// '내 전시' 페이지. 이 브라우저에 저장된 기록만 그린다(서버는 빈 틀만 보낸다).
import { daysBetween, detailHref, dotted, escapeHtml, period, seoulToday } from './common.js';
import * as mine from './mine.js';

const $ = (id) => document.getElementById(id);
const state = { tab: location.hash === '#wish' ? 'wish' : 'visited', editing: null };

function thumb(r) {
  return r.thumbnail
    ? `<img src="${escapeHtml(r.thumbnail)}" alt="" loading="lazy">`
    : `<span>${escapeHtml(r.title.slice(0, 12))}</span>`;
}

function leftText(r, today) {
  if (r.start > today) return { text: `${daysBetween(today, r.start)}일 뒤 시작`, soon: false };
  const left = daysBetween(today, r.end);
  if (left < 0) return { text: '끝났어요', soon: false, ended: true };
  if (left === 0) return { text: '오늘 종료', soon: true };
  return { text: `${left}일 남음`, soon: left <= 7 };
}

function rowHtml(r, today) {
  const when = r.visited
    ? `<p class="m-when">${dotted(r.visited)} 관람</p>`
    : (() => {
      const left = leftText(r, today);
      return `<p class="m-when${left.soon ? ' soon' : ''}${left.ended ? ' ended' : ''}">${left.text}</p>`;
    })();
  return `<li class="m-row"><a href="${detailHref(r)}">
      <div class="m-thumb">${thumb(r)}</div>
      <div class="m-text">
        <h2>${escapeHtml(r.title)}</h2>
        <p class="venue">${escapeHtml(r.venue)}${r.sigungu ? ` · ${escapeHtml(r.sigungu)}` : ''}</p>
        <p class="m-period">${period(r.start, r.end)}</p>
        ${when}
        ${r.memo ? `<p class="m-memo">${escapeHtml(r.memo)}</p>` : ''}
      </div></a>
      ${state.editing === r.seq ? formHtml(r, today) : actionsHtml(r, today)}</li>`;
}

// 기록 고치기·지우기를 이 페이지에서 바로 한다. 상세 페이지로 갈 필요 없이.
function actionsHtml(r, today) {
  const seq = escapeHtml(r.seq);
  if (r.visited) {
    return `<div class="m-actions">
        <button class="btn sm" type="button" data-act="edit" data-seq="${seq}">기록 고치기</button>
        <button class="btn sm" type="button" data-act="delete" data-seq="${seq}">지우기</button>
      </div>`;
  }
  return `<div class="m-actions">
      ${r.start <= today ? `<button class="btn sm" type="button" data-act="edit" data-seq="${seq}">다녀왔어요</button>` : ''}
      <button class="btn sm" type="button" data-act="delete" data-seq="${seq}">목록에서 빼기</button>
    </div>`;
}

function formHtml(r, today) {
  // 관람일은 전시 기간 안, 오늘 이전으로 제한한다.
  const max = r.end < today ? r.end : today;
  const value = r.visited ?? (max >= r.start ? max : r.start);
  return `<form class="mine-form m-form" data-seq="${escapeHtml(r.seq)}">
      <label class="field"><span>다녀온 날</span>
        <input type="date" name="date" value="${value}" min="${r.start}" max="${max}" required></label>
      <label class="field"><span>한 줄 기록 <em>(선택)</em></span>
        <textarea name="memo" rows="3" maxlength="500" placeholder="누구랑, 무엇이 좋았는지">${escapeHtml(r.memo ?? '')}</textarea></label>
      <div class="actions">
        <button class="btn primary" type="submit">저장</button>
        <button class="btn" type="button" data-act="cancel">취소</button>
      </div>
    </form>`;
}

function groupedVisited(list, today) {
  // 관람일 최신순, 연도별로 끊어 보여 준다.
  const sorted = [...list].sort((a, b) => b.visited.localeCompare(a.visited));
  const years = new Map();
  for (const r of sorted) {
    const y = r.visited.slice(0, 4);
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(r);
  }
  return [...years].map(([y, rows]) => `
    <section class="m-year"><h2 class="m-year-h">${y}년 <span>${rows.length}곳</span></h2>
      <ul class="m-list">${rows.map((r) => rowHtml(r, today)).join('')}</ul></section>`).join('');
}

function render() {
  const today = seoulToday();
  const items = mine.all();
  const visited = items.filter((r) => r.visited);
  const wish = items.filter((r) => r.wish && !r.visited);

  $('tabs').innerHTML = [
    ['visited', '다녀온 전시', visited.length],
    ['wish', '가볼 전시', wish.length],
  ].map(([id, label, n]) => `<button class="chip" type="button" data-tab="${id}" aria-pressed="${state.tab === id}">${label}<span class="n"> ${n}</span></button>`).join('');

  const thisYear = visited.filter((r) => r.visited.startsWith(today.slice(0, 4))).length;
  $('summary').textContent = visited.length
    ? `올해 ${thisYear}곳, 지금까지 ${visited.length}곳의 전시를 다녀왔어요.`
    : '다녀온 전시를 기록하면 여기에 쌓여요.';

  if (state.tab === 'visited') {
    $('list').innerHTML = visited.length
      ? groupedVisited(visited, today)
      : '<p class="empty">아직 기록이 없어요. 전시 상세에서 <strong>다녀왔어요</strong>를 눌러 남겨 보세요.</p>';
  } else {
    // 곧 끝나는 것부터. 이미 끝난 찜은 맨 뒤로.
    const sorted = [...wish].sort((a, b) => (a.end < today) - (b.end < today) || a.end.localeCompare(b.end));
    $('list').innerHTML = sorted.length
      ? `<ul class="m-list">${sorted.map((r) => rowHtml(r, today)).join('')}</ul>`
      : '<p class="empty">가볼래요를 누른 전시가 여기에 모여요. 끝나기 전에 챙겨 볼 수 있게 마감 순으로 보여 드려요.</p>';
  }
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function init() {
  if (!mine.available()) {
    $('summary').textContent = '이 브라우저에서는 기록을 저장할 수 없어요. 개인정보 보호 모드를 끄고 다시 열어 주세요.';
    return;
  }
  $('tabs').addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-tab]')?.dataset.tab;
    if (!tab) return;
    state.tab = tab;
    history.replaceState(null, '', tab === 'wish' ? '#wish' : location.pathname);
    render();
  });
  $('export').addEventListener('click', () => download(`오늘전시-기록-${seoulToday()}.json`, mine.exportJson()));
  $('import').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const added = mine.importJson(await file.text());
      $('backup-note').textContent = `불러왔어요. 새 기록 ${added}개.`;
    } catch (err) {
      $('backup-note').textContent = err.message.includes('오늘전시') ? err.message : '파일을 읽지 못했어요. 오늘전시에서 내보낸 파일인지 확인해 주세요.';
    }
    ev.target.value = '';
  });
  $('list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const { act, seq } = btn.dataset;
    if (act === 'edit') state.editing = seq;
    if (act === 'cancel') state.editing = null;
    if (act === 'delete') {
      const rec = mine.get(seq);
      const what = rec?.visited ? '이 관람 기록을 지울까요?' : '가볼 전시 목록에서 뺄까요?';
      if (!rec || !confirm(`${what}\n${rec.title}`)) return;
      state.editing = null;
      mine.remove(seq);
      return; // remove 가 change 이벤트로 다시 그린다.
    }
    render();
    if (act === 'edit') $('list').querySelector('.m-form input')?.focus();
  });
  $('list').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const rec = mine.get(ev.target.dataset.seq);
    if (!rec) return;
    const form = new FormData(ev.target);
    state.editing = null;
    mine.setVisited(rec, String(form.get('date')), String(form.get('memo') ?? '').trim());
  });
  mine.onChange(render);
  window.addEventListener('storage', render);
  render();
}

// 포스터가 깨지면 제목 앞부분으로 대신한다. error 는 버블링하지 않아 캡처로 받는다.
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (img.tagName !== 'IMG' || !img.closest('.m-thumb')) return;
  img.replaceWith(document.createTextNode(img.closest('.m-row')?.querySelector('h2')?.textContent.slice(0, 12) ?? ''));
}, true);

init();
