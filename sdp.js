// Compacts a WebRTC session description into a short string that fits in a QR code,
// and rebuilds a minimal but valid SDP from it on the other side.
// Only the fields needed for a data-channel connection on a local network are kept.

const PREFIX = 'fwf1:';

export function packDescription(desc) {
  const sdp = desc.sdp.replace(/\r/g, '');
  const get = (re) => (sdp.match(re) || [])[1];
  const all = [...sdp.matchAll(/^a=(candidate:.*)$/gm)].map((m) => m[1]);
  // Host candidates only (no STUN/TURN on a plane), UDP only, IPv4 or mDNS names.
  let candidates = all.filter((c) => / udp /i.test(c) && / typ host/.test(c) && !c.split(' ')[4].includes(':'));
  if (candidates.length === 0) candidates = all.filter((c) => / typ host/.test(c));
  return PREFIX + JSON.stringify({
    r: desc.type === 'offer' ? 'o' : 'a',
    m: get(/^a=mid:(.*)$/m) || '0',
    u: get(/^a=ice-ufrag:(.*)$/m),
    p: get(/^a=ice-pwd:(.*)$/m),
    f: get(/^a=fingerprint:sha-256 (.*)$/m),
    c: candidates,
  });
}

export function unpackDescription(text, type) {
  if (!text.startsWith(PREFIX)) throw new Error('Ce code n\'est pas un code Vol entre amis.');
  const d = JSON.parse(text.slice(PREFIX.length));
  const expected = type === 'offer' ? 'o' : 'a';
  if (d.r !== expected) {
    throw new Error(type === 'offer' ? 'Ce code n\'est pas celui d\'un hôte.' : 'Ce code n\'est pas celui d\'un invité.');
  }
  const lines = [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE ' + d.m,
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=ice-ufrag:' + d.u,
    'a=ice-pwd:' + d.p,
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 ' + d.f,
    'a=setup:' + (type === 'offer' ? 'actpass' : 'active'),
    'a=mid:' + d.m,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    ...d.c.map((c) => 'a=' + c),
    'a=end-of-candidates',
  ];
  return { type, sdp: lines.join('\r\n') + '\r\n' };
}
