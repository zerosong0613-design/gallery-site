// Blob 에 저장된 최신 수집본을 돌려준다. 아직 없으면 404 를 내고, 프런트가 배포에 포함된 JSON 으로 대신한다.
import { head } from '@vercel/blob';
import { CACHE_PATH } from '../lib/cache.mjs';

export async function GET() {
  try {
    const { url } = await head(CACHE_PATH);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`blob ${res.status}`);
    return new Response(res.body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // CDN 이 1시간 보관하고, 그 뒤 하루까지는 낡은 사본을 주면서 뒤에서 갱신한다.
        'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('exhibitions cache read failed:', err);
    return new Response('Not found', { status: 404 });
  }
}
