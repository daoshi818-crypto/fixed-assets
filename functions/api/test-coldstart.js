export async function onRequest() {
    const startTime = Date.now();
    return new Response(JSON.stringify({ duration_ms: Date.now() - startTime }));
}
