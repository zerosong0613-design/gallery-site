// 목록·상세 화면이 함께 쓰는 데이터 정리와 표기 규칙.
// 브라우저와 서버 렌더러(api/site.js)가 같은 파일을 쓴다. 그래서 DOM 이나 window 에 기대지 않는다.
export const SOON_DAYS = 7;
// 수집 단계에서 기간이 1년을 넘으면 상설로 본다. 그래도 종료일이 이만큼 다가오면 기획전처럼 남은 날을 보여 준다.
export const PERMANENT_ENDING_DAYS = 60;
const DAY_MS = 86_400_000;

// 사용자 시간대와 무관하게 서울 날짜를 쓴다.
export function seoulToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// 수집 시각(UTC ISO)을 서울 날짜로 바꾼다. 새벽 5시 수집이 UTC로는 전날이라 그대로 자르면 하루 밀려 보인다.
export const seoulDate = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(iso));

export const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
export const dotted = (iso) => iso.replaceAll('-', '.');

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 수집본에 디코딩되지 않은 엔티티(&times; 등)가 남아 있어도 화면에는 문자로 보이게 한다.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', times: '×', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', bull: '•', deg: '°' };
export function decodeEntities(text) {
  let out = String(text ?? '');
  for (let i = 0; i < 3 && /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(out); i++) {
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
  }
  return out;
}

// 외부 데이터의 링크는 http(s) 만 통과시킨다.
const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : '');

export function leftLabel(e) {
  if (e.ended) return { text: '종료', soon: false };
  if (e.upcoming) return { text: `${e.daysToStart}일 뒤 시작`, soon: false };
  if (e.isPermanent) return { text: '상설', soon: false };
  if (e.daysLeft === 0) return { text: '오늘 종료', soon: true };
  return { text: `${e.daysLeft}일 남음`, soon: e.daysLeft <= SOON_DAYS };
}

// 가격은 자유 텍스트다. '-', '미정', '홈페이지 참고' 처럼 금액이 없는 값은 정보 없음으로 본다.
export const hasAmount = (e) => /\d/.test(e.price);
export const priceParts = (e) => e.price.split(/\s*\/\s*/).filter(Boolean);

// 상세는 /exhibitions/{seq}. 어느 페이지에서 링크해도 같은 곳으로 가도록 절대 경로를 쓴다.
export const detailHref = (e) => `/exhibitions/${encodeURIComponent(e.seq)}`;
export const venueHref = (v) => `/venues/${encodeURIComponent(v.id)}`;

// '내 전시'에 저장할 때 함께 남기는 전시 정보. 전시가 끝나 목록에서 빠져도 기록을 그릴 수 있게.
export function snapOf(e) {
  return {
    seq: String(e.seq),
    title: e.title,
    venue: e.venue?.name ?? '',
    sigungu: e.venue?.sigungu ?? '',
    start: e.start,
    end: e.end,
    thumbnail: e.thumbnail ?? '',
    price: e.price ?? '',
    isFree: Boolean(e.isFree),
  };
}

const snapAttr = (e) => escapeHtml(JSON.stringify(snapOf(e)));

const SAVE_ICONS = '<svg class="icon i-wish" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-4-5 4z"/></svg>'
  + '<svg class="icon i-done" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// 수집본(JSON)을 화면용 목록으로 바꾼다. 끝난 전시는 뺀다.
// includeEnded: 아카이브(끝난 전시)까지 포함한다. 끝난 전시는 ended: true.
export function prepare(data, today = seoulToday(), { includeEnded = false } = {}) {
  const venues = new Map(data.venues.map((v) => [v.id, { ...v, name: decodeEntities(v.name), url: safeUrl(v.url) }]));
  const exhibitions = data.exhibitions
    .filter((e) => (includeEnded || e.end >= today) && venues.has(e.venueId))
    .map((e) => ({
      ...e,
      title: decodeEntities(e.title),
      description: decodeEntities(e.description),
      sourceUrl: safeUrl(e.sourceUrl),
      venue: venues.get(e.venueId),
      upcoming: e.start > today,
      ended: e.end < today,
      daysLeft: daysBetween(today, e.end),
      isPermanent: e.isPermanent && daysBetween(today, e.end) > PERMANENT_ENDING_DAYS,
      daysToStart: daysBetween(today, e.start),
      km: null,
    }));
  return { today, updatedAt: data.updatedAt, exhibitions, venues };
}

export async function loadExhibitions() {
  // 매일 갱신되는 수집본을 먼저 찾고, 없으면(로컬 개발, 첫 수집 전) 배포에 포함된 사본을 쓴다.
  let res = await fetch('/api/exhibitions').catch(() => null);
  if (!res?.ok || !res.headers.get('content-type')?.includes('json')) res = await fetch('/data/exhibitions.json');
  if (!res.ok) throw new Error(res.status);
  return prepare(await res.json());
}

// ---- 목록 필터 ----

export const FILTERS = [
  { id: 'now', label: '진행 중', test: (e) => !e.upcoming },
  { id: 'soon', label: '곧 끝나요', test: (e) => !e.upcoming && !e.isPermanent && e.daysLeft <= SOON_DAYS },
  { id: 'free', label: '무료', test: (e) => !e.upcoming && e.isFree },
  { id: 'permanent', label: '상설', test: (e) => !e.upcoming && e.isPermanent },
  { id: 'upcoming', label: '곧 시작', test: (e) => e.upcoming },
];

export function chipsHtml(list, active) {
  return FILTERS.map((f) => {
    const count = list.filter(f.test).length;
    return `<button class="chip" type="button" data-filter="${f.id}" aria-pressed="${f.id === active}">${f.label}<span class="n"> ${count}</span></button>`;
  }).join('');
}

export function guOptionsHtml(exhibitions) {
  const counts = new Map();
  for (const e of exhibitions) if (!e.upcoming) counts.set(e.venue.sigungu, (counts.get(e.venue.sigungu) ?? 0) + 1);
  return '<option value="">서울 전체</option>' + [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([gu, n]) => `<option value="${escapeHtml(gu)}">${escapeHtml(gu)} ${n}</option>`)
    .join('');
}

// 상설은 종료일이 의미가 없으므로 뒤로 보낸다.
export const byEnd = (a, b) => a.isPermanent - b.isPermanent || a.end.localeCompare(b.end);

// ---- 목록 카드 ----

// 같은 해에 끝나면 종료일의 연도를 생략한다.
export const period = (start, end) => `${dotted(start)} – ${dotted(start.slice(0, 4) === end.slice(0, 4) ? end.slice(5) : end)}`;

export const formatKm = (km) => (km < 1 ? `${Math.round(km * 100) * 10}m` : `${km.toFixed(1)}km`);

function cardPriceHtml(e) {
  if (!hasAmount(e)) return e.isFree ? '<span class="free">무료</span>' : '<span class="unknown">상세에서 확인</span>';
  return `<span class="price">${e.isFree ? '<span class="free">무료</span> ' : ''}${escapeHtml(priceParts(e).join(' · '))}</span>`;
}

export function cardHtml(e) {
  const left = leftLabel(e);
  const distance = e.km == null ? '' : ` · ${formatKm(e.km)}`;
  return `<li class="card"><a href="${detailHref(e)}">
    <div class="poster">
      <img src="${escapeHtml(e.thumbnail)}" alt="${escapeHtml(e.title)} 포스터" loading="lazy" data-title="${escapeHtml(e.title)}">
      <span class="badge${left.soon ? ' soon' : ''}">${left.text}</span>
    </div>
    <h2>${escapeHtml(e.title)}</h2>
    <p class="venue">${escapeHtml(e.venue.name)} · ${escapeHtml(e.venue.sigungu)}${distance}</p>
    <dl class="facts">
      <dt>기간</dt><dd>${period(e.start, e.end)}</dd>
      <dt>관람료</dt><dd>${cardPriceHtml(e)}</dd>
    </dl></a>
    <button class="save" type="button" data-snap="${snapAttr(e)}" aria-pressed="false" aria-label="가볼래요">${SAVE_ICONS}</button></li>`;
}

export function summaryText(today, exhibitions) {
  const [y, m, d] = today.split('-').map(Number);
  const ongoing = exhibitions.filter((e) => !e.upcoming);
  const free = ongoing.filter((e) => e.isFree).length;
  const soon = ongoing.filter((e) => !e.isPermanent && e.daysLeft <= SOON_DAYS).length;
  return `${y}년 ${m}월 ${d}일 기준, 서울에서 ${ongoing.length}개 전시가 열리고 있어요. 무료 ${free}개, 일주일 안에 끝나는 전시 ${soon}개.`;
}

// ---- 상세 ----

const EXTERNAL_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5"/></svg>';

function detailPriceHtml(e) {
  const free = e.isFree ? '<span class="free">무료</span>' : '';
  if (!hasAmount(e)) return free || '<span class="unknown">공개된 금액 정보가 없어요. 전시 안내 페이지에서 확인하세요.</span>';
  return `${free}<ul class="lines">${priceParts(e).map((part) => `<li>${escapeHtml(part)}</li>`).join('')}</ul>`;
}

function periodHtml(e) {
  const left = leftLabel(e);
  return `${dotted(e.start)} – ${dotted(e.end)} <span class="left${left.soon ? ' soon' : ''}">${left.text}</span>`;
}

function mapLinks(venue) {
  // 네이버 지도는 주소 검색으로, 카카오맵은 좌표로 연다.
  const naver = `https://map.naver.com/p/search/${encodeURIComponent(venue.address || `${venue.name} ${venue.sigungu}`)}`;
  const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(venue.name.replaceAll(',', ' '))},${venue.lat},${venue.lng}`;
  return `<a class="btn" href="${escapeHtml(naver)}" target="_blank" rel="noopener">네이버 지도 ${EXTERNAL_ICON}</a>
    <a class="btn" href="${escapeHtml(kakao)}" target="_blank" rel="noopener">카카오맵 ${EXTERNAL_ICON}</a>`;
}

function othersHtml(e, exhibitions) {
  const others = exhibitions.filter((o) => o.venueId === e.venueId && o.seq !== e.seq);
  if (!others.length) return '';
  const rows = others.map((o) => {
    const left = leftLabel(o);
    return `<li><a href="${detailHref(o)}"><span class="o-title">${escapeHtml(o.title)}</span>
      <span class="left${left.soon ? ' soon' : ''}">${left.text}</span></a></li>`;
  }).join('');
  return `<section class="others"><h2>${escapeHtml(e.venue.name)}의 다른 전시</h2><ul>${rows}</ul></section>`;
}

export function detailHtml(e, exhibitions) {
  const { venue } = e;
  const left = leftLabel(e);
  const phone = e.phone && /\d/.test(e.phone)
    ? `<dt>문의</dt><dd><a href="tel:${escapeHtml(e.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(e.phone)}</a></dd>`
    : '';
  const address = venue.address ? `<dt>주소</dt><dd>${escapeHtml(venue.address)}</dd>` : '';
  const source = e.sourceUrl
    ? `<a class="btn primary" href="${escapeHtml(e.sourceUrl)}" target="_blank" rel="noopener">전시 안내 페이지 ${EXTERNAL_ICON}</a>`
    : '';
  const venueSite = venue.url && venue.url !== e.sourceUrl
    ? `<a class="btn" href="${escapeHtml(venue.url)}" target="_blank" rel="noopener">기관 홈페이지 ${EXTERNAL_ICON}</a>`
    : '';
  const description = e.description ? `<p class="description">${escapeHtml(e.description)}</p>` : '';

  return `
    <article class="detail">
      <div class="d-poster"><img src="${escapeHtml(e.thumbnail)}" alt="${escapeHtml(e.title)} 포스터"></div>
      <div class="d-body">
        <span class="status${left.soon ? ' soon' : ''}${e.ended ? ' ended' : ''}">${e.ended ? '종료된 전시' : e.upcoming ? '곧 시작' : e.isPermanent ? '상설 전시' : '진행 중'}</span>
        <h1>${escapeHtml(e.title)}</h1>
        <p class="venue"><a href="${venueHref(venue)}">${escapeHtml(venue.name)}</a> · ${escapeHtml(venue.sigungu)}</p>
        ${e.ended ? `<p class="ended-note">${e.end.slice(0, 4)}년 ${Number(e.end.slice(5, 7))}월 ${Number(e.end.slice(8, 10))}일에 끝난 전시예요. 아래는 전시 당시 정보예요.</p>` : ''}
        ${description}
        <dl class="d-facts">
          <dt>기간</dt><dd>${periodHtml(e)}</dd>
          <dt>관람료</dt><dd>${detailPriceHtml(e)}</dd>
          <dt>장소</dt><dd><a href="${venueHref(venue)}">${escapeHtml(venue.name)}</a></dd>
          ${address}
          ${phone}
        </dl>
        <section class="mine" id="mine" data-snap="${snapAttr(e)}">
          <h2>내 기록</h2>
          <div class="mine-body"></div>
          <p class="mine-note">기록은 이 기기의 브라우저에만 저장돼요. <a href="/me">내 전시 보기</a></p>
        </section>
        <div class="actions">${source}${venueSite}</div>
        <div class="actions">${mapLinks(venue)}</div>
        ${othersHtml(e, exhibitions)}
      </div>
    </article>`;
}
