import { createOffer, acceptAnswer, createAnswer, whenOpen } from './peer.js';
import { renderQr, QrScanner } from './qr.js';
import { HostRoom, GuestRoom } from './room.js';
import * as quiz from './quiz-ui.js';
import { TIMING } from './game.js';

const $ = (id) => document.getElementById(id);
const CONNECT_TIMEOUT_MS = 20000;
const APP_VERSION = 'v4';
const DEBUG = new URLSearchParams(location.search).has('debug') || localStorage.getItem('fwf.debug') === '1';
const BOT_NAMES = ['Alice', 'Bruno', 'Chloé'];

const self = {
  id: localStorage.getItem('fwf.id') || saveId(),
  name: localStorage.getItem('fwf.name') || '',
};
let room = null;
let isHost = false;
let members = [];
let pendingScan = null; // (text) => void, set while a scan is expected
const scanner = new QrScanner($('scan-video'));

function saveId() {
  const id = Math.random().toString(36).slice(2, 10);
  localStorage.setItem('fwf.id', id);
  return id;
}

// ---------- screens ----------

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
  $('btn-leave').hidden = id !== 'screen-room';
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
}

function showHome() {
  $('home-name').textContent = self.name;
  $('btn-test').hidden = !DEBUG;
  $('btn-resume').hidden = !HostRoom.savedGame();
  show('screen-home');
}

// ---------- settings ----------

$('btn-settings').onclick = () => {
  $('debug-toggle').checked = DEBUG;
  $('app-version').textContent = APP_VERSION;
  settingsReturn = room ? 'screen-room' : 'screen-home';
  show('screen-settings');
};
let settingsReturn = 'screen-home';
$('btn-settings-back').onclick = () => (settingsReturn === 'screen-home' ? showHome() : show(settingsReturn));
$('debug-toggle').onchange = (e) => {
  localStorage.setItem('fwf.debug', e.target.checked ? '1' : '0');
  toast('Recharge l\'appli pour appliquer');
};

// ---------- name ----------

$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  self.name = $('name-input').value.trim();
  localStorage.setItem('fwf.name', self.name);
  showHome();
});
$('btn-change-name').onclick = () => { $('name-input').value = self.name; show('screen-name'); };
$('btn-help').onclick = () => show('screen-help');
$('btn-help-back').onclick = showHome;

// ---------- invite (share the app link before the flight) ----------

const APP_URL = location.origin + location.pathname.replace(/index.html$/, '');
const INVITE_TEXT = [
  'Pour discuter et jouer pendant le vol, sans réseau :',
  '1. Ouvre ce lien AVANT le vol, avec internet : ' + APP_URL,
  '   iPhone : dans Safari, bouton Partager, « Sur l\'écran d\'accueil ».',
  '   Android : dans Chrome, menu, « Installer l\'application ».',
  '2. Ouvre l\'appli une fois depuis l\'icône et entre ton prénom.',
  '3. Dans l\'avion : mode avion, puis Wi-Fi activé et connecte-toi à mon partage de connexion.',
  '4. « Rejoindre un salon », scanne mon code, puis montre-moi le tien.',
].join('\n');

$('share-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(INVITE_TEXT);
$('share-sms').href = 'sms:' + (/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(INVITE_TEXT);
$('share-copy').onclick = () => navigator.clipboard.writeText(INVITE_TEXT).then(() => toast('Message copié'), () => toast('Copie impossible'));

$('btn-share').onclick = async () => {
  if (navigator.share) {
    try { await navigator.share({ title: 'Vol entre amis', text: INVITE_TEXT }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  $('share-fallback').hidden = false;
};

// ---------- pairing ----------

function showPair(title) {
  $('pair-title').textContent = title;
  $('pair-hint').textContent = '';
  $('pair-status').textContent = '';
  $('qr-canvas').hidden = true;
  $('scanner').hidden = true;
  $('pair-next').hidden = true;
  $('pair-debug').hidden = !DEBUG;
  setDebugPair(null);
  show('screen-pair');
}

// Debug helpers on the pairing screen: show the code as text, accept a pasted one.
function setDebugPair(mode) {
  $('pair-code').hidden = $('pair-copy').hidden = mode !== 'code';
  $('pair-paste-form').hidden = mode !== 'scan';
}
$('pair-copy').onclick = () => navigator.clipboard.writeText($('pair-code').value).then(() => toast('Code copié'));
$('pair-paste-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('pair-paste').value.trim();
  $('pair-paste').value = '';
  if (text) submitScan(text);
});

function submitScan(text) {
  if (!pendingScan) return;
  const resolve = pendingScan;
  pendingScan = null;
  scanner.stop();
  resolve(text);
}

function showCode(hint, code) {
  $('pair-hint').textContent = hint;
  $('scanner').hidden = true;
  renderQr($('qr-canvas'), code);
  $('qr-canvas').hidden = false;
  $('pair-code').value = code;
  setDebugPair('code');
  window.fwfDebug.code = code;
}

function scan(hint) {
  $('pair-hint').textContent = hint;
  $('qr-canvas').hidden = true;
  $('scanner').hidden = false;
  setDebugPair('scan');
  return new Promise((resolve, reject) => {
    pendingScan = resolve;
    scanner.start((text) => { pendingScan = null; resolve(text); }).catch((err) => {
      if (DEBUG) { $('scanner').hidden = true; toast('Pas de caméra : colle un code'); return; }
      reject(new Error('Caméra inaccessible : ' + err.message));
    });
  });
}

function stopPairing() {
  pendingScan = null;
  scanner.stop();
}

function cancelPairing() {
  stopPairing();
  if (room) show('screen-room'); else showHome();
}
$('pair-cancel').onclick = cancelPairing;

async function hostAddGuest() {
  showPair('Inviter un participant');
  try {
    $('pair-status').textContent = 'Préparation…';
    const offer = await createOffer();
    window.fwfDebug.pc = offer.pc;
    $('pair-status').textContent = '';
    showCode('Étape 1 : fais scanner ce code par ton ami (il choisit « Rejoindre un salon »).', offer.code);
    const next = $('pair-next');
    next.textContent = 'Étape 2 : scanner le code de ton ami';
    next.hidden = false;
    await new Promise((resolve) => { next.onclick = resolve; });
    next.hidden = true;
    const answer = await scan('Étape 2 : scanne le code affiché sur le téléphone de ton ami.');
    $('scanner').hidden = true;
    $('pair-status').textContent = 'Connexion…';
    await acceptAnswer(offer.pc, answer);
    room.attach(offer.channel, offer.pc);
    await whenOpen(offer.channel, CONNECT_TIMEOUT_MS);
    toast('Participant connecté');
    show('screen-room');
  } catch (err) {
    fail(err);
  }
}

let guestPc = null; // the guest's own RTCPeerConnection, closed before re-pairing or leaving

async function joinRoom() {
  showPair('Rejoindre un salon');
  try {
    if (guestPc) { guestPc.close(); guestPc = null; } // drop any stale connection before rejoining
    const offer = await scan('Scanne le code affiché sur le téléphone de l\'hôte.');
    $('scanner').hidden = true;
    $('pair-status').textContent = 'Préparation…';
    const answer = await createAnswer(offer);
    guestPc = answer.pc;
    window.fwfDebug.pc = answer.pc;
    $('pair-status').textContent = '';
    showCode('Fais scanner ce code par l\'hôte.', answer.code);
    const channel = await whenOpen(await answer.channelPromise, 60000);
    enterRoom(new GuestRoom(channel, self), false);
  } catch (err) {
    fail(err);
  }
}

function fail(err) {
  stopPairing();
  toast(err.message || String(err));
  if (room) show('screen-room'); else showHome();
}

$('btn-host').onclick = () => {
  enterRoom(new HostRoom(self), true);
  hostAddGuest();
};
$('btn-resume').onclick = () => {
  enterRoom(new HostRoom(self, HostRoom.savedGame()), true);
  toast('Partie restaurée : invite les joueurs puis reprends');
};
$('btn-join').onclick = joinRoom;
$('btn-test').onclick = () => {
  enterRoom(new HostRoom(self), true);
  BOT_NAMES.forEach((name, i) => setTimeout(() => room && room.addBot(name), 800 * (i + 1)));
};
$('btn-add-guest').onclick = hostAddGuest;
$('btn-rejoin').onclick = joinRoom;
$('btn-lost-home').onclick = showHome;

// ---------- room ----------

function enterRoom(newRoom, host) {
  room = newRoom;
  isHost = host;
  $('btn-add-guest').hidden = !host;
  $('messages').innerHTML = '';
  selectTab('chat');
  quiz.setup({ room, isHost: host });
  room.onMessage(handleMessage);
  show('screen-room');
}

function leaveRoom() {
  if (room) room.close();
  if (guestPc) { guestPc.close(); guestPc = null; }
  room = null;
  showHome();
}
$('btn-leave').onclick = leaveRoom;

function handleMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      $('messages').innerHTML = '';
      msg.history.forEach(appendMessage);
      setMembers(msg.members);
      quiz.renderGame(msg.game);
      break;
    case 'members': setMembers(msg.members); break;
    case 'chat':
    case 'system': appendMessage(msg); break;
    case 'game': quiz.renderGame(msg.state); break;
    case 'reaction': quiz.showReaction(msg); break;
    case 'closed':
      room = null;
      show('screen-lost');
      break;
  }
}

function setMembers(list) {
  members = list;
  const names = list.map((m) => (m.id === self.id ? 'toi' : m.name) + (m.online === false ? ' (hors ligne)' : ''));
  $('members').textContent = list.length + (list.length > 1 ? ' participants : ' : ' participant : ') + names.join(', ');
}

function appendMessage(msg) {
  const el = document.createElement('div');
  if (msg.t === 'system') {
    el.className = 'msg system';
    el.textContent = msg.text;
  } else {
    el.className = 'msg' + (msg.id === self.id ? ' mine' : '');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = msg.name;
    el.append(who, document.createTextNode(msg.text));
  }
  const box = $('messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || !room) return;
  room.send({ t: 'chat', text });
  input.value = '';
});

document.querySelectorAll('.tabs [data-tab]').forEach((b) => { b.onclick = () => selectTab(b.dataset.tab); });

function selectTab(name) {
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('tab-chat').hidden = name !== 'chat';
  $('tab-quiz').hidden = name !== 'quiz';
}

// ---------- quiz ----------

quiz.setup({ selfId: self.id, onQuestion: () => selectTab('quiz') });

// ---------- startup ----------

window.fwfDebug = { code: null, scanned: submitScan, setTiming: (t) => Object.assign(TIMING, t) };

if ('serviceWorker' in navigator && !DEBUG) navigator.serviceWorker.register('./sw.js');

if (self.name) showHome(); else show('screen-name');
