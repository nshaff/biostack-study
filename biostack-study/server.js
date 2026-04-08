import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

function buildPrompt({ mode, notes, topic }) {
  const base =
    `You are a study flashcard generator.\n` +
    `Return ONLY a JSON array. No markdown. No backticks. No extra text.\n` +
    `Schema: [{"q":"question","a":"answer"}]\n\n`;
  if (mode === "topic") {
    return (
      base +
      `Create an appropriate number of flashcards for the topic below.\n` +
      `Choose the number based on topic breadth and expected difficulty.\n` +
      `Do not exceed 40 cards.\n` +
      `Topic: ${topic}\n`
    );
  }
  return (
    base +
    `Create an appropriate number of flashcards from the notes below.\n` +
    `Choose the number based on how many distinct facts/concepts/procedures are present.\n` +
    `Do not exceed 40 cards.\n` +
    `Notes:\n${notes}\n`
  );
}

async function generateWithOllama({ mode, notes, topic }) {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  const prompt = buildPrompt({ mode, notes, topic });

  const r = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
      options: { temperature: 0.2 },
    }),
  });

  const data = await r.json().catch(() => null);
  if (!r.ok) {
    return { ok: false, status: r.status, data };
  }
  const text = data?.message?.content || "";
  return { ok: true, text };
}

app.post("/api/generate", async (req, res) => {
  try {
    const { mode, notes, topic } = req.body ?? {};
    if (!mode || (mode !== "deck" && mode !== "cards" && mode !== "topic")) {
      return res.status(400).json({ error: "Invalid mode." });
    }
    if (mode === "topic" && (!topic || typeof topic !== "string")) {
      return res.status(400).json({ error: "Missing topic." });
    }
    if (mode !== "topic" && (!notes || typeof notes !== "string")) {
      return res.status(400).json({ error: "Missing notes." });
    }

    const ollama = await generateWithOllama({ mode, notes, topic });
    if (!ollama.ok) {
      return res.status(502).json({
        error:
          "Ollama error. Is Ollama running locally? Try: `ollama serve` and ensure a model is installed.",
        details: ollama.data,
      });
    }

    const cleaned = String(ollama.text).replace(/```json|```/g, "").trim();

    let cards;
    try {
      cards = JSON.parse(cleaned);
    } catch {
      // Try to salvage a JSON array from extra text.
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("Failed to parse JSON array.");
      cards = JSON.parse(match[0]);
    }

    if (!Array.isArray(cards)) {
      return res.status(500).json({ error: "Model did not return an array." });
    }
    const normalized = cards
      .map((c) => ({
        q: typeof c?.q === "string" ? c.q.trim() : "",
        a: typeof c?.a === "string" ? c.a.trim() : "",
      }))
      .filter((c) => c.q && c.a)
      .slice(0, 50);

    return res.json({ cards: normalized });
  } catch (err) {
    return res.status(500).json({ error: "Server error.", details: String(err?.message || err) });
  }
});

app.use(express.static(__dirname));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const port = Number(process.env.PORT || 5174);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`biostack study running on http://localhost:${port}`);
});

