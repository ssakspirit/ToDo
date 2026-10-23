import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Claude 분석 프록시 — API 키를 브라우저 번들에 넣지 않기 위해 서버에서 호출
// 요청: POST { text: string, images: { data: base64, mimeType }[] }
// 응답: 200 TaskDetails[] / 429 { error, retryAfter(ms) } / 400 · 422 · 503 · 500 { error }

const MODEL = "claude-haiku-5-5";

// Claude가 받는 이미지 형식 (그 외 이미지는 PDF가 아니면 거부)
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

const TaskSchema = z.object({
  title: z
    .string()
    .describe("할 일의 제목. 반드시 태그를 포함해야 함. 형식: '#필수태그 #추가태그 제목내용'. 필수태그는 #일정, #기한, #작업 중 하나. 추가태그는 내용에 맞는 태그 1개. 예: '#일정 #회의 팀 미팅 참석', '#기한 #보고서 월말 보고서 제출', '#작업 #정리 책상 정리하기'"),
  body: z
    .string()
    .describe("받은 내용을 그대로 노트에 적기. 원본 텍스트나 이미지 내용을 최대한 그대로 옮겨 적되, 읽기 쉽게 줄바꿈만 추가. 각색하거나 요약하지 말 것."),
  dueDateTime: z
    .string()
    .describe("기한 날짜 및 시간 (ISO 8601, 시간대 표기 없이 YYYY-MM-DDTHH:mm:ss). #일정에 시간이 명시되면 그 시작 시간, 아니면 23:59:00. 기한이 없으면 오늘 날짜"),
  importance: z
    .enum(["low", "normal", "high"])
    .describe("중요도: 기본적으로 'low'. 특별히 긴급하거나 중요하다고 명시된 경우만 'high'."),
  reminderDateTime: z
    .string()
    .describe("알림 날짜 및 시간 (ISO 8601, 시간대 표기 없이). 기한 날짜의 오전 7시 30분. 예: 기한이 2025-12-25라면 2025-12-25T07:30:00"),
  categories: z.array(z.string()).describe("할 일의 카테고리 또는 태그 목록 (한국어)"),
});

// 구조화 출력의 최상위는 객체여야 하므로 배열을 감쌈
const ResultSchema = z.object({ tasks: z.array(TaskSchema) });

const SYSTEM_PROMPT = "당신은 Microsoft To-Do 전문 비서입니다. 채팅이나 이미지에서 할 일을 추출하여 To-Do 항목으로 만드는 것이 임무입니다. 반드시 제목에 태그(#일정/#기한/#작업 + 추가태그)를 포함하고, 기한은 항상 미래 날짜여야 하며, 알림은 기한 당일 오전 7시 30분으로 설정하세요. 원문 내용은 그대로 노트에 옮기고, 중요도는 기본적으로 'low'입니다. 기간이 있는 일정(예: '1월 21~23일')은 각 날짜별로 개별 항목을 생성하세요.";

// 서버는 UTC로 동작하므로 한국 날짜를 명시적으로 계산
const getSeoulToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const [year, month, day] = [get("year"), get("month"), get("day")];
  // 요일을 알려줘야 "다음주 수요일", "금요일까지" 같은 표현을 정확히 계산함
  const weekday = "일월화수목금토"[new Date(Date.UTC(+year, +month - 1, +day)).getUTCDay()];
  return { year, month, day, weekday };
};

const buildPrompt = (text: string): string => {
  const { year, month, day, weekday } = getSeoulToday();
  return `주어진 텍스트 및/또는 이미지를 분석하여 할 일(To-Do) 항목을 추출하세요.
현재 날짜: ${year}-${month}-${day} (${year}년 ${Number(month)}월 ${Number(day)}일 ${weekday}요일)
- 요일 표현은 현재 날짜의 요일을 기준으로 계산 (예: 현재가 금요일일 때 "다음주 수요일"은 5일 뒤)

[중요 규칙]
1. **제목 태그 필수**: 모든 할 일 제목은 "#필수태그 #추가태그 내용" 형식
   - 필수태그: #일정 (그때 꼭 해야 하는 약속/이벤트) / #기한 (그때까지만 하면 되는 것) / #작업 (언제든 가능)
   - 추가태그: 내용에 맞는 태그 1개 (예: #회의, #보고서, #쇼핑, #청소, #기프티콘 등)
   - 예시: "#일정 #회의 오후 3시 팀 미팅", "#기한 #과제 영어 숙제 제출", "#작업 #청소 방 정리하기"
   - **기프티콘 특별 규칙**: 기프티콘/쿠폰 이미지인 경우 → 반드시 "#기한 #기프티콘 [상품명]" 형식으로 작성. #기프티콘 태그를 추가태그로 포함해야 함. 유효기간을 기한으로 설정

2. **기한(dueDateTime)**:
   - **#일정 태그 + 시간 명시된 경우**: 시작 시간을 dueDateTime에 설정
     - 예: "오후 3시 팀 미팅" (#일정) → 2025-12-18T15:00:00
     - 예: "내일 저녁 7시 30분 저녁식사" (#일정) → 2025-12-19T19:30:00
   - **#기한 태그 또는 시간 없는 경우**: 기한 날짜의 23:59:00으로 설정
     - 기한이 명시되지 않았으면 **오늘 날짜**로 설정
     - 년도가 없으면 현재 년도 기준, 단 **반드시 미래 날짜**여야 함
     - 과거가 되면 자동으로 다음 년도로 설정
     - 예: 현재가 2025-12-18이고 "1월 2일"이라면 → 2026-01-02T23:59:00
   - **기프티콘**: 이미지에 표시된 유효기간을 기한으로 설정 (예: "2025.12.31까지" → 2025-12-31T23:59:00)

3. **알림(reminderDateTime)**:
   - 기한 날짜의 **오전 7시 30분(07:30:00)**
   - 예: 기한이 2025-12-25T23:59:00이면 알림은 2025-12-25T07:30:00

4. **노트(body)**:
   - 받은 내용을 **그대로** 옮겨 적기
   - 요약하거나 각색하지 말 것
   - 원문 그대로, 읽기 쉽게 줄바꿈만 추가
   - **기프티콘**: 상품명, 유효기간, 교환처, 바코드번호(있다면) 등 이미지의 모든 텍스트 정보를 상세히 기록

5. **중요도(importance)**:
   - 기본값: 'low'
   - 특별히 "긴급", "중요" 등이 명시된 경우만 'high'

6. **다중 이미지**:
   - 연속된 대화/스크린샷은 하나로 그룹화
   - 별개의 내용은 별도 항목으로 분리

7. **기간이 있는 일정 (중요)**:
   - 기간이 명시된 경우 (예: "1월 21~23일", "12월 25일~27일", "3일간" 등)
   - **반드시 각 날짜별로 개별 항목을 생성**해야 함
   - 예: "코엑스 교육 박람회 1월 21~23일" → 3개의 항목 생성
     - "#일정 #박람회 코엑스 교육 박람회" (dueDateTime: 2026-01-21T23:59:00)
     - "#일정 #박람회 코엑스 교육 박람회" (dueDateTime: 2026-01-22T23:59:00)
     - "#일정 #박람회 코엑스 교육 박람회" (dueDateTime: 2026-01-23T23:59:00)
   - 각 항목의 제목은 동일하게 유지하되, dueDateTime만 다르게 설정
   - 시작일과 종료일이 명시된 경우, 시작일부터 종료일까지 모든 날짜를 포함

텍스트 내용:
${text}`;
};

// 첨부 파일 → Claude content block (이미지 / PDF)
const toContentBlock = (file: { data: string; mimeType: string }): Anthropic.ContentBlockParam | null => {
  if ((IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: file.mimeType as ImageMediaType, data: file.data },
    };
  }
  if (file.mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: file.data },
    };
  }
  return null;
};

const errorResponse = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status });

export default async (req: Request) => {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return errorResponse("Claude API 키가 서버에 설정되지 않았습니다.", 500);

  let text: string;
  let files: { data: string; mimeType: string }[];
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text : "";
    files = Array.isArray(body.images)
      ? body.images.filter((f: any) => typeof f?.data === "string" && typeof f?.mimeType === "string")
      : [];
  } catch {
    return errorResponse("잘못된 요청 형식입니다.", 400);
  }

  if (!text && files.length === 0) return errorResponse("분석할 내용이 없습니다.", 400);

  const attachments = files.map(toContentBlock);
  if (attachments.some((block) => block === null)) {
    return errorResponse("지원하지 않는 파일 형식입니다. 이미지(JPG·PNG·GIF·WEBP) 또는 PDF만 분석할 수 있습니다.", 400);
  }

  // 함수 실행 한도 60초 안에 끝나도록: 요청당 45초, 429·529 등은 SDK가 1회 자동 재시도
  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(ResultSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            ...(attachments as Anthropic.ContentBlockParam[]),
            { type: "text", text: buildPrompt(text) },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return errorResponse("이 내용은 분석할 수 없습니다.", 422);
    }
    if (!response.parsed_output) {
      // max_tokens 초과 등으로 JSON이 완성되지 않은 경우
      console.error("구조화 출력 파싱 실패:", response.stop_reason);
      return errorResponse("분석 결과가 너무 깁니다. 내용을 나눠서 분석해주세요.", 500);
    }

    return Response.json(response.parsed_output.tasks);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      const retryAfterSec = Number(error.headers?.get("retry-after")) || 30;
      return errorResponse(`요청 한도를 초과했습니다. ${retryAfterSec}초 후 다시 시도해주세요.`, 429, {
        retryAfter: retryAfterSec * 1000,
      });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("Claude 인증 오류:", error.message);
      return errorResponse("Claude API 키가 올바르지 않습니다.", 500);
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Claude 요청 오류:", error.message);
      return errorResponse("분석 요청이 거부되었습니다. 이미지 크기나 형식을 확인해주세요.", 400);
    }
    if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
      // 5xx·529(과부하)·타임아웃 — 클라이언트에서 '과부하' 메시지로 표시
      console.error("Claude 서비스 오류:", error.message);
      return errorResponse("AI 서비스가 일시적으로 응답하지 않습니다.", 503);
    }
    console.error("Claude 분석 오류:", error);
    return errorResponse("분석에 실패했습니다.", 500);
  }
};

export const config: Config = {
  path: "/api/analyze",
  method: "POST",
};
