// ==========================================
// 工具函数 (如果你已经在其他文件定义并 import 了，可以删除这段)
// ==========================================

/**
 * 统一的响应封装
 */
function jsonResponse(data, status = 200, isError = false) {
  const body = isError ? { error: data } : data;
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
    }
  });
}

/**
 * 验证用户 Token (请保留你原本的业务逻辑)
 */
async function verifyUserToken(token) {
  // 这里应该是你原本的 Token 解析或请求鉴权服务器的逻辑
  // 务必返回包含 open_id 的对象，如果验证失败请抛出 Error
  // 例如：return { open_id: 'xxxx' };
}

// ==========================================
// 核心 API 逻辑
// ==========================================

const DEFAULT_CONFIG = {
  publicFields: ['资产名称', '资产编号', '资产状态'],
  hiddenFields: []
};

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // ----------------------------------------
  // 🟢 处理 GET 请求 (获取配置)
  // ----------------------------------------
  if (method === 'GET') {
    try {
      // 增加容错：检查 KV 是否绑定
      if (!env.CONFIG_KV) {
         console.error("Environment error: CONFIG_KV is not bound.");
         // Fallback 到默认配置或者返回 500
         return jsonResponse(DEFAULT_CONFIG); 
      }
      let config = await env.CONFIG_KV.get('field_visibility', 'json');
      if (!config) config = DEFAULT_CONFIG;
      return jsonResponse(config);
    } catch (err) {
      console.error("Failed to GET config from KV:", err);
      // 读取失败时兜底返回默认配置，保证前端正常渲染
      return jsonResponse(DEFAULT_CONFIG);
    }
  }

  // ----------------------------------------
  // 🔵 处理 POST 请求 (保存配置)
  // ----------------------------------------
  if (method === 'POST') {
    // 1. 检查请求头授权
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse('Unauthorized: Missing or invalid Authorization header', 401, true);
    }
    const userToken = authHeader.slice(7);

    // 2. 验证用户信息与管理员权限
    try {
      const userInfo = await verifyUserToken(userToken);
      const openId = userInfo.open_id;

      // 检查 KV: USER_TOKENS 是否绑定
      if (!env.USER_TOKENS) {
        console.error("Environment error: USER_TOKENS KV is not bound.");
        return jsonResponse('Server Config Error', 500, true);
      }

      let adminList = await env.USER_TOKENS.get('admin_list', 'json');
      if (!adminList || !Array.isArray(adminList)) adminList = [];
      
      if (!adminList.includes(openId)) {
        console.warn(`User ${openId} attempted to save config without admin rights.`);
        return jsonResponse('Forbidden: Admin access required', 403, true);
      }
    } catch (err) {
      console.error("Token validation or Admin check failed:", err);
      return jsonResponse('Invalid token or authentication failed', 401, true);
    }

    // 3. 安全解析 Request Body (防 500 崩溃核心点)
    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      console.error("JSON Parsing Error - Body might be empty or invalid HTML:", err);
      return jsonResponse('Invalid JSON payload in request body', 400, true);
    }

    const { publicFields, hiddenFields } = payload;

    // 参数校验：确保拿到的是数组，防止存入非法脏数据
    if (!Array.isArray(publicFields) || !Array.isArray(hiddenFields)) {
      return jsonResponse('Invalid payload format: Arrays expected', 400, true);
    }

    // 4. 保存到 KV (防 500 崩溃核心点)
    if (!env.CONFIG_KV) {
      console.error("Environment error: CONFIG_KV is not bound.");
      return jsonResponse('Server Config Error: KV missing', 500, true);
    }

    try {
      await env.CONFIG_KV.put('field_visibility', JSON.stringify({ publicFields, hiddenFields }));
      return jsonResponse({ success: true });
    } catch (err) {
      console.error("Failed to write config to KV:", err);
      return jsonResponse('Failed to save configuration to database', 500, true);
    }
  }

  // ----------------------------------------
  // 🔴 兜底：方法不允许
  // ----------------------------------------
  return jsonResponse('Method not allowed', 405, true);
}
