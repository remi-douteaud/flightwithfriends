// Renders the quiz tab from game state snapshots sent by the host.
import { THEMES } from './themes.js';
import { LENGTHS, DICE_UNIT } from './game.js';
import { REACTIONS } from './reactions.js';
import { SHAPES } from './shapes.js';

const $ = (id) => document.getElementById(id);
const DIFF = { 1: ['Facile', 'easy'], 2: ['Moyen', 'medium'], 3: ['Difficile', 'hard'] };
const QUARTER = { 1: 'Classement au quart', 2: 'Classement à la mi-partie', 3: 'Classement aux trois quarts', 4: 'Classement final' };

let ctx = { room: null, selfId: null, isHost: false, onQuestion: () => {} };
let state = null;
let myChoice = null;
let currentIndex = -1;
let boardKey = null;
let diceSplit = {};

export function setup(options) { ctx = { ...ctx, ...options }; }

export function renderGame(s) {
  state = s;
  const phase = s ? s.phase : 'lobby';
  $('q-lobby').hidden = phase !== 'lobby';
  $('q-paused').hidden = phase !== 'paused';
  $('q-play').hidden = !['freeze', 'question', 'reveal'].includes(phase);
  $('q-board').hidden = phase !== 'scoreboard' && phase !== 'end';
  $('q-bonus').hidden = phase !== 'bonus';
  if (!s) return;
  if (phase === 'lobby') boardKey = null;
  if (s.index !== currentIndex && phase !== 'lobby') { currentIndex = s.index; myChoice = null; ctx.onQuestion(); }
  switch (phase) {
    case 'lobby': renderLobby(s); break;
    case 'paused': renderPaused(s); break;
    case 'freeze': case 'question': case 'reveal': renderQuestion(s); break;
    case 'scoreboard': case 'end': renderBoard(s); break;
    case 'bonus': renderBonus(s); break;
  }
}

const send = (msg) => ctx.room && ctx.room.send(msg);
const label = (p) => (p.id === ctx.selfId ? 'toi' : p.name);

function chips(container, items, { selected, onPick, counts }) {
  container.innerHTML = '';
  items.forEach(({ id, text }) => {
    const b = document.createElement('button');
    b.className = 'chip' + (id === selected ? ' selected' : '');
    b.textContent = text;
    if (counts && counts[id]) {
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = counts[id];
      b.appendChild(n);
    }
    b.onclick = () => onPick(id);
    container.appendChild(b);
  });
}

// ---------- lobby ----------

function renderLobby(s) {
  const votes = s.lobby.votes, bans = s.lobby.banVotes;
  const counts = {};
  Object.values(votes).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  chips($('lobby-lengths'), LENGTHS.map((l) => ({ id: String(l), text: l === 'all' ? 'Toutes' : String(l) })),
    { selected: String(votes[ctx.selfId]), counts, onPick: (id) => send({ t: 'vote', length: id === 'all' ? 'all' : Number(id) }) });
  const banCounts = {};
  Object.values(bans).forEach((v) => { banCounts[v] = (banCounts[v] || 0) + 1; });
  chips($('lobby-themes'), THEMES.map((t) => ({ id: t.id, text: t.name })),
    { selected: bans[ctx.selfId], counts: banCounts, onPick: (id) => send({ t: 'ban', theme: id }) });
  const voted = s.players.filter((p) => votes[p.id]).length;
  $('lobby-status').textContent = voted + ' / ' + s.players.length + ' ont voté. Sans vote : 50 questions.';
}
$('btn-game-start').onclick = () => send({ t: 'start' });

function renderPaused(s) {
  $('paused-text').textContent = ctx.isHost
    ? 'Question ' + s.index + ' / ' + s.total + '. Invite les joueurs manquants puis reprends.'
    : 'L\'hôte va reprendre la partie (question ' + s.index + ' / ' + s.total + ').';
  $('btn-game-resume').hidden = !ctx.isHost;
}
$('btn-game-resume').onclick = () => send({ t: 'resume' });

// ---------- question / reveal ----------

function renderQuestion(s) {
  const q = s.question;
  const inQuestion = s.phase === 'freeze' || s.phase === 'question';
  $('quiz-index').textContent = 'Question ' + s.index + ' / ' + s.total;
  $('quiz-answered').textContent = s.answered.length + ' / ' + s.players.filter((p) => p.online).length + ' ont répondu';
  $('quiz-theme').textContent = q.theme;
  const [dText, dClass] = DIFF[q.d];
  $('quiz-diff').textContent = dText;
  $('quiz-diff').className = 'badge diff ' + dClass;
  $('quiz-freeze').hidden = s.phase !== 'freeze';
  $('quiz-shape').hidden = !q.shape;
  if (q.shape) $('quiz-shape').querySelector('path').setAttribute('d', SHAPES[q.shape] || '');
  $('quiz-question').textContent = q.text;
  animateTimer(s.remaining, s.duration, s.phase);

  const box = $('quiz-choices');
  box.innerHTML = '';
  q.choices.forEach((choice, i) => {
    if (inQuestion && s.hidden.includes(i)) return;
    const btn = document.createElement('button');
    btn.textContent = choice;
    if (inQuestion) {
      btn.disabled = myChoice !== null;
      if (i === myChoice) btn.classList.add('picked');
      btn.onclick = () => { myChoice = i; send({ t: 'answer', index: s.index, choice: i }); renderQuestion(s); };
    } else {
      btn.disabled = true;
      if (i === s.correct) btn.classList.add('correct');
      else if (i === myChoice) btn.classList.add('wrong');
      const voters = s.players.filter((p) => s.answers[p.id] && s.answers[p.id].choice === i)
        .map((p) => label(p) + (s.answers[p.id].gain ? ' +' + s.answers[p.id].gain : ''));
      if (voters.length) {
        const span = document.createElement('span');
        span.className = 'voters';
        span.textContent = voters.join(' · ');
        btn.appendChild(span);
      }
    }
    box.appendChild(btn);
  });

  if (inQuestion) {
    $('quiz-feedback').textContent = myChoice === null
      ? (s.phase === 'freeze' ? 'Réponds maintenant pour le bonus de temps maximal !' : (s.hidden.length ? 'Bonus : 2 réponses seulement.' : ''))
      : 'Réponse enregistrée, on attend les autres…';
  } else {
    const mine = s.answers[ctx.selfId];
    $('quiz-feedback').textContent = !mine ? 'Pas de réponse.' : (mine.correct ? 'Bonne réponse ! +' + mine.gain + ' points' : 'Raté !');
  }
  $('reactions-bar').hidden = inQuestion;
  if (!inQuestion && !$('reactions-bar').childElementCount) {
    REACTIONS.forEach((e) => {
      const b = document.createElement('button');
      b.textContent = e;
      b.onclick = () => send({ t: 'react', emoji: e });
      $('reactions-bar').appendChild(b);
    });
  }
  if (inQuestion) $('reactions-feed').innerHTML = '';
}

export function showReaction(msg) {
  const el = document.createElement('span');
  el.className = 'reaction';
  el.textContent = msg.emoji + ' ' + (msg.id === ctx.selfId ? 'toi' : msg.name);
  $('reactions-feed').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function animateTimer(remaining, duration, phase) {
  const bar = $('timer-bar');
  bar.className = phase;
  bar.style.transition = 'none';
  bar.style.width = (duration ? 100 * remaining / duration : 0) + '%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = 'width ' + remaining + 'ms linear';
    bar.style.width = '0%';
  }));
}

// ---------- scoreboard (animated) ----------

function renderBoard(s) {
  const b = s.scoreboard;
  $('board-title').textContent = s.phase === 'end' ? 'Résultats' : QUARTER[b.quarter];
  $('btn-quiz-again').hidden = s.phase !== 'end';
  $('board-hint').textContent = s.phase === 'end' ? 'Partie terminée.' : 'Question ' + s.index + ' / ' + s.total;
  const key = s.phase + ':' + b.quarter;
  if (key === boardKey) return; // already animating this board
  boardKey = key;

  const rows = $('board-rows');
  const players = s.players.map((p) => ({ ...p, from: b.from[p.id] || 0, to: b.to[p.id] }));
  const max = Math.max(1, ...players.map((p) => Math.max(p.from, p.to)));
  const before = [...players].sort((a, c) => c.from - a.from);
  const after = [...players].sort((a, c) => c.to - a.to);
  rows.innerHTML = '';
  before.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (p.id === ctx.selfId ? ' me' : '');
    row.dataset.id = p.id;
    row.innerHTML = '<span class="rank"></span><span class="name"></span><span class="bar"><span class="fill"></span></span><span class="pts"></span>';
    row.querySelector('.rank').textContent = (i + 1) + '.';
    row.querySelector('.name').textContent = label(p) + (p.online ? '' : ' (hors ligne)');
    row.querySelector('.fill').style.width = (100 * p.from / max) + '%';
    row.querySelector('.pts').textContent = p.from;
    rows.appendChild(row);
  });
  const first = new Map([...rows.children].map((r) => [r.dataset.id, r.getBoundingClientRect().top]));
  setTimeout(() => {
    after.forEach((p, i) => {
      const row = rows.querySelector('[data-id="' + p.id + '"]');
      rows.appendChild(row);
      row.querySelector('.rank').textContent = (i + 1) + '.';
      row.className += i === 0 ? ' leader' : '';
    });
    [...rows.children].forEach((row) => {
      const dy = first.get(row.dataset.id) - row.getBoundingClientRect().top;
      row.style.transition = 'none';
      row.style.transform = 'translateY(' + dy + 'px)';
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      [...rows.children].forEach((row) => {
        const p = players.find((x) => x.id === row.dataset.id);
        row.style.transition = 'transform 1.2s ease';
        row.style.transform = 'translateY(0)';
        row.querySelector('.fill').style.transition = 'width 1.5s ease';
        row.querySelector('.fill').style.width = (100 * p.to / max) + '%';
        countUp(row.querySelector('.pts'), p.from, p.to, 1500);
      });
    }));
  }, 900);
}

function countUp(el, from, to, ms) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(from + (to - from) * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

$('btn-quiz-again').onclick = () => { boardKey = null; send({ t: 'replay' }); };

// ---------- bonus ----------

const BONUS_TEXT = {
  theme: 'choisit le thème des 5 prochaines questions (même un thème banni).',
  dice: 'lance un dé et vole ' + DICE_UNIT + ' points par point du dé aux joueurs de son choix.',
  half: 'n\'aura que 2 réponses possibles pendant 3 questions.',
  ban: 'bannit un thème.',
  unban: 'réactive un thème banni.',
};

function renderBonus(s) {
  const b = s.bonus;
  const mine = b.holder === ctx.selfId;
  $('bonus-title').textContent = 'Bonus du dernier : ' + (mine ? 'toi !' : b.holderName);
  $('bonus-text').textContent = b.result || ((mine ? 'Tu ' : b.holderName + ' ') + BONUS_TEXT[b.type] + (mine ? '' : ' En attente de son choix…'));
  const pickTheme = mine && b.awaiting && ['theme', 'ban', 'unban'].includes(b.type);
  $('bonus-themes').hidden = !pickTheme;
  if (pickTheme) {
    const list = b.type === 'unban' ? THEMES.filter((t) => s.bans.includes(t.id)) : (b.type === 'ban' ? THEMES.filter((t) => !s.bans.includes(t.id)) : THEMES);
    chips($('bonus-themes'), list.map((t) => ({ id: t.id, text: t.name + (s.bans.includes(t.id) && b.type === 'theme' ? ' (banni)' : '') })),
      { onPick: (id) => send({ t: 'bonus-choice', choice: { theme: id } }) });
  }
  const dice = mine && b.awaiting && b.type === 'dice';
  $('bonus-dice').hidden = !dice;
  if (dice) {
    $('dice-roll').textContent = '🎲 ' + b.roll;
    if (!$('dice-split').childElementCount) diceSplit = {};
    renderDiceSplit(s);
  }
}

function renderDiceSplit(s) {
  const box = $('dice-split');
  box.innerHTML = '';
  const used = Object.values(diceSplit).reduce((a, n) => a + n, 0);
  s.players.filter((p) => p.id !== ctx.selfId).forEach((p) => {
    const row = document.createElement('div');
    row.className = 'split-row';
    const n = diceSplit[p.id] || 0;
    row.innerHTML = '<span class="name"></span><button class="chip">−</button><span class="n"></span><button class="chip">+</button>';
    row.querySelector('.name').textContent = p.name + ' (' + p.score + ')';
    row.querySelector('.n').textContent = n ? n * DICE_UNIT + ' pts' : '—';
    const [minus, plus] = row.querySelectorAll('button');
    minus.disabled = n === 0;
    plus.disabled = used >= s.bonus.roll;
    minus.onclick = () => { diceSplit[p.id] = n - 1; renderDiceSplit(s); };
    plus.onclick = () => { diceSplit[p.id] = n + 1; renderDiceSplit(s); };
    box.appendChild(row);
  });
  $('btn-dice-ok').disabled = used === 0;
  $('btn-dice-ok').textContent = used ? 'Voler ' + used * DICE_UNIT + ' points' : 'Répartis les ' + s.bonus.roll + ' points du dé';
}
$('btn-dice-ok').onclick = () => { send({ t: 'bonus-choice', choice: { split: diceSplit } }); diceSplit = {}; $('dice-split').innerHTML = ''; };
