import { getStore } from '@netlify/blobs';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Petición no válida' }, 400);
  }

  const m = /^data:image\/png;base64,(.+)$/.exec(body?.dataUrl || '');
  if (!m) return json({ error: 'Imagen no válida' }, 400);

  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > 4_000_000) return json({ error: 'La imagen es demasiado grande' }, 413);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await getStore('strips').set(id, data);

  return json({ id, url: `${new URL(req.url).origin}/d/${id}` });
};

export const config = { path: '/api/strips' };