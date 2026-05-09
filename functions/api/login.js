// functions/api/login.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const { APP_ID, APP_SECRET, REDIRECT_URI } = env;

  try {
    const { code } = await request.json();
    if (!code) {
      return jsonResponse('Missing code', 400, true);
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

    // 获取用户信息（包含 open_id）
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (userJson.code !== 0) {
      throw new Error(`Get user info failed: ${JSON.stringify(userJson)}`);
    }
    const openId = userJson.data.open_id;

    // 存储 token 到 KV
    const tokenData = {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: Date.now() + tokenJson.expires_in * 1000,
    };
    await env.USER_TOKENS.put(openId, JSON.stringify(tokenData));

    // 返回给前端（包含 open_id 和 name）
    return jsonResponse({
      accessToken: tokenJson.access_token,
      openId,
      name: userJson.data.name,
      avatar: userJson.data.avatar_url,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(err.message, 500, true);
  }
}

function jsonResponse(data, status = 200, isError = false) {
  return new Response(
    JSON.stringify({
      code: isError ? -1 : 0,
      message: isError ? data : undefined,
      data: isError ? undefined : data,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
