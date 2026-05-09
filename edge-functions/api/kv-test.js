export async function onRequest({ env }) {
  try {
    if (!env.USER_TOKENS) {
      return new Response(JSON.stringify({ error: 'KV binding missing', envKeys: Object.keys(env) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    await env.USER_TOKENS.put('test-key', 'test-value');
    const value = await env.USER_TOKENS.get('test-key');
    return new Response(JSON.stringify({ success: true, value }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
