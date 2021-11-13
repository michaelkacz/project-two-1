const VIDEO_CHAT = 'videoChat';
const TEXT_CHAT = 'textChat';
const VIDEO_CONTROL = 'videoControl';

const $self = {
  /* common start */
  rtcConfig: null,
  id: null,

  // computed property names
  [VIDEO_CHAT]: {
    // [peerId]: isPolit...
  },
  [TEXT_CHAT]: {
    // [peerId]: isPolit...
  },
  [VIDEO_CONTROL]: {
    // [peerId]: isPolit...
  },
  /* common end */

  /* David start */
  mediaConstraints: { audio: true, video: true },

  /* David end */

  /*  Michael start */

  /*  Michael end */

  /* Chiachi start */
  controlDCId: 99,

  /* Chiachi end */
};


// For storing user video peers
const $peers = {
  [VIDEO_CHAT]: {
    // [peerId]: connection...
  },
  [TEXT_CHAT]: {
    // [peerId]: connection...
  },
  [VIDEO_CONTROL]: {
    // [peerId]: connection...
  },
};

/*
navigator.mediaDevices.getUserMedia($self.mediaConstraints).then((stream) => {
  $self.stream = stream;
});
*/

/** Signaling-Channel Setup **/
const namespace = prepareNamespace(window.location.hash, true);

const sc = io.connect('/' + namespace, { autoConnect: false });

registerChannelEvents();
sc.open();

// Signaling Channel Events
function registerChannelEvents() {
  sc.on('connect', handleChannelConnect);
  sc.on('connected peers', handleChannelConnectedPeers);
  sc.on('connected peer', handleChannelConnectedPeer);
  sc.on('signal', handleChannelSignal);
  sc.on('disconnected peer', handleChannelDisconnectedPeer);
}

function handleChannelConnect() {
  console.log('Connected to signaling server!');
  $self.id = sc.id;
  console.log(`Self ID: ${$self.id}`);
}

function handleChannelConnectedPeers(ids) {
  console.log(`Connected peer IDs: ${ids.join(', ')}`);
  for (let id of ids) {
    if (id !== $self.id) {
      // $self is polite with already-connected peers
      initializeSelfAndPeerByIdAndType(VIDEO_CHAT, id, true);
      establishCallFeatures(id);

      initializeSelfAndPeerByIdAndType(VIDEO_CONTROL, id, true);
      establishVideoControlFeatures(id);
    }
  }
}

function handleChannelConnectedPeer(id) {
  console.log(`ID of the new coming peer: ${id}`);
  // $self is impolite with each newly connecting peer
  initializeSelfAndPeerByIdAndType(VIDEO_CHAT, id, false);
  establishCallFeatures(id);


  initializeSelfAndPeerByIdAndType(VIDEO_CONTROL, id, false);
  establishVideoControlFeatures(id);
}

function initializeSelfAndPeerByIdAndType(type, id, isPolite) {
  $self[type][id] = { isPolite };
  $peers[type][id] = { connection: new RTCPeerConnection($self.rtcConfig) };
}

function handleChannelDisconnectedPeer(id) {
  console.log(`Disconnected peer ID: ${id}`);
}

async function handleChannelSignal({ from, to, type, description, candidate, resend }) {
  console.log('Heard signal event!');
  const myself = $self[type][from];
  const peer = $peers[type][from];

  if (description) {
    console.log('Received SDP Signal:', description);
    const readyForOffer = !myself.isMakingOffer &&
        (peer.connection.signalingState === 'stable' || myself.isSettingRemoteAnswerPending);
    console.log('readyForOffer:', readyForOffer);

    const offerCollision = description.type === 'offer' && !readyForOffer;
    console.log('offerCollision:', offerCollision);

    myself.isIgnoringOffer = !myself.isPolite && offerCollision;
    console.log('isIgnoringOffer:', myself.isIgnoringOffer);

    if (myself.isIgnoringOffer) {
      return;
    }

    myself.isSettingRemoteAnswerPending = description.type === 'answer';
    try {
      await peer.connection.setRemoteDescription(description);
    } catch(e) {
      console.error('Cannot set remote description', e);
      if (!myself.isSettingRemoteAnswerPending && peer.connection.signalingState === 'have-local-offer') {
        // the browser (Safari) can't handle state conflict, so reset myself and tell remote end to send again
        // TODO reset connection
      }
      return;
    }
    myself.isSettingRemoteAnswerPending = false;

    if (description.type === 'offer') {
      try {
        await peer.connection.setLocalDescription();
      } catch(e) {
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
      } finally {
        console.log('Send answer');
        sc.emit('signal', {
          from: $self.id,
          to: from,
          type,
          description: peer.connection.localDescription
        });
        myself.skipOffer = false;
      }
    }
  } else if (candidate) {
    console.log('Received ICE candidate:', candidate);
    try {
      await peer.connection.addIceCandidate(candidate);
    } catch(e) {
      if (!myself.isIgnoringOffer) {
        console.error('Cannot add ICE candidate for peer', e);
      }
    }
  } else if (resend) {
    console.log('Received resend signal');
    handleRtcNegotiation(type, from);
  }
}

/* WebRTC Events */
function registerRtcEvents(type, id, handler) {
  peer = $peers[type][id];

  peer.connection.onnegotiationneeded = () => handleRtcNegotiation(type, id);
  peer.connection.onicecandidate = ({ candidate }) => handleIceCandidate(type, id, candidate);

  if (type === VIDEO_CHAT) {
    peer.connection.ontrack = ({ streams: [stream] }) => handler(type, id, stream);
  } else {
    // The rest of types are data channel event
    peer.connection.ondatachannel = ({ channel }) => handler(type, id, channel);
  }
}

function establishCallFeatures(id) {
  /* David */
  registerRtcEvents(VIDEO_CHAT, id, videoChatOnTrack);
  addStreamingMedia(id, $self.stream);
}

function videoChatOnTrack(type, id, stream) {
  /* David */
  console.log('handle video chat ontrack');
}

function addStreamingMedia(id, stream) {
  /* David */
  const peer = $peers[VIDEO_CHAT][id];
  if (stream) {
    for (let track of stream.getTracks()) {
      peer.connection.addTrack(track, stream);
    }
  }
}

function establishTextChatFeatures(id) {
  /* Michael */
  registerRtcEvents(TEXT_CHAT, id, textChatOnDataChannel);
}

function textChatOnDataChannel(type, id, channel) {
  /* Michael */
  console.log('handle text chat ondatachannel');
}

function establishVideoControlFeatures(id) {
  /* Chiachi */
  registerRtcEvents(VIDEO_CONTROL, id, videoControlOnDataChannel);
  const peer = $peers[VIDEO_CONTROL][id];
  peer.dataChannel = peer.connection.createDataChannel(VIDEO_CONTROL, {
    negotiated: true,
    id: $self.controlDCId,
  });
  peer.dataChannel.onmessage = handleVideoControl;
}

function videoControlOnDataChannel(type, id, channel) {
  console.log('handle video control ondatachannel', type, id, channel);
}

async function handleRtcNegotiation(type, id) {
  const myself = $self[type][id];
  const peer = $peers[type][id];
  console.log('RTC negotiation needed...');
  if (myself.skipOffer) {
    console.log('Skip offer');
    return;
  }
  // send an SDP description
  myself.isMakingOffer = true;
  try {
    await peer.connection.setLocalDescription();
  } catch (e) {
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
  } finally {
    // finally, however this was done, send the localDescription to the remote peer
    console.log('Send description...');
    sc.emit('signal', {
      from: $self.id,
      to: id,
      type,
      description: peer.connection.localDescription
    });
  }
  myself.isMakingOffer = false;
}

function handleIceCandidate(type, id, candidate) {
  // send ICE candidate
  console.log('Send ICE candidate...');
  sc.emit('signal', {
    from: $self.id,
    to: id,
    type,
    candidate
  });
}

/**
David start
*/



/**
David end
*/



/**
Michael start
*/



/**
Michael end
*/



/**
Chiachi start
*/
// TODO get vidoe id from the room settings
const videoId = 'npUlUdeU1vc';

const iframeAPIScript = document.createElement('script');
iframeAPIScript.src = 'https://www.youtube.com/iframe_api';
document.getElementsByTagName('body')[0].append(iframeAPIScript);

const playerDom = document.getElementById('player');
let player;
// This will be executed after the YouTubeIframeAPI is loaded.
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: playerDom.clientWidth * 0.5625,
    width: playerDom.clientWidth,
    videoId,
    playerVars: {
      modestbranding: 1,
      controls: 0,
      playsinline: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
}

// This will be called when the video player is ready.
function onPlayerReady(event) {
  console.log('ready...');
  // Mute to prevent this error "Autoplay is only allowed when approved by the user, the site is activated by the user, or media is muted."
  player.mute();
}

// The will be called when the player's state changes.
function onPlayerStateChange(event) {
  // TODO send command to everyone
  console.log(event.data);
}

function startVideo(skipSendCommand) {
  if (!skipSendCommand) {
    sendControlCommand('start');
  }
  player.playVideo();
}

function pauseVideo(skipSendCommand) {
  if (!skipSendCommand) {
    sendControlCommand('pause');
  }
  player.pauseVideo();
}

function stopVideo(skipSendCommand) {
  if (!skipSendCommand) {
    sendControlCommand('stop');
  }
  player.stopVideo();
}

function sendControlCommand(command) {
  for(let peerID in $peers[VIDEO_CONTROL]) {
    console.log('send command to', peerID);
    $peers[VIDEO_CONTROL][peerID].dataChannel.send(command);
  }
}

function handleVideoControl({ data }) {
  console.log(data);
  switch(data) {
    case 'start':
      startVideo(true);
      break;
    case 'pause':
      pauseVideo(true);
      break;
    case 'stop':
      stopVideo(true);
      break;
    default:
      console.log('unknown command');
  }
}

document.getElementById('play-video').addEventListener('click', () => startVideo());
document.getElementById('pause-video').addEventListener('click', () => pauseVideo());
document.getElementById('stop-video').addEventListener('click', () => stopVideo());


/**
Chiachi end
*/
