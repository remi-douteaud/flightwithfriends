// Builds fwf/shapes.js (country outlines) and fwf/questions/drapeaux.js + formes.js from world-atlas.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const topojson = require('topojson-client');
const iso = require('i18n-iso-countries');
iso.registerLocale(require('i18n-iso-countries/langs/fr.json'));
const world = require('world-atlas/countries-50m.json');

// [alpha2, continent, shape difficulty, flag difficulty]  (0 = no shape question)
const LIST = `
FR EU 1 1|IT EU 1 1|ES EU 1 1|DE EU 1 1|GB EU 1 1|PT EU 1 1|IE EU 2 2|NL EU 3 2|BE EU 2 1|CH EU 2 1|AT EU 3 2|
SE EU 1 1|NO EU 1 2|FI EU 2 2|DK EU 3 2|IS EU 2 3|PL EU 2 2|CZ EU 3 3|HU EU 3 3|RO EU 3 2|BG EU 3 3|GR EU 1 1|
HR EU 3 3|RS EU 3 3|UA EU 2 2|RU EU 1 2|TR EU 1 1|LT EU 0 3|LV EU 0 3|EE EU 0 3|SK EU 0 3|SI EU 0 3|AL EU 0 3|
US NA 1 1|CA NA 1 1|MX NA 1 1|CU NA 2 2|GT NA 3 3|PA NA 3 3|JM NA 0 2|HT NA 0 3|DO NA 0 3|CR NA 0 3|
BR SA 1 1|AR SA 1 1|CL SA 1 2|PE SA 2 2|CO SA 2 2|VE SA 3 3|BO SA 3 3|EC SA 3 2|UY SA 3 3|PY SA 3 3|
CN AS 1 1|JP AS 1 1|IN AS 1 1|KR AS 2 2|TH AS 2 2|VN AS 2 2|ID AS 2 2|PH AS 2 2|MY AS 3 3|SA AS 2 2|IR AS 2 2|
IQ AS 2 2|IL AS 3 1|PK AS 2 2|AF AS 3 3|KZ AS 2 3|MN AS 2 3|NP AS 3 2|LK AS 2 3|KH AS 3 3|MM AS 3 3|SY AS 3 3|
JO AS 3 3|AE AS 3 3|KP AS 3 3|TW AS 3 3|BD AS 3 3|GE AS 0 3|AM AS 0 3|QA AS 0 3|KW AS 0 3|LB AS 0 2|
EG AF 1 1|ZA AF 1 1|MA AF 1 1|DZ AF 2 1|TN AF 2 1|LY AF 2 3|NG AF 2 2|KE AF 2 2|ET AF 2 2|MG AF 1 3|SN AF 2 1|
CI AF 2 2|GH AF 2 2|CM AF 2 2|CD AF 2 3|ML AF 2 2|NE AF 3 3|TD AF 3 3|SD AF 3 3|SO AF 2 3|TZ AF 3 3|MZ AF 3 3|
AO AF 3 3|NA AF 3 3|ZW AF 3 3|
AU OC 1 1|NZ OC 1 2|PG OC 3 3|FJ OC 0 3|
`.trim().split(/\||\n/).map((s) => s.trim()).filter(Boolean).map((s) => s.split(' '));

const NAMES = { US: 'États-Unis', GB: 'Royaume-Uni', RU: 'Russie', KR: 'Corée du Sud', KP: 'Corée du Nord',
  CD: 'RD Congo', CZ: 'République tchèque', IR: 'Iran', SY: 'Syrie', VN: 'Vietnam', TZ: 'Tanzanie', BO: 'Bolivie',
  VE: 'Venezuela', LA: 'Laos', MK: 'Macédoine du Nord', CI: 'Côte d\'Ivoire', AE: 'Émirats arabes unis', TW: 'Taïwan' };
const name = (a2) => NAMES[a2] || iso.getName(a2, 'fr', { select: 'official' }) || iso.getName(a2, 'fr');

// --- shapes ---
const features = topojson.feature(world, world.objects.countries).features;
const byNumeric = new Map();
for (const f of features) if (!byNumeric.has(f.id) || f.geometry.coordinates.flat(3).length > byNumeric.get(f.id).geometry.coordinates.flat(3).length) byNumeric.set(f.id, f);

function ringArea(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; }
function simplify(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const sqDist = (p, a, b) => { let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) { const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
    dx = p[0] - x; dy = p[1] - y; return dx * dx + dy * dy; };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) { const [f, l] = stack.pop(); let max = 0, idx = -1;
    for (let i = f + 1; i < l; i++) { const d = sqDist(pts[i], pts[f], pts[l]); if (d > max) { max = d; idx = i; } }
    if (max > tol * tol) { keep[idx] = 1; stack.push([f, idx], [idx, l]); } }
  return pts.filter((_, i) => keep[i]);
}

function shapePath(a2) {
  const f = byNumeric.get(iso.alpha2ToNumeric(a2));
  if (!f) throw new Error('no geometry for ' + a2);
  let polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // outer rings only, keep the largest and its significant neighbours
  const rings = polys.map((p) => p[0]).map((r) => ({ r, area: ringArea(r), cx: r.reduce((s, p) => s + p[0], 0) / r.length, cy: r.reduce((s, p) => s + p[1], 0) / r.length }));
  rings.sort((a, b) => b.area - a.area);
  const main = rings[0];
  const kept = rings.filter((x) => x === main || (x.area > main.area * 0.03 && Math.hypot(x.cx - main.cx, x.cy - main.cy) < 25));
  // equirectangular-ish projection centred on the shape
  const cos = Math.cos(main.cy * Math.PI / 180);
  let pts = kept.map((x) => x.r.map(([lon, lat]) => [(lon - main.cx) * cos, -(lat - main.cy)]));
  if (a2 === 'RU' || a2 === 'US') pts = pts.map((r) => r.map(([x, y]) => [x < -100 ? x + 360 * cos : x, y])); // antimeridian
  const all = pts.flat();
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const scale = 96 / Math.max(maxX - minX, maxY - minY);
  const ox = (100 - (maxX - minX) * scale) / 2, oy = (100 - (maxY - minY) * scale) / 2;
  return pts.map((r) => simplify(r.map(([x, y]) => [(x - minX) * scale + ox, (y - minY) * scale + oy]), 0.6))
    .filter((r) => r.length > 3)
    .map((r) => 'M' + r.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z').join('');
}

const shapes = {};
for (const [a2, , sd] of LIST) if (sd !== '0') shapes[a2] = shapePath(a2);
const shapesJs = '// Simplified country outlines in a 100x100 box, generated from world-atlas (Natural Earth 50m).\nexport const SHAPES = ' +
  JSON.stringify(shapes).replace(/","/g, '",\n  "').replace('{', '{\n  ').replace(/}$/, '\n};\n');
fs.writeFileSync(new URL('../', import.meta.url).pathname + 'shapes.js', shapesJs);

// --- questions ---
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr, n, exclude) => { const pool = arr.filter((x) => x !== exclude); const out = []; while (out.length < n) { const x = pool[Math.floor(rnd() * pool.length)]; if (!out.includes(x)) out.push(x); } return out; };
const shuffleIn = (correct, wrongs) => { const c = [...wrongs]; const a = Math.floor(rnd() * 4); c.splice(a, 0, correct); return { c, a }; };
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
const line = (o) => `  { d: ${o.d}, q: '${esc(o.q)}', c: [${o.c.map((x) => `'${esc(x)}'`).join(', ')}], a: ${o.a}${o.shape ? `, shape: '${o.shape}'` : ''}${o.flag ? `, flag: '${o.flag}'` : ''}${o.cf ? `, cf: [${o.cf.map((x) => `'${x}'`).join(', ')}]` : ''} },`;

const byContinent = (cont) => LIST.filter((x) => x[1] === cont).map((x) => x[0]);
const flagQs = [];
for (const [a2, cont, , fd] of LIST) {
  const d = Number(fd);
  const others = pick(d === 1 ? LIST.map((x) => x[0]) : byContinent(cont), 3, a2);
  if (rnd() < 0.7) {
    const { c, a } = shuffleIn(name(a2), others.map(name));
    flagQs.push({ d, q: 'Quel pays a ce drapeau ?', c, a, flag: a2 });
  } else {
    const { c, a } = shuffleIn(a2, others); // choices are country codes, rendered as flag images (cf)
    flagQs.push({ d, q: `Quel est le drapeau de ce pays : ${name(a2)} ?`, c, a, cf: c });
  }
}
const shapeQs = [];
for (const [a2, cont, sd] of LIST) {
  if (sd === '0') continue;
  const d = Number(sd);
  const others = pick(d === 1 ? LIST.map((x) => x[0]) : byContinent(cont), 3, a2);
  const { c, a } = shuffleIn(name(a2), others.map(name));
  shapeQs.push({ d, q: 'Quel pays a cette forme ?', c, a, shape: a2 });
}
const header = (t) => `// ${t} — generated by build-geo.mjs, do not edit by hand.\nexport default [\n`;
fs.writeFileSync(new URL('../', import.meta.url).pathname + 'questions/drapeaux.js', header('Drapeaux') + flagQs.map(line).join('\n') + '\n];\n');
fs.writeFileSync(new URL('../', import.meta.url).pathname + 'questions/formes.js', header('Formes de pays (field shape = ISO code, see shapes.js)') + shapeQs.map(line).join('\n') + '\n];\n');
console.log('flags', flagQs.length, 'shapes', shapeQs.length, 'shapes.js bytes', shapesJs.length);
