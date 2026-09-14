// WebRTC plumbing: one RTCPeerConnection + one data channel per guest.
// No ICE servers: peers find each other through host candidates on the hotspot network.
import { packDescription, unpackDescription } from './sdp.js';

const CONFIG = { iceServers: [] };
const GATHER_TIMEOUT_MS = 3000;

function waitForCandidates(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, GATHER_TIMEOUT_MS);
  });
}

export function whenOpen(channel, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (channel.readyState === 'open') return resolve(channel);
    const timer = setTimeout(() => reject(new Error('Connexion impossible (délai dépassé).')), timeoutMs);
    channel.onopen = () => { clearTimeout(timer); resolve(channel); };
    channel.onerror = () => { clearTimeout(timer); reject(new Error('Connexion impossible.')); };
  });
}

// Host side: returns the code to show, plus the pending connection.
export async function createOffer() {
  const pc = new RTCPeerConnection(CONFIG);
  const channel = pc.createDataChannel('fwf');
  await pc.setLocalDescription(await pc.createOffer());
  await waitForCandidates(pc);
  return { pc, channel, code: packDescription(pc.localDescription) };
}

export function acceptAnswer(pc, code) {
  return pc.setRemoteDescription(unpackDescription(code, 'answer'));
}

// Guest side: consumes the host's code, returns the code to show back.
export async function createAnswer(code) {
  const pc = new RTCPeerConnection(CONFIG);
  const channelPromise = new Promise((resolve) => { pc.ondatachannel = (e) => resolve(e.channel); });
  await pc.setRemoteDescription(unpackDescription(code, 'offer'));
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForCandidates(pc);
  return { pc, channelPromise, code: packDescription(pc.localDescription) };
}
