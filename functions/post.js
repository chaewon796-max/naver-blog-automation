export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "id required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const row = await env.DB.prepare(
    `
    SELECT id, title, content, keyword, status, score, created_at
    FROM posts
    WHERE id = ?
    `
  ).bind(id).first();

  if (!row) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // 해시태그 분리(본문 마지막 줄에 #이 많이 붙는 경우 대비)
  const lines = String(row.content || "").split("\n");
  const hashtags = lines.filter((l) => l.trim().startsWith("#")).join("\n");
  const body = lines.filter((l) => !l.trim().startsWith("#")).join("\n").trim();

  return new Response(JSON.stringify({ ...row, body, hashtags }), {
    headers: { "content-type": "application/json" },
  });
}
