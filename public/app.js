import { FILTERS, byEnd, cardHtml, chipsHtml, dotted, guOptionsHtml, loadExhibitions, seoulDate, summaryText } from './common.js';

// 첫 화면은 서버가 이미 그려서 보낸다(api/site.js). 여기서는 필터·정렬·위치를 붙이고, 최신 수집본으로 다시 그린다.
const state = { filter: 'now', sort: 'end', gu: '', position: null };
let exhibitions = [];

const $ = (id) => document.getElementById(id);

function haversineKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const SORTS = {
  end: byEnd,
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
  $('chips').innerHTML = chipsHtml(inGu, state.filter);

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
  let loaded;
  try {
    loaded = await loadExhibitions();
  } catch {
    // 서버가 그린 목록이 이미 있으면 그대로 둔다.
    if (!$('grid').children.length) $('summary').textContent = '전시 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.';
    return;
  }
  exhibitions = loaded.exhibitions;

  $('summary').textContent = summaryText(loaded.today, exhibitions);
  $('updated').textContent = `${dotted(seoulDate(loaded.updatedAt))} 수집.`;
  $('gu').innerHTML = guOptionsHtml(exhibitions);

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
