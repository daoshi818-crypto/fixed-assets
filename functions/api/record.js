// functions/api/record.js - Cloudflare Pages 兼容版
const PUBLIC_FIELDS_FALLBACK = ['资产名称', '资产编号', '资产状态'];

// ==================== 配置缓存 ====================
let cachedFieldConfig = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60 * 1000; // 1分钟

async function getFieldConfig(env) {
  const now = Date.now();
  if (cachedFieldConfig && now < configCacheTime) return cachedFieldConfig;
  try {
    let config = await env.CONFIG_KV?.get('field_visibility', 'json');
    if (!config) {
      config = { publicFields: PUBLIC_FIELDS_FALLBACK, hiddenFields: [] };
    }
    cachedFieldConfig = config;
    configCacheTime = now + CONFIG_CACHE_TTL;
    return config;
  } catch (err) {
    console.error('Failed to load field config:', err);
    return { publicFields: PUBLIC_FIELDS_FALLBACK, hiddenFields: [] };
  }
}

function filterFields(fields, isLoggedIn, config) {
  const { publicFields, hiddenFields } = config;
  let allowedKeys = isLoggedIn ? Object.keys(fields) : publicFields;
  allowedKeys = allowedKeys.filter(key => !hiddenFields.includes(key));
  const result = {};
  for (const key of allowedKeys) {
    result[key] = fields[key] !== undefined ? fields[key] : null;
  }
  return result;
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

// ==================== 租户 token 缓存 ====================
let cachedTenantToken = null;
let tenantTokenExpire = 0;

async function getTenantAccessToken(env) {
  const now = Date.now();
  if (cachedTenantToken && now < tenantTokenExpire) return cachedTenantToken;
  const { APP_ID, APP_SECRET } = env;
  if (!APP_ID || !APP_SECRET) throw new Error('Missing APP_ID or APP_SECRET');

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`tenant token error: ${JSON.stringify(json)}`);
  cachedTenantToken = json.tenant_access_token;
  tenantTokenExpire = now + (json.expire || 7200) * 1000 - 5 * 60 * 1000;
  return cachedTenantToken;
}

// ==================== 用户 token 管理（使用 env.USER_TOKENS） ====================
async function getUserTokenData(openId, env) {
  const raw = await env.USER_TOKENS.get(openId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function saveUserTokenData(openId, data, env) {
  await env.USER_TOKENS.put(openId, JSON.stringify(data));
}
async function refreshUserToken(refreshToken, env) {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/refresh_access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: env.APP_ID,
      client_secret: env.APP_SECRET,
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
  if (data.expires_at > now + 5 * 60 * 1000) return data.access_token;
  try {
    const newData = await refreshUserToken(data.refresh_token, env);
    await saveUserTokenData(openId, newData, env);
    return newData.access_token;
  } catch (err) {
    console.error('refresh failed', err);
    return null;
  }
}
async function verifyUserToken(token) {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error('Invalid user token');
  return json.data;
}

// ==================== 多维表格业务逻辑 ====================
async function getRecordList(tenantToken, isLoggedIn, env) {
  const { APP_TOKEN, TABLE_ID } = env;
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tenantToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`list error: ${JSON.stringify(json)}`);
  const items = json.data.items || [];
  const config = await getFieldConfig(env);
  return items.map((item) => {
    const fields = item.fields || {};
    const filtered = filterFields(fields, isLoggedIn, config);
    return { id: item.record_id, ...filtered };
  });
}

async function getRecordDetail(tenantToken, recordId, isLoggedIn, env) {
  const { APP_TOKEN, TABLE_ID } = env;
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tenantToken}` } });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`detail error: ${JSON.stringify(json)}`);
  const fields = json.data.record.fields || {};
  const config = await getFieldConfig(env);
  const filtered = filterFields(fields, isLoggedIn, config);
  return { id: recordId, ...filtered };
}

async function updateRecord(userToken, recordId, fields, env) {
  const { APP_TOKEN, TABLE_ID } = env;
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
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
    if (method === 'GET') {
      const type = url.searchParams.get('type');
      if (!type) return jsonResponse('Missing type', 400, true);
      const tenantToken = await getTenantAccessToken(env);
      let isLoggedIn = false;
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const userToken = authHeader.slice(7);
        try {
          const userInfo = await verifyUserToken(userToken);
          const openId = userInfo.open_id;
          const validToken = await getValidUserAccessToken(openId, env);
          if (validToken) isLoggedIn = true;
        } catch (err) { console.error(err); }
      }
      if (type === 'list') {
        return jsonResponse(await getRecordList(tenantToken, isLoggedIn, env));
      } else if (type === 'detail') {
        const id = url.searchParams.get('id');
        if (!id) return jsonResponse('Missing id', 400, true);
        return jsonResponse(await getRecordDetail(tenantToken, id, isLoggedIn, env));
      } else {
        return jsonResponse('Invalid type', 400, true);
      }
    }

    if (method === 'POST') {
      const action = url.searchParams.get('action');
      if (action !== 'update') return jsonResponse('Invalid action', 400, true);
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return jsonResponse('Unauthorized', 401, true);
      const userToken = authHeader.slice(7);
      let openId;
      try {
        const userInfo = await verifyUserToken(userToken);
        openId = userInfo.open_id;
      } catch (err) { return jsonResponse('Invalid token', 401, true); }
      const validToken = await getValidUserAccessToken(openId, env);
      if (!validToken) return jsonResponse('Token expired', 401, true);
      const { id, fields } = await request.json();
      if (!id || !fields) return jsonResponse('Missing id or fields', 400, true);
      await updateRecord(validToken, id, fields, env);
      return jsonResponse({ success: true });
    }

    return jsonResponse('Method not allowed', 405, true);
  } catch (err) {
    console.error(err);
    return jsonResponse(err.message, 500, true);
  }
}
