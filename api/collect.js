// Vercel Cron 이 하루 한 번 호출한다. 수집 결과를 Blob 에 덮어쓴다.
import { put } from '@vercel/blob';
import { CACHE_PATH } from '../lib/cache.mjs';
import { collect } from '../lib/cultureinfo.mjs';

export async function GET(request) {
  // Vercel Cron 은 CRON_SECRET 을 Bearer 토큰으로 보낸다. 값이 없으면 아무도 호출할 수 없게 닫아 둔다.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { from, to, failed, data } = await collect();
    await put(CACHE_PATH, JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 3600,
    });
    return Response.json({ ok: true, from, to, exhibitions: data.exhibitions.length, venues: data.venues.length, detailFailed: failed });
  } catch (err) {
    console.error(err);
    // 실패하면 기존 Blob 을 그대로 둔다.
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
