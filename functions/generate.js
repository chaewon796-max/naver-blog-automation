export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const keyword = body.keyword;

    if (!keyword) {
      return new Response(JSON.stringify({ error: "keyword required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // ✅ Gemini 호출
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
다음 키워드로 네이버 SEO 블로그 글 작성:

키워드: ${keyword}

조건:
- 제목 포함
- 서론/본론/결론 구조
- 최소 1500자 이상
- 사람처럼 자연스럽게 작성
- 과장 금지
`,
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();

    // 🔎 디버깅용 (에러 원인 확인용)
    console.log("GEMINI RESPONSE:", JSON.stringify(geminiData));

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({ error: "Gemini API error", detail: geminiData }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // ✅ 안전 파싱
    let content = "";

    if (geminiData.candidates && geminiData.candidates.length > 0) {
      const parts = geminiData.candidates[0].content.parts;
      content = parts.map((p) => p.text || "").join("\n");
    }

    if (!content) {
      return new Response(
        JSON.stringify({
          error: "AI generation failed",
          raw: geminiData,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // ✅ DB 저장
    const result = await env.DB.prepare(
      "INSERT INTO posts (title, content, keyword, status) VALUES (?, ?, ?, 'draft')"
    )
      .bind(keyword, content, keyword)
      .run();

    return new Response(
      JSON.stringify({
        status: "ok",
        postId: result.meta.last_row_id,
        preview: content.slice(0, 300),
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Server error", detail: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
