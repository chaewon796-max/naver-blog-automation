export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 50);

  const rows = await env.DB.prepare(
    `
    SELECT id, title, keyword, status, score, created_at
    FROM posts
    WHERE status='draft'
    ORDER BY datetime(created_at) DESC
    LIMIT ?
    `
  ).bind(limit).all();

  return new Response(JSON.stringify({ items: rows.results || [] }), {
    headers: { "content-type": "application/json" },
  });
}
