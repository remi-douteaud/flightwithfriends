// Star topology: the host relays everything. Both HostRoom and GuestRoom expose the same
// tiny interface to the UI: send(msg), onMessage(handler), close().
import { GameEngine } from './game.js';
import { Bot } from './bot.js';

const HISTORY_LIMIT = 200;
const SAVE_KEY = 'fwf.game';
const REACTION_COOLDOWN_MS = 800;

export class HostRoom {
  constructor(self, savedGame) {
    this.self = self;
    this.links = [];          // { channel: RTCDataChannel|null, member: {id, name}|null, bot: Bot|null }
    this.history = [];
    this.handler = () => {};
    this.lastReaction = new Map();
    this.local = { channel: null, member: self, bot: null };
    this.links.push(this.local);
    this.game = new GameEngine(() => this.onGameChange());
    if (savedGame) this.game.restore(savedGame);
    this.game.addPlayer(self.id, self.name);
  }

  static savedGame() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }

  onMessage(handler) {
    this.handler = handler;
    this.deliver(this.local, this.welcome(this.self.id));
  }

  send(msg) { this.handle(this.local, msg); }

  attach(channel, pc) {
    const link = { channel, pc: pc || null, member: null, bot: null };
    this.links.push(link);
    channel.onmessage = (e) => this.handle(link, JSON.parse(e.data));
    channel.onclose = () => this.detach(link);
  }

  addBot(name) {
    const link = { channel: null, member: null, bot: null };
    link.bot = new Bot(name, (msg) => this.handle(link, msg));
    this.links.push(link);
    this.handle(link, { t: 'hello', id: 'bot-' + Math.random().toString(36).slice(2, 8), name });
  }

  close() {
    this.game.pause();
    this.links.forEach((l) => { if (l.channel) l.channel.close(); if (l.pc) l.pc.close(); if (l.bot) l.bot.stop(); });
  }

  memberList() {
    return this.game.ranking().map((p) => ({ id: p.id, name: p.name, online: p.online }));
  }

  welcome(id) {
    return { t: 'welcome', self: id, members: this.memberList(), history: this.history, game: this.game.snapshotFor(id) };
  }

  handle(link, msg) {
    const id = link.member && link.member.id;
    switch (msg.t) {
      case 'hello': {
        if (link.member && link.member.id === msg.id) { this.deliver(link, this.welcome(msg.id)); break; } // duplicate hello (retry): just re-ack
        // Same id already connected elsewhere (e.g. stale link): drop the old link silently.
        this.links.filter((l) => l !== link && l.member && l.member.id === msg.id).forEach((l) => { l.member = null; if (l.channel) l.channel.close(); });
        const known = this.game.players.has(msg.id);
        link.member = { id: msg.id, name: msg.name };
        this.game.addPlayer(msg.id, msg.name);
        this.deliver(link, this.welcome(msg.id));
        this.broadcast({ t: 'members', members: this.memberList() });
        this.broadcast({ t: 'system', text: msg.name + (known ? ' est de retour' : ' a rejoint le salon') });
        break;
      }
      case 'chat':
        if (id && msg.text) this.broadcast({ t: 'chat', id, name: link.member.name, text: msg.text.slice(0, 500), ts: Date.now() });
        break;
      case 'react': {
        const now = Date.now();
        const canReact = this.game.phase === 'reveal' || ((this.game.phase === 'question' || this.game.phase === 'freeze') && this.game.hasAnswered(id));
        if (id && canReact && now - (this.lastReaction.get(id) || 0) > REACTION_COOLDOWN_MS) {
          this.lastReaction.set(id, now);
          this.broadcast({ t: 'reaction', id, name: link.member.name, emoji: String(msg.emoji).slice(0, 4) });
        }
        break;
      }
      case 'vote': if (id) this.game.vote(id, msg.length); break;
      case 'ban': if (id) this.game.banVote(id, msg.theme); break;
      case 'start': if (id) this.game.start(); break;
      case 'theme-toggle': if (link === this.local) this.game.toggleTheme(msg.theme, !!msg.on); break;
      case 'answer': if (id) this.game.answer(id, msg.index, msg.choice); break;
      case 'bonus-choice': if (id) this.game.bonusChoice(id, msg.choice); break;
      case 'replay': if (id) this.game.resetToLobby(); break;
      case 'resume': if (link === this.local) this.game.resume(); break;
    }
  }

  detach(link) {
    this.links = this.links.filter((l) => l !== link);
    if (link.pc) { try { link.pc.close(); } catch (e) { /* already closed */ } }
    if (!link.member) return;
    this.game.setOnline(link.member.id, false);
    this.broadcast({ t: 'members', members: this.memberList() });
    this.broadcast({ t: 'system', text: link.member.name + ' a perdu la connexion' });
  }

  onGameChange() {
    if (!this.game) return;
    if (window.fwfDebug) window.fwfDebug.hostAnswer = this.game.current ? this.game.current.a : null; // test hook (host only)
    this.links.forEach((l) => { if (l.member) this.deliver(l, { t: 'game', state: this.game.snapshotFor(l.member.id) }); });
    const phase = this.game.phase;
    try {
      if (phase === 'lobby' || phase === 'end') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.serialize()));
    } catch (e) { /* storage unavailable: the game simply is not resumable */ }
  }

  broadcast(msg) {
    if (msg.t === 'chat' || msg.t === 'system') {
      this.history.push(msg);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    }
    this.links.forEach((l) => this.deliver(l, msg));
  }

  deliver(link, msg) {
    if (link === this.local) this.handler(msg);
    else if (link.bot) link.bot.receive(msg);
    else if (link.channel.readyState === 'open') link.channel.send(JSON.stringify(msg));
  }
}

export class GuestRoom {
  constructor(channel, self) {
    this.channel = channel;
    this.self = self;
    this.handler = () => {};
    this.acked = false;
    channel.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') this.acked = true; this.handler(m); };
    channel.onclose = () => this.handler({ t: 'closed' });
  }

  sayHello(tries) {
    if (this.acked || this.channel.readyState !== 'open') return;
    this.send({ t: 'hello', id: this.self.id, name: this.self.name });
    if (tries < 8) setTimeout(() => this.sayHello(tries + 1), 400);
  }

  // Handler is set here (after enterRoom), THEN hello goes out — so the welcome is never
  // delivered to a noop handler. Resent until acknowledged: the first message after open can drop.
  onMessage(handler) { this.handler = handler; this.sayHello(0); }

  send(msg) {
    if (this.channel.readyState === 'open') this.channel.send(JSON.stringify(msg));
  }

  close() { this.channel.close(); }
}
