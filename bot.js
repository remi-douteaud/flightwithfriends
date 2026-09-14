// Fake participants for single-phone testing. A bot lives inside the host and reacts to the
// same messages a real guest would receive: it votes, bans, answers, reacts and uses its bonuses.
import { QUESTION_BY_ID } from './bank.js';
import { THEMES } from './themes.js';
import { TIMING } from './game.js';
import { REACTIONS } from './reactions.js';

const CHAT_REPLIES = [
  'Ha ha, bien vu !', 'On atterrit quand ?', 'Quelqu\'un a des bonbons ?', 'Je vote pour un quiz.',
  'Moi je dors bientôt.', 'Le film est nul.', 'Trop bien cette appli.', 'Pas d\'accord !',
];
const CHAT_IDLE = [
  'Il reste combien de temps de vol ?', 'Le plateau repas était… spécial.', 'Regardez par le hublot !',
  'J\'ai les jambes en compote.', 'Quelqu\'un connaît la réponse à la dernière ?', 'Vous avez pris quoi comme film ?',
  'On fait une pause après celle-là ?', 'La question sur les rois de France, sérieux ?', 'Mon voisin ronfle.',
];
const CHAT_IDLE_EVERY_MS = [45000, 120000]; // a bot says something at random every 45 s to 2 min
const CORRECT_RATE = 0.6;
const rand = (min, max) => min + Math.random() * (max - min);
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Bot {
  constructor(name, send) {
    this.name = name;
    this.send = send;
    this.seen = new Set();   // keys of one-shot actions already done
    this.timers = new Set();
  }

  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  once(key, ms, fn) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.later(ms, fn);
  }

  stop() { this.timers.forEach(clearTimeout); }

  chatter() {
    this.later(rand(...CHAT_IDLE_EVERY_MS), () => {
      this.send({ t: 'chat', text: sample(CHAT_IDLE) });
      this.chatter();
    });
  }

  receive(msg) {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.self;
        this.later(rand(1000, 3000), () => this.send({ t: 'chat', text: 'Salut, c\'est ' + this.name + ' !' }));
        this.chatter();
        this.onGame(msg.game);
        break;
      case 'chat':
        if (msg.id !== this.id && !msg.id.startsWith('bot-') && Math.random() < 0.35) {
          this.later(rand(1500, 4000), () => this.send({ t: 'chat', text: sample(CHAT_REPLIES) }));
        }
        break;
      case 'game':
        this.onGame(msg.state);
        break;
    }
  }

  onGame(s) {
    if (!s) return;
    if (s.phase === 'lobby' && !this.inLobby) this.seen.clear(); // new game: one-shot actions are allowed again
    this.inLobby = s.phase === 'lobby';
    switch (s.phase) {
      case 'lobby':
        this.once('vote', rand(500, 2500), () => this.send({ t: 'vote', length: sample([50, 50, 100]) }));
        break;
      case 'banning':
        this.once('ban', rand(1500, 6000), () => this.send({ t: 'ban', theme: sample(THEMES.filter((t) => !s.disabled.includes(t.id))).id }));
        break;
      case 'freeze':
      case 'question': {
        const q = QUESTION_BY_ID.get(s.question.id);
        const visible = [0, 1, 2, 3].filter((i) => !s.hidden.includes(i));
        const wrong = visible.filter((i) => i !== q.a);
        const choice = Math.random() < CORRECT_RATE || wrong.length === 0 ? q.a : sample(wrong);
        this.once('q' + s.index, rand(TIMING.freeze + 1500, TIMING.freeze + TIMING.question * 0.75), () => this.send({ t: 'answer', index: s.index, choice }));
        break;
      }
      case 'reveal':
        if (Math.random() < 0.5) this.once('r' + s.index, rand(300, 2500), () => this.send({ t: 'react', emoji: sample(REACTIONS) }));
        break;
      case 'bonus':
        if (s.bonus && s.bonus.awaiting && s.bonus.holder === this.id) {
          this.once('b' + s.index, rand(1500, 4000), () => {
            if (s.bonus.type === 'dice') {
              const victims = s.players.filter((p) => p.id !== this.id).sort((a, b) => b.score - a.score);
              const split = {};
              let left = s.bonus.roll;
              victims.forEach((v, i) => { const n = i === victims.length - 1 ? left : Math.ceil(left / 2); if (n > 0) split[v.id] = n; left -= n; });
              this.send({ t: 'bonus-choice', choice: { split } });
            } else if (s.bonus.type === 'unban') {
              this.send({ t: 'bonus-choice', choice: { theme: sample(s.bans) } });
            } else {
              this.send({ t: 'bonus-choice', choice: { theme: sample(THEMES.filter((t) => !s.bans.includes(t.id))).id } });
            }
          });
        }
        break;
    }
  }
}
