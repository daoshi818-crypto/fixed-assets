// functions/api/field-config.js
const DEFAULT_CONFIG = {
  publicFields: ['资产名称', '资产编号', '资产状态'],
  hiddenFields: []
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // GET: 任何人都可以读取配置
  if (method === 'GET') {
    let config = await env.CONFIG_KV?.get('field_visibility', 'json');
    if (!config) config = DEFAULT_CONFIG;
    return jsonResponse(config);
  }

  // POST: 仅管理员可修改
  if (method === 'POST') {
    // 验证管理员身份
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse('Unauthorized', 401, true);
    }
    const userToken = authHeader.slice(7);
    try {
      const userInfo = await verifyUserToken(userToken);
      const ADMIN_OPENID = env.ADMIN_OPENID;
      if (userInfo.open_id !== ADMIN_OPENID) {
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

function jsonResponse(data, status = 200, isError = false) {
  return new Response(
    JSON.stringify({
      code: isError ? -1 : 0,
      message: isError ? data : undefined,
      data: isError ? undefined : data,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
}

async function verifyUserToken(token) {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Invalid token');
  return json.data;
}
