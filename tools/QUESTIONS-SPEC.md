# Question file spec (for generation)

One ES module per theme in `questions/<id>.js`:

```js
export default [
  { d: 1, q: 'Quelle est la capitale de l\'Australie ?', c: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], a: 1 },
  ...
];
```

- `d`: difficulty 1 = facile, 2 = moyen, 3 = difficile. Aim for ~14 / 14 / 12 per 40 questions.
- `q`: the question, in French, one sentence, ends with « ? ». Use French typography: apostrophes escaped with \' inside single-quoted strings, « » for titles is optional, accents required.
- `c`: exactly 4 distinct answer strings, short (1–5 words), same nature (all names, all years, all numbers). No "Toutes ces réponses" / "Aucune".
- `a`: index 0–3 of the correct answer. Spread the correct index evenly across positions.
- Facts only, no opinions, no "le plus populaire". No trick questions. Avoid facts that change over time (current record holder, current champion, latest release) unless anchored to a year ("en 2022").
- Do not quote song lyrics or poem/book passages. Music questions are about artists, years, albums, bands, instruments, events.
- Every answer must be one you are certain of. When unsure, replace the question rather than guess. Prefer classic, well-established facts for difficulty 1–2; difficulty 3 can be niche but must remain verifiable.
- 40 questions per theme, no duplicates, no two questions with the same answer if avoidable.
- The file must be valid JavaScript (run `node --check`), UTF-8, LF line endings, one question per line.
