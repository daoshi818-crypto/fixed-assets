// functions/api/field-config.js
const DEFAULT_CONFIG = {
  publicFields: ['资产名称', '资产编号', '资产状态'],
  hiddenFields: []
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'GET') {
    let config = await env.CONFIG_KV?.get('field_visibility', 'json');
    if (!config) config = DEFAULT_CONFIG;
    return jsonResponse(config);
  }

  if (method === 'POST') {
    // 检查管理员权限
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse('Unauthorized', 401, true);
    }
    const userToken = authHeader.slice(7);
    try {
      const userInfo = await verifyUserToken(userToken);
      const openId = userInfo.open_id;
      // 获取管理员列表
      let adminList = await env.USER_TOKENS.get('admin_list', 'json');
      if (!adminList || !Array.isArray(adminList)) adminList = [];
      if (!adminList.includes(openId)) {
        return jsonResponse('Forbidden', 403, true);
      }
    } catch (err) {
      return jsonResponse('Invalid token', 401, true);
    }

    const { publicFields, hiddenFields } = await request.json();
    await env.CONFIG_KV.put('field_visibility', JSON.stringify({ publicFields, hiddenFields }));
    return jsonResponse({ success: true });
  }

  return jsonResponse('Method not allowed', 405, true);
}
// jsonResponse, verifyUserToken 函数同上
