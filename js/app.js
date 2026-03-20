/**
 * App entry point — reads URL hash, manages UI state.
 *
 * URL hash format:
 *   #perform&wss=abc123.trycloudflare.com   → performer mode
 *   #wss=abc123.trycloudflare.com           → viewer mode
 */
(async () => {
  // Parse hash params
  const hashParams = {};
  location.hash.replace(/^#/, '').split('&').forEach(part => {
    const [k, v] = part.split('=');
    if (k) hashParams[k] = v || true;
  });

  const isPerformer = 'perform' in hashParams;
  const tunnelHost = hashParams.wss || null;

  // Generate anonymous name
  const anonName = isPerformer
    ? 'Performer'
    : `Listener-${Math.floor(1000 + Math.random() * 9000)}`;

  // DOM refs
  const setupScreen = document.getElementById('setup-screen');
  const stageScreen = document.getElementById('stage-screen');
  const setupViewer = document.getElementById('setup-viewer');
  const setupPerformer = document.getElementById('setup-performer');
  const tunnelInput = document.getElementById('tunnel-input');
  const goLiveBtn = document.getElementById('go-live-btn');
  const performerControls = document.getElementById('performer-controls');
  const viewerCountEl = document.getElementById('viewer-count');
  const performerNameEl = document.getElementById('performer-name');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const toggleMicBtn = document.getElementById('toggle-mic-btn');
  const toggleCamBtn = document.getElementById('toggle-cam-btn');
  const endStreamBtn = document.getElementById('end-stream-btn');

  // --- Performer mode ---
  if (isPerformer) {
    setupViewer.style.display = 'none';
    setupPerformer.style.display = 'flex';
    if (tunnelHost) tunnelInput.value = tunnelHost;

    goLiveBtn.addEventListener('click', async () => {
      const host = tunnelInput.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!host) return alert('Enter your tunnel URL');

      goLiveBtn.disabled = true;
      goLiveBtn.textContent = 'Connecting...';

      try {
        const token = await fetchToken(host, 'Performer', true);
        const room = await Stream.connect(host, token, {
          onViewerCountChange: count => {
            viewerCountEl.textContent = `${count} watching`;
          },
          onDisconnected: () => {
            alert('Disconnected from server');
            location.reload();
          },
        });

        Chat.init(room);
        Chat.appendSystem('You are live!');

        await Stream.publishTracks({ audio: true, video: false });

        showStage();
        performerControls.style.display = 'flex';
        performerNameEl.textContent = 'Performer (you)';

        // Update URL hash so it can be shared
        location.hash = `perform&wss=${host}`;
      } catch (err) {
        console.error(err);
        alert(`Failed to connect: ${err.message}`);
        goLiveBtn.disabled = false;
        goLiveBtn.textContent = 'Go Live';
      }
    });

    toggleMicBtn.addEventListener('click', () => {
      const micOn = Stream.toggleMic();
      toggleMicBtn.textContent = micOn ? 'Mute Mic' : 'Unmute Mic';
    });

    toggleCamBtn.addEventListener('click', () => {
      const camOn = Stream.toggleCamera();
      toggleCamBtn.textContent = camOn ? 'Hide Cam' : 'Show Cam';
    });

    endStreamBtn.addEventListener('click', () => {
      Stream.disconnect();
      location.hash = '';
      location.reload();
    });
  }

  // --- Viewer mode ---
  if (!isPerformer) {
    if (!tunnelHost) {
      setupViewer.innerHTML = '<p>No stream URL provided.</p><p style="color:var(--text-dim)">Ask the performer for a link.</p>';
      return;
    }

    try {
      const token = await fetchToken(tunnelHost, anonName, false);
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

      showStage();
      performerNameEl.textContent = anonName;
    } catch (err) {
      console.error(err);
      setupViewer.innerHTML = `<p>Could not connect to stream.</p><p style="color:var(--text-dim)">${err.message}</p>`;
    }
  }

  // --- Chat form ---
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value;
    if (!text.trim()) return;
    Chat.send(isPerformer ? 'Performer' : anonName, text);
    chatInput.value = '';
  });

  // --- Helpers ---
  function showStage() {
    setupScreen.style.display = 'none';
    stageScreen.style.display = 'flex';
  }

  async function fetchToken(host, identity, isPerformer) {
    // Token server + LiveKit proxy share the same tunnel origin
    const url = `https://${host}/token?name=${encodeURIComponent(identity)}&performer=${isPerformer}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Token server returned ${resp.status}`);
    const data = await resp.json();
    return data.token;
  }
})();
