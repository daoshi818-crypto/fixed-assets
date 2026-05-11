// functions/api/test-feishu.js
export async function onRequest({ env }) {
    const startTime = Date.now();

    try {
        // 1. 获取租户 token（完全独立实现）
        const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app_id: env.APP_ID,
                app_secret: env.APP_SECRET
            })
        });
        const tokenJson = await tokenRes.json();
        if (tokenJson.code !== 0) throw new Error('Token error: ' + JSON.stringify(tokenJson));
        const tenantToken = tokenJson.tenant_access_token;

        // 2. 调用飞书多维表格 API 获取记录列表
        const recordsRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${env.APP_TOKEN}/tables/${env.TABLE_ID}/records/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tenantToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const recordsData = await recordsRes.json();

        const duration = Date.now() - startTime;

        return new Response(JSON.stringify({
            status: 'ok',
            feishu_api_code: recordsData.code,
            duration_ms: duration
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        const duration = Date.now() - startTime;
        return new Response(JSON.stringify({
            error: err.message,
            duration_ms: duration
        }), { status: 500 });
    }
}
