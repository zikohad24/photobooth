import { getStore } from '@netlify/blobs';

export default async (req) => {
  const m = /^\/files\/([a-f0-9]{12})\.png$/.exec(new URL(req.url).pathname);
  if (!m) return new Response('No encontrado', { status: 404 });

  const data = await getStore('strips').get(m[1], { type: 'arrayBuffer' });
  if (!data) return new Response('No encontrado', { status: 404 });

  return new Response(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};

export const config = { path: '/files/*' };