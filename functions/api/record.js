// functions/api/record.js - 调试版本
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 输出环境变量 keys 和 KV 状态
  console.log('=== record.js started ===');
  console.log('env keys:', Object.keys(env));
  console.log('USER_TOKENS type:', typeof env.USER_TOKENS);
  console.log('CONFIG_KV type:', typeof env.CONFIG_KV);

  // 检查必要环境变量
  const required = ['APP_ID', 'APP_SECRET', 'APP_TOKEN', 'TABLE_ID'];
  for (const key of required) {
    if (!env[key]) {
      console.error(`Missing env.${key}`);
      return new Response(JSON.stringify({ error: `Missing ${key}` }), { status: 500 });
    }
  }

  try {
    // 获取租户 token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: env.APP_ID, app_secret: env.APP_SECRET }),
    });
    const tokenJson = await tokenRes.json();
    if (tokenJson.code !== 0) {
      console.error('Tenant token error:', tokenJson);
      return new Response(JSON.stringify({ error: 'tenant token failed', detail: tokenJson }), { status: 500 });
    }
    const tenantToken = tokenJson.tenant_access_token;

    // 查询记录
    const listUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.APP_TOKEN}/tables/${env.TABLE_ID}/records/search`;
    const listRes = await fetch(listUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tenantToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const listJson = await listRes.json();
    if (listJson.code !== 0) {
      console.error('List error:', listJson);
      return new Response(JSON.stringify({ error: 'list failed', detail: listJson }), { status: 500 });
    }

    const items = (listJson.data.items || []).map(item => ({
      id: item.record_id,
      asset_name: item.fields?.['资产名称'] || '',
      asset_code: item.fields?.['资产编号'] || '',
      status: item.fields?.['资产状态'] || '',
    }));

    return new Response(JSON.stringify({ code: 0, data: items }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
