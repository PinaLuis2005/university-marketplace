// === Global notification helper ===
function addNotification(userEmail, type, title, details) {
  const all = JSON.parse(localStorage.getItem("notifications")) || [];
  all.push({
    id: Date.now(),
    userEmail,
    type, // "message" | "sale" | "review"
    title,
    details,
    timestamp: new Date().toISOString(),
    read: false
  });
  localStorage.setItem("notifications", JSON.stringify(all));
}
