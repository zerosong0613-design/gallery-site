const SOON_DAYS = 7;
const DAY_MS = 86_400_000;

const FILTERS = [
  { id: 'now', label: '진행 중', test: (e) => !e.upcoming },
  { id: 'soon', label: '곧 끝나요', test: (e) => !e.upcoming && !e.isPermanent && e.daysLeft <= SOON_DAYS },
  { id: 'free', label: '무료', test: (e) => !e.upcoming && e.isFree },
  { id: 'permanent', label: '상설', test: (e) => !e.upcoming && e.isPermanent },
  { id: 'upcoming', label: '곧 시작', test: (e) => e.upcoming },
];

const state = { filter: 'now', sort: 'end', gu: '', position: null };
let exhibitions = [];

const $ = (id) => document.getElementById(id);

// 사용자 시간대와 무관하게 서울 날짜를 쓴다.
function seoulToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const dotted = (iso) => iso.replaceAll('-', '.');
// 같은 해에 끝나면 종료일의 연도를 생략한다.
const period = (start, end) => `${dotted(start)} – ${dotted(start.slice(0, 4) === end.slice(0, 4) ? end.slice(5) : end)}`;

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function haversineKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const formatKm = (km) => (km < 1 ? `${Math.round(km * 100) * 10}m` : `${km.toFixed(1)}km`);

function leftLabel(e) {
  if (e.upcoming) return { text: `${e.daysToStart}일 뒤 시작`, soon: false };
  if (e.isPermanent) return { text: '상설', soon: false };
  if (e.daysLeft === 0) return { text: '오늘 종료', soon: true };
  return { text: `${e.daysLeft}일 남음`, soon: e.daysLeft <= SOON_DAYS };
}

// 가격은 자유 텍스트다. '-', '미정', '홈페이지 참고' 같은 값은 정보 없음으로 본다.
function priceHtml(e) {
  const price = e.price.replace(/\s*\/\s*/g, ' · ');
  if (!/\d/.test(price) && !e.isFree) return '<span class="unknown">기관 홈페이지에서 확인</span>';
  if (e.isFree && !/\d/.test(price)) return '<span class="free">무료</span>';
  return `<span class="price">${e.isFree ? '<span class="free">무료</span> ' : ''}${escapeHtml(price)}</span>`;
}

function cardHtml(e) {
  const left = leftLabel(e);
  const href = e.sourceUrl || e.venue.url;
  const distance = e.km == null ? '' : ` · ${formatKm(e.km)}`;
  const body = `
    <div class="poster">
      <img src="${escapeHtml(e.thumbnail)}" alt="" loading="lazy" data-title="${escapeHtml(e.title)}">
      <span class="badge${left.soon ? ' soon' : ''}">${left.text}</span>
    </div>
    <h2>${escapeHtml(e.title)}</h2>
    <p class="venue">${escapeHtml(e.venue.name)} · ${escapeHtml(e.venue.sigungu)}${distance}</p>
    <dl class="facts">
      <dt>기간</dt><dd>${period(e.start, e.end)}</dd>
      <dt>관람료</dt><dd>${priceHtml(e)}</dd>
    </dl>`;
  return `<li class="card">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${body}</a>` : body}</li>`;
}

const SORTS = {
  // 상설은 종료일이 의미가 없으므로 뒤로 보낸다.
  end: (a, b) => a.isPermanent - b.isPermanent || a.end.localeCompare(b.end),
  new: (a, b) => b.start.localeCompare(a.start),
  near: (a, b) => a.km - b.km,
};

function visible() {
  const filter = FILTERS.find((f) => f.id === state.filter);
  const list = exhibitions.filter((e) => filter.test(e) && (!state.gu || e.venue.sigungu === state.gu));
  if (state.filter === 'upcoming' && state.sort !== 'near') return list.sort((a, b) => a.start.localeCompare(b.start));
  return list.sort(SORTS[state.sort]);
}

function render() {
  const inGu = exhibitions.filter((e) => !state.gu || e.venue.sigungu === state.gu);
  $('chips').innerHTML = FILTERS.map((f) => {
    const count = inGu.filter(f.test).length;
    return `<button class="chip" type="button" data-filter="${f.id}" aria-pressed="${f.id === state.filter}">${f.label}<span class="n"> ${count}</span></button>`;
  }).join('');

  const list = visible();
  $('grid').innerHTML = list.length
    ? list.map(cardHtml).join('')
    : '<li class="empty">조건에 맞는 전시가 없어요. 필터를 바꿔 보세요.</li>';
}

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

async function onSortChange(value) {
  $('notice').textContent = '';
  if (value === 'near' && !state.position) {
    try {
      // 위치는 이 브라우저 안에서 거리 계산에만 쓰고 서버로 보내지 않는다.
      state.position = await locate();
      for (const e of exhibitions) e.km = haversineKm(state.position, e.venue);
    } catch {
      $('notice').textContent = '위치를 확인할 수 없어요. 지역을 골라서 찾아보세요.';
      $('sort').value = state.sort;
      return;
    }
  }
  state.sort = value;
  render();
}

async function init() {
  let data;
  try {
    // 매일 갱신되는 수집본을 먼저 찾고, 없으면(로컬 개발, 첫 수집 전) 배포에 포함된 사본을 쓴다.
    let res = await fetch('api/exhibitions').catch(() => null);
    if (!res?.ok || !res.headers.get('content-type')?.includes('json')) res = await fetch('data/exhibitions.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $('summary').textContent = '전시 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.';
    return;
  }

  const today = seoulToday();
  const venues = new Map(data.venues.map((v) => [v.id, v]));
  exhibitions = data.exhibitions
    .filter((e) => e.end >= today)
    .map((e) => ({
      ...e,
      venue: venues.get(e.venueId),
      upcoming: e.start > today,
      daysLeft: daysBetween(today, e.end),
      daysToStart: daysBetween(today, e.start),
      km: null,
    }));

  const [y, m, d] = today.split('-').map(Number);
  const ongoing = exhibitions.filter((e) => !e.upcoming);
  $('summary').textContent = `${y}년 ${m}월 ${d}일, 서울에서 ${ongoing.length}개 전시가 열리고 있어요.`;
  $('updated').textContent = `${dotted(data.updatedAt.slice(0, 10))} 수집.`;

  const guCounts = new Map();
  for (const e of ongoing) guCounts.set(e.venue.sigungu, (guCounts.get(e.venue.sigungu) ?? 0) + 1);
  $('gu').insertAdjacentHTML(
    'beforeend',
    [...guCounts].sort((a, b) => b[1] - a[1]).map(([gu, n]) => `<option value="${escapeHtml(gu)}">${escapeHtml(gu)} ${n}</option>`).join(''),
  );

  $('chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    render();
  });
  $('sort').addEventListener('change', (ev) => onSortChange(ev.target.value));
  $('gu').addEventListener('change', (ev) => {
    state.gu = ev.target.value;
    render();
  });
  // 썸네일이 깨지면 제목으로 대신한다. error 이벤트는 버블링하지 않아 캡처로 받는다.
  $('grid').addEventListener('error', (ev) => {
    if (ev.target.tagName !== 'IMG') return;
    const poster = ev.target.parentElement;
    poster.classList.add('noimg');
    ev.target.replaceWith(document.createTextNode(ev.target.dataset.title));
  }, true);

  render();
}

init();
