// functions/api/login.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const { code } = await request.json();
  const APP_ID = "cli_a9744fcb1a391cc8";
  const APP_SECRET = "KMBW1e83BhwdYRViYb1e1gDPLA2mHXZ8";
  const REDIRECT_URI = "https://86782b78.fixed-assets.pages.dev/api/login";

  const tokenRes = await fetch('https://passport.feishu.cn/suite/passport/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) throw new Error('Login failed');

  const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = await userRes.json();
  const openId = userJson.data.open_id;

  // 存储到 KV（如果 KV 未绑定，会报错但不影响返回 accessToken）
  if (env.USER_TOKENS) {
    await env.USER_TOKENS.put(openId, JSON.stringify({
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: Date.now() + tokenJson.expires_in * 1000,
    }));
  }

  return new Response(JSON.stringify({
    code: 0,
    data: { accessToken: tokenJson.access_token, openId }
  }), { headers: { 'Content-Type': 'application/json' } });
}
