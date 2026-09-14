Vol entre amis
==============

Offline group chat + synchronised quiz for a group of friends on a plane.
Plain HTML/JS PWA, no build step, no server, French UI.

How it works
------------
- No internet on board, so one phone (the host) turns on its Wi-Fi hotspot.
  Nothing needs to go through it; it is only a local network. The others
  connect to that Wi-Fi.
- Phones talk to each other with WebRTC data channels over that network.
  There is no signalling server: the host shows a QR code, the guest scans
  it, the guest shows a QR code back, the host scans it. Repeat per guest.
- Topology is a star: the host relays chat messages and runs the quiz.
  If the host closes the app, the room is gone.
- The app must be opened once with internet before the flight so the
  service worker caches it. Adding it to the home screen is recommended.

Hosting
-------
It has to be served over HTTPS (camera + service worker + WebRTC all
require a secure origin). GitHub Pages is the easiest: push this folder
to a repo, enable Pages on the main branch, share the resulting URL on
WhatsApp. Any static host works. For local testing, `python -m http.server`
on http://localhost is also considered secure.

Files
-----
index.html    screens (name, home, help, pairing, room, connection lost)
style.css
app.js        UI wiring and pairing flow
peer.js       RTCPeerConnection / data channel helpers
sdp.js        packs a session description into ~260 bytes for the QR code
qr.js         QR rendering (qrcode-generator) and camera scanning (jsQR)
room.js       HostRoom (relay + quiz owner) and GuestRoom, same interface
quiz.js       quiz engine (host only), emits state snapshots
questions.js  the question bank, edit freely
sw.js         offline cache; bump VERSION after changing any file
manifest.json, icons/

Protocol (JSON over the data channel)
-------------------------------------
guest -> host : hello {id,name} | chat {text} | quiz-start | answer {index,choice}
host  -> all  : welcome {self,members,history,quiz} | members | chat | system
                | quiz {state}   (state: phase question/reveal/end, remaining ms,
                                  answered ids, scores...)

Debug mode
----------
Append ?debug to the URL: the service worker is not registered and
window.fwfDebug exposes the current QR payload (.code) and a way to inject
a scanned payload (.scanned(text)) so two browser tabs can be paired
without a camera. The Playwright end-to-end test used during development
is in test/e2e.mjs (needs `npm i playwright` and a local http server on
port 8099).

Known limits / things to check on real phones
---------------------------------------------
- Tested end to end in headless Chromium only. Safari on iOS and Chrome on
  Android need a real test: the minimal SDP rebuilt in sdp.js is standard
  but Safari has not been exercised.
- Browsers hide local IPs in ICE candidates behind mDNS names unless the
  page has camera permission. The app asks for the camera to scan, which
  also unlocks the real IPs, but if a phone only ever shows a QR without
  scanning (not the case in the current flow) it would rely on mDNS
  working across the hotspot.
- iOS cannot start a Personal Hotspot in airplane mode, so the host should
  be an Android phone. Guests can be anything.
- Phones may drop a Wi-Fi network that has no internet; keep cellular off
  (airplane mode with Wi-Fi re-enabled) so they stay on the hotspot.
- No reconnection logic: a guest who loses the link scans again and gets
  the chat history back from the host. Quiz scores are kept host-side.
