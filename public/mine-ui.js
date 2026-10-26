// 카드의 '가볼래요' 버튼과 상세의 '내 기록' 패널. 어느 페이지에서든 이 파일 하나로 붙는다.
// 버튼·패널은 서버가 data-snap(전시 스냅샷 JSON)과 함께 그려 두고, 여기서 상태를 입히고 클릭을 받는다.
import { escapeHtml, seoulToday } from './common.js';
import * as mine from './mine.js';

const parseSnap = (el) => {
  try {
    return JSON.parse(el.dataset.snap);
  } catch {
    return null;
  }
};

// ---- 카드 버튼 ----

export function syncSaveButtons(root = document) {
  for (const btn of root.querySelectorAll('.save[data-snap]')) {
    const rec = mine.get(parseSnap(btn)?.seq);
    const state = rec?.visited ? 'visited' : rec?.wish ? 'wish' : 'none';
    btn.dataset.state = state;
    btn.setAttribute('aria-pressed', String(state !== 'none'));
    btn.setAttribute('aria-label', state === 'visited' ? '다녀온 전시' : state === 'wish' ? '가볼래요 해제' : '가볼래요');
    btn.title = btn.getAttribute('aria-label');
  }
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.save[data-snap]');
  if (!btn) return;
  ev.preventDefault();
  const snap = parseSnap(btn);
  if (!snap) return;
  // 이미 다녀온 전시는 카드에서 지우지 않는다. 기록 수정은 상세나 '내 전시'에서.
  if (mine.get(snap.seq)?.visited) {
    location.href = `/exhibitions/${encodeURIComponent(snap.seq)}#mine`;
    return;
  }
  mine.toggleWish(snap);
});

// ---- 상세 패널 ----

const longDate = (iso) => `${Number(iso.slice(0, 4))}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

function panelHtml(snap, rec, editing) {
  if (editing) {
    const today = seoulToday();
    // 관람일은 전시 기간 안, 오늘 이전으로 제한한다.
    const max = snap.end < today ? snap.end : today;
    const value = rec?.visited ?? (max >= snap.start ? max : snap.start);
    return `
      <form class="mine-form">
        <label class="field"><span>다녀온 날</span>
          <input type="date" name="date" value="${value}" min="${snap.start}" max="${max}" required></label>
        <label class="field"><span>한 줄 기록 <em>(선택)</em></span>
          <textarea name="memo" rows="3" maxlength="500" placeholder="누구랑, 무엇이 좋았는지">${escapeHtml(rec?.memo ?? '')}</textarea></label>
        <div class="actions">
          <button class="btn primary" type="submit">저장</button>
          <button class="btn" type="button" data-act="cancel">취소</button>
        </div>
      </form>`;
  }
  if (rec?.visited) {
    return `
      <p class="mine-done"><strong>${longDate(rec.visited)}</strong>에 다녀왔어요.</p>
      ${rec.memo ? `<p class="mine-memo">${escapeHtml(rec.memo)}</p>` : ''}
      <div class="actions">
        <button class="btn" type="button" data-act="edit">기록 고치기</button>
        <button class="btn" type="button" data-act="clear">기록 지우기</button>
      </div>`;
  }
  const started = snap.start <= seoulToday();
  return `
    <div class="actions">
      <button class="btn${rec?.wish ? ' on' : ''}" type="button" data-act="wish" aria-pressed="${Boolean(rec?.wish)}">
        ${rec?.wish ? '가볼래요 ✓' : '가볼래요'}</button>
      ${started ? '<button class="btn" type="button" data-act="edit">다녀왔어요</button>' : ''}
    </div>`;
}

function mountPanel(panel) {
  const snap = parseSnap(panel);
  if (!snap) return;
  const body = panel.querySelector('.mine-body');
  let editing = false;
  const render = () => {
    body.innerHTML = panelHtml(snap, mine.get(snap.seq), editing);
  };

  if (!mine.available()) {
    body.innerHTML = '<p class="mine-note">이 브라우저에서는 기록을 저장할 수 없어요. 개인정보 보호 모드를 끄고 다시 열어 주세요.</p>';
    return;
  }

  panel.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'wish') mine.toggleWish(snap);
    if (act === 'edit') editing = true;
    if (act === 'cancel') editing = false;
    if (act === 'clear' && confirm('이 전시의 관람 기록을 지울까요?')) mine.clearVisited(snap);
    render();
    if (act === 'edit') body.querySelector('input')?.focus();
  });
  panel.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    mine.setVisited(snap, String(form.get('date')), String(form.get('memo') ?? '').trim());
    editing = false;
    render();
  });
  render();
}

// ---- 시작 ----

mine.onChange(() => syncSaveButtons());
// 다른 탭에서 바꾼 것도 반영한다.
window.addEventListener('storage', () => syncSaveButtons());
syncSaveButtons();
document.querySelectorAll('.mine[data-snap]').forEach(mountPanel);

