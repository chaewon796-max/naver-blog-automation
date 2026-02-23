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

    // ⏱️ 타임아웃 컨트롤러 생성
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    /* =========================================================
       1️⃣ 블로그 생성
    ========================================================= */

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
키워드: ${keyword}

네이버 검색의도 기반 블로그 글 작성.

[스타일]
- 사람이 직접 작성하는 스타일 학습 기반 생성
- 문장 길이 다양화
- 모바일 가독성 중심
- 설명 → 요약 → 질문 흐름 반복
- 정보성 + 경험형 톤 혼합
- 이전 생성 글과 문장 구조 반복 금지
- 이전 글과 제목 패턴 유사 금지

[제목]
- 클릭 유도 구조
- 숫자, 구체성, 궁금증 요소 중 최소 1개 포함

[본문]
- 목록 3~5개 포함
- 과장 금지
- 키워드 자연 포함

[마무리]
- 짧고 명확하게 정리

[해시태그]
- 8~15개
- 키워드 파생 중심
`,
                },
              ],
            },
          ],
        }),
      }
    );

    clearTimeout(timeout);

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("GEMINI ERROR:", JSON.stringify(geminiData));
      return new Response(JSON.stringify({ error: "Gemini API error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    let content = "";

    if (geminiData.candidates?.length) {
      const parts = geminiData.candidates[0].content.parts;
      content = parts.map((p) => p.text || "").join("\n");
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500 }
      );
    }

    // 제목 추출
    const title = content.split("\n")[0].replace(/[#*]/g, "").trim();

    /* =========================================================
       2️⃣ usageMetadata 토큰 기록
    ========================================================= */

    const genUsage = geminiData.usageMetadata || {};
    const genPromptTokens = genUsage.promptTokenCount || 0;
    const genOutputTokens = genUsage.candidatesTokenCount || 0;

    console.log("GEN TOKENS:", genPromptTokens, genOutputTokens);

    /* =========================================================
       3️⃣ 검수 / 점수화
    ========================================================= */

    const scoreRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
다음 블로그 글을 평가하라.

평가기준:
- 제목 클릭 유도력
- 검색의도 적합성
- 가독성
- 자연스러움
- 중복 패턴 위험도

100점 만점 총점 숫자만 출력.

글:
${content}
`,
                },
              ],
            },
          ],
        }),
      }
    );

    const scoreData = await scoreRes.json();

    const scoreUsage = scoreData.usageMetadata || {};
    const scorePromptTokens = scoreUsage.promptTokenCount || 0;
    const scoreOutputTokens = scoreUsage.candidatesTokenCount || 0;

    console.log("SCORE TOKENS:", scorePromptTokens, scoreOutputTokens);

    const scoreText =
      scoreData.candidates?.[0]?.content?.parts?.[0]?.text || "0";

    const score = parseInt(scoreText.replace(/[^0-9]/g, "")) || 0;

    /* =========================================================
       4️⃣ 품질 필터
    ========================================================= */

    if (score < 80) {
      return new Response(
        JSON.stringify({
          status: "discarded",
          score,
          message: "Quality below 80",
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    /* =========================================================
       5️⃣ DB 저장
    ========================================================= */

    const result = await env.DB.prepare(
      `INSERT INTO posts 
      (title, content, keyword, status, score, 
       gen_prompt_tokens, gen_output_tokens, 
       score_prompt_tokens, score_output_tokens)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
    )
      .bind(
        title,
        content,
        keyword,
        score,
        genPromptTokens,
        genOutputTokens,
        scorePromptTokens,
        scoreOutputTokens
      )
      .run();

    return new Response(
      JSON.stringify({
        status: "ok",
        postId: result.meta.last_row_id,
        score,
        preview: content.slice(0, 200),
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    if (e.name === "AbortError") {
      return new Response(
        JSON.stringify({
          error: "Gemini timeout",
        }),
        { status: 504 }
      );
    }

    console.error("SERVER ERROR:", e);

    return new Response(
      JSON.stringify({
        error: "Server error",
        detail: String(e),
      }),
      { status: 500 }
    );
  }
}
