import { TaskDetails } from "../types";

// Gemini 호출은 서버(netlify/functions/analyze.mts)에서 처리 — API 키를 번들에 넣지 않기 위함

// Netlify 함수 요청 본문 한도 6MB (JSON 오버헤드 감안해 여유를 둠)
const MAX_PAYLOAD_CHARS = 5.5 * 1024 * 1024;

export const analyzeContent = async (
  text: string,
  images: { data: string; mimeType: string }[] = []
): Promise<TaskDetails[]> => {
  const payload = JSON.stringify({ text, images });
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // App.tsx의 오류 분기(status / retryAfter)가 그대로 동작하도록 같은 형태로 전달
    const error = new Error(data.error || `분석 요청 실패 (${response.status})`);
    (error as any).status = response.status;
    (error as any).retryAfter = data.retryAfter;
    throw error;
  }

  return response.json();
};
