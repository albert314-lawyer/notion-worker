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

    const jsonString =
      ai.output
        .find(x => x.type === "message")
        .content
        .find(x => x.type === "output_text")
        .text;

    const note = JSON.parse(jsonString);

    // Notion 저장
    const notion = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
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
                  content: note.title
                }
              }
            ]
          },
          분류: {
            select: {
              name: note.category || "기타"
            }
          }
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: note.summary
                  }
                }
              ]
            }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: note.content
                  }
                }
              ]
            }
          }
        ]
      })
    });

    const result = await notion.text();

    res.status(200).send(result);

  } catch (err) {
    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
}