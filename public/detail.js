import { detailHref, dotted, escapeHtml, hasAmount, leftLabel, loadExhibitions, priceParts } from './common.js';

const $ = (id) => document.getElementById(id);

const EXTERNAL_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5"/></svg>';

function priceHtml(e) {
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
  return `<a class="btn" href="${naver}" target="_blank" rel="noopener">네이버 지도 ${EXTERNAL_ICON}</a>
    <a class="btn" href="${kakao}" target="_blank" rel="noopener">카카오맵 ${EXTERNAL_ICON}</a>`;
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

function render(e, exhibitions) {
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

  document.title = `${e.title} — 서울 전시`;
  $('detail').innerHTML = `
    <article class="detail">
      <div class="d-poster"><img src="${escapeHtml(e.thumbnail)}" alt="${escapeHtml(e.title)} 포스터"></div>
      <div class="d-body">
        <span class="status${left.soon ? ' soon' : ''}">${e.upcoming ? '곧 시작' : e.isPermanent ? '상설 전시' : '진행 중'}</span>
        <h1>${escapeHtml(e.title)}</h1>
        <p class="venue">${escapeHtml(venue.name)} · ${escapeHtml(venue.sigungu)}</p>
        ${description}
        <dl class="d-facts">
          <dt>기간</dt><dd>${periodHtml(e)}</dd>
          <dt>관람료</dt><dd>${priceHtml(e)}</dd>
          <dt>장소</dt><dd>${escapeHtml(venue.name)}</dd>
          ${address}
          ${phone}
        </dl>
        <div class="actions">${source}${venueSite}</div>
        <div class="actions">${mapLinks(venue)}</div>
        ${othersHtml(e, exhibitions)}
      </div>
    </article>`;

  $('detail').querySelector('.d-poster img').addEventListener('error', (ev) => ev.target.parentElement.remove());
}

async function init() {
  const seq = new URLSearchParams(location.search).get('seq');
  try {
    const { exhibitions, updatedAt } = await loadExhibitions();
    $('updated').textContent = `${dotted(updatedAt.slice(0, 10))} 수집.`;
    const found = exhibitions.find((e) => e.seq === seq);
    if (found) return render(found, exhibitions);
    $('detail').innerHTML = '<p class="empty">끝났거나 목록에 없는 전시예요. <a href="./">진행 중인 전시 보기</a></p>';
  } catch {
    $('detail').innerHTML = '<p class="empty">전시 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>';
  }
}

init();
