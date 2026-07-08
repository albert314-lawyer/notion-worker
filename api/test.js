export default async function handler(req, res) {
  try {
    const { text } = req.body;

    // GPT 호출
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: `
다음 내용을 노션에 저장하기 좋게 정리해.

반드시 JSON만 출력한다.

{
  "title":"",
  "summary":"",
  "category":"",
  "tags":[],
  "content":""
}

내용:
${text}
`
      })
    });

    const ai = await response.json();

    // OpenAI 오류
    if (ai.error) {
      return res.status(500).json(ai);
    }

    const message = ai.output.find(x => x.type === "message");

    const output = message.content.find(
      x => x.type === "output_text"
    );

    const note = JSON.parse(output.text);

    // 허용 카테고리
    const category = [
      "투자",
      "법학",
      "독서",
      "LEET",
      "경제",
      "AI",
      "아이디어"
    ].includes(note.category)
      ? note.category
      : "기타";

    // ---------- Notion Block 생성 ----------
    const children = [];

    function addParagraph(text) {
      if (!text) return;

      const str = String(text);

      for (let i = 0; i < str.length; i += 1900) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: str.slice(i, i + 1900)
                }
              }
            ]
          }
        });
      }
    }

    addParagraph(note.summary);
    addParagraph(note.content);

    // ---------- Notion 저장 ----------
    const notion = await fetch(
      "https://api.notion.com/v1/pages",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28"
        },
        body: JSON.stringify({
          parent: {
            database_id: process.env.NOTION_DATABASE_ID
          },
          properties: {
            이름: {
              title: [
                {
                  text: {
                    content: String(note.title).slice(0, 200)
                  }
                }
              ]
            },
            분류: {
              select: {
                name: category
              }
            }
          },
          children
        })
      }
    );

    const notionResult = await notion.text();

    if (!notion.ok) {
      return res.status(notion.status).send(notionResult);
    }

    return res.status(200).json({
      success: true,
      note
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
}