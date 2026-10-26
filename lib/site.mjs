// 서버에서 완성된 HTML·sitemap·robots 를 만든다.
// 검색엔진, AI 크롤러, 카카오톡 미리보기는 JS 를 실행하지 않거나 늦게 실행하므로 첫 응답에 내용이 다 들어 있어야 한다.
import { head } from '@vercel/blob';
import { CACHE_PATH } from './cache.mjs';
import {
  byEnd, cardHtml, chipsHtml, detailHref, detailHtml, dotted, escapeHtml,
  guOptionsHtml, hasAmount, prepare, priceParts, summaryText,
} from '../public/common.js';

// 고유한 이름이어야 이름으로 검색했을 때 이 사이트가 나온다. '서울 전시'는 검색어로 남겨 두고 이름은 따로 둔다.
export const SITE_NAME = '오늘전시';

// 검색엔진 소유 확인용 메타태그. 확인 후에도 지우면 소유 확인이 풀린다.
const VERIFICATION = [
  ['google-site-verification', 'yMgxVYnwAbPFw6Qc3p5p3xbSKfM7ncslj-yDO3cXz8g'],
  ['naver-site-verification', '956e86b6153969c40dcd8129b17586004084cd81'],
];
const verificationTags = VERIFICATION.map(([name, content]) => `<meta name="${name}" content="${content}">`).join('\n  ');

// 커스텀 도메인을 붙이면 SITE_URL 환경변수로 대표 주소를 고정한다. 없으면 요청 호스트를 쓴다.
export function siteOrigin(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

// 프로덕션이 아닌 배포(프리뷰, 로컬)는 색인되지 않게 막는다. 같은 내용이 여러 주소로 퍼지는 것을 막기 위해서다.
export const indexable = () => process.env.VERCEL_ENV === 'production';

// Blob 의 최신 수집본을 읽고, 없으면 배포에 포함된 사본을 쓴다.
export async function loadData(origin) {
  try {
    const { url } = await head(CACHE_PATH);
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {
    // 토큰이 없거나(로컬) 첫 수집 전이면 아래 사본으로 간다.
  }
  // 로컬에서 실데이터로 보고 싶으면 DATA_URL 에 운영 사이트의 /api/exhibitions 주소를 준다.
  const res = await fetch(process.env.DATA_URL || `${origin}/data/exhibitions.json`);
  if (!res.ok) throw new Error(`fallback data ${res.status}`);
  return res.json();
}

// ---- 공통 틀 ----

// JSON-LD 안에 </script> 가 들어가도 태그가 닫히지 않게 한다.
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function layout({ title, description, canonical, image, ogType = 'website', bodyClass = '', ld = [], body, script, noindex }) {
  const robots = noindex || !indexable() ? '<meta name="robots" content="noindex">' : '';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${robots}
  ${verificationTags}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">\n  <meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&display=swap">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="/styles.css">
  ${ld.map(jsonLd).join('\n  ')}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
  <script type="module" src="${script}"></script>
</body>
</html>
`;
}

const footer = (updatedAt) => `  <footer>
    <div class="wrap">
      <p>자료: 한국문화정보원 한눈에보는문화정보 (공공데이터포털). <span id="updated">${updatedAt ? `${dotted(updatedAt.slice(0, 10))} 수집.` : ''}</span></p>
      <p>휴관일과 운영시간은 싣지 않습니다. 방문 전에 각 기관 안내를 확인하세요.</p>
    </div>
  </footer>`;

// ---- 구조화 데이터 ----

// '성인(만19-64세) 23,000원' 처럼 자유 텍스트라서 '원' 앞의 금액만 뽑는다. 못 뽑으면 offers 를 넣지 않는다.
function offers(e, url) {
  const parsed = hasAmount(e)
    ? priceParts(e).map((part) => {
      const m = part.match(/([\d,]+)\s*원/);
      if (!m) return null;
      const name = part.slice(0, m.index).replace(/[:：]\s*$/, '').trim();
      return { '@type': 'Offer', ...(name && { name }), price: Number(m[1].replaceAll(',', '')), priceCurrency: 'KRW', url };
    }).filter(Boolean)
    : [];
  if (parsed.length) return parsed;
  if (e.isFree) return [{ '@type': 'Offer', price: 0, priceCurrency: 'KRW', url }];
  return undefined;
}

function place(venue) {
  return {
    '@type': 'Place',
    name: venue.name,
    address: {
      '@type': 'PostalAddress',
      ...(venue.address && { streetAddress: venue.address }),
      addressLocality: venue.sigungu,
      addressRegion: '서울특별시',
      addressCountry: 'KR',
    },
    ...(Number.isFinite(venue.lat) && { geo: { '@type': 'GeoCoordinates', latitude: venue.lat, longitude: venue.lng } }),
    ...(venue.url && { url: venue.url }),
  };
}

function eventLd(e, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ExhibitionEvent',
    name: e.title,
    url,
    startDate: e.start,
    endDate: e.end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place(e.venue),
    ...(e.thumbnail && { image: [e.thumbnail] }),
    ...(e.description && { description: e.description.slice(0, 500) }),
    // 금액도 '무료' 도 없으면(미정, 홈페이지 참고) 무료 여부를 단정하지 않는다.
    ...((e.isFree || hasAmount(e)) && { isAccessibleForFree: e.isFree }),
    ...(offers(e, e.sourceUrl || url) && { offers: offers(e, e.sourceUrl || url) }),
    ...(e.sourceUrl && { sameAs: e.sourceUrl }),
  };
}

// ---- 페이지 ----

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  // 수집은 하루 한 번이지만 '며칠 남음' 이 날짜마다 바뀌므로 CDN 보관은 10분으로 짧게 둔다.
  'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
};

function headers(extra = {}) {
  return { ...HTML_HEADERS, ...(indexable() ? {} : { 'x-robots-tag': 'noindex' }), ...extra };
}

export function homePage(data, origin) {
  const { today, updatedAt, exhibitions } = prepare(data);
  const ongoing = exhibitions.filter((e) => !e.upcoming).sort(byEnd);
  const summary = summaryText(today, exhibitions);
  const canonical = `${origin}/`;

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: ['서울 전시', '오늘 서울 전시'],
      url: canonical,
      inLanguage: 'ko-KR',
      description: '서울에서 지금 진행 중인 전시의 기간과 관람료를 매일 모아 보여줍니다.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `서울에서 진행 중인 전시 (${dotted(today)} 기준)`,
      numberOfItems: ongoing.length,
      itemListElement: ongoing.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + detailHref(e), name: e.title })),
    },
  ];

  const body = `  <header class="wrap masthead">
    <h1><a href="/">${SITE_NAME}</a></h1>
    <p id="summary">${escapeHtml(summary)}</p>
  </header>

  <div class="controls">
    <div class="wrap">
      <div class="chips" id="chips" role="group" aria-label="전시 필터">${chipsHtml(exhibitions, 'now')}</div>
      <div class="selects">
        <label><span>정렬</span>
          <select id="sort">
            <option value="end">곧 끝나는 순</option>
            <option value="new">최근 시작한 순</option>
            <option value="near">가까운 순</option>
          </select>
        </label>
        <label><span>지역</span>
          <select id="gu">${guOptionsHtml(exhibitions)}</select>
        </label>
      </div>
      <p class="notice" id="notice" role="status"></p>
    </div>
  </div>

  <main class="wrap">
    <ul class="grid" id="grid">${ongoing.map(cardHtml).join('')}</ul>
  </main>

${footer(updatedAt)}`;

  const html = layout({
    title: `${SITE_NAME} — 서울에서 지금 하는 전시, 기간과 관람료`,
    // 예: '10월 26일 기준 서울 전시 72개, 무료 64개. 미술관·박물관·갤러리 전시의 기간과 관람료.'
    description: clip(`${monthDay(today)} 기준 서울 전시 ${ongoing.length}개, 무료 ${ongoing.filter((e) => e.isFree).length}개. 미술관·박물관·갤러리 전시의 기간과 관람료.`),
    canonical,
    image: ongoing.find((e) => e.thumbnail)?.thumbnail,
    ld,
    body,
    script: '/app.js',
  });
  return new Response(html, { headers: headers() });
}

// 네이버는 설명문을 80자 이내로 권장한다. 넘치면 단어 경계에서 자르고 말줄임표를 붙인다.
function clip(text, max = 80) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.·]+$/, '')}…`;
}

const monthDay = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

function priceSummary(e) {
  if (e.isFree && !/\d/.test(e.price)) return '무료';
  if (hasAmount(e)) return `${e.isFree ? '무료 · ' : ''}${priceParts(e).join(' / ')}`;
  return '관람료는 전시 안내 페이지에서 확인';
}

export function detailPage(data, origin, seq) {
  const { updatedAt, exhibitions } = prepare(data);
  const e = exhibitions.find((x) => x.seq === seq);
  const topbar = `  <header class="wrap topbar">
    <a href="/" class="back">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      전시 목록
    </a>
  </header>`;

  if (!e) {
    // 끝났거나 없는 전시는 404 로 답한다. 200 으로 '없어요' 를 보여주면 검색엔진이 빈 페이지를 색인한다.
    const html = layout({
      title: `끝났거나 없는 전시 — ${SITE_NAME}`,
      description: '끝났거나 목록에 없는 전시입니다.',
      canonical: `${origin}/`,
      noindex: true,
      body: `${topbar}
  <main class="wrap" id="detail" data-missing="1">
    <p class="empty">끝났거나 목록에 없는 전시예요. <a href="/">진행 중인 전시 보기</a></p>
  </main>
${footer(updatedAt)}`,
      script: '/detail.js',
    });
    return new Response(html, { status: 404, headers: headers() });
  }

  const canonical = origin + detailHref(e);
  const until = `${monthDay(e.end)}까지`;
  const title = `${e.title} — ${e.venue.name}, ${until}${e.isFree ? ' · 무료' : ''} | ${SITE_NAME}`;
  const facts = `${e.venue.name}(서울 ${e.venue.sigungu}), ${dotted(e.start)}~${dotted(e.end)}. 관람료 ${priceSummary(e)}.`;
  const description = clip(e.description ? `${facts} ${e.description}` : facts);

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: e.title, item: canonical },
    ],
  };

  const html = layout({
    title,
    description,
    canonical,
    image: e.thumbnail,
    ogType: 'article',
    ld: [eventLd(e, canonical), breadcrumbs],
    body: `${topbar}

  <main class="wrap" id="detail">${detailHtml(e, exhibitions)}
  </main>

${footer(updatedAt)}`,
    script: '/detail.js',
  });
  return new Response(html, { headers: headers() });
}

// ---- sitemap / robots ----

export function sitemap(data, origin) {
  const { exhibitions, updatedAt } = prepare(data);
  const lastmod = (updatedAt ?? new Date().toISOString()).slice(0, 10);
  const urls = [`${origin}/`, ...exhibitions.map((e) => origin + detailHref(e))];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}

// 검색엔진(구글·네이버 Yeti·빙·다음)과 AI 검색·답변 크롤러(GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot 등)를
// 모두 허용한다. 특정 봇을 막고 싶어지면 여기에 그 봇만 Disallow 로 추가한다. 프리뷰 배포는 전부 막는다.
export function robots(origin) {
  const body = indexable()
    ? `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}
