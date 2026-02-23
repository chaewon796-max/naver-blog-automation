export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  if (url.pathname.endsWith("/health")) {
    try {
      if (!env.DB) {
        return new Response(
          JSON.stringify({ status: "ok", note: "DB not bound yet" }),
          { headers: { "content-type": "application/json" } }
        );
      }
      const r = await env.DB.prepare("SELECT 1 as ok").first();
return new Response(JSON.stringify({ status: "ok", db: r ?? { ok: 1 } }), {
  headers: { "content-type": "application/json" },
});
    } catch (e) {
      return new Response(
        JSON.stringify({ status: "error", message: String(e?.message ?? e) }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  }

  return new Response("naver automation pages functions running");
}
