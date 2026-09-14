import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8099/index.html?debug';
const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function openAs(name) {
  const ctx = await browser.newContext({ permissions: ['camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { console.log(`[${name}] console`, m.text()); });
  await page.goto(URL);
  await page.fill('#name-input', name);
  await page.click('#name-form button');
  return page;
}

const host = await openAs('Rémi');
const guests = [await openAs('Alice'), await openAs('Bob')];

await host.click('#btn-host');
for (const [i, guest] of guests.entries()) {
  if (i > 0) await host.click('#btn-add-guest');
  await host.waitForFunction(() => window.fwfDebug.code && window.fwfDebug.code.startsWith('fwf1:{"r":"o"'));
  const offer = await host.evaluate(() => window.fwfDebug.code);
  console.log('offer length', offer.length, offer);
  await guest.click('#btn-join');
  await wait(500);
  await guest.evaluate((c) => window.fwfDebug.scanned(c), offer);
  await guest.waitForFunction(() => window.fwfDebug.code && window.fwfDebug.code.startsWith('fwf1:{"r":"a"'));
  const answer = await guest.evaluate(() => window.fwfDebug.code);
  console.log('answer length', answer.length);
  await host.click('#pair-next');
  await wait(500);
  await host.evaluate((c) => window.fwfDebug.scanned(c), answer);
  try { await guest.waitForSelector('#screen-room:not([hidden])', { timeout: 15000 }); } catch (e) {
    for (const [n, p] of [['host', host], ['guest', guest]]) console.log(n, 'status:', await p.textContent('#pair-status'), 'toast:', await p.textContent('#toast'), 'hint:', await p.textContent('#pair-hint'));
    for (const [n, p] of [['host', host], ['guest', guest]]) console.log(n, await p.evaluate(() => { const pc = window.fwfDebug.pc; return [pc.iceConnectionState, pc.connectionState, pc.signalingState, pc.iceGatheringState, pc.sctp && pc.sctp.state]; }));
    for (const [n, p] of [['host', host], ['guest', guest]]) console.log(n, await p.evaluate(async () => { const st = await window.fwfDebug.pc.getStats(); return [...st.values()].filter((x) => x.type === 'data-channel' || x.type === 'transport').map((x) => JSON.stringify(x)); }));
    console.log('guest probe', await guest.evaluate(() => Promise.race([window.fwfDebug.channelPromise.then((c) => 'resolved ' + c.readyState), new Promise((r) => setTimeout(() => r('pending'), 1000))])));
    console.log('rects', await guest.evaluate(() => ['screen-room','screen-pair','tab-chat','messages'].map((id) => { const el = document.getElementById(id); const r = el.getBoundingClientRect(); return id + ' hidden=' + el.hidden + ' ' + r.width + 'x' + r.height; })));
    throw e;
  }
  await host.waitForSelector('#screen-room:not([hidden])', { timeout: 15000 });
  await host.evaluate(() => { window.fwfDebug.code = null; });
  console.log('guest', i, 'joined');
}
await wait(300);
console.log('host members:', await host.textContent('#members'));
console.log('bob members:', await guests[1].textContent('#members'));

await guests[0].fill('#chat-input', 'Coucou tout le monde');
await guests[0].press('#chat-input', 'Enter');
await host.fill('#chat-input', 'Salut Alice');
await host.press('#chat-input', 'Enter');
await wait(500);
console.log('bob sees:', await guests[1].$$eval('#messages .msg', (els) => els.map((e) => e.textContent)));

// quiz
await guests[1].click('[data-tab=quiz]');
await guests[1].click('#btn-quiz-start');
await wait(500);
for (let q = 0; q < 10; q++) {
  for (const p of [host, ...guests]) {
    await p.waitForFunction((q) => document.querySelector('#quiz-index').textContent.startsWith('Question ' + (q + 1) + ' '), q, { timeout: 30000 });
  }
  // host always picks the first choice, Alice the correct one (cheat via module), Bob the second
  await host.click('#quiz-choices button:nth-child(1)');
  await guests[1].click('#quiz-choices button:nth-child(2)');
  await guests[0].evaluate(async (q) => {
    const { QUESTIONS } = await import('./questions.js');
    document.querySelectorAll('#quiz-choices button')[QUESTIONS[q].answer].click();
  }, q);
  await wait(300);
  console.log('q', q + 1, 'feedback alice:', await guests[0].textContent('#quiz-feedback'), '| host:', await host.textContent('#quiz-feedback'));
  await wait(5200);
}
await host.waitForSelector('#quiz-end:not([hidden])');
console.log('scores (host view):', await host.$$eval('#quiz-scores li', (els) => els.map((e) => e.textContent)));
console.log('scores (bob view):', await guests[1].$$eval('#quiz-scores li', (els) => els.map((e) => e.textContent)));

// disconnect: host leaves
await host.click('#btn-leave');
await guests[0].waitForSelector('#screen-lost:not([hidden])', { timeout: 5000 });
console.log('alice sees lost screen: ok');
await browser.close();
