export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    console.log("CURRENT MODEL:", env.GEMINI_MODEL);

    const body = await request.json();
    const keyword = body.keyword;

    if (!keyword) {
      return new Response(JSON.stringify({ error: "keyword required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // 🔥 Gemini 호출 (KEY 반드시 포함)
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

    // 🔎 Gemini 에러 로그
    if (!geminiRes.ok) {
      console.error("GEMINI ERROR:", JSON.stringify(geminiData));
      return new Response(
        JSON.stringify({
          error: "Gemini API error",
          modelUsed: env.GEMINI_MODEL,
          detail: geminiData,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // ✅ 응답 파싱
    let content = "";

    if (geminiData.candidates?.length) {
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

    // 🧠 제목 자동 추출
    const title = content.split("\n")[0].replace(/[#*]/g, "").trim();

    // 💾 DB 저장
    const result = await env.DB.prepare(
      "INSERT INTO posts (title, content, keyword, status) VALUES (?, ?, ?, 'draft')"
    )
      .bind(title, content, keyword)
      .run();

    return new Response(
      JSON.stringify({
        status: "ok",
        modelUsed: env.GEMINI_MODEL,
        postId: result.meta.last_row_id,
        preview: content.slice(0, 300),
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e) {
    console.error("SERVER ERROR:", e);
    return new Response(
      JSON.stringify({
        error: "Server error",
        detail: String(e),
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
