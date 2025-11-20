// --- Multi-user helpers ---
const CONVERSATION_KEY = "conversations";

function getUsers() {
  return JSON.parse(localStorage.getItem("users")) || [];
}

function saveUsers(users) {
  localStorage.setItem("users", JSON.stringify(users));
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

// --- Load Chat List ---
function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  chatList.innerHTML = "";

  const convos = getConversations().filter(c => c.participants.includes(user.email));

  if (convos.length === 0) {
    chatList.innerHTML = "<li class='conversation-item muted'>No conversations yet.</li>";
    return;
  }

  convos
    .sort((a, b) => {
      const lastA = a.messages.at(-1)?.timestamp || 0;
      const lastB = b.messages.at(-1)?.timestamp || 0;
      return lastB - lastA;
    })
    .forEach(conv => {
      const partner = conv.participants.find(p => p !== user.email) || conv.participants[0];
      const lastMsg = conv.messages.at(-1);
      const preview = lastMsg
        ? lastMsg.type === "photo"
          ? "📷 Photo"
          : lastMsg.type === "voice"
            ? "🎤 Voice message"
            : (lastMsg.content || lastMsg.text || "").slice(0, 50)
        : "No messages";
      const li = document.createElement("li");
      li.className = "conversation-item";
      li.dataset.partner = partner;
      li.innerHTML = `
        <div class="name">${resolveName(partner, conv)}</div>
        <div class="preview">${preview}</div>
      `;
      li.addEventListener("click", () => openChat(partner));
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
    li.classList.toggle("active", li.dataset.partner === partnerEmail);
  });

  const convo = getConversations().find(c => c.key === conversationKey(user.email, partnerEmail));
  chatHeader.textContent = `Chat with ${resolveName(partnerEmail, convo)}`;
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
        ${msg.time || ""}
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
    pushMessage("photo", ev.target.result);
    photoInput.value = "";
  };
  reader.readAsDataURL(file);
});

// --- Auto-load Chat List ---
loadChatList();
