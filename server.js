import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { streamChat, generateOnce, toUserError, LlmError, describeProvider } from "./lib/llm.js";
import { characters, chats, newId } from "./lib/store.js";
import {
  buildSystemPrompt,
  characterGenPrompt,
  CHARACTER_SCHEMA,
  DEFAULT_EMOTIONS,
  EMOTION_DIMS,
} from "./lib/prompts.js";

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT, "public")));

const now = () => new Date().toISOString();

/* ---------------- 角色 ---------------- */

app.get("/api/characters", (req, res) => {
  res.json(characters.all());
});

app.post("/api/characters", (req, res) => {
  const ch = characters.insert({
    id: newId(),
    createdAt: now(),
    updatedAt: now(),
    ...sanitizeCharacter(req.body),
  });
  res.status(201).json(ch);
});

app.put("/api/characters/:id", (req, res) => {
  const ch = characters.update(req.params.id, sanitizeCharacter(req.body));
  if (!ch) return res.status(404).json({ error: "角色不存在" });
  res.json(ch);
});

app.delete("/api/characters/:id", (req, res) => {
  for (const chat of chats.all().filter((c) => c.characterId === req.params.id)) {
    chats.remove(chat.id);
  }
  characters.remove(req.params.id);
  res.json({ ok: true });
});

const CHARACTER_FIELDS = [
  "name", "gender", "age", "identity", "appearance", "scent", "personality",
  "likes", "dislikes", "speechStyle", "background", "secret", "worldview",
  "relationship", "greeting", "avatar",
];

function sanitizeCharacter(body = {}) {
  const out = {};
  for (const key of CHARACTER_FIELDS) {
    if (typeof body[key] === "string") out[key] = body[key].slice(0, 8000);
  }
  return out;
}

/* --------- AI 生成人設 --------- */

app.post("/api/characters/generate", async (req, res) => {
  try {
    const text = await generateOnce({
      prompt: characterGenPrompt(req.body?.idea),
      jsonSchema: CHARACTER_SCHEMA,
    });
    res.json(parseJsonLoose(text));
  } catch (err) {
    console.error("generate-character failed:", err);
    const { status, message } = toUserError(err);
    res.status(status).json({ error: message });
  }
});

// 寬鬆解析模型輸出的 JSON（容忍 markdown 圍欄或前後說明文字）
function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* 繼續嘗試 */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* 繼續 */ }
  }
  throw new LlmError("模型沒有輸出有效的 JSON，請再按一次生成。", 502);
}

/* ---------------- 對話 ---------------- */

app.get("/api/chats", (req, res) => {
  const list = chats.all().map(({ id, characterId, title, updatedAt, emotions, messages }) => ({
    id, characterId, title, updatedAt, emotions,
    messageCount: messages.length,
  }));
  res.json(list);
});

app.post("/api/chats", (req, res) => {
  const character = characters.get(req.body?.characterId);
  if (!character) return res.status(404).json({ error: "角色不存在" });
  const chat = chats.insert({
    id: newId(),
    characterId: character.id,
    title: `與${character.name}的故事`,
    userPersona: typeof req.body?.userPersona === "string" ? req.body.userPersona.slice(0, 4000) : "",
    emotions: { ...DEFAULT_EMOTIONS },
    messages: character.greeting
      ? [{ id: newId(), role: "assistant", content: character.greeting, createdAt: now() }]
      : [],
    createdAt: now(),
    updatedAt: now(),
  });
  res.status(201).json(chat);
});

app.get("/api/chats/:id", (req, res) => {
  const chat = chats.get(req.params.id);
  if (!chat) return res.status(404).json({ error: "對話不存在" });
  res.json(chat);
});

app.delete("/api/chats/:id", (req, res) => {
  chats.remove(req.params.id);
  res.json({ ok: true });
});

/* --------- 傳訊息（SSE 串流回覆） --------- */

app.post("/api/chats/:id/messages", async (req, res) => {
  const chat = chats.get(req.params.id);
  if (!chat) return res.status(404).json({ error: "對話不存在" });
  const content = (req.body?.content ?? "").trim();
  if (!content) return res.status(400).json({ error: "訊息不可為空" });

  chat.messages.push({ id: newId(), role: "user", content, createdAt: now() });
  chats.update(chat.id, { messages: chat.messages });
  await streamReply(chat, res);
});

// 重新生成上一則角色回覆
app.post("/api/chats/:id/regenerate", async (req, res) => {
  const chat = chats.get(req.params.id);
  if (!chat) return res.status(404).json({ error: "對話不存在" });
  const last = chat.messages[chat.messages.length - 1];
  // 開場白（首則）不可重生，避免清空整個故事
  if (!last || last.role !== "assistant" || chat.messages.length < 2) {
    return res.status(400).json({ error: "沒有可重新生成的回覆" });
  }
  chat.messages.pop();
  chats.update(chat.id, { messages: chat.messages });
  await streamReply(chat, res);
});

async function streamReply(chat, res) {
  const character = characters.get(chat.characterId);
  if (!character) {
    res.status(404).json({ error: "角色已被刪除" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const apiMessages = chat.messages.map(({ role, content }) => ({ role, content }));
  // API 要求第一則訊息必須是 user；開場白是 assistant 時補一則引導
  if (apiMessages[0]?.role === "assistant") {
    apiMessages.unshift({ role: "user", content: "（故事開始。）" });
  }

  try {
    const { text: raw, refusal } = await streamChat({
      system: buildSystemPrompt({ ...character, emotions: chat.emotions }, chat.userPersona),
      messages: apiMessages,
      onDelta: (delta) => send("delta", { text: delta }),
    });
    if (refusal) {
      send("error", { error: "模型拒絕了這段內容，試著調整說法或用（OOC）換個劇情方向。" });
      res.end();
      return;
    }

    const { text, emotions } = extractMood(raw, chat.emotions);

    const message = { id: newId(), role: "assistant", content: text, createdAt: now() };
    chat.messages.push(message);
    chats.update(chat.id, { messages: chat.messages, emotions });

    send("done", { message, emotions });
  } catch (err) {
    console.error("streamReply failed:", err);
    send("error", { error: toUserError(err).message });
  }
  res.end();
}

// 從回覆結尾解析 <mood>{...}</mood>，並將其從正文移除
function extractMood(raw, prev) {
  const emotions = { ...prev };
  let text = raw;
  const match = raw.match(/<mood>\s*(\{[\s\S]*?\})\s*<\/mood>/);
  if (match) {
    text = raw.replace(match[0], "").trim();
    try {
      const parsed = JSON.parse(match[1]);
      for (const dim of EMOTION_DIMS) {
        const v = Number(parsed[dim]);
        if (Number.isFinite(v)) emotions[dim] = Math.max(0, Math.min(100, Math.round(v)));
      }
    } catch {
      // 解析失敗就沿用先前數值
    }
  }
  return { text: text.trim(), emotions };
}

app.listen(PORT, () => {
  console.log(`♥ roMANce 已啟動： http://localhost:${PORT}`);
  console.log(`  供應商：${describeProvider()}`);
  if (!process.env.OPENAI_BASE_URL && !process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ 尚未設定 ANTHROPIC_API_KEY 或 OPENAI_BASE_URL，聊天時會出現錯誤提示（設定方式見 README）");
  }
});
