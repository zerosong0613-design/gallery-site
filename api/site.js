// 사람과 크롤러가 여는 모든 페이지를 서버에서 그린다. vercel.json 의 rewrites 가 이 함수로 보낸다.
//   /                    → view=home
//   /exhibitions/{seq}   → view=detail
//   /sitemap.xml         → view=sitemap
//   /robots.txt          → view=robots
import { detailPage, homePage, loadData, robots, sitemap, siteOrigin } from '../lib/site.mjs';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const view = params.get('view') ?? 'home';
  const origin = siteOrigin(request);

  if (view === 'robots') return robots(origin);

  let data;
  try {
    data = await loadData(origin);
  } catch (err) {
    console.error('site data load failed:', err);
    return new Response('전시 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '300' },
    });
  }

  if (view === 'sitemap') return sitemap(data, origin);
  if (view === 'detail') return detailPage(data, origin, params.get('seq') ?? '');
  return homePage(data, origin);
}
