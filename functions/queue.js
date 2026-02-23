export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    const keyword = (body.keyword || "").trim();
    const platform = (body.platform || "naver").trim(); // naver | tistory
    const scheduled_at = (body.scheduled_at || "").trim(); // "YYYY-MM-DD HH:MM:SS"

    if (!keyword) {
      return new Response(JSON.stringify({ error: "keyword required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!scheduled_at) {
      return new Response(JSON.stringify({ error: "scheduled_at required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!["naver", "tistory"].includes(platform)) {
      return new Response(
        JSON.stringify({ error: "platform must be 'naver' or 'tistory'" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // 형식 체크: "YYYY-MM-DD HH:MM:SS"
    const dtRe = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/;
    if (!dtRe.test(scheduled_at)) {
      return new Response(
        JSON.stringify({
          error: "scheduled_at format must be 'YYYY-MM-DD HH:MM:SS'",
          example: "2026-02-24 09:00:00",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const result = await env.DB.prepare(
      `INSERT INTO publish_queue (keyword, platform, scheduled_at, status)
       VALUES (?, ?, ?, 'queued')`
    )
      .bind(keyword, platform, scheduled_at)
      .run();

    return new Response(
      JSON.stringify({
        status: "queued",
        queueId: result.meta.last_row_id,
        keyword,
        platform,
        scheduled_at,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Server error", detail: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
