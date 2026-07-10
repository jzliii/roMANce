/* roMANce 前端邏輯 */
const $ = (sel) => document.querySelector(sel);
const EMOTION_DIMS = ["好感", "信任", "心動", "依賴", "佔有", "張力"];

const state = {
  characters: [],
  chats: [],
  currentChat: null,     // 完整 chat 物件
  currentCharacter: null,
  editingId: null,       // 正在編輯的角色 id
  pendingCharacterId: null, // persona 彈窗中準備開始聊天的角色
  streaming: false,
};

/* ---------------- API ---------------- */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `請求失敗（${res.status}）`);
  }
  return res.json();
}

/* ---------------- 視圖切換 ---------------- */
function showHome() {
  state.currentChat = null;
  $("#view-chat").hidden = true;
  $("#view-home").hidden = false;
  $("#btn-home").hidden = true;
  refreshHome();
}

function showChat() {
  $("#view-home").hidden = true;
  $("#view-chat").hidden = false;
  $("#btn-home").hidden = false;
}

/* ---------------- 首頁 ---------------- */
async function refreshHome() {
  [state.characters, state.chats] = await Promise.all([
    api("/api/characters"),
    api("/api/chats"),
  ]);
  renderCharacters();
  renderChatList();
}

function renderCharacters() {
  const grid = $("#character-grid");
  grid.innerHTML = "";
  if (!state.characters.length) {
    grid.innerHTML = `<div class="empty">還沒有角色。點「＋ 創建角色」，或用 ✨ AI 幫你生成一個吧。</div>`;
    return;
  }
  for (const ch of state.characters) {
    const card = document.createElement("div");
    card.className = "char-card";
    card.innerHTML = `
      <div class="avatar">${escapeHtml(ch.avatar || ch.name?.[0] || "?")}</div>
      <h3>${escapeHtml(ch.name)}</h3>
      <div class="meta">${escapeHtml([ch.identity, ch.worldview].filter(Boolean).join("｜") || "尚未填寫簡介")}</div>
      <div class="actions">
        <button class="btn primary small" data-act="chat">開始聊天 ♥</button>
        <button class="btn ghost small" data-act="edit">編輯</button>
        <button class="btn ghost small" data-act="del">刪除</button>
      </div>`;
    card.querySelector('[data-act="chat"]').onclick = () => openPersonaModal(ch);
    card.querySelector('[data-act="edit"]').onclick = () => openEditor(ch);
    card.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm(`確定刪除「${ch.name}」？相關的故事也會一併刪除。`)) return;
      await api(`/api/characters/${ch.id}`, { method: "DELETE" });
      refreshHome();
    };
    grid.appendChild(card);
  }
}

function renderChatList() {
  const list = $("#chat-list");
  list.innerHTML = "";
  if (!state.chats.length) {
    list.innerHTML = `<div class="empty">還沒有進行中的故事。</div>`;
    return;
  }
  for (const chat of [...state.chats].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))) {
    const ch = state.characters.find((c) => c.id === chat.characterId);
    const item = document.createElement("div");
    item.className = "chat-item";
    item.innerHTML = `
      <div class="chat-avatar">${escapeHtml(ch?.avatar || ch?.name?.[0] || "?")}</div>
      <div class="title">${escapeHtml(chat.title)}
        <div class="sub">${chat.messageCount} 則訊息 · 好感 ${chat.emotions?.["好感"] ?? "-"}</div>
      </div>
      <button class="del" title="刪除故事">✕</button>`;
    item.onclick = () => openChat(chat.id);
    item.querySelector(".del").onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("確定刪除這段故事？")) return;
      await api(`/api/chats/${chat.id}`, { method: "DELETE" });
      refreshHome();
    };
    list.appendChild(item);
  }
}

/* ---------------- 角色編輯 ---------------- */
function openEditor(character = null) {
  state.editingId = character?.id || null;
  $("#editor-title").textContent = character ? `編輯：${character.name}` : "創建角色";
  const form = $("#character-form");
  form.reset();
  if (character) {
    for (const el of form.elements) {
      if (el.name && character[el.name] != null) el.value = character[el.name];
    }
  }
  $("#gen-idea").value = "";
  $("#gen-status").hidden = true;
  $("#editor").hidden = false;
}

$("#btn-new-character").onclick = () => openEditor();
$("#btn-cancel").onclick = () => ($("#editor").hidden = true);
$("#editor").onclick = (e) => { if (e.target === $("#editor")) $("#editor").hidden = true; };

$("#character-form").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    if (state.editingId) {
      await api(`/api/characters/${state.editingId}`, { method: "PUT", body: JSON.stringify(data) });
    } else {
      await api("/api/characters", { method: "POST", body: JSON.stringify(data) });
    }
    $("#editor").hidden = true;
    refreshHome();
  } catch (err) {
    alert(err.message);
  }
};

$("#btn-generate").onclick = async () => {
  const btn = $("#btn-generate");
  btn.disabled = true;
  $("#gen-status").hidden = false;
  try {
    const gen = await api("/api/characters/generate", {
      method: "POST",
      body: JSON.stringify({ idea: $("#gen-idea").value }),
    });
    const form = $("#character-form");
    for (const el of form.elements) {
      if (el.name && gen[el.name] != null) el.value = gen[el.name];
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    $("#gen-status").hidden = true;
  }
};

/* ---------------- 開始聊天（persona） ---------------- */
function openPersonaModal(character) {
  state.pendingCharacterId = character.id;
  $("#persona-with").textContent = `與「${character.name}」展開一段新的故事。`;
  $("#persona-input").value = "";
  $("#persona-modal").hidden = false;
}
$("#persona-cancel").onclick = () => ($("#persona-modal").hidden = true);
$("#persona-start").onclick = async () => {
  try {
    const chat = await api("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        characterId: state.pendingCharacterId,
        userPersona: $("#persona-input").value,
      }),
    });
    $("#persona-modal").hidden = true;
    openChat(chat.id);
  } catch (err) {
    alert(err.message);
  }
};

/* ---------------- 聊天 ---------------- */
async function openChat(chatId) {
  const chat = await api(`/api/chats/${chatId}`);
  state.currentChat = chat;
  state.currentCharacter = state.characters.find((c) => c.id === chat.characterId)
    || (await api("/api/characters")).find((c) => c.id === chat.characterId);
  const ch = state.currentCharacter;
  $("#chat-avatar").textContent = ch?.avatar || ch?.name?.[0] || "?";
  $("#chat-name").textContent = ch?.name || "未知角色";
  $("#chat-sub").textContent = [ch?.identity, ch?.worldview].filter(Boolean).join("｜");
  renderMessages();
  renderEmotions(chat.emotions, {});
  showChat();
}

function renderMessages() {
  const box = $("#messages");
  box.innerHTML = "";
  for (const m of state.currentChat.messages) {
    box.appendChild(messageEl(m.role, m.content));
  }
  box.scrollTop = box.scrollHeight;
}

function messageEl(role, content) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = content;
  return el;
}

$("#composer").onsubmit = (e) => {
  e.preventDefault();
  sendMessage();
};
$("#input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});
$("#btn-regenerate").onclick = () => {
  if (state.streaming || !state.currentChat) return;
  const msgs = state.currentChat.messages;
  if (msgs.length < 2 || msgs[msgs.length - 1].role !== "assistant") return;
  msgs.pop();
  renderMessages();
  streamFrom(`/api/chats/${state.currentChat.id}/regenerate`, {});
};

function sendMessage() {
  if (state.streaming || !state.currentChat) return;
  const input = $("#input");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  state.currentChat.messages.push({ role: "user", content });
  $("#messages").appendChild(messageEl("user", content));
  streamFrom(`/api/chats/${state.currentChat.id}/messages`, { content });
}

async function streamFrom(url, body) {
  state.streaming = true;
  $("#btn-send").disabled = true;
  $("#btn-regenerate").disabled = true;

  const box = $("#messages");
  const bubble = messageEl("assistant", "");
  bubble.classList.add("streaming");
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;

  let raw = "";
  const prevEmotions = { ...state.currentChat.emotions };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `請求失敗（${res.status}）`);
    }

    for await (const event of parseSSE(res.body)) {
      if (event.type === "delta") {
        raw += event.data.text;
        // 隱藏 <mood> 標籤之後的內容（情感數值不屬於正文）
        bubble.textContent = raw.split(/<mood/i)[0];
        box.scrollTop = box.scrollHeight;
      } else if (event.type === "done") {
        bubble.textContent = event.data.message.content;
        state.currentChat.messages.push(event.data.message);
        renderEmotions(event.data.emotions, prevEmotions);
        state.currentChat.emotions = event.data.emotions;
      } else if (event.type === "error") {
        throw new Error(event.data.error);
      }
    }
  } catch (err) {
    if (!bubble.textContent) bubble.remove();
    const errEl = messageEl("error", `⚠ ${err.message}`);
    errEl.classList.add("error");
    box.appendChild(errEl);
    setTimeout(() => errEl.remove(), 6000);
  } finally {
    bubble.classList.remove("streaming");
    state.streaming = false;
    $("#btn-send").disabled = false;
    $("#btn-regenerate").disabled = false;
    box.scrollTop = box.scrollHeight;
  }
}

/* 解析 SSE 串流 */
async function* parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let type = "message", data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) type = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) {
        try { yield { type, data: JSON.parse(data) }; } catch { /* 忽略壞塊 */ }
      }
    }
  }
}

/* ---------------- 六維情感視覺化 ---------------- */
function renderEmotions(emotions = {}, prev = {}) {
  // 長條
  const bars = $("#emotion-bars");
  bars.innerHTML = "";
  for (const dim of EMOTION_DIMS) {
    const v = emotions[dim] ?? 0;
    const delta = prev[dim] != null ? v - prev[dim] : 0;
    const row = document.createElement("div");
    row.className = "ebar";
    row.innerHTML = `
      <div class="label"><b>${dim}</b><span>${v}${delta ? `（${delta > 0 ? "+" : ""}${delta}）` : ""}</span></div>
      <div class="track"><div class="fill${delta > 0 ? " up" : ""}" style="width:${v}%"></div></div>`;
    bars.appendChild(row);
  }
  // 雷達圖
  drawRadar(emotions);
}

function drawRadar(emotions) {
  const svg = $("#radar");
  const cx = 110, cy = 110, R = 82;
  const pt = (i, r) => {
    const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  let out = "";
  // 網格
  for (const frac of [0.33, 0.66, 1]) {
    const pts = EMOTION_DIMS.map((_, i) => pt(i, R * frac).join(",")).join(" ");
    out += `<polygon points="${pts}" fill="none" stroke="#46374e" stroke-width="1"/>`;
  }
  // 軸線與標籤
  EMOTION_DIMS.forEach((dim, i) => {
    const [x, y] = pt(i, R);
    const [lx, ly] = pt(i, R + 16);
    out += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#46374e" stroke-width="1"/>`;
    out += `<text x="${lx}" y="${ly}" fill="#a893ab" font-size="12" text-anchor="middle" dominant-baseline="middle">${dim}</text>`;
  });
  // 數值多邊形
  const valuePts = EMOTION_DIMS.map((dim, i) => pt(i, (R * (emotions[dim] ?? 0)) / 100).join(",")).join(" ");
  out += `<polygon points="${valuePts}" fill="rgba(232,98,140,.35)" stroke="#e8628c" stroke-width="2"/>`;
  svg.innerHTML = out;
}

/* ---------------- 工具 ---------------- */
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

$("#btn-home").onclick = showHome;
$("#logo").onclick = showHome;

showHome();
