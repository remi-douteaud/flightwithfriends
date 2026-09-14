// Star topology: the host relays everything. Both HostRoom and GuestRoom expose the same
// tiny interface to the UI: send(msg), onMessage(handler), close().
import { QuizEngine } from './quiz.js';
import { QUESTIONS } from './questions.js';

const HISTORY_LIMIT = 200;

export class HostRoom {
  constructor(self) {
    this.self = self;
    this.links = [];          // { channel: RTCDataChannel|null, member: {id, name}|null }
    this.history = [];
    this.handler = () => {};
    this.local = { channel: null, member: self };
    this.links.push(this.local);
    this.quiz = new QuizEngine(QUESTIONS, () => this.members(), (state) => this.broadcast({ t: 'quiz', state }));
  }

  onMessage(handler) {
    this.handler = handler;
    this.deliver(this.local, this.welcome());
  }

  send(msg) { this.handle(this.local, msg); }

  attach(channel) {
    const link = { channel, member: null };
    this.links.push(link);
    channel.onmessage = (e) => this.handle(link, JSON.parse(e.data));
    channel.onclose = () => this.detach(link);
  }

  close() {
    this.quiz.stop();
    this.links.forEach((l) => l.channel && l.channel.close());
  }

  members() {
    return new Map(this.links.filter((l) => l.member).map((l) => [l.member.id, l.member.name]));
  }

  memberList() { return [...this.members()].map(([id, name]) => ({ id, name })); }

  welcome() {
    return { t: 'welcome', self: this.self.id, members: this.memberList(), history: this.history, quiz: this.quiz.snapshot() };
  }

  handle(link, msg) {
    switch (msg.t) {
      case 'hello':
        link.member = { id: msg.id, name: msg.name };
        this.deliver(link, this.welcome());
        this.broadcast({ t: 'members', members: this.memberList() });
        this.broadcast({ t: 'system', text: msg.name + ' a rejoint le salon' });
        break;
      case 'chat':
        if (link.member && msg.text) {
          this.broadcast({ t: 'chat', id: link.member.id, name: link.member.name, text: msg.text.slice(0, 500), ts: Date.now() });
        }
        break;
      case 'quiz-start':
        if (this.quiz.phase === 'idle' || this.quiz.phase === 'end') this.quiz.start();
        break;
      case 'answer':
        if (link.member) this.quiz.answer(link.member.id, msg.index, msg.choice);
        break;
    }
  }

  detach(link) {
    this.links = this.links.filter((l) => l !== link);
    if (!link.member) return;
    this.broadcast({ t: 'members', members: this.memberList() });
    this.broadcast({ t: 'system', text: link.member.name + ' a quitté le salon' });
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
    else if (link.channel.readyState === 'open') link.channel.send(JSON.stringify(msg));
  }
}

export class GuestRoom {
  constructor(channel, self) {
    this.channel = channel;
    this.handler = () => {};
    channel.onmessage = (e) => this.handler(JSON.parse(e.data));
    channel.onclose = () => this.handler({ t: 'closed' });
    this.send({ t: 'hello', id: self.id, name: self.name });
  }

  onMessage(handler) { this.handler = handler; }

  send(msg) {
    if (this.channel.readyState === 'open') this.channel.send(JSON.stringify(msg));
  }

  close() { this.channel.close(); }
}
