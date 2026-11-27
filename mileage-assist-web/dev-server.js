'use strict';
// Local development server: serves public/ with the same security headers and routes as vercel.json.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handle } = require('./lib/routes');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const API = /^\/(api\/|login$|logout$|login\/webauthn$|webauthn\/)/;

const server = http.createServer((req, res) => {
  for (const h of config.headers[0].headers) {
    if (h.key === 'Strict-Transport-Security' || h.value.includes('upgrade-insecure-requests')) {
      if (h.key === 'Content-Security-Policy') res.setHeader(h.key, h.value.replace('; upgrade-insecure-requests', ''));
      continue; // plain http locally
    }
    res.setHeader(h.key, h.value);
  }
  const url = new URL(req.url, 'http://localhost');
  if (API.test(url.pathname)) return handle(req, res);
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`Mileage Assist running at http://localhost:${port}`));
