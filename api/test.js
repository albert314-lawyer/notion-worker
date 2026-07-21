export default async function handler(req, res) {
  try {
    // ---------- 요청 본문 안전 처리 ----------
    const body =
  	typeof req.body === "string"
 	   ? JSON.parse(req.body)
 	   : (req.body || {});

    const text = String(body?.text || "").trim();

    if (!text) {
      return res.status(400).json({
        error: "text가 비어 있습니다."
      });
    }

    // ---------- OpenAI 호출 ----------
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
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

반드시 JSON만 출력한다.

{
  "title":"",
  "summary":"",
  "category":"",
  "tags":[],
  "content":""
}

title
- 40자 내외

summary
- 3~5문장
- 결론 먼저

category

다음 중 하나만 선택

투자
법학
독서
LEET
경제
AI
아이디어
기타

tags
- 3~8개
- 중복 금지

content는 반드시 Markdown으로 작성한다.

순서

## 핵심

## 중요한 내용

## 예시

## 기억해야 할 포인트

- 핵심1
- 핵심2
- 핵심3

## 활용

## 실전 체크리스트

내용은 절대 축약하지 말고
중요한 내용은 모두 유지한다.

본문:

${text}
`
        })
      }
    );

    const ai = await response.json();

    // ---------- OpenAI 오류 ----------
    if (!response.ok) {
      return res.status(response.status).json(ai);
    }

    if (ai.error) {
      return res.status(500).json(ai);
    }

    // ---------- GPT 응답 추출 ----------
    const message = ai.output?.find(
      item => item.type === "message"
    );

    if (!message) {
      return res.status(500).json({
        error: "GPT 응답(message)이 없습니다.",
        raw: ai
      });
    }

    const output = message.content?.find(
      item => item.type === "output_text"
    );

    if (!output) {
      return res.status(500).json({
        error: "output_text가 없습니다.",
        raw: ai
      });
    }

    // ---------- JSON 문자열 정리 ----------
    if (!output.text) {
      return res.status(500).json({
        error: "output.text가 없습니다."
      });
    }

    const jsonText = output.text
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    let note;

    try {
      note = JSON.parse(jsonText);
    } catch (e) {
      return res.status(500).json({
        error: "GPT가 올바른 JSON을 반환하지 않았습니다.",
        raw: jsonText
      });
    }

    // ---------- 카테고리 검증 ----------
    const allowedCategories = [
      "투자",
      "법학",
      "독서",
      "LEET",
      "경제",
      "AI",
      "아이디어",
      "기타"
    ];

    const category = allowedCategories.includes(
      note.category
    )
      ? note.category
      : "기타";

    const tags = Array.isArray(note.tags)
      ? [...new Set(note.tags)]
          .slice(0, 8)
          .map(tag => String(tag).slice(0, 100))
      : [];

    // ---------- Markdown 변환 ----------
function markdownToBlocks(markdown) {
  const blocks = [];

  if (!markdown) return blocks;

  const lines = String(markdown)
    .replace(/\r/g, "")
    .split("\n");

  for (let raw of lines) {
    const line = raw.trim();

    if (!line) continue;

    // -----------------------
    // H2
    // -----------------------

    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          function parseRichText(text) {
            const rich = [];

            const regex = /\*\*(.*?)\*\*/g;

            let last = 0;
            let match;
          
            while ((match = regex.exec(text)) !== null) {

              if (match.index > last) {
                rich.push({
                  type: "text",
                  text: {
                    content: text.slice(last, match.index)
                  }
                });
              }

              rich.push({
                type: "text",
                text: {
                  content: match[1]
                },
                annotations: {
                  bold: true
                }
              });

              last = regex.lastIndex;
            }

            if (last < text.length) {
              rich.push({
                type: "text",
                text: {
                  content: text.slice(last)
                }
              });
            }

            return rich;
          }
        }
      });

      continue;
    }

    // -----------------------
    // Divider
    // -----------------------

    if (
      line === "---" ||
      line === "***"
    ) {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {}
      });

      continue;
    }

    // -----------------------
    // Bullet List
    // -----------------------

    if (
      line.startsWith("- ") ||
      line.startsWith("* ")
    ) {

      const text = line
        .replace(/^[-*]\s/, "");

      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: parseRichText(text)
        }
      });

      continue;
    }

    // -----------------------
    // Numbered List
    // -----------------------

    if (/^\d+\.\s/.test(line)) {

      const text = line.replace(
        /^\d+\.\s/,
        ""
      );

      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: text.slice(0, 1900)
              }
            }
          ]
        }
      });

      continue;
    }

    // -----------------------
    // Quote
    // -----------------------

    if (line.startsWith("> ")) {

      blocks.push({
        object: "block",
        type: "quote",
        quote: {
          rich_text: [
            {
              type: "text",
              text: {
                content: line
                  .replace(/^>\s/, "")
                  .slice(0, 1900)
              }
            }
          ]
        }
      });

      continue;
    }

    // -----------------------
    // Code Block
    // -----------------------

    if (line.startsWith("```")) {
      continue;
    }

    // -----------------------
    // 일반 문단
    // -----------------------

    for (
      let i = 0;
      i < line.length;
      i += 1900
    ) {

      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: line.slice(
                  i,
                  i + 1900
                )
              }
            }
          ]
        }
      });

    }

  }

  return blocks;
}
    // ==========================
    // Notion Block 생성
    // ==========================

    const children = [];

    // ---------- 제목 ----------
    children.push({
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [
          {
            type: "text",
            text: {
              content: String(note.title || "").slice(0, 200)
            }
          }
        ]
      }
    });

    // ---------- 구분선 ----------
    children.push({
      object: "block",
      type: "divider",
      divider: {}
    });

    // ---------- 요약 ----------
    if (note.summary) {

      children.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "📌 요약"
              }
            }
          ]
        }
      });

      children.push(
        ...markdownToBlocks(note.summary)
      );
    }

    // ---------- 본문 ----------
    if (note.content) {

      children.push({
        object: "block",
        type: "divider",
        divider: {}
      });

      children.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "📝 본문"
              }
            }
          ]
        }
      });

      children.push(
        ...markdownToBlocks(note.content)
      );
    }

    // ---------- 태그가 없는 경우 ----------
    if (!Array.isArray(note.tags)) {
      note.tags = [];
    }

    // ---------- 카테고리 ----------
    const finalCategory =
      [
        "투자",
        "법학",
        "독서",
        "LEET",
        "경제",
        "AI",
        "아이디어",
        "기타"
      ].includes(category)
        ? category
        : "기타";

    // ---------- 태그 ----------
    const finalTags =
      note.tags
        .filter(Boolean)
        .map(tag => String(tag))
        .slice(0, 8);

    // ---------- 페이지 데이터 ----------
    const notionBody = {

      parent: {
        database_id:
          process.env.NOTION_DATABASE_ID
      },

      properties: {

        이름: {
          title: [
            {
              text: {
                content: String(
                  note.title || "제목 없음"
                ).slice(0, 200)
              }
            }
          ]
        },

        분류: {
          select: {
            name: finalCategory
          }
        },

        태그: {
          multi_select:
            finalTags.map(tag => ({
              name: tag.slice(0, 100)
            }))
        }

      },

      children

    };
    // ==========================
    // Notion 저장
    // ==========================

    const notion = await fetch(
      "https://api.notion.com/v1/pages",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28"
        },
        body: JSON.stringify(notionBody)
      }
    );

    const notionResult = await notion.text();

    if (!notion.ok) {

      let notionError;

      try {
        notionError = JSON.parse(notionResult);
      } catch {
        notionError = notionResult;
      }

      return res.status(notion.status).json({
        success: false,
        error: "Notion 저장 실패",
        notion: notionError
      });

    }

    // ==========================
    // 성공
    // ==========================

    return res.status(200).json({
      success: true,
      title: note.title,
      category: finalCategory,
      tags: finalTags
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });

  }
}