const form = document.getElementById("chat-form");
const chat = document.getElementById("chat");
const input = document.getElementById("message");

function getSessionId() {
  const key = "llm_obs_session_id";
  let sid = localStorage.getItem(key);
  if (!sid) {
    sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    localStorage.setItem(key, sid);
  }
  return sid;
}
const sessionId = getSessionId();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  addMessage("You", text);
  input.value = "";

  let res;
  try {
    res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId, safe_mode: false }),
    });
  } catch (err) {
    addMessage("Copilot", `Network error: ${err.message || err}`);
    return;
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    addMessage("Copilot", `Server error (${res.status}): ${bodyText || "Request failed"}`);
    return;
  }

  const data = await res.json();
  console.log(data);
  addMessage("Copilot", data.answer, data.request_id);
});

function addMessage(author, text, requestId = null) {
  const div = document.createElement("div");
  div.className = "message";
  div.innerHTML = `<span class="user">${author}:</span> ${text}`;

  if (requestId) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `request_id: ${requestId}`;
    div.appendChild(meta);
  }

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
