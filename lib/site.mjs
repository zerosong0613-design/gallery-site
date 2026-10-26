// 서버에서 완성된 HTML·sitemap 을 만든다.
// 검색엔진, AI 크롤러, 카카오톡 미리보기는 JS 를 실행하지 않거나 늦게 실행하므로 첫 응답에 내용이 다 들어 있어야 한다.
//
// 페이지
//   /                     진행 중 전시 목록
//   /exhibitions/{seq}    전시 상세 (끝난 전시는 아카이브에서 '종료된 전시'로)
//   /ending-soon          이번 주 끝나는 전시
//   /free                 무료 전시
//   /gu/{구}              구별 전시
//   /venues/{id}          전시장: 지금 하는 전시 + 지난 전시
//   /archive              지난 전시 모음
//   /me                   내 전시 (브라우저에 저장된 기록, 색인 안 함)
import { head } from '@vercel/blob';
import { ARCHIVE_PATH, withArchive } from './archive.mjs';
import { CACHE_PATH } from './cache.mjs';
import {
  SOON_DAYS, byEnd, cardHtml, chipsHtml, detailHref, detailHtml, dotted, escapeHtml,
  guOptionsHtml, hasAmount, period, prepare, priceParts, seoulDate, summaryText, venueHref,
} from '../public/common.js';

// 고유한 이름이어야 이름으로 검색했을 때 이 사이트가 나온다. '서울 전시'는 검색어로 남겨 두고 이름은 따로 둔다.
export const SITE_NAME = '오늘전시';

// 검색엔진 소유 확인용 메타태그. 확인 후에도 지우면 소유 확인이 풀린다.
const VERIFICATION = [
  ['google-site-verification', 'yMgxVYnwAbPFw6Qc3p5p3xbSKfM7ncslj-yDO3cXz8g'],
  // 네이버는 사이트(주소)마다 값이 다르다. 예전 주소(gallery-site-opal)는 새 주소로 이동하므로 새 값만 둔다.
  ['naver-site-verification', '8a76868c45abb29d616e8aa0d36ce4e7600aea16'],
];
const verificationTags = VERIFICATION.map(([name, content]) => `<meta name="${name}" content="${content}">`).join('\n  ');

// 정식 주소. 예전 주소(gallery-site-opal.vercel.app)는 Vercel 도메인 설정에서 이 주소로 영구 이동시킨다.
// 커스텀 도메인을 붙이면 SITE_URL 환경변수로 바꾼다.
const CANONICAL_ORIGIN = 'https://oneul-jeonsi.vercel.app';

export function siteOrigin(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  // 프로덕션은 어떤 주소로 들어와도 canonical·sitemap 이 정식 주소를 가리키게 한다.
  if (process.env.VERCEL_ENV === 'production') return CANONICAL_ORIGIN;
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

// 프로덕션이 아닌 배포(프리뷰, 로컬)는 색인되지 않게 막는다. 같은 내용이 여러 주소로 퍼지는 것을 막기 위해서다.
export const indexable = () => process.env.VERCEL_ENV === 'production';

// ---- 데이터 ----

async function readBlob(path) {
  try {
    const { url } = await head(path);
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    // 토큰이 없거나(로컬) 아직 만들어지지 않았다.
    return null;
  }
}

// 같은 함수 인스턴스가 연달아 요청을 받을 때 Blob 을 매번 읽지 않도록 5분간 들고 있는다.
const MEMO_MS = 5 * 60_000;
let memo = { at: 0, value: null };

// 최신 수집본 + 아카이브. 수집본이 없으면 배포에 포함된 사본을 쓴다.
export async function loadData(origin) {
  if (memo.value && Date.now() - memo.at < MEMO_MS) return memo.value;
  let [data, archive] = await Promise.all([readBlob(CACHE_PATH), readBlob(ARCHIVE_PATH)]);
  if (!data) {
    // 로컬에서 실데이터로 보고 싶으면 DATA_URL 에 운영 사이트의 /api/exhibitions 주소를 준다.
    const res = await fetch(process.env.DATA_URL || `${origin}/data/exhibitions.json`);
    if (!res.ok) throw new Error(`fallback data ${res.status}`);
    data = await res.json();
  }
  const value = { data, all: withArchive(data, archive) };
  memo = { at: Date.now(), value };
  return value;
}

// 화면에서 쓰는 모양으로 정리한다. current: 진행 중·예정, all: 끝난 전시 포함.
function model({ data, all }) {
  const current = prepare(data);
  const everything = prepare(all, current.today, { includeEnded: true });
  return {
    today: current.today,
    updatedAt: current.updatedAt,
    current: current.exhibitions,
    all: everything.exhibitions,
    ended: everything.exhibitions.filter((e) => e.ended),
    venues: everything.venues,
  };
}

// ---- 공통 틀 ----

// JSON-LD 안에 </script> 가 들어가도 태그가 닫히지 않게 한다.
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function layout({ title, description, canonical, image, ogType = 'website', ld = [], body, script, noindex }) {
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
<body>
${body}
  <script type="module" src="${script}"></script>
</body>
</html>
`;
}

const BACK_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

const topbar = (backHref = '/', backLabel = '전시 목록') => `  <header class="wrap topbar">
    <a href="${backHref}" class="back">${BACK_ICON} ${escapeHtml(backLabel)}</a>
    <a href="/me" class="to-mine">내 전시</a>
  </header>`;

// 목록 사이를 오가는 링크. 검색엔진이 하위 페이지를 찾는 길이기도 하다.
function quickNav(m, active = '') {
  const links = [
    ['/ending-soon', '이번 주 끝나는', m.current.filter(endingThisWeek).length],
    ['/free', '무료', m.current.filter((e) => !e.upcoming && e.isFree).length],
    ['/archive', '지난 전시', m.ended.length],
  ];
  return `<nav class="quick" aria-label="전시 모아 보기">${links
    .map(([href, label, n]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}<span class="n"> ${n}</span></a>`)
    .join('')}</nav>`;
}

function guNav(m, activeGu = '') {
  const counts = new Map();
  for (const e of m.current) if (!e.upcoming) counts.set(e.venue.sigungu, (counts.get(e.venue.sigungu) ?? 0) + 1);
  const items = [...counts].filter(([gu]) => gu).sort((a, b) => b[1] - a[1]);
  return `<nav class="gu-nav" aria-label="구별 전시"><h2>구별로 보기</h2><ul>${items
    .map(([gu, n]) => `<li><a href="${guHref(gu)}"${gu === activeGu ? ' aria-current="page"' : ''}>${escapeHtml(gu)} <span class="n">${n}</span></a></li>`)
    .join('')}</ul></nav>`;
}

const footer = (updatedAt) => `  <footer>
    <div class="wrap">
      <p>자료: 한국문화정보원 한눈에보는문화정보 (공공데이터포털). <span id="updated">${updatedAt ? `${dotted(seoulDate(updatedAt))} 수집.` : ''}</span></p>
      <p>휴관일과 운영시간은 싣지 않습니다. 방문 전에 각 기관 안내를 확인하세요.</p>
    </div>
  </footer>`;

const guHref = (gu) => `/gu/${encodeURIComponent(gu)}`;
const endingThisWeek = (e) => !e.upcoming && !e.isPermanent && e.daysLeft <= SOON_DAYS;
const monthDay = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

// 네이버는 설명문을 80자 이내로 권장한다. 넘치면 단어 경계에서 자르고 말줄임표를 붙인다.
function clip(text, max = 80) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.·]+$/, '')}…`;
}

function priceSummary(e) {
  if (e.isFree && !/\d/.test(e.price)) return '무료';
  if (hasAmount(e)) return `${e.isFree ? '무료 · ' : ''}${priceParts(e).join(' / ')}`;
  return '관람료는 전시 안내 페이지에서 확인';
}

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

function place(venue, origin) {
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
    ...(venue.url && { sameAs: venue.url }),
    ...(origin && { url: origin + venueHref(venue) }),
  };
}

function eventLd(e, url, origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ExhibitionEvent',
    name: e.title,
    url,
    startDate: e.start,
    endDate: e.end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place(e.venue, origin),
    ...(e.thumbnail && { image: [e.thumbnail] }),
    ...(e.description && { description: e.description.slice(0, 500) }),
    // 금액도 '무료' 도 없으면(미정, 홈페이지 참고) 무료 여부를 단정하지 않는다.
    ...((e.isFree || hasAmount(e)) && { isAccessibleForFree: e.isFree }),
    ...(offers(e, e.sourceUrl || url) && { offers: offers(e, e.sourceUrl || url) }),
    ...(e.sourceUrl && { sameAs: e.sourceUrl }),
  };
}

function itemListLd(name, list, origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: list.length,
    itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + detailHref(e), name: e.title })),
  };
}

function breadcrumbLd(origin, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [[SITE_NAME, '/'], ...trail].map(([name, path], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: origin + path,
    })),
  };
}

// ---- 응답 ----

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  // 수집은 하루 한 번이지만 '며칠 남음' 이 날짜마다 바뀌므로 CDN 보관은 10분으로 짧게 둔다.
  'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
};

const headers = (extra = {}) => ({ ...HTML_HEADERS, ...(indexable() ? {} : { 'x-robots-tag': 'noindex' }), ...extra });
const html = (body, status = 200) => new Response(body, { status, headers: headers() });

function notFound(m, origin, message) {
  return html(layout({
    title: `찾는 페이지가 없어요 — ${SITE_NAME}`,
    description: message,
    canonical: `${origin}/`,
    noindex: true,
    body: `${topbar()}
  <main class="wrap" id="detail" data-missing="1">
    <p class="empty">${escapeHtml(message)} <a href="/">진행 중인 전시 보기</a></p>
  </main>
${footer(m.updatedAt)}`,
    script: '/cards.js',
  }), 404);
}

// ---- 첫 화면 ----

export function homePage(loaded, origin) {
  const m = model(loaded);
  const ongoing = m.current.filter((e) => !e.upcoming).sort(byEnd);
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
    itemListLd(`서울에서 진행 중인 전시 (${dotted(m.today)} 기준)`, ongoing, origin),
  ];

  const body = `  <header class="wrap masthead">
    <div class="mast-row"><h1><a href="/">${SITE_NAME}</a></h1><a href="/me" class="to-mine">내 전시</a></div>
    <p id="summary">${escapeHtml(summaryText(m.today, m.current))}</p>
    ${quickNav(m)}
  </header>

  <div class="controls">
    <div class="wrap">
      <div class="chips" id="chips" role="group" aria-label="전시 필터">${chipsHtml(m.current, 'now')}</div>
      <div class="selects">
        <label><span>정렬</span>
          <select id="sort">
            <option value="end">곧 끝나는 순</option>
            <option value="new">최근 시작한 순</option>
            <option value="near">가까운 순</option>
          </select>
        </label>
        <label><span>지역</span>
          <select id="gu">${guOptionsHtml(m.current)}</select>
        </label>
      </div>
      <p class="notice" id="notice" role="status"></p>
    </div>
  </div>

  <main class="wrap">
    <ul class="grid" id="grid">${ongoing.map(cardHtml).join('')}</ul>
    ${guNav(m)}
  </main>

${footer(m.updatedAt)}`;

  return html(layout({
    title: `${SITE_NAME} — 서울에서 지금 하는 전시, 기간과 관람료`,
    // 예: '10월 26일 기준 서울 전시 72개, 무료 64개. 미술관·박물관·갤러리 전시의 기간과 관람료.'
    description: clip(`${monthDay(m.today)} 기준 서울 전시 ${ongoing.length}개, 무료 ${ongoing.filter((e) => e.isFree).length}개. 미술관·박물관·갤러리 전시의 기간과 관람료.`),
    canonical,
    image: ongoing.find((e) => e.thumbnail)?.thumbnail,
    ld,
    body,
    script: '/app.js',
  }));
}

// ---- 상세 ----

export function detailPage(loaded, origin, seq) {
  const m = model(loaded);
  const e = m.all.find((x) => x.seq === seq);
  if (!e) return notFound(m, origin, '목록에 없는 전시예요.');

  const canonical = origin + detailHref(e);
  const when = e.ended ? `${dotted(e.start)}~${dotted(e.end)} (종료)` : `${monthDay(e.end)}까지`;
  const title = `${e.title} — ${e.venue.name}, ${when}${!e.ended && e.isFree ? ' · 무료' : ''} | ${SITE_NAME}`;
  const facts = e.ended
    ? `${e.venue.name}(서울 ${e.venue.sigungu})에서 ${dotted(e.start)}~${dotted(e.end)} 열린 전시. 관람료 ${priceSummary(e)}.`
    : `${e.venue.name}(서울 ${e.venue.sigungu}), ${dotted(e.start)}~${dotted(e.end)}. 관람료 ${priceSummary(e)}.`;

  return html(layout({
    title,
    description: clip(e.description ? `${facts} ${e.description}` : facts),
    canonical,
    image: e.thumbnail,
    ogType: 'article',
    ld: [
      eventLd(e, canonical, origin),
      breadcrumbLd(origin, [[e.venue.name, venueHref(e.venue)], [e.title, detailHref(e)]]),
    ],
    body: `${topbar()}

  <main class="wrap" id="detail">${detailHtml(e, m.current)}
  </main>

${footer(m.updatedAt)}`,
    script: '/detail.js',
  }));
}

// ---- 모아 보기: 이번 주 끝나는 / 무료 / 구별 ----

function listPage(m, origin, { path, h1, lead, list, title, description, emptyText, activeNav, activeGu }) {
  const canonical = origin + path;
  return html(layout({
    title,
    description: clip(description),
    canonical,
    image: list.find((e) => e.thumbnail)?.thumbnail,
    ld: [itemListLd(h1, list, origin), breadcrumbLd(origin, [[h1, path]])],
    body: `${topbar()}

  <main class="wrap">
    <header class="page-head">
      <h1>${escapeHtml(h1)}</h1>
      <p class="lead">${escapeHtml(lead)}</p>
      ${quickNav(m, activeNav)}
    </header>
    <ul class="grid">${list.length ? list.map(cardHtml).join('') : `<li class="empty">${escapeHtml(emptyText)} <a href="/">진행 중인 전시 보기</a></li>`}</ul>
    ${guNav(m, activeGu)}
  </main>

${footer(m.updatedAt)}`,
    script: '/cards.js',
  }));
}

export function endingSoonPage(loaded, origin) {
  const m = model(loaded);
  const list = m.current.filter(endingThisWeek).sort(byEnd);
  const today = monthDay(m.today);
  const todayEnd = list.filter((e) => e.daysLeft === 0).length;
  return listPage(m, origin, {
    path: '/ending-soon',
    h1: '이번 주 끝나는 서울 전시',
    lead: list.length
      ? `${today} 기준, 일주일 안에 끝나는 전시가 ${list.length}개 있어요.${todayEnd ? ` 그중 ${todayEnd}개는 오늘이 마지막 날이에요.` : ''} 곧 끝나는 순서로 모았어요.`
      : `${today} 기준, 일주일 안에 끝나는 전시가 없어요.`,
    list,
    title: `이번 주 끝나는 서울 전시 ${list.length}개 (${today} 기준) | ${SITE_NAME}`,
    description: `${today} 기준 일주일 안에 끝나는 서울 전시 ${list.length}개. 마감일과 관람료를 곧 끝나는 순으로.`,
    emptyText: '이번 주에 끝나는 전시가 없어요.',
    activeNav: '/ending-soon',
  });
}

export function freePage(loaded, origin) {
  const m = model(loaded);
  const list = m.current.filter((e) => !e.upcoming && e.isFree).sort(byEnd);
  const today = monthDay(m.today);
  return listPage(m, origin, {
    path: '/free',
    h1: '지금 무료로 볼 수 있는 서울 전시',
    lead: `${today} 기준, 관람료 없이 볼 수 있는 전시가 ${list.length}개 있어요. 곧 끝나는 순서로 모았어요.`,
    list,
    title: `서울 무료 전시 ${list.length}개 (${today} 기준) | ${SITE_NAME}`,
    description: `${today} 기준 서울에서 무료로 볼 수 있는 전시 ${list.length}개. 기간과 장소를 곧 끝나는 순으로.`,
    emptyText: '지금 무료로 볼 수 있는 전시가 없어요.',
    activeNav: '/free',
  });
}

export function guPage(loaded, origin, gu) {
  const m = model(loaded);
  const list = m.current.filter((e) => !e.upcoming && e.venue.sigungu === gu).sort(byEnd);
  if (!gu || !list.length) return notFound(m, origin, '이 지역에는 지금 하는 전시가 없어요.');
  const today = monthDay(m.today);
  const free = list.filter((e) => e.isFree).length;
  return listPage(m, origin, {
    path: guHref(gu),
    h1: `${gu} 전시`,
    lead: `${today} 기준, 서울 ${gu}에서 ${list.length}개 전시가 열리고 있어요. 무료 ${free}개. 곧 끝나는 순서로 모았어요.`,
    list,
    title: `${gu} 전시 — 지금 하는 전시 ${list.length}개 (${today} 기준) | ${SITE_NAME}`,
    description: `${today} 기준 서울 ${gu}에서 열리는 전시 ${list.length}개, 무료 ${free}개. 기간과 관람료.`,
    emptyText: '',
    activeGu: gu,
  });
}

// ---- 전시장 ----

const EXTERNAL_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5"/></svg>';

function pastRowsHtml(list) {
  return `<ul class="past">${list.map((e) => `<li><a href="${detailHref(e)}">
      <span class="o-title">${escapeHtml(e.title)}</span>
      <span class="p-date">${period(e.start, e.end)}</span></a></li>`).join('')}</ul>`;
}

export function venuePage(loaded, origin, id) {
  const m = model(loaded);
  const venue = m.venues.get(id);
  const now = m.current.filter((e) => e.venueId === id).sort((a, b) => a.upcoming - b.upcoming || byEnd(a, b));
  const past = m.ended.filter((e) => e.venueId === id).sort((a, b) => b.end.localeCompare(a.end));
  if (!venue || (!now.length && !past.length)) return notFound(m, origin, '이 전시장의 전시 정보가 없어요.');

  const path = venueHref(venue);
  const today = monthDay(m.today);
  const ongoing = now.filter((e) => !e.upcoming);
  const naver = `https://map.naver.com/p/search/${encodeURIComponent(venue.address || `${venue.name} ${venue.sigungu}`)}`;
  const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(venue.name.replaceAll(',', ' '))},${venue.lat},${venue.lng}`;
  const lead = ongoing.length
    ? `${today} 기준, ${venue.name}에서 ${ongoing.length}개 전시가 열리고 있어요.${now.length > ongoing.length ? ` 곧 시작하는 전시 ${now.length - ongoing.length}개.` : ''}`
    : `${today} 기준, ${venue.name}에서 지금 열리는 전시는 없어요.`;

  return html(layout({
    title: `${venue.name} 전시 — ${[ongoing.length ? `지금 하는 전시 ${ongoing.length}개` : '지금 하는 전시', past.length ? `지난 전시 ${past.length}개` : ''].filter(Boolean).join(', ')} | ${SITE_NAME}`,
    description: clip(`${venue.name}(서울 ${venue.sigungu}) ${today} 기준 진행 중 전시 ${ongoing.length}개${past.length ? `, 지난 전시 ${past.length}개` : ''}. 기간과 관람료.`),
    canonical: origin + path,
    image: now.find((e) => e.thumbnail)?.thumbnail ?? past.find((e) => e.thumbnail)?.thumbnail,
    ld: [
      { '@context': 'https://schema.org', ...place(venue, origin), ...(now.length && { event: now.map((e) => ({ '@type': 'ExhibitionEvent', name: e.title, startDate: e.start, endDate: e.end, url: origin + detailHref(e) })) }) },
      breadcrumbLd(origin, [[venue.name, path]]),
    ],
    body: `${topbar()}

  <main class="wrap">
    <header class="page-head">
      <h1>${escapeHtml(venue.name)}</h1>
      <p class="venue">서울 ${escapeHtml(venue.sigungu)}${venue.address ? ` · ${escapeHtml(venue.address)}` : ''}</p>
      <p class="lead">${escapeHtml(lead)}</p>
      <div class="actions">
        ${venue.url ? `<a class="btn" href="${escapeHtml(venue.url)}" target="_blank" rel="noopener">기관 홈페이지 ${EXTERNAL_ICON}</a>` : ''}
        <a class="btn" href="${escapeHtml(naver)}" target="_blank" rel="noopener">네이버 지도 ${EXTERNAL_ICON}</a>
        <a class="btn" href="${escapeHtml(kakao)}" target="_blank" rel="noopener">카카오맵 ${EXTERNAL_ICON}</a>
      </div>
    </header>
    ${now.length ? `<h2 class="sec-h">지금 하는 전시</h2><ul class="grid">${now.map(cardHtml).join('')}</ul>` : ''}
    ${past.length ? `<section class="others"><h2 class="sec-h">지난 전시 <span class="n">${past.length}</span></h2>${pastRowsHtml(past)}</section>` : ''}
  </main>

${footer(m.updatedAt)}`,
    script: '/cards.js',
  }));
}

// ---- 지난 전시 모음 ----

export function archivePage(loaded, origin) {
  const m = model(loaded);
  const past = [...m.ended].sort((a, b) => b.end.localeCompare(a.end));
  // 끝난 달로 묶는다.
  const months = new Map();
  for (const e of past) {
    const key = e.end.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(e);
  }
  const sections = [...months].map(([ym, list]) => `
    <section class="others"><h2 class="sec-h">${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월에 끝난 전시 <span class="n">${list.length}</span></h2>
      <ul class="past">${list.map((e) => `<li><a href="${detailHref(e)}">
        <span class="o-title">${escapeHtml(e.title)}<small>${escapeHtml(e.venue.name)}</small></span>
        <span class="p-date">${period(e.start, e.end)}</span></a></li>`).join('')}</ul></section>`).join('');

  return html(layout({
    title: `지난 서울 전시 기록 — 끝난 전시 ${past.length}개 | ${SITE_NAME}`,
    description: clip(`오늘전시가 매일 모은 서울 전시 중 끝난 전시 ${past.length}개. 언제, 어디서 열렸는지 끝난 달별로.`),
    canonical: `${origin}/archive`,
    ld: [breadcrumbLd(origin, [['지난 전시', '/archive']])],
    body: `${topbar()}

  <main class="wrap">
    <header class="page-head">
      <h1>지난 전시</h1>
      <p class="lead">${past.length
    ? `오늘전시가 매일 모은 전시 중 끝난 전시 ${past.length}개예요. 언제, 어디서 열렸는지 끝난 달별로 모았어요.`
    : '아직 끝난 전시 기록이 없어요. 매일 새벽 수집할 때 끝난 전시가 여기에 쌓여요.'}</p>
      ${quickNav(m, '/archive')}
    </header>
    ${sections}
  </main>

${footer(m.updatedAt)}`,
    script: '/cards.js',
  }));
}

// ---- 내 전시 ----

export function mePage(origin) {
  return html(layout({
    title: `내 전시 — 다녀온 전시와 가볼 전시 | ${SITE_NAME}`,
    description: '이 기기에 저장한 다녀온 전시와 가볼 전시 기록.',
    canonical: `${origin}/me`,
    noindex: true,
    body: `${topbar()}

  <main class="wrap">
    <header class="page-head">
      <h1>내 전시</h1>
      <p class="lead" id="summary">기록을 불러오는 중…</p>
      <div class="chips" id="tabs" role="group" aria-label="내 전시 보기"></div>
    </header>
    <div id="list"></div>
    <section class="backup">
      <h2>기록 옮기기</h2>
      <p>기록은 이 기기의 브라우저에만 저장돼요. 방문 기록을 지우거나 기기를 바꾸면 사라질 수 있으니, 가끔 파일로 내보내 두세요.</p>
      <div class="actions">
        <button class="btn" type="button" id="export">파일로 내보내기</button>
        <label class="btn file">파일에서 불러오기<input type="file" id="import" accept="application/json,.json"></label>
      </div>
      <p class="mine-note" id="backup-note" role="status"></p>
    </section>
  </main>

  <footer><div class="wrap"><p>기록은 서버로 보내지 않아요.</p></div></footer>`,
    script: '/me.js',
  }));
}

// ---- sitemap ----

export function sitemap(loaded, origin) {
  const m = model(loaded);
  // 시각까지 넣는다(W3C datetime). 날짜만 자르면 UTC 기준이라 하루 밀린다.
  const lastmod = m.updatedAt ?? new Date().toISOString();
  const gus = [...new Set(m.current.filter((e) => !e.upcoming).map((e) => e.venue.sigungu))].filter(Boolean);
  const venueIds = new Set([...m.current, ...m.ended].map((e) => e.venueId));
  const fresh = [
    '/', '/ending-soon', '/free', '/archive',
    ...gus.map(guHref),
    ...[...venueIds].map((id) => venueHref({ id })),
    ...m.current.map(detailHref),
  ].map((path) => [origin + path, lastmod]);
  // 끝난 전시는 더 바뀌지 않는다. 마지막으로 본 시각을 쓴다.
  const ended = m.ended.map((e) => [origin + detailHref(e), e.lastSeen ?? lastmod]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...fresh, ...ended].map(([loc, mod]) => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${mod}</lastmod></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}

// 예전 /robots.txt 경로 호환용. 지금은 public/robots.txt 정적 파일을 쓴다.
export function robots(origin) {
  const body = indexable() ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
  });
}
