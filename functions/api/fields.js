// functions/api/fields.js
export async function onRequest(context) {
  const { env } = context;
  const { APP_TOKEN, TABLE_ID, APP_ID, APP_SECRET } = env;

  try {
    // 获取租户 token
    const tenantToken = await getTenantAccessToken({ APP_ID, APP_SECRET });
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg);
    const fields = json.data.items.map(field => field.field_name);
    return new Response(JSON.stringify({ code: 0, data: fields }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ code: -1, message: err.message }), { status: 500 });
  }
}

async function getTenantAccessToken({ APP_ID, APP_SECRET }) {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.msg);
  return json.tenant_access_token;
}
