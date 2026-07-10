# 🌹 roMANce 唯戀

一個自架的沉浸式 AI 戀愛角色扮演平台（靈感來自 whif.io），專為言情、BG / BL 與各種戀愛題材打造。用小說級的文筆與你創造的角色互動，劇情走向與關係深淺完全由你掌握。

## 特色

- **角色創建** — 自訂姓名、外貌、性格、喜好、氣味／信息素、隱藏設定、世界觀、開場白等完整人設欄位
- **✨ AI 生成人設** — 一句話構想（例如「ABO 世界觀、佔有慾極強的財閥 Alpha」），AI 幫你補完整張角色卡與開場劇情
- **小說級敘事** — 角色以第三人稱小說筆法回覆：動作神態、對白、心理描寫、情感張力，並在懸念處收尾
- **六維情感系統** — 好感・信任・心動・依賴・佔有・張力。每輪互動後角色情感真實波動，雷達圖與數值即時呈現
- **OOC 特殊指令** — 在訊息中使用（括號）下幕後指示，如 `（時間跳到隔天早上）`、`（讓劇情往誤會的方向發展）`
- **多故事線** — 同一角色可以開啟多段平行故事，各自獨立的記憶與情感狀態
- **↻ 重寫** — 不滿意的回覆可以一鍵重新生成

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定模型來源（見下方「模型來源」，擇一即可）
cp .env.example .env
# 編輯 .env

# 3. 啟動
npm start
# 打開 http://localhost:3000
```

## 模型來源（擇一）

### 方案 A：Anthropic Claude（品質最好，需付費金鑰）

到 [console.anthropic.com](https://console.anthropic.com) 申請金鑰，填入 `.env`：

```ini
ANTHROPIC_API_KEY=sk-ant-...
```

### 方案 B：不申請 Anthropic 金鑰

在 `.env` 設定 `OPENAI_BASE_URL` 後，會自動改走任何 OpenAI 相容端點：

**B1. Ollama 本地模型 — 完全免費、資料不出你的電腦**

1. 安裝 [ollama.com](https://ollama.com)
2. 下載一個中文能力好的模型：`ollama pull qwen3:8b`（顯卡記憶體大可以選 `qwen3:14b` 或更大）
3. `.env` 設定：
   ```ini
   OPENAI_BASE_URL=http://localhost:11434/v1
   MODEL=qwen3:8b
   ```
4. 建議啟動 Ollama 時放大上下文長度，長對話才不會失憶：
   `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`

**B2. 雲端免費額度**（品質比本地小模型好，但有用量限制）

| 服務 | OPENAI_BASE_URL | 模型範例 |
|---|---|---|
| [Google AI Studio](https://aistudio.google.com) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| [OpenRouter](https://openrouter.ai)（選 `:free` 模型） | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat-v3-0324:free` |
| [Groq](https://console.groq.com) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |

以上都要在該服務網站免費註冊拿一把金鑰填到 `OPENAI_API_KEY`（Ollama 不用）。各服務與模型的內容尺度政策不同，實際體驗請自行測試。

## 技術架構

| 部分 | 技術 |
|---|---|
| 後端 | Node.js + Express，SSE 串流回覆 |
| LLM | Anthropic Claude（預設 `claude-opus-4-8`），或任何 OpenAI 相容端點（Ollama／Gemini／Groq／OpenRouter） |
| 人設生成 | Anthropic 走 Structured Outputs（JSON Schema）；相容端點走提示詞約束＋寬鬆 JSON 解析 |
| 情感系統 | 系統提示詞引導模型每輪輸出 `<mood>` 數值，後端解析並持久化 |
| 儲存 | 本機 JSON 檔（`data/`，已加入 .gitignore） |
| 前端 | 原生 HTML / CSS / JS，無 build step |

## 目錄結構

```
server.js          # Express 伺服器與 API 路由
lib/prompts.js     # 系統提示詞、六維情感、人設生成 schema
lib/store.js       # JSON 檔案儲存
public/            # 前端（index.html / app.js / style.css）
data/              # 角色與對話資料（執行時自動建立）
```

## 內容說明

角色扮演的敘事以成年角色之間的戀愛為題材，情感與親密描寫的實際尺度由所使用的模型與其供應商的內容政策決定。

## 給自己玩的一些點子

- 在角色的「隱藏設定」放一個秘密，看角色會在第幾輪不小心露出馬腳
- 用 OOC 指令切換視角或插入回憶殺：`（插入一段他五年前的回憶）`
- 把「張力」逼到 90 以上再和好，情感曲線會很好看
