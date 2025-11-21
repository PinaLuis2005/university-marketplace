// --- Multi-user helpers ---
const CONVERSATION_KEY = "conversations";

function getUsers() {
  return JSON.parse(localStorage.getItem("users")) || [];
}

// --- User helpers ---
const getUsers = () => JSON.parse(localStorage.getItem("users")) || [];
const saveUsers = users => localStorage.setItem("users", JSON.stringify(users));

const getUserByEmail = email => (email ? getUsers().find(u => u.email === email) || null : null);

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

function getConversations() {
  return JSON.parse(localStorage.getItem(CONVERSATION_KEY)) || [];
}

function saveConversations(data) {
  localStorage.setItem(CONVERSATION_KEY, JSON.stringify(data));
}

function conversationKey(a, b) {
  return [a, b].sort().join("::");
}

function ensureConversation(userEmail, partnerEmail, partnerName) {
  let convos = getConversations();
  const key = conversationKey(userEmail, partnerEmail);
  let convo = convos.find(c => c.key === key);

  if (!convo) {
    convo = {
      key,
      participants: [userEmail, partnerEmail],
      labels: { [partnerEmail]: partnerName || partnerEmail },
      messages: []
    };
    convos.push(convo);
  } else {
    convo.labels = convo.labels || {};
    if (partnerName) convo.labels[partnerEmail] = partnerName;
  }

  saveConversations(convos);
  return convo;
}

function seedLegacyConversations(user) {
  const legacy = user.messages || [];
  if (!legacy.length) return;

  let convos = getConversations();
  let changed = false;

  legacy.forEach(conv => {
    const key = conversationKey(user.email, conv.with);
    if (convos.some(c => c.key === key)) return;
    const mapped = (conv.chat || []).map(msg => ({
      from: msg.from,
      type: msg.type || "text",
      content: msg.content || msg.text,
      text: msg.text || msg.content,
      time: msg.time,
      timestamp: msg.timestamp || Date.now()
    }));
    convos.push({
      key,
      participants: [user.email, conv.with],
      labels: { [conv.with]: conv.with },
      messages: mapped
    });
    changed = true;
  });

  if (changed) saveConversations(convos);
}

// Ensure user logged in
const activeUser = getCurrentUser();
if (!activeUser) {
  window.location.href = "login_signup.html";
}

if (activeUser) seedLegacyConversations(activeUser);

// --- UI Elements ---
const chatList = document.getElementById("chatList");
const chatMessages = document.getElementById("chatMessages");
const chatHeader = document.getElementById("chatHeader");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const photoBtn = document.getElementById("photoBtn");
const photoInput = document.getElementById("photoInput");

let currentChatPartner = null;

function resolveName(email, convo) {
  const users = getUsers();
  const found = users.find(u => u.email === email);
  if (found && found.name) return found.name;
  if (convo?.labels && convo.labels[email]) return convo.labels[email];
  return email;
}

// --- Load pending chat (from profile or itemdetails) ---
const pendingChat = localStorage.getItem("openChatWith");
const pendingMeta = localStorage.getItem("openChatMeta");
if (pendingChat && activeUser) {
  const meta = pendingMeta ? JSON.parse(pendingMeta) : {};
  ensureConversation(activeUser.email, pendingChat, meta.name || pendingChat);
  openChat(pendingChat, meta.name);
  localStorage.removeItem("openChatWith");
  localStorage.removeItem("openChatMeta");
}

// --- Chat List ---
function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  chatList.innerHTML = "";

  const convos = getConversations().filter(c => c.participants.includes(user.email));

  if (convos.length === 0) {
    chatList.innerHTML = "<li class='conversation-item muted'>No conversations yet.</li>";
    return;
  }

  convos.forEach(conv => {
    const li = document.createElement("li");
    li.className = "conversation-item";
    const lastMsg = conv.chat?.at(-1);
    li.innerHTML = `
      <div class="name">${conv.with}</div>
      <div class="preview">${lastMsg ? lastMsg.text.slice(0, 50) : "No messages"}</div>
    `;
    li.addEventListener("click", () => openChat(conv.with));
    chatList.appendChild(li);
  });
}

// --- Open Chat ---
function openChat(partnerEmail, partnerName) {
  const user = getCurrentUser();
  if (!user) return;

  ensureConversation(user.email, partnerEmail, partnerName);
  currentChatPartner = partnerEmail;
  Array.from(chatList.children).forEach(li => {
    if (li.textContent.includes(partnerEmail)) {
      li.classList.add("active");
    } else {
      li.classList.remove("active");
    }
  });
  chatHeader.textContent = `Chat with ${partnerEmail}`;
  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
  renderMessages();
}

// --- Render Messages ---
function renderMessages() {
  const user = getCurrentUser();
  if (!user || !currentChatPartner) return;

  const conv = getConversations().find(c => c.key === conversationKey(user.email, currentChatPartner));
  chatMessages.innerHTML = "";

  if (!conv || !conv.messages.length) {
    chatMessages.innerHTML = "<p>No messages yet.</p>";
    return;
  }

  conv.messages.forEach(msg => {
    const div = document.createElement("div");
    div.classList.add("message", msg.from === user.email ? "sent" : "received");

    let body = "";
    if (msg.type === "photo") {
      body = `<div class="message-photo">${msg.content ? `<img src="${msg.content}" alt="Photo" />` : '<div class="photo-placeholder">Photo</div>'}</div>`;
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
function addToUserMessages(ownerEmail, partnerEmail, msg) {
  const users = getUsers();
  let owner = users.find(u => u.email === ownerEmail);
  if (!owner) {
    owner = { email: ownerEmail, name: ownerEmail, messages: [] };
    users.push(owner);
  }
  ownerConv.messages.push(msg);
  saveConversationList(user.email, ownerList);

  owner.messages = owner.messages || [];
  let convo = owner.messages.find(c => c.with === partnerEmail);
  if (!convo) {
    convo = { with: partnerEmail, chat: [] };
    owner.messages.push(convo);
  }
  convo.chat.push({ from: msg.from, text: msg.content || msg.text, time: msg.time, type: msg.type, timestamp: msg.timestamp });
  saveUsers(users);

  const current = getCurrentUser();
  if (current && current.email === ownerEmail) {
    localStorage.setItem("userProfile", JSON.stringify(owner));
    localStorage.setItem("loggedInUser", JSON.stringify(owner));
  }
}

function buildMessage(type, content) {
  const time = new Date();
  return {
    id: Date.now(),
    from: getCurrentUser().email,
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

  const convo = ensureConversation(user.email, currentChatPartner);
  const msg = buildMessage(type, content);
  convo.messages.push(msg);
  saveConversations(getConversations().map(c => (c.key === convo.key ? convo : c)));

  addToUserMessages(user.email, currentChatPartner, msg);
  addToUserMessages(currentChatPartner, user.email, msg);

  addNotification(
    currentChatPartner,
    "message",
    "New Message",
    `${user.name || user.email} sent you a ${type === "voice" ? "voice message" : type === "photo" ? "photo" : "message"}.`
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
    pushMessage("photo", ev.target.result);
    photoInput.value = "";
  };
  reader.readAsDataURL(file);
});

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
