export async function onRequestPost(context) {
  const { request, env } = context;
  const { APP_ID, APP_SECRET, REDIRECT_URI } = env;

  try {
    const { code } = await request.json();
    if (!code) {
      return new Response(JSON.stringify({ code: -1, message: 'Missing code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 换取 token
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

    // 获取用户信息
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (userJson.code !== 0) {
      throw new Error(`Get user info failed: ${JSON.stringify(userJson)}`);
    }
    const openId = userJson.data.open_id;

    // 管理员设置
    let adminList = await env.USER_TOKENS.get('admin_list', 'json');
    if (!adminList || !Array.isArray(adminList)) adminList = [];
    if (adminList.length === 0) {
      adminList = [openId];
      await env.USER_TOKENS.put('admin_list', JSON.stringify(adminList));
    }
    const isAdmin = adminList.includes(openId);

    // 存储用户 token
    const tokenData = {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: Date.now() + tokenJson.expires_in * 1000,
    };
    await env.USER_TOKENS.put(openId, JSON.stringify(tokenData));

    return new Response(JSON.stringify({
      code: 0,
      data: {
        accessToken: tokenJson.access_token,
        openId,
        name: userJson.data.name,
        avatar: userJson.data.avatar_url,
        isAdmin,
      }
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ code: -1, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
