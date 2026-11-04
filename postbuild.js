const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dist = path.join(__dirname, 'dist');
const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) { console.error('dist/index.html not found'); process.exit(1); }

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const BG = [11, 11, 15], GOLD = [212, 175, 55];
const BOLT = [[0.58, 0.18], [0.34, 0.54], [0.48, 0.54], [0.42, 0.82], [0.66, 0.45], [0.52, 0.45]];
const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const colorAt = (x, y) => {
  if (inPoly(x, y, BOLT)) return BG;
  const dx = x - 0.5, dy = y - 0.5;
  if (dx * dx + dy * dy <= 0.36 * 0.36) return GOLD;
  return BG;
};
function makePng(size) {
  const SS = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(dist, 'icon-192.png'), makePng(192));
fs.writeFileSync(path.join(dist, 'icon-512.png'), makePng(512));

fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({
  name: 'شحن ميكس', short_name: 'شحن ميكس', description: 'شحن ألعاب وشدات ببجي',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  background_color: '#0B0B0F', theme_color: '#0B0B0F', lang: 'ar',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

fs.writeFileSync(path.join(dist, 'sw.js'),
`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
`);

let html = fs.readFileSync(indexPath, 'utf8');
const tags = `
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0B0B0F">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="icon" type="image/png" href="/icon-192.png">
<style>html,body{background:#0B0B0F;overscroll-behavior:none}</style>
<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})}</script>
`;
html = html.replace(/<html[^>]*>/i, '<html lang="ar">');
if (/<title>.*?<\/title>/is.test(html)) html = html.replace(/<title>.*?<\/title>/is, '<title>شحن ميكس</title>');
html = html.replace('</head>', tags + '</head>');
fs.writeFileSync(indexPath, html);
console.log('PWA files generated');
