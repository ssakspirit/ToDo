import { GoogleGenAI, Type, Schema } from "@google/genai";
import { TaskDetails } from "../types";

// 여러 API 키 지원 (쉼표로 구분)
const getApiKeys = (): string[] => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  console.log('[DEBUG] 원본 환경 변수:', apiKey);
  console.log('[DEBUG] 환경 변수 길이:', apiKey.length);
  // 쉼표로 구분된 여러 키 지원
  const keys = apiKey.split(',').map(key => key.trim()).filter(key => key.length > 0);
  console.log('[DEBUG] 분리된 키 배열:', keys.map(k => k.substring(0, 20) + '...'));
  return keys.length > 0 ? keys : [];
};

// API 키 배열
const apiKeys = getApiKeys();
let currentKeyIndex = 0;

// 디버깅: API 키 개수 확인
console.log(`[Gemini Service] 로드된 API 키 개수: ${apiKeys.length}`);
if (apiKeys.length > 0) {
  console.log(`[Gemini Service] 첫 번째 키: ${apiKeys[0].substring(0, 20)}...`);
}

// 현재 API 키 가져오기
const getCurrentApiKey = (): string => {
  if (apiKeys.length === 0) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.');
  }
  return apiKeys[currentKeyIndex];
};

// 다음 API 키로 전환
const switchToNextApiKey = (): boolean => {
  if (apiKeys.length <= 1) {
    return false; // 키가 하나뿐이면 전환 불가
  }
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return true;
};

// GoogleGenAI 인스턴스 생성 함수
const createAIInstance = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

// Define the schema for a single task item
const taskItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "할 일의 제목. 반드시 태그를 포함해야 함. 형식: '#필수태그 #추가태그 제목내용'. 필수태그는 #일정, #기한, #작업 중 하나. 추가태그는 내용에 맞는 태그 1개. 예: '#일정 #회의 팀 미팅 참석', '#기한 #보고서 월말 보고서 제출', '#작업 #정리 책상 정리하기'",
    },
    body: {
      type: Type.STRING,
      description: "받은 내용을 그대로 노트에 적기. 원본 텍스트나 이미지 내용을 최대한 그대로 옮겨 적되, 읽기 쉽게 줄바꿈만 추가. 각색하거나 요약하지 말 것.",
    },
    dueDateTime: {
      type: Type.STRING,
      description: "기한 날짜 및 시간 (ISO 8601 형식, 시간은 23:59:00). 기한이 명시되지 않았으면 오늘 날짜. 년도가 없으면 현재 년도를 기준으로 하되, 반드시 미래 일자여야 함. 만약 과거 날짜가 되면 다음 년도로 설정. 예: 2025년 12월에 '1월 2일'이라고 하면 2026-01-02T23:59:00",
    },
    importance: {
      type: Type.STRING,
      description: "중요도: 기본적으로 'low'. 특별히 긴급하거나 중요하다고 명시된 경우만 'high'.",
      enum: ["low", "normal", "high"],
    },
    reminderDateTime: {
      type: Type.STRING,
      description: "알림 날짜 및 시간 (ISO 8601 형식). 기한 날짜의 오전 7시 30분 (07:30:00)으로 설정. 예: 기한이 2025-12-25라면 알림은 2025-12-25T07:30:00",
    },
    categories: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "할 일의 카테고리 또는 태그 목록 (한국어)",
    },
    sender: {
      type: Type.STRING,
      description: "메시지 보낸 사람의 이름. 스크린샷에서 상단이나 메시지 옆에 표시된 이름. 알 수 없으면 '알 수 없음'",
    },
    receivedDateTime: {
      type: Type.STRING,
      description: "메시지 수신 날짜 및 시간 (ISO 8601 형식)",
    },
    location: {
      type: Type.STRING,
      description: "장소 또는 위치 정보 (한국어)",
    },
    attendees: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "참석자 또는 관련 인물 목록 (한국어)",
    },
    attachmentNames: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "메시지 내용 또는 스크린샷에 표시된 첨부파일 이름. 캡처 이미지 자체의 파일명은 포함하지 않음.",
    },
  },
  required: ["title", "body", "importance"],
};

export const analyzeContent = async (
  text: string,
  images: { data: string; mimeType: string }[] = []
): Promise<TaskDetails[]> => {

  const parts: any[] = [];

  // Add all images to the request
  images.forEach((img) => {
    parts.push({
      inlineData: {
        data: img.data,
        mimeType: img.mimeType,
      },
    });
  });

  const promptText = `주어진 텍스트 및/또는 이미지를 분석하여 할 일(To-Do) 항목을 추출하세요.
현재 날짜: ${new Date().toISOString().split('T')[0]} (${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일)

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

  if (text) {
    parts.push({
      text: promptText,
    });
  } else if (parts.length > 0) {
     parts.push({ text: promptText });
  }

  // 재시도 로직 (모든 API 키를 시도 + exponential backoff)
  // 429 오류의 경우 모든 키를 시도하고, 다른 오류는 최대 3회 재시도
  const maxRetries = Math.max(apiKeys.length, 3); // 키 개수와 3 중 큰 값
  
  console.log(`[Gemini Service] 분석 시작 - 사용 가능한 키: ${apiKeys.length}개, 최대 재시도: ${maxRetries}회`);
  
  let lastError: any = null;
  let currentAttemptKeyIndex = currentKeyIndex;
  let triedKeys = new Set<number>(); // 시도한 키 추적
  
  if (apiKeys.length === 0) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.');
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 현재 시도에 사용할 API 키 선택
      const attemptApiKey = apiKeys[currentAttemptKeyIndex];
      triedKeys.add(currentAttemptKeyIndex);
      
      console.log(`API 키 시도 (${currentAttemptKeyIndex + 1}/${apiKeys.length}): ${attemptApiKey.substring(0, 20)}...`);
      
      const aiInstance = createAIInstance(attemptApiKey);
      
      const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.ARRAY,
              items: taskItemSchema,
          },
          systemInstruction: "당신은 Microsoft To-Do 전문 비서입니다. 채팅이나 이미지에서 할 일을 추출하여 To-Do 항목으로 만드는 것이 임무입니다. 반드시 제목에 태그(#일정/#기한/#작업 + 추가태그)를 포함하고, 기한은 항상 미래 날짜여야 하며, 알림은 기한 당일 오전 7시 30분으로 설정하세요. 원문 내용은 그대로 노트에 옮기고, 중요도는 기본적으로 'low'입니다. **중요**: 기간이 있는 일정(예: '1월 21~23일')은 반드시 각 날짜별로 개별 항목을 생성해야 합니다.",
        },
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("Gemini로부터 데이터를 받지 못했습니다");

      const results = JSON.parse(jsonText);

      // 성공 시 다음 키로 전환 (라운드 로빈)
      currentKeyIndex = (currentAttemptKeyIndex + 1) % apiKeys.length;
      console.log(`[Gemini Service] 분석 성공! 다음 요청은 키 ${currentKeyIndex + 1}/${apiKeys.length}부터 시작`);

      // Transform to TaskDetails format
      return results.map((item: any): TaskDetails => ({
        title: item.title,
        body: item.body,
        dueDateTime: item.dueDateTime || undefined,
        importance: item.importance || 'normal',
        reminderDateTime: item.reminderDateTime || undefined,
        categories: item.categories || [],
      }));
    } catch (error: any) {
      lastError = error;
      console.error(`Gemini 분석 오류 (시도 ${attempt + 1}/${maxRetries}):`, error);

      // 429 오류 (할당량 초과)인 경우
      const isQuotaExceeded = error?.status === 429 || 
                              error?.code === 429 ||
                              error?.message?.includes('quota') ||
                              error?.message?.includes('RESOURCE_EXHAUSTED');

      if (isQuotaExceeded) {
        // 다른 API 키가 있으면 전환 시도
        if (apiKeys.length > 1) {
          // 아직 시도하지 않은 키 찾기
          let nextKeyIndex = -1;
          for (let i = 0; i < apiKeys.length; i++) {
            const checkIndex = (currentAttemptKeyIndex + i + 1) % apiKeys.length;
            if (!triedKeys.has(checkIndex)) {
              nextKeyIndex = checkIndex;
              break;
            }
          }
          
          if (nextKeyIndex !== -1) {
            currentAttemptKeyIndex = nextKeyIndex;
            // 전역 인덱스도 업데이트하여 다음 요청에 반영
            currentKeyIndex = nextKeyIndex;
            console.log(`할당량 초과로 API 키 전환 (키 ${currentAttemptKeyIndex + 1}/${apiKeys.length})`);
            // 짧은 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        
        // 모든 키를 시도했거나 다른 키가 없는 경우
        const retryDelayMatch = error?.message?.match(/Please retry in ([\d.]+)s/i);
        const retryDelaySeconds = retryDelayMatch ? parseFloat(retryDelayMatch[1]) : 30;
        const delayMs = Math.ceil(retryDelaySeconds * 1000);
        
        const quotaError = new Error(`모든 API 키의 일일 요청 한도를 초과했습니다. ${Math.ceil(retryDelaySeconds)}초 후 다시 시도해주세요.`);
        (quotaError as any).status = 429;
        (quotaError as any).retryAfter = delayMs;
        throw quotaError;
      }

      // 503 오류 (서비스 과부하)인 경우 재시도
      const isOverloaded = error?.status === 503 || 
                          error?.code === 503 ||
                          error?.message?.includes('overloaded') ||
                          error?.message?.includes('UNAVAILABLE');

      if (isOverloaded && attempt < maxRetries - 1) {
        // Exponential backoff: 1초, 2초, 4초
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 재시도 불가능한 오류이거나 최대 재시도 횟수 초과
      throw error;
    }
  }

  // 모든 재시도 실패
  throw lastError || new Error("분석에 실패했습니다.");
};
