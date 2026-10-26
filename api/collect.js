// Vercel Cron 이 하루 한 번 호출한다. 수집 결과를 Blob 에 덮어쓰고, 끝난 전시는 아카이브에 쌓는다.
import { head, put } from '@vercel/blob';
import { ARCHIVE_PATH, mergeArchive } from '../lib/archive.mjs';
import { CACHE_PATH } from '../lib/cache.mjs';
import { collect } from '../lib/cultureinfo.mjs';

async function readBlob(path) {
  try {
    const { url } = await head(path);
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const putJson = (path, data) => put(path, JSON.stringify(data), {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/json; charset=utf-8',
  cacheControlMaxAge: 3600,
});

export async function GET(request) {
  // Vercel Cron 은 CRON_SECRET 을 Bearer 토큰으로 보낸다. 값이 없으면 아무도 호출할 수 없게 닫아 둔다.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { from, to, failed, data } = await collect();

    // 덮어쓰기 전에 직전 수집본을 아카이브에 합친다. 어제까지 하던 전시가 여기서 남는다.
    const [previous, archive] = await Promise.all([readBlob(CACHE_PATH), readBlob(ARCHIVE_PATH)]);
    const nextArchive = mergeArchive(archive, previous, data);

    // 아카이브를 먼저 쓴다. 수집본 쓰기가 실패해도 기록은 남게.
    await putJson(ARCHIVE_PATH, nextArchive);
    const blob = await putJson(CACHE_PATH, data);

    const summary = {
      ok: true, from, to,
      exhibitions: data.exhibitions.length,
      venues: data.venues.length,
      archived: nextArchive.exhibitions.length,
      detailFailed: failed,
    };
    console.log('collected', JSON.stringify(summary), blob.pathname);
    return Response.json(summary);
  } catch (err) {
    console.error(err);
    // 실패하면 기존 Blob 을 그대로 둔다.
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
