// fixed-assets/functions/api/record.js
// 配置常量，从环境变量读取
const APP_ID = env.APP_ID;
const APP_SECRET = env.APP_SECRET;
const APP_TOKEN = env.APP_TOKEN;
const TABLE_ID = env.TABLE_ID;

// 未登录用户可见字段
const PUBLIC_FIELDS = ['资产名称', '资产编号', '资产状态'];

// ==================== 辅助函数 ====================
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

// ==================== 租户 token（自动缓存） ====================
let cachedTenantToken = null;
let tenantTokenExpire = 0;

async function getTenantAccessToken(env) {
  const now = Date.now();
  if (cachedTenantToken && now < tenantTokenExpire) {
    return cachedTenantToken;
  }

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`tenant token error: ${JSON.stringify(json)}`);
  }
  cachedTenantToken = json.tenant_access_token;
  tenantTokenExpire = now + (json.expire || 7200) * 1000 - 5 * 60 * 1000;
  return cachedTenantToken;
}

// ==================== 用户 token 管理（KV 自动刷新） ====================
async function getUserTokenData(openId, env) {
  const data = await env.USER_TOKENS.get(openId, 'json');
  return data;
}

async function refreshUserToken(refreshToken, env) {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/refresh_access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`refresh error: ${JSON.stringify(json)}`);
  return {
    access_token: json.data.access_token,
    refresh_token: json.data.refresh_token,
    expires_at: Date.now() + json.data.expires_in * 1000,
  };
}

async function getValidUserAccessToken(openId, env) {
  let data = await getUserTokenData(openId, env);
  if (!data) return null;
  const now = Date.now();
  if (data.expires_at > now + 5 * 60 * 1000) {
    return data.access_token;
  }
  try {
    const newData = await refreshUserToken(data.refresh_token, env);
    await env.USER_TOKENS.put(openId, JSON.stringify(newData));
    return newData.access_token;
  } catch (err) {
    console.error('refresh failed', err);
    return null;
  }
}

async function verifyUserToken(token, env) {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Invalid token');
  return json.data.open_id;
}

// ==================== 多维表格业务逻辑 ====================
async function getRecordList(tenantToken, isLoggedIn, env) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tenantToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`list error: ${JSON.stringify(json)}`);

  const items = json.data.items || [];
  return items.map((item) => {
    const fields = item.fields || {};
    if (isLoggedIn) {
      return { id: item.record_id, ...fields };
    } else {
      const publicData = { id: item.record_id };
      for (const key of PUBLIC_FIELDS) {
        publicData[key] = fields[key] || null;
      }
      return publicData;
    }
  });
}

async function getRecordDetail(tenantToken, recordId, isLoggedIn, env) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tenantToken}` },
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`detail error: ${JSON.stringify(json)}`);

  const fields = json.data.record.fields || {};
  if (isLoggedIn) {
    return { id: recordId, ...fields };
  } else {
    const publicData = { id: recordId };
    for (const key of PUBLIC_FIELDS) {
      publicData[key] = fields[key] || null;
    }
    return publicData;
  }
}

async function updateRecord(userToken, recordId, fields, env) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`update error: ${JSON.stringify(json)}`);
  return true;
}

// ==================== 主入口 ====================
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  try {
    // ---------- GET 请求：列表 或 详情 ----------
    if (method === 'GET') {
      const type = url.searchParams.get('type');
      if (!type) {
        return jsonResponse('Missing parameter: type', 400, true);
      }

      // 获取租户 token
      const tenantToken = await getTenantAccessToken(env);

      // 判断是否登录（尝试解析 Authorization header）
      let isLoggedIn = false;
      const authHeader = request.headers.get('Authorization');
      let openId = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const userToken = authHeader.slice(7);
        try {
          openId = await verifyUserToken(userToken, env);
          // 验证通过后，确保 KV 中有最新的 token（如果快过期会自动刷新）
          const validToken = await getValidUserAccessToken(openId, env);
          if (validToken) isLoggedIn = true;
        } catch (e) {
          // token 无效，视为未登录
        }
      }

      if (type === 'list') {
        const list = await getRecordList(tenantToken, isLoggedIn, env);
        return jsonResponse(list);
      } else if (type === 'detail') {
        const id = url.searchParams.get('id');
        if (!id) return jsonResponse('Missing id', 400, true);
        const detail = await getRecordDetail(tenantToken, id, isLoggedIn, env);
        return jsonResponse(detail);
      } else {
        return jsonResponse('Invalid type', 400, true);
      }
    }

    // ---------- POST 请求：更新记录（需要登录） ----------
    if (method === 'POST') {
      const action = url.searchParams.get('action');
      if (action !== 'update') {
        return jsonResponse('Invalid action', 400, true);
      }

      // 必须提供用户 token
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse('Unauthorized: please login first', 401, true);
      }
      const userToken = authHeader.slice(7);

      // 验证 token 并获取 openId
      let openId;
      try {
        openId = await verifyUserToken(userToken, env);
      } catch (e) {
        return jsonResponse('Invalid or expired token, please login again', 401, true);
      }

      // 获取有效的 access_token（若 refresh 失败则要求重新登录）
      const validToken = await getValidUserAccessToken(openId, env);
      if (!validToken) {
        return jsonResponse('Token expired, please login again', 401, true);
      }

      const { id, fields } = await request.json();
      if (!id || !fields) {
        return jsonResponse('Missing id or fields', 400, true);
      }

      await updateRecord(validToken, id, fields, env);
      return jsonResponse({ success: true });
    }

    return jsonResponse('Method not allowed', 405, true);
  } catch (err) {
    console.error(err);
    return jsonResponse(err.message || 'Internal server error', 500, true);
  }
}
