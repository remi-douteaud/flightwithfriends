// Quiz engine, runs on the host only. Emits a full state snapshot whenever something changes;
// every phone (including the host's) simply renders the latest snapshot.

const QUESTION_MS = 20000;
const REVEAL_MS = 5000;

export class QuizEngine {
  constructor(questions, getMembers, emit) {
    this.questions = questions;
    this.getMembers = getMembers; // () => Map<id, name>
    this.emit = emit;             // (snapshot) => void
    this.phase = 'idle';
    this.timer = null;
  }

  start() {
    this.scores = new Map();
    this.index = -1;
    this.next();
  }

  next() {
    this.index++;
    if (this.index >= this.questions.length) {
      this.phase = 'end';
      this.emit(this.snapshot());
      return;
    }
    this.phase = 'question';
    this.answers = new Map();
    this.endsAt = Date.now() + QUESTION_MS;
    this.timer = setTimeout(() => this.reveal(), QUESTION_MS);
    this.emit(this.snapshot());
  }

  answer(id, index, choice) {
    if (this.phase !== 'question' || index !== this.index || this.answers.has(id)) return;
    this.answers.set(id, choice);
    if (choice === this.questions[this.index].answer) this.scores.set(id, (this.scores.get(id) || 0) + 1);
    const everyoneAnswered = [...this.getMembers().keys()].every((m) => this.answers.has(m));
    if (everyoneAnswered) this.reveal(); else this.emit(this.snapshot());
  }

  reveal() {
    clearTimeout(this.timer);
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_MS;
    this.timer = setTimeout(() => this.next(), REVEAL_MS);
    this.emit(this.snapshot());
  }

  stop() {
    clearTimeout(this.timer);
    this.phase = 'idle';
  }

  snapshot() {
    if (this.phase === 'idle') return null;
    const q = this.questions[this.index];
    const scores = [...this.getMembers()]
      .map(([id, name]) => ({ id, name, score: this.scores.get(id) || 0 }))
      .sort((a, b) => b.score - a.score);
    return {
      phase: this.phase,
      index: this.index,
      total: this.questions.length,
      question: q ? { text: q.text, choices: q.choices } : null,
      correct: this.phase === 'reveal' ? q.answer : null,
      answers: this.phase === 'reveal' ? Object.fromEntries(this.answers) : null,
      answered: this.answers ? [...this.answers.keys()] : [],
      remaining: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : 0,
      duration: this.phase === 'question' ? QUESTION_MS : REVEAL_MS,
      scores,
    };
  }
}
