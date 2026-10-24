import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './analyze.mts';

// Claude를 호출하기 전 단계(입력 검증)만 테스트 — 네트워크·요금 없음
const post = (body: unknown) =>
  handler(new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify(body) }));

describe('analyze 입력 검증', () => {
  beforeEach(() => vi.stubGlobal('Netlify', { env: { get: (k: string) => (k === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined) } }));
  afterEach(() => vi.unstubAllGlobals());

  it('내용이 없으면 400', async () => {
    const res = await post({ text: '', images: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: '분석할 내용이 없습니다.' });
  });

  it('지원하지 않는 파일 형식(HEIC 등)은 400 안내', async () => {
    const res = await post({ images: [{ data: 'AAAA', mimeType: 'image/heic' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('지원하지 않는 파일 형식');
  });

  it('API 키가 없으면 500', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => undefined } });
    expect((await post({ text: '내일 회의' })).status).toBe(500);
  });
});
