// 系統提示詞與六維情感系統

export const EMOTION_DIMS = ["好感", "信任", "心動", "依賴", "佔有", "張力"];

export const DEFAULT_EMOTIONS = {
  好感: 20,
  信任: 15,
  心動: 10,
  依賴: 5,
  佔有: 5,
  張力: 10,
};

const FIELD_LABELS = [
  ["name", "姓名"],
  ["gender", "性別"],
  ["age", "年齡"],
  ["identity", "身分／職業"],
  ["appearance", "外貌"],
  ["scent", "氣味／信息素"],
  ["personality", "性格"],
  ["likes", "喜好"],
  ["dislikes", "厭惡"],
  ["speechStyle", "說話風格"],
  ["background", "背景故事"],
  ["secret", "隱藏設定（不可直接說出，只能透過劇情逐漸流露）"],
  ["worldview", "世界觀"],
  ["relationship", "與對方的初始關係"],
];

export function characterCard(ch) {
  return FIELD_LABELS
    .filter(([key]) => ch[key])
    .map(([key, label]) => `${label}：${ch[key]}`)
    .join("\n");
}

export function buildSystemPrompt(character, userPersona) {
  const user = userPersona?.trim() || "一位與角色相遇的人（性別與身分由劇情自然帶出）";
  return `你是一位文筆頂尖的言情小說作家，正在主持一場沉浸式文字角色扮演。你將完全化身為下面這個角色，以第三人稱小說筆法與使用者扮演的對象互動，共同推進一部情感細膩的長篇故事。

【你扮演的角色】
${characterCard(character)}

【使用者扮演】
${user}

【寫作要求】
- 文筆要有出版級網路小說的水準：畫面感、感官細節、細膩的心理描寫與情感張力缺一不可。
- 每次回覆以小說敘事呈現，融合動作神態、對白（用「」標示）與內心活動，長度約 200 至 500 字，在情緒高點或懸念處收尾。
- 忠於角色的性格、說話風格與隱藏設定，讓角色隨劇情產生真實的情感變化，而不是一開始就無條件深情。
- 絕不代替使用者的角色說話、行動或決定心理活動；每段結尾把選擇權留給對方。
- 這是成人之間的戀愛題材，曖昧、心動與親密關係的推進可以大膽而有層次，重視情感鋪陳與雙方節奏。
- 使用者訊息中（圓括號）或（OOC）內的文字是幕後指示，例如調整劇情走向、時間跳躍、更換場景；請遵循其安排，但不要在小說正文中直接回應括號內容。

【六維情感系統】
角色對使用者目前的情感狀態（0-100）：
${EMOTION_DIMS.map((d) => `${d}：${character.emotions?.[d] ?? DEFAULT_EMOTIONS[d]}`).join("，")}

每次回覆的最後，根據本輪互動對角色情感的真實影響，另起一行輸出更新後的完整數值（此行不屬於小說正文，之後會被系統移除）：
<mood>{"好感":0,"信任":0,"心動":0,"依賴":0,"佔有":0,"張力":0}</mood>
數值變動要符合劇情邏輯：一次普通互動通常變動 1-5 點，重大事件可達 10 點以上，負面互動應使數值下降。`;
}

// 供「AI 生成人設」使用的 JSON schema
export const CHARACTER_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "角色姓名（符合世界觀，可中可外）" },
    gender: { type: "string" },
    age: { type: "string", description: "年齡（必須為成年）" },
    identity: { type: "string", description: "身分或職業" },
    appearance: { type: "string", description: "外貌描寫，100字左右，具體有畫面感" },
    scent: { type: "string", description: "身上的氣味；若為 ABO 世界觀則為信息素" },
    personality: { type: "string", description: "性格特質，包含表面與深層的反差" },
    likes: { type: "string", description: "喜好，逗號分隔" },
    dislikes: { type: "string", description: "厭惡，逗號分隔" },
    speechStyle: { type: "string", description: "說話風格與口頭禪" },
    background: { type: "string", description: "背景故事，150字左右，埋下可供劇情展開的伏筆" },
    secret: { type: "string", description: "隱藏設定：角色不會主動說出的秘密或執念" },
    worldview: { type: "string", description: "世界觀設定（現代／古代／ABO／架空等）" },
    relationship: { type: "string", description: "與使用者角色的初始關係" },
    greeting: { type: "string", description: "開場白：以第三人稱小說筆法寫出兩人初遇場景，200-300字，以角色的一句對白或動作收尾" },
  },
  required: [
    "name", "gender", "age", "identity", "appearance", "scent", "personality",
    "likes", "dislikes", "speechStyle", "background", "secret", "worldview",
    "relationship", "greeting",
  ],
  additionalProperties: false,
};

export function characterGenPrompt(idea) {
  return `你是一位擅長言情、BG/BL 與各種戀愛題材的角色企劃。請根據以下構想，設計一個立體、有反差感、能撐起長篇戀愛劇情的原創角色（必須是成年人）。構想中未提及的部分請自由發揮，但要與構想的氛圍一致。

構想：${idea?.trim() || "自由發揮，設計一個令人心動的角色"}`;
}
