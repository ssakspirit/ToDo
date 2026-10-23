import type { Config } from "@netlify/functions";

// Google OAuth 토큰 교환/갱신 프록시 — client_secret을 브라우저 번들에 넣지 않기 위해 서버에서 추가
// 요청: POST { grant_type: 'authorization_code', code, code_verifier, redirect_uri }
//       POST { grant_type: 'refresh_token', refresh_token }
// 응답: Google 토큰 엔드포인트 응답을 상태 코드 그대로 전달

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export default async (req: Request) => {
  // VITE_ 이름은 기존 Netlify 설정 호환용
  const clientId = Netlify.env.get("GOOGLE_CLIENT_ID") || Netlify.env.get("VITE_GOOGLE_CLIENT_ID");
  const clientSecret = Netlify.env.get("GOOGLE_CLIENT_SECRET") || Netlify.env.get("VITE_GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return Response.json({ error: "Google OAuth 설정이 서버에 없습니다." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  if (body.grant_type === "authorization_code") {
    params.set("grant_type", "authorization_code");
    params.set("code", str(body.code));
    params.set("code_verifier", str(body.code_verifier));
    params.set("redirect_uri", str(body.redirect_uri));
  } else if (body.grant_type === "refresh_token") {
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", str(body.refresh_token));
  } else {
    return Response.json({ error: "지원하지 않는 grant_type입니다." }, { status: 400 });
  }

  const googleRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  return new Response(await googleRes.text(), {
    status: googleRes.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/google-token",
  method: "POST",
};
