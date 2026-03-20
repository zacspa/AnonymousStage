/**
 * Viewer-only entry point — reads tunnel host from URL hash.
 *
 * URL hash format:
 *   #wss=abc123.trycloudflare.com → viewer mode
 *
 * Performer mode is at http://localhost:3001/perform (WebAuthn protected).
 */
(async () => {
  // Parse hash params
  const hashParams = {};
  location.hash.replace(/^#/, '').split('&').forEach(part => {
    const [k, v] = part.split('=');
    if (k) hashParams[k] = v || true;
  });

  const tunnelHost = hashParams.wss || null;
  const anonName = `Listener-${Math.floor(1000 + Math.random() * 9000)}`;

  // DOM refs
  const setupScreen = document.getElementById('setup-screen');
  const stageScreen = document.getElementById('stage-screen');
  const setupViewer = document.getElementById('setup-viewer');
  const viewerCountEl = document.getElementById('viewer-count');
  const performerNameEl = document.getElementById('performer-name');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  if (!tunnelHost) {
    setupViewer.innerHTML = '<p>No stream URL provided.</p><p style="color:var(--text-dim)">Ask the performer for a link.</p>';
    return;
  }

  try {
    const token = await fetchToken(tunnelHost, anonName);
    const room = await Stream.connect(tunnelHost, token, {
      onViewerCountChange: count => {
        viewerCountEl.textContent = `${count} watching`;
      },
      onTrackSubscribed: () => {},
      onDisconnected: () => {
        Chat.appendSystem('Stream ended.');
      },
    });

    Chat.init(room);
    Chat.appendSystem(`Joined as ${anonName}`);

    setupScreen.style.display = 'none';
    stageScreen.style.display = 'flex';
    performerNameEl.textContent = anonName;
  } catch (err) {
    console.error(err);
    setupViewer.innerHTML = `<p>Could not connect to stream.</p><p style="color:var(--text-dim)">${err.message}</p>`;
  }

  // Chat
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value;
    if (!text.trim()) return;
    Chat.send(anonName, text);
    chatInput.value = '';
  });

  async function fetchToken(host, identity) {
    const url = `https://${host}/token?name=${encodeURIComponent(identity)}&performer=false`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Token server returned ${resp.status}`);
    const data = await resp.json();
    return data.token;
  }
})();
