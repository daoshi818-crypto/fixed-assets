export async function onRequest({ env }) {
  try {
    const testValue = await env.USER_TOKENS.get('test-key');
    return new Response(JSON.stringify({ hasUserTokens: !!env.USER_TOKENS, testValue }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
