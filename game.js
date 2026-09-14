// Quiz game engine. Runs on the host only. Every change emits per-player snapshots through `emit`.
import { BANK, QUESTION_BY_ID } from './bank.js';
import { THEMES, THEME_NAME } from './themes.js';

export const TIMING = { freeze: 3000, question: 20000, reveal: 6000, scoreboard: 9000, bonusChoice: 25000, bonusInfo: 5000 };
export const LENGTHS = [50, 100, 200, 500, 'all'];
const BASE_POINTS = { 1: 100, 2: 200, 3: 300 };
const BONUS_EVERY = 8;
const BONUS_TYPES = ['theme', 'dice', 'half', 'ban', 'unban'];
export const DICE_UNIT = 100; // one pip on the dice = 100 points stolen

const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class GameEngine {
  constructor(emit) {
    this.emit = emit;              // () => void, called after every state change
    this.players = new Map();      // id -> { name, score, online, halfLeft }
    this.timer = null;
    this.resetToLobby();
  }

  // ----- players -----

  addPlayer(id, name) {
    const p = this.players.get(id);
    if (p) { p.name = name; p.online = true; }
    else this.players.set(id, { name, score: 0, online: true, halfLeft: 0 });
    this.emit();
  }

  setOnline(id, online) {
    const p = this.players.get(id);
    if (p) { p.online = online; this.emit(); }
  }

  onlineIds() { return [...this.players].filter(([, p]) => p.online).map(([id]) => id); }

  // ----- lobby -----

  resetToLobby() {
    clearTimeout(this.timer);
    this.phase = 'lobby';
    this.votes = {}; this.banVotes = {};
    this.bans = new Set();
    this.unused = []; this.total = 0; this.index = 0;
    this.current = null; this.answers = new Map();
    this.forced = null; this.bonus = null;
    this.lastScoreboard = 0; this.lastBonus = 0;
    this.prevScores = {};
    this.players.forEach((p) => { p.score = 0; p.halfLeft = 0; });
    this.emit();
  }

  vote(id, length) { if (this.phase === 'lobby' && LENGTHS.includes(length)) { this.votes[id] = length; this.emit(); } }
  banVote(id, theme) { if (this.phase === 'lobby' && THEME_NAME[theme]) { this.banVotes[id] = theme; this.emit(); } }

  start() {
    if (this.phase !== 'lobby') return;
    const counts = {};
    Object.values(this.votes).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const best = Math.max(0, ...Object.values(counts));
    const winners = LENGTHS.filter((l) => counts[l] === best);
    const length = best === 0 ? 50 : sample(winners);
    this.bans = new Set(Object.values(this.banVotes));
    this.unused = shuffle(BANK.map((q) => q.id));
    const available = this.unused.filter((id) => !this.bans.has(QUESTION_BY_ID.get(id).theme)).length;
    this.total = length === 'all' ? available : Math.min(length, available);
    this.index = 0;
    this.players.forEach((p) => { p.score = 0; p.halfLeft = 0; });
    this.prevScores = this.scoresById();
    this.next();
  }

  // ----- flow -----

  next() {
    clearTimeout(this.timer);
    if (this.index >= this.total) return this.finish();
    const quarter = Math.floor(this.index * 4 / this.total);
    if (this.index > 0 && quarter > 0 && quarter < 4 && this.lastScoreboard < quarter) {
      this.lastScoreboard = quarter;
      return this.showScoreboard(quarter);
    }
    if (this.index > 0 && this.index % BONUS_EVERY === 0 && this.lastBonus !== this.index) {
      this.lastBonus = this.index;
      return this.startBonus();
    }
    this.askQuestion();
  }

  drawQuestion() {
    const pick = (pred) => { const i = this.unused.findIndex((id) => pred(QUESTION_BY_ID.get(id))); return i < 0 ? null : this.unused.splice(i, 1)[0]; };
    let id = null;
    if (this.forced) {
      id = pick((q) => q.theme === this.forced.theme);
      if (!id || --this.forced.left === 0) this.forced = null;
    }
    if (!id) id = pick((q) => !this.bans.has(q.theme));
    return id ? QUESTION_BY_ID.get(id) : null;
  }

  askQuestion() {
    const q = this.drawQuestion();
    if (!q) { this.total = this.index; return this.finish(); }
    this.current = q;
    this.index++;
    this.answers = new Map();
    this.phase = 'freeze';
    this.startedAt = Date.now() + TIMING.freeze;
    this.setTimer(TIMING.freeze, () => {
      this.phase = 'question';
      this.setTimer(TIMING.question, () => this.reveal());
      if (this.everyoneAnswered()) this.reveal(); else this.emit();
    });
  }

  answer(id, index, choice) {
    if ((this.phase !== 'freeze' && this.phase !== 'question') || index !== this.index || this.answers.has(id)) return;
    const p = this.players.get(id);
    if (!p || this.hiddenChoices(id).includes(choice)) return;
    const elapsed = Math.max(0, Date.now() - this.startedAt);
    const factor = this.phase === 'freeze' ? 1 : 0.5 + 0.5 * Math.max(0, 1 - elapsed / TIMING.question);
    const correct = choice === this.current.a;
    const gain = correct ? Math.round(BASE_POINTS[this.current.d] * factor / 10) * 10 : 0;
    this.answers.set(id, { choice, gain, correct });
    if (this.phase === 'question' && this.everyoneAnswered()) this.reveal(); else this.emit();
  }

  everyoneAnswered() { return this.onlineIds().every((id) => this.answers.has(id)); }

  reveal() {
    this.phase = 'reveal';
    this.answers.forEach((a, id) => { this.players.get(id).score += a.gain; });
    this.players.forEach((p) => { if (p.halfLeft > 0 && p.online) p.halfLeft--; });
    this.setTimer(TIMING.reveal, () => this.next());
  }

  showScoreboard(quarter) {
    this.phase = 'scoreboard';
    this.scoreboard = { quarter, from: this.prevScores, to: this.scoresById() };
    this.prevScores = this.scoresById();
    this.setTimer(TIMING.scoreboard, () => this.next());
  }

  finish() {
    clearTimeout(this.timer);
    this.phase = 'end';
    this.scoreboard = { quarter: 4, from: this.prevScores, to: this.scoresById() };
    this.emit();
  }

  // ----- bonus for the last player -----

  startBonus() {
    const ids = this.onlineIds();
    if (ids.length < 2) return this.askQuestion();
    const min = Math.min(...ids.map((id) => this.players.get(id).score));
    const holder = sample(ids.filter((id) => this.players.get(id).score === min));
    const types = BONUS_TYPES.filter((t) => (t !== 'unban' || this.bans.size > 0) && (t !== 'ban' || this.bans.size < THEMES.length - 2));
    const type = sample(types);
    this.bonus = { holder, type, awaiting: true, roll: type === 'dice' ? 1 + Math.floor(Math.random() * 6) : null, result: null };
    this.phase = 'bonus';
    if (type === 'half') return this.resolveBonus({});
    this.setTimer(TIMING.bonusChoice, () => this.resolveBonus(null));
  }

  bonusChoice(id, choice) {
    if (this.phase === 'bonus' && this.bonus && this.bonus.awaiting && id === this.bonus.holder) this.resolveBonus(choice);
  }

  // choice: { theme } | { split: { playerId: points } } | null (timeout -> automatic pick)
  resolveBonus(choice) {
    const b = this.bonus;
    const holder = this.players.get(b.holder);
    const themeIds = THEMES.map((t) => t.id);
    switch (b.type) {
      case 'half':
        holder.halfLeft = 3;
        b.result = holder.name + ' n\'aura que 2 réponses possibles pendant 3 questions.';
        break;
      case 'theme': {
        const theme = choice && THEME_NAME[choice.theme] ? choice.theme : sample(themeIds);
        this.forced = { theme, left: 5 };
        b.result = 'Les 5 prochaines questions seront sur : ' + THEME_NAME[theme] + '.';
        break;
      }
      case 'ban': {
        const open = themeIds.filter((t) => !this.bans.has(t));
        const theme = choice && open.includes(choice.theme) ? choice.theme : sample(open);
        this.bans.add(theme);
        b.result = 'Thème banni : ' + THEME_NAME[theme] + '.';
        break;
      }
      case 'unban': {
        const banned = [...this.bans];
        const theme = choice && banned.includes(choice.theme) ? choice.theme : sample(banned);
        this.bans.delete(theme);
        b.result = 'Thème réactivé : ' + THEME_NAME[theme] + '.';
        break;
      }
      case 'dice': {
        let split = choice && choice.split;
        if (!split) {
          const leader = [...this.players].filter(([id]) => id !== b.holder).sort((x, y) => y[1].score - x[1].score)[0];
          split = leader ? { [leader[0]]: b.roll } : {};
        }
        let budget = b.roll; // in dice pips
        const parts = [];
        for (const [id, n] of Object.entries(split)) {
          const victim = this.players.get(id);
          if (!victim || id === b.holder) continue;
          const pips = Math.min(Math.max(0, Math.floor(n)), budget);
          const take = Math.min(pips * DICE_UNIT, victim.score);
          if (take <= 0) continue;
          victim.score -= take; holder.score += take; budget -= pips;
          parts.push(take + ' pts à ' + victim.name);
        }
        b.result = holder.name + ' a fait ' + b.roll + ' et vole ' + (parts.length ? parts.join(', ') : 'rien') + '.';
        break;
      }
    }
    b.awaiting = false;
    this.setTimer(TIMING.bonusInfo, () => { this.bonus = null; this.next(); });
  }

  // ----- save / resume -----

  pause() {
    clearTimeout(this.timer);
    if (this.phase === 'lobby' || this.phase === 'end') return;
    if (this.phase === 'freeze' || this.phase === 'question') { this.index--; this.unused.unshift(this.current.id); }
    this.phase = 'paused';
    this.bonus = null;
    this.emit();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.next();
  }

  serialize() {
    return {
      players: [...this.players].map(([id, p]) => ({ id, name: p.name, score: p.score, halfLeft: p.halfLeft })),
      bans: [...this.bans], unused: this.unused, total: this.total, index: this.index,
      forced: this.forced, lastScoreboard: this.lastScoreboard, lastBonus: this.lastBonus, prevScores: this.prevScores,
      phase: this.phase === 'lobby' ? 'lobby' : (this.phase === 'end' ? 'end' : 'paused'),
    };
  }

  restore(data) {
    clearTimeout(this.timer);
    this.players = new Map(data.players.map((p) => [p.id, { name: p.name, score: p.score, online: false, halfLeft: p.halfLeft || 0 }]));
    this.bans = new Set(data.bans); this.unused = data.unused; this.total = data.total; this.index = data.index;
    this.forced = data.forced; this.lastScoreboard = data.lastScoreboard; this.lastBonus = data.lastBonus; this.prevScores = data.prevScores || {};
    this.phase = data.phase;
    if (this.phase === 'end') this.scoreboard = { quarter: 4, from: this.prevScores, to: this.scoresById() };
    this.emit();
  }

  // ----- snapshots -----

  setTimer(ms, fn) {
    clearTimeout(this.timer);
    this.endsAt = Date.now() + ms;
    this.duration = ms;
    this.timer = setTimeout(fn, ms);
    this.emit();
  }

  scoresById() { return Object.fromEntries([...this.players].map(([id, p]) => [id, p.score])); }

  ranking() {
    return [...this.players].map(([id, p]) => ({ id, name: p.name, score: p.score, online: p.online })).sort((a, b) => b.score - a.score);
  }

  hiddenChoices(id) {
    const p = this.players.get(id);
    if (!p || p.halfLeft <= 0 || !this.current) return [];
    return [0, 1, 2, 3].filter((i) => i !== this.current.a).slice(0, 2);
  }

  snapshotFor(id) {
    const q = this.current;
    const inQuestion = this.phase === 'freeze' || this.phase === 'question';
    const showQ = inQuestion || this.phase === 'reveal';
    return {
      phase: this.phase,
      index: this.index, total: this.total,
      remaining: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : 0, duration: this.duration || 0,
      players: this.ranking(),
      lobby: this.phase === 'lobby' ? { votes: this.votes, banVotes: this.banVotes } : null,
      bans: [...this.bans],
      forced: this.forced,
      question: showQ ? { id: q.id, text: q.q, choices: q.c, d: q.d, theme: THEME_NAME[q.theme], shape: q.shape || null } : null,
      hidden: inQuestion ? this.hiddenChoices(id) : [],
      answered: [...this.answers.keys()],
      correct: this.phase === 'reveal' ? q.a : null,
      answers: this.phase === 'reveal' ? Object.fromEntries(this.answers) : null,
      scoreboard: this.phase === 'scoreboard' || this.phase === 'end' ? this.scoreboard : null,
      bonus: this.bonus ? { ...this.bonus, holderName: this.players.get(this.bonus.holder).name } : null,
      halfLeft: this.players.has(id) ? this.players.get(id).halfLeft : 0,
    };
  }
}
