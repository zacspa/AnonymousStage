/**
 * Chat module — uses LiveKit data channels for messaging.
 */
const Chat = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let messagesEl = null;
  let room = null;

  function init(lkRoom) {
    room = lkRoom;
    messagesEl = document.getElementById('chat-messages');

    room.on(LivekitClient.RoomEvent.DataReceived, (payload, participant) => {
      try {
        const msg = JSON.parse(decoder.decode(payload));
        if (msg.type === 'chat') {
          appendMessage(msg.name, msg.text);
        }
      } catch (_) { /* ignore non-chat data */ }
    });
  }

  function send(name, text) {
    if (!room || !text.trim()) return;
    const msg = JSON.stringify({ type: 'chat', name, text: text.trim() });
    room.localParticipant.publishData(encoder.encode(msg), { reliable: true });
    // Show own message locally
    appendMessage(name, text.trim());
  }

  function appendMessage(name, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.style.color = nameColor(name);
    nameSpan.textContent = name;

    const textNode = document.createTextNode(text);

    div.appendChild(nameSpan);
    div.appendChild(textNode);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendSystem(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Deterministic color from name
  function nameColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 65%)`;
  }

  return { init, send, appendSystem };
})();
