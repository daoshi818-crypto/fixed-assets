// functions/api/test-feishu.js
export async function onRequest({ env }) {
    const startTime = Date.now();
    try {
        const tenantToken = await getTenantAccessToken(env); // 复用您已有的函数
        const recordsRes = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${env.APP_TOKEN}/tables/${env.TABLE_ID}/records/search`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tenantToken}` }
        });
        const recordsData = await recordsRes.json();
        const duration = Date.now() - startTime;
        return new Response(JSON.stringify({
            status: 'ok',
            duration_ms: duration
        }));
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }));
    }
}
