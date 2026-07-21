import http from "node:http";

const PORT = Number(process.env.SMART_HEALTH_API_PORT || 3001);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";

const SYSTEM_PROMPT = `You are Smart Health by Design, an AI design co-pilot for biomedical technology innovation.

Your role:
- Help designers explore smart health product concepts, companion mobile apps, CAD/prototype considerations, human factors, safety constraints, manufacturability, and evidence-informed trade-offs.
- Ask concise clarifying questions when requirements are missing.
- Structure answers as practical design guidance: goals, assumptions, options, risks, trade-offs, next steps, and validation ideas.
- Be careful with medical claims. Do not diagnose, prescribe, or present yourself as a clinician. Recommend consultation with qualified medical, regulatory, clinical, or engineering experts when decisions affect patient care, safety, compliance, or clinical performance.
- Be transparent when evidence is not actually available in the app context. Do not invent citations, standards, or test results. Use phrases like "to verify" or "candidate evidence to review" when discussing unverified sources.
- Prioritize patient safety, accessibility, privacy, usability, explainability, regulatory awareness, and human-in-the-loop review.

Answer in a concise, professional product-design voice.`;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function toOllamaMessages(messages = [], context = "") {
  const contextMessage = context
    ? `Current app context: ${context}. The user is working inside the Smart Health by Design UI.`
    : "Current app context: general Smart Health by Design workflow.";

  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextMessage}` },
    ...messages
      .filter((message) => ["user", "assistant"].includes(message.role) && message.content)
      .slice(-12)
      .map((message) => ({ role: message.role, content: String(message.content).slice(0, 4000) }))
  ];
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { ok: true, model: OLLAMA_MODEL });
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    return sendJson(res, 404, { error: "Not found" });
  }

  try {
    const body = await readJson(req);
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model || OLLAMA_MODEL,
        stream: false,
        messages: toOllamaMessages(body.messages, body.context),
        options: {
          temperature: 0.35,
          top_p: 0.9
        }
      })
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      return sendJson(res, 502, { error: "Ollama request failed", detail: text });
    }

    const data = await ollamaRes.json();
    return sendJson(res, 200, {
      model: data.model || body.model || OLLAMA_MODEL,
      message: data.message?.content || ""
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Chat request failed",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Smart Health API listening on http://127.0.0.1:${PORT}`);
  console.log(`Using Ollama model ${OLLAMA_MODEL}`);
});
