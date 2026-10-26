// 사람과 크롤러가 여는 모든 페이지를 서버에서 그린다. vercel.json 의 rewrites 가 이 함수로 보낸다.
// 페이지 목록은 lib/site.mjs 맨 위에 있다. robots.txt 는 public/robots.txt 정적 파일.
import {
  archivePage, detailPage, endingSoonPage, freePage, guPage, homePage, loadData, mePage, robots, sitemap, siteOrigin,
  venuePage,
} from '../lib/site.mjs';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const view = params.get('view') ?? 'home';
  const origin = siteOrigin(request);

  if (view === 'robots') return robots(origin); // 예전 경로 호환
  if (view === 'me') return mePage(origin); // 기록은 브라우저에 있으므로 데이터가 필요 없다.

  let loaded;
  try {
    loaded = await loadData(origin);
  } catch (err) {
    console.error('site data load failed:', err);
    return new Response('전시 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '300' },
    });
  }

  switch (view) {
    case 'sitemap': return sitemap(loaded, origin);
    case 'detail': return detailPage(loaded, origin, params.get('seq') ?? '');
    case 'ending-soon': return endingSoonPage(loaded, origin);
    case 'free': return freePage(loaded, origin);
    case 'gu': return guPage(loaded, origin, params.get('gu') ?? '');
    case 'venue': return venuePage(loaded, origin, params.get('id') ?? '');
    case 'archive': return archivePage(loaded, origin);
    default: return homePage(loaded, origin);
  }
}

// 크롤러와 진단 도구가 HEAD 로 먼저 확인하는 경우가 있어 본문 없이 같은 상태·헤더를 돌려준다.
export async function HEAD(request) {
  const res = await GET(request);
  return new Response(null, { status: res.status, headers: res.headers });
}
