export default async (req) => {
  const m = /^\/d\/([a-f0-9]{12})$/.exec(new URL(req.url).pathname);
  if (!m) return new Response('No encontrado', { status: 404 });

  const file = `/files/${m[1]}.png`;
  const html = `<!DOCTYPE html>
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
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};

export const config = { path: '/d/*' };