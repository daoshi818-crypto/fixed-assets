// fixed-assets/functions/api/login.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const { APP_ID, APP_SECRET, REDIRECT_URI } = env;

  try {
    const { code } = await request.json();
    if (!code) {
      return new Response(JSON.stringify({ code: -1, message: 'Missing code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 用 code 换 user_access_token 和 refresh_token
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
    if (!tokenJson.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    // 获取用户 open_id
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (userJson.code !== 0) throw new Error(`Get user info failed: ${JSON.stringify(userJson)}`);
    const openId = userJson.data.open_id;

    // 存储到 KV
    if (env.USER_TOKENS) {
      await env.USER_TOKENS.put(openId, JSON.stringify({
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expires_at: Date.now() + tokenJson.expires_in * 1000,
      }));
    }

    return new Response(
      JSON.stringify({
        code: 0,
        data: { accessToken: tokenJson.access_token, openId },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ code: -1, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
