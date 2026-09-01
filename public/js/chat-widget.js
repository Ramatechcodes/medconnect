// Shared chat box used by the Patient and Provider (doctor/nurse/pharmacist/
// lab tech) dashboards. Chat only unlocks once a request is accepted, and
// each dashboard is responsible for calling renderChatBox() with a fresh
// container + requestId once that happens.
//
// Delivery uses BOTH a real-time socket push AND a short-interval poll as
// a safety net — some networks/proxies/tunnels (e.g. ngrok, corporate
// firewalls) don't reliably keep WebSocket pushes flowing, so relying on
// the socket alone can silently need a refresh to catch up. The poll
// guarantees messages appear within a few seconds either way. Both paths
// funnel through the same de-duplication so a message never appears twice.

window.__chatSeen = window.__chatSeen || {};   // containerId -> Set of message ids already rendered
window.__chatPollTimers = window.__chatPollTimers || {}; // containerId -> interval id

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function chatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function chatBubbleEl(message, isMine) {
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (isMine ? 'mine' : 'theirs');
  div.innerHTML = `<div class="chat-bubble">${escapeHtml(message.text)}</div><div class="chat-time">${chatTime(message.createdAt)}</div>`;
  return div;
}

// Appends a message to a chat box only if it hasn't been rendered there
// yet (by _id) — the single choke point both the socket push and the
// polling fallback go through, so duplicates can never appear.
function appendChatMessageIfNew(containerId, message, isMine) {
  const seen = window.__chatSeen[containerId];
  if (!seen || seen.has(String(message._id))) return;
  seen.add(String(message._id));

  const msgList = document.getElementById(`${containerId}-messages`);
  if (!msgList) return;
  if (msgList.querySelector('.empty-state')) msgList.innerHTML = '';
  msgList.appendChild(chatBubbleEl(message, isMine));
  msgList.scrollTop = msgList.scrollHeight;
}

// Renders (and wires up) a full chat box inside #<containerId>.
async function renderChatBox(containerId, requestId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Fresh conversation in this box — reset dedup tracking and any poll
  // left running from a previous request (e.g. a prior completed trip).
  window.__chatSeen[containerId] = new Set();
  if (window.__chatPollTimers[containerId]) clearInterval(window.__chatPollTimers[containerId]);

  container.innerHTML = `
    <div class="chat-box">
      <div class="chat-header">💬 Chat</div>
      <div class="chat-messages" id="${containerId}-messages"><div class="empty-state">Loading chat…</div></div>
      <div class="chat-input-row">
        <input type="text" id="${containerId}-input" maxlength="2000" placeholder="Type a message...">
        <button class="btn btn-primary" id="${containerId}-send">Send</button>
      </div>
    </div>
  `;

  const msgList = document.getElementById(`${containerId}-messages`);
  const me = getUser()?.id;

  try {
    const { messages } = await apiRequest(`/messages/${requestId}`);
    msgList.innerHTML = '';
    if (!messages.length) {
      msgList.innerHTML = '<div class="empty-state">Say hello 👋</div>';
    } else {
      messages.forEach(m => {
        window.__chatSeen[containerId].add(String(m._id));
        msgList.appendChild(chatBubbleEl(m, String(m.sender) === String(me)));
      });
      msgList.scrollTop = msgList.scrollHeight;
    }
  } catch (e) {
    msgList.innerHTML = `<div class="empty-state">Could not load chat. (${e.message})</div>`;
  }

  async function send() {
    const input = document.getElementById(`${containerId}-input`);
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const { message } = await apiRequest(`/messages/${requestId}`, { method: 'POST', body: { text } });
      appendChatMessageIfNew(containerId, message, true);
    } catch (e) {
      showAlert('alertBox', e.message);
    }
  }

  document.getElementById(`${containerId}-send`).addEventListener('click', send);
  document.getElementById(`${containerId}-input`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  // Polling safety net — self-stops once this chat box is no longer on
  // the page (trip completed, panel re-rendered, etc.).
  window.__chatPollTimers[containerId] = setInterval(async () => {
    if (!document.getElementById(containerId)) {
      clearInterval(window.__chatPollTimers[containerId]);
      delete window.__chatPollTimers[containerId];
      return;
    }
    try {
      const { messages: latest } = await apiRequest(`/messages/${requestId}`);
      const meNow = getUser()?.id;
      latest.forEach(m => appendChatMessageIfNew(containerId, m, String(m.sender) === String(meNow)));
    } catch (e) {
      // transient network hiccup — try again next tick
    }
  }, 4000);
}

// Wires a socket to append incoming chat messages into whichever open chat
// box matches the message's requestId — the fast path, when it works.
// `getActiveRequestId` is a function returning the currently-open
// request's id (or null), and `containerId` is the chat box to update.
function wireChatSocket(socket, getActiveRequestId, containerId) {
  socket.on('chat:message', (message) => {
    const activeId = getActiveRequestId();
    if (!activeId || String(message.request) !== String(activeId)) return;
    appendChatMessageIfNew(containerId, message, false);
  });
}
