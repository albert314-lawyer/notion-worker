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
다음 내용을 개인 지식관리(PKM)용 노트로 정리한다.

목표는 나중에 검색했을 때 30초 안에 핵심을 이해할 수 있는 노트를 만드는 것이다.

규칙

1. 반드시 JSON만 출력한다.

{
  "title":"",
  "summary":"",
  "category":"",
  "tags":[],
  "content":""
}

2. title
- 가장 핵심이 드러나도록 40자 내외로 작성한다.

3. summary
- 3~5문장으로 핵심만 요약한다.
- 결론을 먼저 쓴다.

4. category
다음 중 하나만 선택한다.

투자
법학
독서
LEET
경제
AI
아이디어
기타

5. tags
- 3~8개
- 검색할 만한 핵심 키워드
- 중복 금지

6. content

다음 순서를 반드시 지킨다.

## 핵심

한 문단으로 전체 내용 요약

## 중요한 내용

핵심 내용을 논리적으로 정리

## 예시

이해를 돕는 사례

## 기억해야 할 포인트

- 핵심1
- 핵심2
- 핵심3

## 활용

실제로 어떻게 활용할 수 있는지 작성

내용은 절대 축약하지 말고,
중요한 정보는 모두 유지한다.

Markdown 형식으로 작성한다.

추가 규칙

- content는 Markdown 문법을 적극 활용한다.
- 표는 가능한 Markdown 표로 작성한다.
- 제목은 ##까지만 사용한다.
- 불필요한 인사말은 작성하지 않는다.
- 중요한 개념은 굵게 표시한다.
- 예시는 반드시 포함한다.
- 마지막에는 반드시 "실전 체크리스트"를 작성한다.

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

    const message = ai.output?.find(x => x.type === "message");

    if (!message) {
      return res.status(500).json(ai);
    }

    const output = message.content.find(
      x => x.type === "output_text"
    );

    const jsonText = output.text
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/, "")
      .trim();

    const note = JSON.parse(jsonText);

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

    children.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{
          type: "text",
          text: {
            content: "📌 요약"
          }
        }]
      }
    });

    children.push(...markdownToBlocks(note.summary));

    children.push({
      object: "block",
      type: "divider",
      divider: {}
    });

    children.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{
          type: "text",
          text: {
            content: "📝 본문"
          }
        }]
      }
    });

    children.push(...markdownToBlocks(note.content));

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
            },

            태그: {
              multi_select: (note.tags || [])
                .slice(0, 8)
                .map(tag => ({
                  name: String(tag).slice(0, 100)
                }))
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