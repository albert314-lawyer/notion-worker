export default async function handler(req, res) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5",
      input: "hello"
    })
  });

  const text = await response.text();

  res.status(response.status).send(text);
}