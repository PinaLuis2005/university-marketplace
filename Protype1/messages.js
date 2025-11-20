// --- Multi-user helpers ---
const CONVERSATION_KEY = "conversations";

function conversationKey(a, b) {
  return [a, b].sort().join("::");
}

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

function normalizeStoredConversations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && raw.conversations) {
    const userEmail = raw.currentUser || getCurrentUser()?.email || "";
    return Object.entries(raw.conversations).map(([partner, messages = []]) => ({
      key: conversationKey(userEmail, partner),
      participants: [userEmail, partner],
      labels: { [partner]: partner },
      messages: messages.map(m => ({
        from: m.from,
        type: m.type === "photo" ? "image" : m.type || "text",
        content: m.content || m.text || m.src,
        text: m.text || m.content || m.src,
        time: m.time,
        timestamp: m.timestamp || Date.now()
      }))
    }));
  }
  return [];
}

function getConversationStore() {
  const raw = JSON.parse(localStorage.getItem(CONVERSATION_KEY));
  if (!raw) return { conversations: {} };

  // Legacy array -> map
  if (Array.isArray(raw)) {
    const mapped = {};
    raw.forEach(c => {
      const clean = sanitizeConversation(c);
      if (clean.key) mapped[clean.key] = clean;
    });
    return { conversations: mapped };
  }

  // Expected { conversations: { key: convo } }
  if (raw.conversations && typeof raw.conversations === "object") {
    const mapped = {};
    Object.entries(raw.conversations).forEach(([key, convo]) => {
      const clean = sanitizeConversation({ ...convo, key: key || convo.key });
      if (clean.key) mapped[clean.key] = clean;
    });
    return { conversations: mapped };
  }

  return { conversations: {} };
}

function saveConversationStore(store) {
  localStorage.setItem(CONVERSATION_KEY, JSON.stringify(store));
}

function getConversations() {
  return Object.values(getConversationStore().conversations || {});
}

function saveConversations(convos) {
  const store = { conversations: {} };
  (convos || []).forEach(c => {
    const clean = sanitizeConversation(c);
    if (clean.key) store.conversations[clean.key] = clean;
  });
  saveConversationStore(store);
}

function ensureConversation(userEmail, partnerEmail, partnerName) {
  const store = getConversationStore();
  const key = conversationKey(userEmail, partnerEmail);

  ensureUserRecord(userEmail);
  ensureUserRecord(partnerEmail, partnerName);

  let convo = store.conversations[key];
  if (!convo) {
    convo = {
      key,
      participants: [userEmail, partnerEmail],
      labels: { [partnerEmail]: partnerName || partnerEmail },
      messages: []
    };
  } else {
    convo = sanitizeConversation(convo);
    convo.labels = convo.labels || {};
    convo.participants = convo.participants?.length ? convo.participants : [userEmail, partnerEmail];
    if (partnerName) convo.labels[partnerEmail] = partnerName;
    else if (!convo.labels[partnerEmail]) convo.labels[partnerEmail] = partnerEmail;
  }

  store.conversations[key] = convo;
  saveConversationStore(store);
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

function ensureUserRecord(email, name) {
  if (!email) return;
  const users = getUsers();
  const idx = users.findIndex(u => u.email === email);
  if (idx === -1) {
    users.push({ email, name: name || email });
  } else if (name && !users[idx].name) {
    users[idx].name = name;
  }
  saveUsers(users);
}

function sanitizeConversation(convo) {
  let changed = false;
  const participants = Array.isArray(convo.participants)
    ? convo.participants.filter(Boolean)
    : [];

  let key = convo.key;
  if ((!key || !key.includes("::")) && participants.length === 2) {
    key = conversationKey(participants[0], participants[1]);
    changed = true;
  }

  if ((!participants || participants.length < 2) && key?.includes("::")) {
    const [a, b] = key.split("::");
    if (a && b) {
      participants.push(a, b);
      changed = true;
    }
  }

  const fixedMessages = (convo.messages || []).map(msg => {
    const mappedType = msg.type === "photo" ? "image" : msg.type || "text";
    return {
      ...msg,
      type: mappedType,
      content: msg.content || msg.text || msg.src,
      text: msg.text || msg.content || msg.src,
      timestamp: msg.timestamp || Date.now()
    };
  });

  return {
    ...convo,
    key,
    participants,
    labels: convo.labels || {},
    messages: fixedMessages,
    _changed: changed
  };
}

function normalizeConversationsFor(userEmail) {
  const store = getConversationStore();
  const users = getUsers();
  let changed = false;

  const normalized = Object.entries(store.conversations)
    .map(([key, convo]) => sanitizeConversation({ ...convo, key }))
    .map(convo => {
      const cleaned = { ...convo };
      if (cleaned.participants.length === 2) {
        const partner = cleaned.participants.find(p => p !== userEmail) || cleaned.participants[0];
        const partnerUser = users.find(u => u.email === partner);
        cleaned.labels = cleaned.labels || {};
        if (!cleaned.labels[partner]) cleaned.labels[partner] = partnerUser?.name || partner;
        if (partnerUser?.name && cleaned.labels[partner] !== partnerUser.name) {
          cleaned.labels[partner] = partnerUser.name;
          changed = true;
        }
      }
      if (cleaned._changed) changed = true;
      return cleaned;
    })
    .filter(c => Array.isArray(c.participants) && c.participants.includes(userEmail));

  if (changed) saveConversations(normalized);
  return normalized;
}

// Ensure user logged in
const activeUser = getCurrentUser();
if (!activeUser) {
  window.location.href = "login_signup.html";
}

if (activeUser) {
  ensureUserRecord(activeUser.email, activeUser.name);
  seedLegacyConversations(activeUser);
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
  const users = getUsers();
  const found = users.find(u => u.email === email);
  if (found && found.name) return found.name;
  if (convo?.labels && convo.labels[email]) return convo.labels[email];
  return email || "Unknown user";
}

function syncConversationLabels(userEmail) {
  const users = getUsers();
  const convos = normalizeConversationsFor(userEmail);
  let changed = false;

  convos.forEach(convo => {
    const partner = convo.participants.find(p => p !== userEmail) || convo.participants[0];
    if (!partner) return;
    const partnerUser = users.find(u => u.email === partner);
    if (partnerUser?.name) {
      convo.labels = convo.labels || {};
      if (convo.labels[partner] !== partnerUser.name) {
        convo.labels[partner] = partnerUser.name;
        changed = true;
      }
    }
  });

  if (changed) saveConversations(convos);
  return convos;
}

// --- Load pending chat (from profile or itemdetails) ---
const pendingChat = localStorage.getItem("openChatWith");
const pendingMeta = localStorage.getItem("openChatMeta");
if (pendingChat && activeUser) {
  const meta = pendingMeta ? JSON.parse(pendingMeta) : {};
  ensureConversation(activeUser.email, pendingChat, meta.name || pendingChat);
  openChat(pendingChat, meta.name || pendingChat);
  localStorage.removeItem("openChatWith");
  localStorage.removeItem("openChatMeta");
}

// --- Load Chat List ---
function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  chatList.innerHTML = "";

  const convos = syncConversationLabels(user.email)
    .map(convo => {
      if (Array.isArray(convo.participants) && convo.participants.length === 2) return convo;
      if (convo.key?.includes("::")) {
        const [a, b] = convo.key.split("::");
        return { ...convo, participants: [a, b] };
      }
      return null;
    })
    .filter(Boolean)
    .filter(c => c.participants.includes(user.email));

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
      if (!partner) return;
      const lastMsg = conv.messages.at(-1);
      const preview = lastMsg
        ? lastMsg.type === "image" || lastMsg.type === "photo"
          ? "📷 Image"
          : lastMsg.type === "video"
            ? "🎥 Video"
            : lastMsg.type === "voice"
              ? "🎤 Voice message"
              : (lastMsg.content || lastMsg.text || "").slice(0, 50)
        : "No messages";
      const li = document.createElement("li");
      li.className = "conversation-item";
      li.dataset.partner = partner;
      const partnerName = resolveName(partner, conv);
      li.dataset.partnerName = partnerName;
      li.innerHTML = `
        <div class="name">${partnerName}</div>
        <div class="preview">${preview}</div>
      `;
      li.addEventListener("click", () => openChat(partner, partnerName));
      if (currentChatPartner === partner) li.classList.add("active");
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

  const convo = normalizeConversationsFor(user.email).find(
    c => c.key === conversationKey(user.email, partnerEmail)
  );
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

  const conv = normalizeConversationsFor(user.email).find(
    c => c.key === conversationKey(user.email, currentChatPartner)
  );
  chatMessages.innerHTML = "";

  if (!conv || !conv.messages.length) {
    chatMessages.innerHTML = "<p>No messages yet.</p>";
    return;
  }

  conv.messages.forEach(msg => {
    const div = document.createElement("div");
    div.classList.add("message", msg.from === user.email ? "sent" : "received");

    let body = "";
    if (msg.type === "image" || msg.type === "photo") {
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
        ${msg.time || ""}
      </small>
    `;
    chatMessages.appendChild(div);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- Message helpers ---
function addToUserMessages(ownerEmail, partnerEmail, msg) {
  ensureUserRecord(ownerEmail);
  ensureUserRecord(partnerEmail);
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
  const store = getConversationStore();
  store.conversations[convo.key] = sanitizeConversation(convo);
  saveConversationStore(store);

  addToUserMessages(user.email, currentChatPartner, msg);
  addToUserMessages(currentChatPartner, user.email, msg);

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
