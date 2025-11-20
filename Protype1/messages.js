// --- Multi-user helpers ---
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

addNotification(
  recipientEmail,
  "message",
  "New Message",
  `You received a message from ${senderName}.`
);


// Ensure user logged in
if (!getCurrentUser()) {
  window.location.href = "login_signup.html";
}

// --- UI Elements ---
const chatList = document.getElementById("chatList");
const chatMessages = document.getElementById("chatMessages");
const chatHeader = document.getElementById("chatHeader");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

let currentChatPartner = null;

// --- Load pending chat (from profile or itemdetails) ---
const pendingChat = localStorage.getItem("openChatWith");
if (pendingChat) {
  openChat(pendingChat);
  localStorage.removeItem("openChatWith");
}

// --- Load Chat List ---
function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  chatList.innerHTML = "";

  const convos = user.messages || [];
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
function openChat(partnerEmail) {
  const user = getCurrentUser();
  if (!user) return;

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

  const conv = (user.messages || []).find(c => c.with === currentChatPartner);
  chatMessages.innerHTML = "";

  if (!conv || !conv.chat.length) {
    chatMessages.innerHTML = "<p>No messages yet.</p>";
    return;
  }

  conv.chat.forEach(msg => {
    const div = document.createElement("div");
    div.classList.add("message", msg.from === user.email ? "sent" : "received");
    div.innerHTML = `
      <span>${msg.text}</span>
      <small style="display:block;opacity:0.6;font-size:11px;margin-top:3px;">
        ${msg.time || ""}
      </small>
    `;
    chatMessages.appendChild(div);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- Send Message ---
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChatPartner) return;

  const users = getUsers();
  const sender = getCurrentUser();
  const receiver = users.find(u => u.email === currentChatPartner);
  if (!receiver) {
    alert("User not found!");
    return;
  }

  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const msg = { from: sender.email, text, time: timestamp };

  // Update sender messages
  sender.messages = sender.messages || [];
  let senderConv = sender.messages.find(c => c.with === receiver.email);
  if (!senderConv) {
    senderConv = { with: receiver.email, chat: [] };
    sender.messages.push(senderConv);
  }
  senderConv.chat.push(msg);

  // Update receiver messages
  receiver.messages = receiver.messages || [];
  let receiverConv = receiver.messages.find(c => c.with === sender.email);
  if (!receiverConv) {
    receiverConv = { with: sender.email, chat: [] };
    receiver.messages.push(receiverConv);
  }
  receiverConv.chat.push(msg);

  // Save updates
  const updatedUsers = users.map(u =>
    u.email === sender.email ? sender : u.email === receiver.email ? receiver : u
  );
  saveUsers(updatedUsers);
  localStorage.setItem("loggedInUser", JSON.stringify(sender));

  messageInput.value = "";
  renderMessages();
  loadChatList();
}

// --- Auto-load Chat List ---
loadChatList();
