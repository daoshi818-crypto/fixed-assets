export async function onRequestPost(context) {
  const { request, env } = context;
  const { APP_ID, APP_SECRET, REDIRECT_URI } = env;

  try {
    const { code } = await request.json();

    if (!code) {
      return jsonResponse('Missing code', 400, true);
    }

    // code -> user_access_token
    const tokenRes = await fetch(
      'https://passport.feishu.cn/suite/passport/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: APP_ID,
          client_secret: APP_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      }
    );

    const tokenJson = await tokenRes.json();

    if (!tokenJson.access_token) {
      throw new Error(
        `Token exchange failed: ${JSON.stringify(tokenJson)}`
      );
    }

    // 获取用户信息
    const userRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
        },
      }
    );

    const userJson = await userRes.json();

    if (userJson.code !== 0) {
      throw new Error(
        `Get user info failed: ${JSON.stringify(userJson)}`
      );
    }

    return jsonResponse({
      accessToken: tokenJson.access_token,
      openId: userJson.data.open_id,
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
