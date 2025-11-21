// Conversation storage follows an array per user:
// [ { chatWithEmail, chatWithName, profilePic, messages: [...] } ]
const CONVERSATION_KEY_PREFIX = "conversationList:";

// --- User helpers ---
const getUsers = () => JSON.parse(localStorage.getItem("users")) || [];
const saveUsers = users => localStorage.setItem("users", JSON.stringify(users));

const getUserByEmail = email => (email ? getUsers().find(u => u.email === email) || null : null);

function getCurrentUser() {
  const profile = JSON.parse(localStorage.getItem("userProfile"));
  if (profile?.email) return profile;
  const logged = JSON.parse(localStorage.getItem("loggedInUser"));
  if (logged?.email) return logged;
  const id = localStorage.getItem("loggedInUserId");
  if (!id) return null;
  return getUsers().find(u => u.email === id) || null;
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

// --- Conversation helpers ---
const conversationKey = email => `${CONVERSATION_KEY_PREFIX}${email}`;

function mapLegacyMessage(msg) {
  const type = msg.type === "photo" ? "image" : msg.type === "voice" ? "audio" : msg.type || "text";
  return {
    sender: msg.from || msg.sender || msg.author || msg.email || "",
    type,
    content: msg.content || msg.text || msg.src || msg.value || "",
    text: msg.text || msg.content || msg.src || "",
    timestamp: msg.timestamp || msg.time || Date.now(),
    time: msg.time
  };
}

function normalizeList(list) {
  if (Array.isArray(list)) return list;
  if (list && typeof list === "object") {
    return Object.values(list).map(entry => ({
      chatWithEmail: entry.partnerEmail || entry.chatWithEmail,
      chatWithName: entry.partnerName || entry.chatWithName || entry.partnerEmail,
      profilePic: entry.profilePic,
      messages: (entry.messages || []).map(mapLegacyMessage)
    }));
  }
  return [];
}

function migrateLegacyStore(userEmail) {
  const rawList = JSON.parse(localStorage.getItem(conversationKey(userEmail)));
  let list = normalizeList(rawList);

  if (!list.length) {
    const legacy = JSON.parse(localStorage.getItem("conversations"));
    if (legacy && typeof legacy === "object") {
      const possible = legacy[userEmail] || legacy.conversations || legacy;
      list = normalizeList(possible);
      if (!list.length && Array.isArray(legacy)) list = normalizeList(legacy);
    }
  }

  localStorage.setItem(conversationKey(userEmail), JSON.stringify(list));
  return list;
}

function getConversationList(ownerEmail) {
  const list = migrateLegacyStore(ownerEmail);
  return Array.isArray(list) ? list : [];
}

function saveConversationList(ownerEmail, list) {
  localStorage.setItem(conversationKey(ownerEmail), JSON.stringify(list || []));
}

function resolveName(email, fallbackName) {
  const user = getUserByEmail(email);
  if (user?.name) return user.name;
  if (fallbackName) return fallbackName;
  return email || "Unknown user";
}

function ensureConversation(ownerEmail, partnerEmail, meta = {}) {
  if (!ownerEmail || !partnerEmail) return null;
  let list = getConversationList(ownerEmail);
  const existing = list.find(c => c.chatWithEmail === partnerEmail);

  if (existing) {
    existing.chatWithName = meta.name || existing.chatWithName || resolveName(partnerEmail);
    existing.profilePic = meta.profilePic || existing.profilePic;
  } else {
    list.push({
      chatWithEmail: partnerEmail,
      chatWithName: meta.name || resolveName(partnerEmail),
      profilePic: meta.profilePic || getUserByEmail(partnerEmail)?.profilePic || "",
      messages: []
    });
  }

  saveConversationList(ownerEmail, list);
  ensureUserRecord(partnerEmail, meta.name, meta.profilePic);
  return list.find(c => c.chatWithEmail === partnerEmail);
}

// --- Auth gate ---
const activeUser = getCurrentUser();
if (!activeUser) {
  window.location.href = "login_signup.html";
}

if (activeUser) {
  ensureUserRecord(activeUser.email, activeUser.name, activeUser.profilePic);
  migrateLegacyStore(activeUser.email);
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

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- Chat List ---
function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  chatList.innerHTML = "";

  const list = getConversationList(user.email);

  if (!list.length) {
    chatList.innerHTML = "<li class='conversation-item muted'>No conversations yet.</li>";
    return;
  }

  list
    .slice()
    .sort((a, b) => {
      const lastA = a.messages?.at(-1)?.timestamp || 0;
      const lastB = b.messages?.at(-1)?.timestamp || 0;
      return lastB - lastA;
    })
    .forEach(convo => {
      const lastMsg = convo.messages?.at(-1);
      const preview = lastMsg
        ? lastMsg.type === "image"
          ? "📷 Image"
          : lastMsg.type === "video"
            ? "🎥 Video"
            : lastMsg.type === "audio"
              ? "🎤 Voice message"
              : (lastMsg.content || lastMsg.text || "").slice(0, 50)
        : "No messages yet";

      const li = document.createElement("li");
      li.className = "conversation-item";
      li.dataset.partner = convo.chatWithEmail;
      const partnerName = resolveName(convo.chatWithEmail, convo.chatWithName);
      li.dataset.partnerName = partnerName;

      const avatar = convo.profilePic || getUserByEmail(convo.chatWithEmail)?.profilePic || "";
      const initial = (partnerName || convo.chatWithEmail || "?").charAt(0).toUpperCase();

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
            <div class="preview" style="font-size:13px;opacity:0.85;">${preview || "No messages yet"}</div>
          </div>
        </div>
      `;

      li.addEventListener("click", () => openChat(convo.chatWithEmail, partnerName));
      if (currentChatPartner === convo.chatWithEmail) li.classList.add("active");
      chatList.appendChild(li);
    });
}

// --- Open Chat ---
function openChat(partnerEmail, partnerName) {
  const user = getCurrentUser();
  if (!user) return;

  ensureConversation(user.email, partnerEmail, { name: partnerName });
  currentChatPartner = partnerEmail;

  Array.from(chatList.children).forEach(li => li.classList.toggle("active", li.dataset.partner === partnerEmail));

  const list = getConversationList(user.email);
  const conv = list.find(c => c.chatWithEmail === partnerEmail);
  chatHeader.textContent = `Chat with ${resolveName(partnerEmail, conv?.chatWithName)}`;
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
  renderMessages();
}

// --- Render Messages ---
function renderMessages() {
  const user = getCurrentUser();
  if (!user || !currentChatPartner) return;

  const list = getConversationList(user.email);
  const conv = list.find(c => c.chatWithEmail === currentChatPartner);
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
    } else if (msg.type === "audio") {
      body = `<div class="voice-chip">🎤 Voice message</div>`;
    } else {
      body = `<span>${msg.content || msg.text}</span>`;
    }

    div.innerHTML = `
      ${body}
      <small style="display:block;opacity:0.6;font-size:11px;margin-top:3px;">
        ${formatTime(msg.timestamp)}
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
    timestamp: time.getTime()
  };
}

function pushMessage(type, content) {
  const user = getCurrentUser();
  if (!user || !currentChatPartner) return;

  const msg = buildMessage(type, content);
  let ownerList = getConversationList(user.email);
  let ownerConv = ownerList.find(c => c.chatWithEmail === currentChatPartner);
  if (!ownerConv) {
    ensureConversation(user.email, currentChatPartner);
    ownerList = getConversationList(user.email);
    ownerConv = ownerList.find(c => c.chatWithEmail === currentChatPartner);
  }
  ownerConv.messages.push(msg);
  saveConversationList(user.email, ownerList);

  const partnerMeta = { name: user.name || user.email, profilePic: user.profilePic };
  let partnerList = getConversationList(currentChatPartner);
  let partnerConv = partnerList.find(c => c.chatWithEmail === user.email);
  if (!partnerConv) {
    ensureConversation(currentChatPartner, user.email, partnerMeta);
    partnerList = getConversationList(currentChatPartner);
    partnerConv = partnerList.find(c => c.chatWithEmail === user.email);
  }
  partnerConv.messages.push({ ...msg, sender: user.email });
  saveConversationList(currentChatPartner, partnerList);

  addNotification(
    currentChatPartner,
    "message",
    "New Message",
    `${user.name || user.email} sent you a ${type === "audio" ? "voice message" : type === "image" ? "image" : type === "video" ? "video" : "message"}.`
  );

  renderMessages();
  loadChatList();
}

// --- Event bindings ---
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
  pushMessage("audio", "Voice message");
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

// --- Pending chat from item/profile ---
const pendingChat = localStorage.getItem("openChatWith");
const pendingMeta = localStorage.getItem("openChatMeta");

function bootstrapPending() {
  const user = getCurrentUser();
  if (!user) return;
  const meta = pendingMeta ? JSON.parse(pendingMeta) : {};
  if (pendingChat) {
    ensureConversation(user.email, pendingChat, meta);
    ensureConversation(pendingChat, user.email, { name: user.name, profilePic: user.profilePic });
    currentChatPartner = pendingChat;
  }
}

bootstrapPending();
loadChatList();

if (pendingChat) {
  openChat(pendingChat, JSON.parse(pendingMeta || "{}")?.name || pendingChat);
  localStorage.removeItem("openChatWith");
  localStorage.removeItem("openChatMeta");
}
