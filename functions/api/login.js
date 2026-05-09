// functions/api/login.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const { APP_ID, APP_SECRET, REDIRECT_URI } = env;

  try {
    const { code } = await request.json();
    if (!code) return jsonResponse('Missing code', 400, true);

    // 换取 token（略，与原代码相同）
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
    if (!tokenJson.access_token) throw new Error('Token exchange failed');

    // 获取用户信息（open_id）
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (userJson.code !== 0) throw new Error('Get user info failed');
    const openId = userJson.data.open_id;

    // ---- 新增：自动设置管理员 ----
    // 读取当前管理员列表
    let adminList = await env.USER_TOKENS.get('admin_list', 'json');
    if (!adminList || !Array.isArray(adminList)) {
      adminList = [];
    }
    // 如果没有管理员，则当前用户成为管理员
    if (adminList.length === 0) {
      adminList = [openId];
      await env.USER_TOKENS.put('admin_list', JSON.stringify(adminList));
      console.log(`User ${openId} set as first admin`);
    }

    // 存储用户 token（略，与原代码相同）
    const tokenData = {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: Date.now() + tokenJson.expires_in * 1000,
    };
    await env.USER_TOKENS.put(openId, JSON.stringify(tokenData));

    // 返回给前端（包含 open_id 和 isAdmin 标志）
    const isAdmin = adminList.includes(openId);
    return jsonResponse({
      accessToken: tokenJson.access_token,
      openId,
      name: userJson.data.name,
      avatar: userJson.data.avatar_url,
      isAdmin,   // 新增字段
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(err.message, 500, true);
  }
}
// jsonResponse 函数同上，略
