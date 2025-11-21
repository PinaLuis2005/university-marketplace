// --- Multi-user helpers ---
const CONVERSATION_KEY = "conversations";

function getUsers() {
  return JSON.parse(localStorage.getItem("users")) || [];
}

function saveUsers(users) {
  localStorage.setItem("users", JSON.stringify(users));
}

function getUserByEmail(email) {
  if (!email) return null;
  return getUsers().find(u => u.email === email) || null;
}

function getCurrentUser() {
  const profile = JSON.parse(localStorage.getItem("userProfile"));
  if (profile && profile.email) return profile;
  const obj = JSON.parse(localStorage.getItem("loggedInUser"));
  if (obj && obj.email) return obj;
  const id = localStorage.getItem("loggedInUserId");
  const users = getUsers();
  return users.find(u => u.email === id) || null;
}

function mapLegacyMessage(msg) {
  return {
    sender: msg.from || msg.sender || msg.author || msg.email || "",
    type: msg.type === "photo" ? "image" : msg.type || "text",
    content: msg.content || msg.text || msg.src || msg.value || "",
    text: msg.text || msg.content || msg.src || "",
    time: msg.time,
    timestamp: msg.timestamp || Date.now()
  };
}

function migrateStoreToEmailMap(userEmail) {
  const raw = JSON.parse(localStorage.getItem(CONVERSATION_KEY));
  let store = raw && typeof raw === "object" ? raw : {};

  if (Array.isArray(raw) || raw?.conversations) {
    const legacyList = Array.isArray(raw)
      ? raw
      : Object.values(raw.conversations || {});
    store = {};
    legacyList.forEach(convo => {
      const participants = convo.participants || [];
      if (participants.length < 2) return;
      participants.forEach(owner => {
        const partner = participants.find(p => p !== owner);
        if (!partner) return;
        if (!store[owner]) store[owner] = {};
        store[owner][partner] = {
          partnerEmail: partner,
          partnerName: convo.labels?.[partner] || partner,
          messages: (convo.messages || []).map(mapLegacyMessage)
        };
      });
    });
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(store));
  }

  // Seed legacy inline user messages
  if (!store[userEmail]) {
    const userRecord = getUserByEmail(userEmail);
    const legacy = userRecord?.messages || [];
    if (legacy.length) {
      store[userEmail] = {};
      legacy.forEach(conv => {
        store[userEmail][conv.with] = {
          partnerEmail: conv.with,
          partnerName: conv.with,
          messages: (conv.chat || []).map(mapLegacyMessage)
        };
      });
      localStorage.setItem(CONVERSATION_KEY, JSON.stringify(store));
    }
  }

  return store;
}

function getConversationMap(userEmail) {
  const store = migrateStoreToEmailMap(userEmail);
  return store[userEmail] || {};
}

function saveConversationMap(userEmail, map) {
  const store = migrateStoreToEmailMap(userEmail);
  store[userEmail] = map;
  localStorage.setItem(CONVERSATION_KEY, JSON.stringify(store));
}

function ensureUserRecord(email, name, profilePic) {
  if (!email) return;
  const users = getUsers();
  const idx = users.findIndex(u => u.email === email);
  if (idx === -1) {
    users.push({ email, name: name || email, profilePic });
  } else {
    if (name && !users[idx].name) users[idx].name = name;
    if (profilePic && !users[idx].profilePic) users[idx].profilePic = profilePic;
  }
  saveUsers(users);
}

// Ensure user logged in
const activeUser = getCurrentUser();
if (!activeUser) {
  window.location.href = "login_signup.html";
}

if (activeUser) {
  ensureUserRecord(activeUser.email, activeUser.name, activeUser.profilePic);
  migrateStoreToEmailMap(activeUser.email);
}

// --- UI Elements ---
const chatList = document.getElementById("chatList");
const chatMessages = document.getElementById("chatMessages");
const chatHeader = document.getElementById("chatHeader");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const photoBtn = document.getElementById("photoBtn");
const videoBtn = document.getElementById("videoBtn");
const photoInput = document.getElementById("photoInput");
const videoInput = document.getElementById("videoInput");

let currentChatPartner = null;

function resolveName(email, convo) {
  const partner = getUserByEmail(email);
  if (partner?.name) return partner.name;
  if (convo?.partnerName) return convo.partnerName;
  return email || "Unknown user";
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ensureConversation(ownerEmail, partnerEmail, meta = {}) {
  if (!ownerEmail || !partnerEmail) return null;
  const map = getConversationMap(ownerEmail);
  const partnerRecord = getUserByEmail(partnerEmail);
  const entry = map[partnerEmail] || { partnerEmail, messages: [] };
  entry.partnerName = meta.name || entry.partnerName || partnerRecord?.name || partnerEmail;
  entry.profilePic = meta.profilePic || entry.profilePic || partnerRecord?.profilePic;
  map[partnerEmail] = entry;
  saveConversationMap(ownerEmail, map);
  ensureUserRecord(partnerEmail, entry.partnerName, entry.profilePic);
  return entry;
}

// --- Load pending chat (from profile or itemdetails) ---
const pendingChat = localStorage.getItem("openChatWith");
const pendingMeta = localStorage.getItem("openChatMeta");
if (pendingChat && activeUser) {
  const meta = pendingMeta ? JSON.parse(pendingMeta) : {};
  ensureConversation(activeUser.email, pendingChat, meta);
  openChat(pendingChat, meta.name || pendingChat);
  localStorage.removeItem("openChatWith");
  localStorage.removeItem("openChatMeta");
}

// --- Load Chat List ---
function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  chatList.innerHTML = "";

  const convMap = getConversationMap(user.email);
  const entries = Object.entries(convMap);

  if (!entries.length) {
    chatList.innerHTML = "<li class='conversation-item muted'>No conversations yet.</li>";
    return;
  }

  entries
    .sort(([, a], [, b]) => {
      const lastA = a.messages?.at(-1)?.timestamp || 0;
      const lastB = b.messages?.at(-1)?.timestamp || 0;
      return lastB - lastA;
    })
    .forEach(([partnerEmail, convo]) => {
      const lastMsg = (convo.messages || []).at(-1);
      const preview = lastMsg
        ? lastMsg.type === "image"
          ? "📷 Image"
          : lastMsg.type === "video"
            ? "🎥 Video"
            : lastMsg.type === "voice"
              ? "🎤 Voice message"
              : (lastMsg.content || lastMsg.text || "").slice(0, 50)
        : "No messages";
      const li = document.createElement("li");
      li.className = "conversation-item";
      li.dataset.partner = partnerEmail;
      const partnerName = resolveName(partnerEmail, convo);
      li.dataset.partnerName = partnerName;
      const avatar = convo.profilePic || getUserByEmail(partnerEmail)?.profilePic || "";
      const initial = (partnerName || partnerEmail || "?").charAt(0).toUpperCase();
      li.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;">
          <div class="chat-avatar" style="width:40px;height:40px;border-radius:50%;background:#f2f2f2;overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;">
            ${avatar ? `<img src="${avatar}" alt="${partnerName}" style="width:100%;height:100%;object-fit:cover;">` : initial}
          </div>
          <div style="flex:1 1 auto;min-width:0;">
            <div class="name-row" style="display:flex;justify-content:space-between;gap:6px;">
              <div class="name" style="font-weight:600;">${partnerName}</div>
              <div class="time" style="font-size:12px;opacity:0.7;">${formatTime(lastMsg?.timestamp)}</div>
            </div>
            <div class="preview" style="font-size:13px;opacity:0.85;">${preview}</div>
          </div>
        </div>
      `;
      li.addEventListener("click", () => openChat(partnerEmail, partnerName));
      if (currentChatPartner === partnerEmail) li.classList.add("active");
      chatList.appendChild(li);
    });
}

// --- Open Chat ---
function openChat(partnerEmail, partnerName) {
  const user = getCurrentUser();
  if (!user) return;

  ensureConversation(user.email, partnerEmail, { name: partnerName });
  currentChatPartner = partnerEmail;

  Array.from(chatList.children).forEach(li => {
    li.classList.toggle("active", li.dataset.partner === partnerEmail);
  });

  const conv = getConversationMap(user.email)[partnerEmail];
  chatHeader.textContent = `Chat with ${resolveName(partnerEmail, conv)}`;
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
  renderMessages();
}

// --- Render Messages ---
function renderMessages() {
  const user = getCurrentUser();
  if (!user || !currentChatPartner) return;

  const conv = getConversationMap(user.email)[currentChatPartner];
  chatMessages.innerHTML = "";

  if (!conv || !conv.messages.length) {
    chatMessages.innerHTML = "<p>No messages yet.</p>";
    return;
  }

  conv.messages.forEach(msg => {
    const div = document.createElement("div");
    div.classList.add("message", msg.sender === user.email ? "sent" : "received");

    let body = "";
    if (msg.type === "image") {
      body = `<div class="message-photo">${msg.content ? `<img src="${msg.content}" alt="Photo" />` : '<div class="photo-placeholder">Photo</div>'}</div>`;
    } else if (msg.type === "video") {
      const placeholder = '<div class="video-placeholder">Video</div>';
      body = `<div class="message-video">${msg.content ? `<video src="${msg.content}" controls></video>` : placeholder}</div>`;
    } else if (msg.type === "voice") {
      body = `<div class="voice-chip">🎤 Voice message</div>`;
    } else {
      body = `<span>${msg.content || msg.text}</span>`;
    }

    div.innerHTML = `
      ${body}
      <small style="display:block;opacity:0.6;font-size:11px;margin-top:3px;">
        ${msg.time || formatTime(msg.timestamp)}
      </small>
    `;
    chatMessages.appendChild(div);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- Message helpers ---
function buildMessage(type, content) {
  const time = new Date();
  const user = getCurrentUser();
  return {
    id: Date.now(),
    sender: user?.email,
    type,
    content,
    text: content,
    time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    timestamp: time.getTime()
  };
}

function pushMessage(type, content) {
  const user = getCurrentUser();
  if (!user || !currentChatPartner) return;

  const msg = buildMessage(type, content);
  ensureConversation(user.email, currentChatPartner);
  ensureConversation(currentChatPartner, user.email, { name: user.name, profilePic: user.profilePic });

  const ownerMap = getConversationMap(user.email);
  ownerMap[currentChatPartner].messages.push(msg);
  saveConversationMap(user.email, ownerMap);

  const partnerMap = getConversationMap(currentChatPartner);
  if (!partnerMap[user.email]) partnerMap[user.email] = { partnerEmail: user.email, partnerName: user.name || user.email, messages: [] };
  partnerMap[user.email].messages.push({ ...msg, sender: user.email });
  saveConversationMap(currentChatPartner, partnerMap);

  addNotification(
    currentChatPartner,
    "message",
    "New Message",
    `${user.name || user.email} sent you a ${type === "voice" ? "voice message" : type === "image" ? "image" : type === "video" ? "video" : "message"}.`
  );

  renderMessages();
  loadChatList();
}
// --- Send Message ---
sendBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (!text) return;
  pushMessage("text", text);
  messageInput.value = "";
});

messageInput.addEventListener("keypress", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    pushMessage("text", text);
    messageInput.value = "";
  }
});

voiceBtn?.addEventListener("click", () => {
  pushMessage("voice", "Voice message");
});

photoBtn?.addEventListener("click", () => photoInput?.click());

photoInput?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    pushMessage("image", ev.target.result);
    photoInput.value = "";
  };
  reader.readAsDataURL(file);
});

videoBtn?.addEventListener("click", () => videoInput?.click());

videoInput?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    pushMessage("video", ev.target.result);
    videoInput.value = "";
  };
  reader.readAsDataURL(file);
});

// --- Auto-load Chat List ---
loadChatList();
