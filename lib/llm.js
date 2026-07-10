// LLM 供應商轉接層：
// - 預設使用 Anthropic Claude（需要 ANTHROPIC_API_KEY）
// - 設定 OPENAI_BASE_URL 後改走任何 OpenAI 相容端點
//   （Ollama、Google AI Studio、Groq、OpenRouter、LM Studio…）
import Anthropic from "@anthropic-ai/sdk";

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "not-needed";

export const provider = OPENAI_BASE_URL ? "openai-compatible" : "anthropic";
export const MODEL =
  process.env.MODEL || (provider === "anthropic" ? "claude-opus-4-8" : "");

const anthropic = provider === "anthropic" ? new Anthropic() : null;

export class LlmError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function describeProvider() {
  return provider === "anthropic"
    ? `Anthropic ｜ 模型：${MODEL}`
    : `OpenAI 相容端點 ${OPENAI_BASE_URL} ｜ 模型：${MODEL || "（未設定 MODEL！）"}`;
}

/** 串流聊天回覆。onDelta(text) 逐段回呼；回傳 { text, refusal } */
export async function streamChat({ system, messages, onDelta }) {
  if (provider === "anthropic") {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    });
    stream.on("text", onDelta);
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, refusal: final.stop_reason === "refusal" };
  }

  const res = await openaiFetch({
    model: MODEL,
    stream: true,
    max_tokens: 4096,
    messages: [{ role: "system", content: system }, ...messages],
  });
  let text = "";
  for await (const data of sseJson(res.body)) {
    const delta = data.choices?.[0]?.delta?.content;
    if (delta) {
      text += delta;
      onDelta(delta);
    }
  }
  return { text, refusal: false };
}

/** 單次生成（AI 生成人設用）。提供 jsonSchema 時要求模型輸出 JSON，回傳原始文字 */
export async function generateOnce({ prompt, jsonSchema }) {
  if (provider === "anthropic") {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      ...(jsonSchema
        ? { output_config: { format: { type: "json_schema", schema: jsonSchema } } }
        : {}),
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") {
      throw new LlmError("模型拒絕了這個請求，換個描述試試。", 422);
    }
    return response.content.find((b) => b.type === "text")?.text ?? "";
  }

  // OpenAI 相容端點對 JSON schema 的支援度不一，改用提示詞約束＋寬鬆解析
  let fullPrompt = prompt;
  if (jsonSchema) {
    const hint = Object.fromEntries(
      Object.entries(jsonSchema.properties).map(([k, v]) => [k, v.description || v.type]),
    );
    fullPrompt += `\n\n請直接輸出一個 JSON 物件（不要加說明文字或 markdown 圍欄），包含以下全部欄位，值一律為字串：\n${JSON.stringify(hint, null, 2)}`;
  }
  const res = await openaiFetch({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: fullPrompt }],
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/* ---------------- OpenAI 相容端點工具 ---------------- */

async function openaiFetch(body) {
  if (!MODEL) {
    throw new LlmError("使用 OPENAI_BASE_URL 時必須在 .env 設定 MODEL（例如 qwen3:8b）。", 500);
  }
  let res;
  try {
    res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LlmError(
      `無法連線到 ${OPENAI_BASE_URL} —— 模型服務有啟動嗎？（Ollama 請先執行 ollama serve）`,
    );
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmError(`模型服務回應錯誤（${res.status}）：${detail || res.statusText}`);
  }
  return res;
}

/** 解析 OpenAI 相容端點的 SSE 串流，逐塊 yield JSON */
async function* sseJson(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        yield JSON.parse(payload);
      } catch {
        // 忽略無法解析的片段
      }
    }
  }
}

/** 把各種錯誤轉成給使用者看的訊息，回傳 { status, message } */
export function toUserError(err) {
  if (err instanceof LlmError) return { status: err.status, message: err.message };
  if (String(err?.message).includes("Could not resolve authentication method")) {
    return {
      status: 500,
      message:
        "尚未設定模型憑證：請在 .env 填 ANTHROPIC_API_KEY，或改用 OPENAI_BASE_URL 接免費的本地／雲端模型（見 README）。",
    };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 500, message: "API 金鑰無效，請檢查 .env 的 ANTHROPIC_API_KEY。" };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "請求太頻繁，稍等一下再試。" };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "無法連線到 Anthropic API，請檢查網路。" };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, message: `API 錯誤（${err.status}）：${err.message}` };
  }
  return { status: 500, message: "發生未知錯誤，請查看伺服器日誌。" };
}
