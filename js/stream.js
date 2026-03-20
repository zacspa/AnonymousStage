/**
 * Stream module — handles LiveKit room connection, track publish/subscribe.
 */
const Stream = (() => {
  let room = null;
  let onViewerCountChange = null;

  // Rewrite private LAN IPs to public IP in ICE candidates for remote viewers
  function patchIceCandidates(publicIp) {
    if (!publicIp) return;
    // Match common private IP patterns (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const privateIpRegex = /(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})/g;

    const origAddIceCandidate = RTCPeerConnection.prototype.addIceCandidate;
    RTCPeerConnection.prototype.addIceCandidate = function(candidate) {
      if (candidate && candidate.candidate && privateIpRegex.test(candidate.candidate)) {
        candidate = new RTCIceCandidate({
          candidate: candidate.candidate.replace(privateIpRegex, publicIp),
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        });
      }
      return origAddIceCandidate.call(this, candidate);
    };

    const origSetRemoteDesc = RTCPeerConnection.prototype.setRemoteDescription;
    RTCPeerConnection.prototype.setRemoteDescription = function(desc) {
      if (desc && desc.sdp) {
        desc = new RTCSessionDescription({
          type: desc.type,
          sdp: desc.sdp.replace(privateIpRegex, publicIp),
        });
      }
      return origSetRemoteDesc.call(this, desc);
    };
  }

  async function connect(tunnelUrl, token, callbacks = {}) {
    onViewerCountChange = callbacks.onViewerCountChange || null;

    // If a public IP was provided, rewrite ICE candidates for remote viewers
    if (callbacks.publicIp) {
      patchIceCandidates(callbacks.publicIp);
    }

    // Determine ws:// vs wss:// based on host
    let wsUrl = tunnelUrl.replace(/^(https?|wss?):\/\//, '').replace(/\/$/, '');
    const isLocal = wsUrl.startsWith('localhost') || wsUrl.startsWith('127.0.0.1');
    wsUrl = `${isLocal ? 'ws' : 'wss'}://${wsUrl}`;

    room = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
    });

    // Track subscribed — viewer receives performer's tracks
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const el = track.attach();
      if (track.kind === 'video') {
        const videoEl = document.getElementById('stage-video');
        // Copy the srcObject from the attached element
        videoEl.srcObject = el.srcObject || el.captureStream?.();
        // Or just replace with the attached element
        const container = document.getElementById('video-container');
        el.id = 'stage-video';
        el.className = 'active';
        el.autoplay = true;
        el.playsInline = true;
        const old = document.getElementById('stage-video');
        if (old) old.replaceWith(el);
        document.getElementById('no-video-placeholder').classList.add('hidden');
      } else if (track.kind === 'audio') {
        el.id = 'stage-audio-' + Math.random().toString(36).slice(2);
        el.autoplay = true;
        // Start muted; unmute overlay handles user gesture
        el.muted = true;
        document.body.appendChild(el);
      }
      if (callbacks.onTrackSubscribed) callbacks.onTrackSubscribed(track);
    });

    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(el => el.remove());
      if (track.kind === 'video') {
        document.getElementById('no-video-placeholder')?.classList.remove('hidden');
        // Re-add a fresh video element if it was removed
        if (!document.getElementById('stage-video')) {
          const v = document.createElement('video');
          v.id = 'stage-video';
          v.autoplay = true;
          v.playsInline = true;
          document.getElementById('video-container').prepend(v);
        }
      }
    });

    room.on(LivekitClient.RoomEvent.ParticipantConnected, () => updateViewerCount());
    room.on(LivekitClient.RoomEvent.ParticipantDisconnected, () => updateViewerCount());
    room.on(LivekitClient.RoomEvent.Disconnected, () => {
      if (callbacks.onDisconnected) callbacks.onDisconnected();
    });

    await room.connect(wsUrl, token);
    updateViewerCount();

    return room;
  }

  async function publishTracks({ audio = true, video = false } = {}) {
    if (!room) throw new Error('Not connected');

    if (audio) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }
    if (video) {
      await room.localParticipant.setCameraEnabled(true);
      // Attach local video preview
      const camTrack = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
      if (camTrack?.track) {
        const el = camTrack.track.attach();
        el.id = 'stage-video';
        el.className = 'active';
        el.autoplay = true;
        el.playsInline = true;
        el.muted = true; // Don't play own audio
        const old = document.getElementById('stage-video');
        if (old) old.replaceWith(el);
        document.getElementById('no-video-placeholder').classList.add('hidden');
      }
    }
  }

  function toggleMic() {
    if (!room) return false;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    room.localParticipant.setMicrophoneEnabled(!enabled);
    return !enabled;
  }

  function toggleCamera() {
    if (!room) return false;
    const enabled = room.localParticipant.isCameraEnabled;
    room.localParticipant.setCameraEnabled(!enabled);
    if (enabled) {
      // Turning off camera
      document.getElementById('no-video-placeholder')?.classList.remove('hidden');
      const v = document.getElementById('stage-video');
      if (v) v.classList.remove('active');
    }
    return !enabled;
  }

  function disconnect() {
    if (room) {
      room.disconnect();
      room = null;
    }
  }

  function getRoom() {
    return room;
  }

  function updateViewerCount() {
    if (!room) return;
    const count = room.numParticipants; // excludes local
    if (onViewerCountChange) onViewerCountChange(count);
  }

  return { connect, publishTracks, toggleMic, toggleCamera, disconnect, getRoom };
})();
