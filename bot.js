// Fake participants for single-phone testing. A bot lives inside the host and reacts to the
// same messages a real guest would receive; it answers quiz questions and chats a little.

import { QUESTIONS } from './questions.js';

const CHAT_REPLIES = [
  'Ha ha, bien vu !', 'On atterrit quand ?', 'Quelqu\'un a des bonbons ?', 'Je vote pour un quiz.',
  'Moi je dors bientôt.', 'Le film est nul.', 'Trop bien cette appli.', 'Pas d\'accord !',
];
const CORRECT_RATE = 0.6;
const rand = (min, max) => min + Math.random() * (max - min);

export class Bot {
  constructor(name, send) {
    this.name = name;
    this.send = send;
    this.answeredIndex = -1;
    this.timers = new Set();
  }

  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  stop() { this.timers.forEach(clearTimeout); }

  receive(msg) {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.self;
        this.later(rand(1000, 3000), () => this.send({ t: 'chat', text: 'Salut, c\'est ' + this.name + ' !' }));
        break;
      case 'chat':
        if (msg.id !== this.id && !msg.id.startsWith('bot-') && Math.random() < 0.35) {
          this.later(rand(1500, 4000), () => this.send({ t: 'chat', text: CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)] }));
        }
        break;
      case 'quiz':
        this.onQuiz(msg.state);
        break;
    }
  }

  onQuiz(state) {
    if (!state || state.phase !== 'question' || state.index === this.answeredIndex) return;
    this.answeredIndex = state.index;
    const n = state.question.choices.length;
    const correct = QUESTIONS[state.index].answer;
    const choice = Math.random() < CORRECT_RATE ? correct : (correct + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.later(rand(2000, Math.min(12000, state.remaining - 500)), () => this.send({ t: 'answer', index: state.index, choice }));
  }
}
