const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;
const DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// ---------- IP de la Wi-Fi (plan C si no hay túnel) ----------
const VIRTUAL = /vEthernet|WSL|Hyper-V|Virtual|VMware|VBox|Docker|Loopback|Bluetooth|VPN|Tailscale|ZeroTier/i;
const WIFI = /Wi-?Fi|Wireless|WLAN|Inal[aá]mbric/i;

function candidates() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        list.push({ name, address: a.address, virtual: VIRTUAL.test(name), wifi: WIFI.test(name) });
      }
    }
  }
  return list;
}

function lanBase() {
  if (process.env.PHOTOBOOTH_IP) return `http://${process.env.PHOTOBOOTH_IP}:${PORT}`;
  const c = candidates();
  const best =
    c.find((x) => x.wifi && !x.virtual) ||
    c.find((x) => !x.virtual && /^(192\.168|10\.)/.test(x.address)) ||
    c.find((x) => !x.virtual) ||
    c[0];
  return `http://${best ? best.address : 'localhost'}:${PORT}`;
}

// ---------- Túnel público ----------
// Estados: 'starting' (conectando), 'ready' (listo), 'off' (sin túnel)
let tunnelState = 'starting';
let tunnelUrl = null;
let activeChild = null;

function stopChild() {
  if (activeChild) {
    try { activeChild.kill(); } catch {}
    activeChild = null;
  }
}

function ready(url, how) {
  tunnelUrl = url;
  tunnelState = 'ready';
  console.log(`\n  ✔ Enlace público CONECTADO (${how}): ${url}\n  Ya puedes crear el QR.\n`);
}

// Intento 1: Cloudflare
function tryCloudflare(next) {
  const local = path.join(__dirname, 'cloudflared.exe');
  const bin = fs.existsSync(local) ? local : 'cloudflared';
  console.log('  Probando Cloudflare...');

  let url = null;
  let done = false;
  const child = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate', '--protocol', 'http2']);
  activeChild = child;

  const fail = (why) => {
    if (done) return;
    done = true;
    console.log(`  ✖ Cloudflare no conectó (${why}).`);
    stopChild();
    next();
  };

  child.on('error', () => fail('no está instalado'));
  child.on('exit', () => fail('se cerró'));

  const onData = (buf) => {
    const text = buf.toString();
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
    if (m && !url) url = m[0];
    if (/Registered tunnel connection/i.test(text) && url && !done) {
      done = true;
      ready(url, 'Cloudflare');
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  setTimeout(() => fail('tiempo agotado'), 25000);
}

// Intento 2: ssh con localhost.run (puerto 22)
function trySsh(next) {
  console.log('  Probando ssh (localhost.run)...');
  let done = false;
  const child = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=NUL',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:localhost:${PORT}`,
    'nokey@localhost.run',
  ]);
  activeChild = child;

  const fail = (why) => {
    if (done) return;
    done = true;
    console.log(`  ✖ ssh no conectó (${why}).`);
    stopChild();
    next();
  };

  child.on('error', () => fail('ssh no disponible'));
  child.on('exit', () => {
    if (!done) fail('se cerró');
    else if (tunnelState === 'ready') {
      console.log('  ✖ El túnel se cerró. Reinicia el servidor.');
      tunnelState = 'off';
      tunnelUrl = null;
    }
  });

  const onData = (buf) => {
    const m = /https:\/\/[a-z0-9-]+\.lhr\.life/.exec(buf.toString());
    if (m && !done) {
      done = true;
      ready(m[0], 'ssh');
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  setTimeout(() => fail('tiempo agotado'), 30000);
}

function startTunnel() {
  if (process.env.PUBLIC_URL) {
    ready(process.env.PUBLIC_URL, 'manual');
    return;
  }
  const useWifi = () => {
    tunnelState = 'off';
    tunnelUrl = null;
    console.log(`  Se usará la Wi-Fi: ${lanBase()} (solo funciona si el móvil llega al PC)`);
  };
  tryCloudflare(() => trySsh(useWifi));
}

process.on('exit', stopChild);
process.on('SIGINT', () => process.exit());

// ---------- API ----------
app.post('/api/strips', (req, res) => {
  if (tunnelState === 'starting') {
    return res
      .status(503)
      .json({ error: 'El enlace público se está conectando. Espera unos segundos y vuelve a pulsar.' });
  }

  const m = /^data:image\/png;base64,(.+)$/.exec(req.body?.dataUrl || '');
  if (!m) return res.status(400).json({ error: 'Imagen no válida' });

  const id = crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(path.join(DIR, `${id}.png`), Buffer.from(m[1], 'base64'));

  const base = tunnelState === 'ready' && tunnelUrl ? tunnelUrl : lanBase();
  res.json({ id, url: `${base}/d/${id}`, tunnel: tunnelState === 'ready' });
});

app.get('/files/:file', (req, res) => {
  if (!/^[a-f0-9]{12}\.png$/.test(req.params.file)) return res.sendStatus(404);
  res.sendFile(path.join(DIR, req.params.file));
});

app.get('/d/:id', (req, res) => {
  if (!/^[a-f0-9]{12}$/.test(req.params.id)) return res.sendStatus(404);
  const file = `/files/${req.params.id}.png`;
  res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tu tira de fotos</title>
<style>
  body{margin:0;padding:24px 16px;font-family:system-ui,sans-serif;text-align:center;background:#7d1d2c;color:#f7f2e8}
  h1{font-size:1.4rem;margin:0 0 16px}
  img{max-width:100%;max-height:70vh;box-shadow:0 8px 24px #0008}
  a{display:inline-block;margin-top:18px;padding:14px 32px;border-radius:999px;background:#ffd479;color:#1c1416;font-weight:700;text-decoration:none;font-size:1.1rem}
</style></head>
<body>
  <h1>¡Tu tira de fotos!</h1>
  <img src="${file}" alt="Tira de fotos"><br>
  <a href="${file}" download="tira-photobooth.png">Descargar</a>
</body></html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor listo en http://localhost:' + PORT);
  console.log('Conectando el enlace público (espera el mensaje "CONECTADO")...');
  startTunnel();
});