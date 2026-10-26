// 로컬 미리보기 서버. vercel.json 의 rewrites/redirects 를 흉내 내어 api/site.js 를 그대로 실행한다.
//   npm run dev                      → 배포에 포함된 사본(public/data/exhibitions.json)으로 렌더
//   DATA_URL=https://…/api/exhibitions npm run dev → 실데이터로 렌더
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { GET as site } from '../api/site.js';

const PORT = Number(process.env.PORT ?? 4173);
const ROOT = new URL('../public/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function route(pathname, searchParams) {
  if (pathname === '/') return '/api/site?view=home';
  if (pathname === '/sitemap.xml') return '/api/site?view=sitemap';
  const m = pathname.match(/^\/exhibitions\/([^/]+)$/);
  if (m) return `/api/site?view=detail&seq=${encodeURIComponent(decodeURIComponent(m[1]))}`;
  return null;
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/detail') {
      const seq = url.searchParams.get('seq');
      res.writeHead(308, { location: seq ? `/exhibitions/${encodeURIComponent(seq)}` : '/' });
      return res.end();
    }
    const target = route(url.pathname, url.searchParams);
    if (target) {
      const request = new Request(new URL(target, url), { headers: { host: url.host } });
      return send(res, await site(request));
    }
    // 로컬에는 Blob 이 없으므로 /api/exhibitions 는 404 → 브라우저가 사본으로 넘어간다.
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404);
      return res.end();
    }
    const file = normalize(join(ROOT, url.pathname));
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
