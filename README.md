Vol entre amis
==============

Offline group chat + a rich synchronised quiz for friends on a plane.
Plain HTML/JS PWA, no build step, no server, French UI.

Transport (unchanged)
---------------------
No internet on board, so one phone (the host, preferably Android — iOS can't
start a hotspot in airplane mode) turns on its Wi-Fi hotspot; the others join
that local network. Phones talk over WebRTC data channels, paired by QR codes
(host shows offer, guest scans, guest shows answer, host scans). No signalling
server. Topology is a star: the host relays chat and runs the quiz. The app
must be opened once with internet before the flight so the service worker
caches it (see the in-app "Comment ça marche ?").

Quiz
----
Lobby (everyone votes, anyone launches):
- Vote the length: 50 / 100 / 200 / 500 / toutes. Ties broken at random, no
  vote defaults to 50.
- Each player bans one theme; every banned theme is removed for the game.

Per question:
- The theme and difficulty (Facile / Moyen / Difficile) are shown up front.
- A 3 s "verrouillage anticipé" freeze lets you pre-lock an answer before the
  timer starts; locking during the freeze earns the maximum time bonus.
- Scoring: base 100 / 200 / 300 by difficulty, multiplied by a time factor —
  1.0 during the freeze, then decaying from 1.0 to 0.5 across the 20 s timer,
  rounded to 10. Wrong or no answer = 0.
- Reveal shows the right answer, who picked what and their gain, then a row of
  ~8 emoji reactions (💩 🤣 😭 🔥 🤯 😴 🤔 👏) that fly onto everyone's screen.

Animated scoreboard at each quarter (25/50/75/100 %): bars grow and rows slide
into their new ranking, points count up.

Bonus for the last-placed player, announced roughly every 8 questions between
questions. One of: choose the theme (even a banned one) for the next 5
questions; roll a d6 and steal 100 points per pip, split freely between
players; get only 2 answer choices for 3 questions; ban a theme; unban a
theme.

Themes (25) and questions
-------------------------
questions/<theme>.js, ~40 questions each (drapeaux and formes have more),
difficulty 1–3. Themes: League of Legends, jeux vidéo, Warcraft, animaux,
légumes, fleurs, célébrités, Formule 1, histoire, rois de France, géographie,
drapeaux (flag emojis), formes de pays (SVG outlines in shapes.js), littérature,
Harry Potter, musique 70s–90s / 90s–2010 / 2010+, art, culture internet
française, cuisine, cinéma, Seigneur des Anneaux, dinosaures, le monde en 1444.
bank.js flattens them all with a stable id (theme:index) so a game survives
save/restore. themes.js is the registry (edit to add/rename a theme).

To regenerate flags, shapes and the country outlines after editing the country
list: `node tools/build-geo.mjs` (dev-only; needs `npm i world-atlas
topojson-client i18n-iso-countries`).

Save / resume / reconnect
-------------------------
The host autosaves the running game to its own localStorage after every change.
If the host closes the app, "Reprendre la partie en cours" on the home screen
restores it (paused); players rescan the host's code and get their scores back.
A player who drops is kept in the standings as "(hors ligne)"; rejoining with
the same device restores their place and chat history. Disconnected players
don't block the question timer.

Files
-----
index.html, style.css
app.js         UI wiring, pairing, screen flow
peer.js        RTCPeerConnection / data channel helpers
sdp.js         packs a session description into ~260 bytes for the QR code
qr.js          QR rendering (qrcode-generator) + camera scanning (jsQR)
room.js        HostRoom (relay + owns the game) and GuestRoom
game.js        the quiz engine: lobby, scoring, freeze, bonuses, quarters,
               save/restore, per-player snapshots
quiz-ui.js     renders the quiz tab from those snapshots
bot.js         simulated players for the test room (debug mode)
themes.js, bank.js, questions/*.js, shapes.js, reactions.js
tools/build-geo.mjs   regenerates drapeaux.js, formes.js and shapes.js
sw.js          offline cache — bump VERSION after changing any file
manifest.json, icons/, test/e2e.mjs

Protocol (JSON over the data channel)
-------------------------------------
guest -> host : hello {id,name} | chat {text} | react {emoji} | vote {length}
                | ban {theme} | start | answer {index,choice}
                | bonus-choice {choice} | replay | resume
host  -> guest: welcome {self,members,history,game} | members | chat | system
                | reaction | game {state}
The game snapshot never leaks the correct answer during a question (the host
computes scores; guests only learn the answer at reveal).

Settings / debug mode
---------------------
Gear icon top right -> "Mode débug" (localStorage, or ?debug in the URL). Adds
a "Salon de test (3 bots)" button (bots vote, ban, answer ~60% right, react and
use their bonuses), shows the pairing code as text with copy/paste so two tabs
pair without a camera, and skips the service worker so reloads are fresh.
window.fwfDebug exposes .code, .scanned(text), .setTiming({...}) and, on the
host, .hostAnswer (used by the tests).

Hosting
-------
Serve over HTTPS (camera + service worker + WebRTC require a secure origin).
GitHub Pages is easiest: push this folder, enable Pages on main / root, share
the URL on WhatsApp with the in-app "Inviter des amis" button.

Tested (headless Chromium, test/e2e.mjs and dev scripts)
-------------------------------------------------------
Full bots game end to end (lobby votes/bans, freeze + speed scoring, all bonus
types, quarter scoreboards, reactions, flags and country shapes, final board);
host + 2 real-WebRTC guests (lobby, scoring propagation, chat); a dropped
player reconnecting and keeping their score; host leaving, resuming the saved
game, and a player joining the resumed game. Not yet tested on real iOS/Android
phones over a hotspot — Safari's minimal-SDP path (sdp.js) is the main thing to
verify on a real two-phone run.

Note on reconnection in headless tests only: two headless browser contexts that
already connected once cannot always re-establish WebRTC because they share a
single fake IP (192.0.2.2). Real phones have distinct IPs and reconnect fine;
a fresh context joins a resumed game without issue in the tests.
