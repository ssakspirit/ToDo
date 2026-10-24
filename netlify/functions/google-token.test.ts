import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './google-token.mts';

const env: Record<string, string | undefined> = {};
const post = (body: unknown) =>
  handler(new Request('http://localhost/api/google-token', { method: 'POST', body: JSON.stringify(body) }));
const googleReplies = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe('google-token 프록시', () => {
  beforeEach(() => {
    Object.assign(env, { VITE_GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret' });
    vi.stubGlobal('Netlify', { env: { get: (k: string) => env[k] } });
  });
  afterEach(() => { vi.unstubAllGlobals(); for (const k in env) delete env[k]; });

  it('client_secret을 붙여 Google에 요청하고 응답을 그대로 전달', async () => {
    googleReplies(200, { access_token: 'at', expires_in: 3599 });
    const res = await post({ grant_type: 'refresh_token', refresh_token: 'rt' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'at', expires_in: 3599 });
    const sent = new URLSearchParams((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as URLSearchParams);
    expect(Object.fromEntries(sent)).toEqual({
      client_id: 'cid', client_secret: 'secret', grant_type: 'refresh_token', refresh_token: 'rt',
    });
  });

  it('사용자 토큰 오류(invalid_grant)는 400 그대로 — 앱이 재로그인 처리', async () => {
    googleReplies(400, { error: 'invalid_grant' });
    expect((await post({ grant_type: 'refresh_token', refresh_token: 'x' })).status).toBe(400);
  });

  it('서버 secret 오류(invalid_client)는 502로 바꿈 — 앱이 토큰을 지우지 않음', async () => {
    googleReplies(401, { error: 'invalid_client' });
    const res = await post({ grant_type: 'refresh_token', refresh_token: 'x' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'server_misconfigured' });
  });

  it('secret이 없으면 500, 이름이 VITE_로 잘못 설정된 secret은 읽지 않음', async () => {
    delete env.GOOGLE_CLIENT_SECRET;
    env.VITE_GOOGLE_CLIENT_SECRET = 'leaked-style-name';
    expect((await post({ grant_type: 'refresh_token', refresh_token: 'x' })).status).toBe(500);
  });

  it('지원하지 않는 grant_type은 Google 호출 없이 400', async () => {
    googleReplies(200, {});
    expect((await post({ grant_type: 'password' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
