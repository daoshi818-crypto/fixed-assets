// functions/api/login.js - 健壮版
export async function onRequestPost(context) {
  const { request, env } = context;

  // 调试日志：输出 env 中包含哪些键（不输出值，保护敏感信息）
  console.log('=== login.js started ===');
  console.log('env keys:', Object.keys(env || {}));

  // 辅助函数：统一返回 JSON 错误
  function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ code: -1, message }), {
      status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  function jsonSuccess(data) {
    return new Response(JSON.stringify({ code: 0, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    // 1. 解析请求体
    let code;
    try {
      const body = await request.json();
      code = body.code;
    } catch (err) {
      console.error('Failed to parse JSON body:', err);
      return jsonError('Invalid request body');
    }

    if (!code) {
      return jsonError('Missing code');
    }

    // 2. 检查环境变量
    const { APP_ID, APP_SECRET, REDIRECT_URI } = env;
    if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
      console.error('Missing env vars:', { hasAPP_ID: !!APP_ID, hasAPP_SECRET: !!APP_SECRET, hasREDIRECT_URI: !!REDIRECT_URI });
      return jsonError('Server configuration error', 500);
    }

    // 3. 调用飞书换取 token
    let tokenJson;
    try {
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
      tokenJson = await tokenRes.json();
      console.log('Token exchange response status:', tokenRes.status);
    } catch (err) {
      console.error('Token exchange network error:', err);
      return jsonError('Failed to connect to Feishu', 500);
    }

    if (!tokenJson.access_token) {
      console.error('Token exchange failed:', tokenJson);
      return jsonError(`Token exchange failed: ${tokenJson.error_description || 'unknown error'}`);
    }

    // 4. 获取用户信息
    let userJson;
    try {
      const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      userJson = await userRes.json();
    } catch (err) {
      console.error('Get user info network error:', err);
      return jsonError('Failed to get user info', 500);
    }

    if (userJson.code !== 0) {
      console.error('Get user info failed:', userJson);
      return jsonError(`Get user info failed: ${userJson.msg}`);
    }

    const openId = userJson.data.open_id;

    // 5. 管理员设置（尝试使用 KV，但如果 KV 不可用，就跳过，不影响登录）
    let isAdmin = false;
    try {
      // 检查 KV 是否可用
      if (env.USER_TOKENS) {
        let adminList = await env.USER_TOKENS.get('admin_list', 'json');
        if (!adminList || !Array.isArray(adminList)) adminList = [];
        if (adminList.length === 0) {
          adminList = [openId];
          await env.USER_TOKENS.put('admin_list', JSON.stringify(adminList));
        }
        isAdmin = adminList.includes(openId);
      } else {
        console.warn('USER_TOKENS KV not bound, admin feature disabled');
      }
    } catch (err) {
      console.error('Admin setup failed:', err);
      // 不影响登录，继续
    }

    // 6. 存储用户 token（同样，KV 失败不影响登录）
    try {
      if (env.USER_TOKENS) {
        const tokenData = {
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expires_at: Date.now() + tokenJson.expires_in * 1000,
        };
        await env.USER_TOKENS.put(openId, JSON.stringify(tokenData));
      } else {
        console.warn('USER_TOKENS not bound, token not persisted');
      }
    } catch (err) {
      console.error('Failed to store token:', err);
      // 不返回错误，因为登录已经成功，只是没有持久化
    }

    // 7. 返回成功响应
    return jsonSuccess({
      accessToken: tokenJson.access_token,
      openId,
      name: userJson.data.name,
      avatar: userJson.data.avatar_url,
      isAdmin,
    });
  } catch (err) {
    console.error('Unhandled error in login.js:', err);
    return jsonError('Internal server error', 500);
  }
}
