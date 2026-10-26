// 내 전시 기록: 가볼래요(찜)와 다녀왔어요(관람 기록).
// 로그인 없이 이 브라우저(localStorage)에만 저장한다. 서버로 보내지 않는다.
// 전시가 끝나면 목록·상세에서 사라지므로, 저장할 때 화면에 필요한 정보를 함께 떠 둔다(스냅샷).
import { seoulToday, snapOf } from './common.js';

const KEY = 'oneul-jeonsi:mine:v1';
const EVENT = 'mine:change';

export { snapOf as snapshot };

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return data && typeof data.items === 'object' ? data : { items: {} };
  } catch {
    return { items: {} };
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 사파리 개인정보 보호 모드 등에서는 저장이 막힌다. 화면은 그대로 둔다.
    return false;
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  return true;
}

export const available = () => {
  try {
    const probe = `${KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
};

export const all = () => Object.values(read().items);
export const get = (seq) => read().items[String(seq)] ?? null;
export const onChange = (fn) => window.addEventListener(EVENT, fn);

function update(e, patch) {
  const data = read();
  const seq = String(e.seq);
  const prev = data.items[seq] ?? { savedAt: new Date().toISOString(), wish: false, visited: null, memo: '' };
  // 최신 정보로 스냅샷을 갱신하되, 이미 끝난 전시(e 가 스냅샷)도 그대로 받는다.
  const snap = e.venue && typeof e.venue === 'object' ? snapOf(e) : { ...e, seq };
  const next = { ...prev, ...snap, ...patch, updatedAt: new Date().toISOString() };
  if (!next.wish && !next.visited) delete data.items[seq];
  else data.items[seq] = next;
  return write(data) ? data.items[seq] ?? null : prev;
}

export const toggleWish = (e) => update(e, { wish: !get(e.seq)?.wish });
export const setVisited = (e, date = seoulToday(), memo = get(e.seq)?.memo ?? '') =>
  update(e, { visited: date, memo: String(memo).slice(0, 500), wish: false });
export const clearVisited = (e) => update(e, { visited: null, memo: '' });
export const remove = (seq) => {
  const data = read();
  delete data.items[String(seq)];
  write(data);
};

// ---- 백업 ----

export function exportJson() {
  return JSON.stringify({ app: 'oneul-jeonsi', version: 1, exportedAt: new Date().toISOString(), ...read() }, null, 2);
}

// 기존 기록과 합친다. 같은 전시는 나중에 고친 쪽을 남긴다.
export function importJson(text) {
  const incoming = JSON.parse(text);
  if (!incoming || typeof incoming.items !== 'object') throw new Error('오늘전시 백업 파일이 아니에요.');
  const data = read();
  let added = 0;
  for (const [seq, item] of Object.entries(incoming.items)) {
    if (!item || typeof item.title !== 'string') continue;
    const cur = data.items[seq];
    if (!cur || (item.updatedAt ?? '') > (cur.updatedAt ?? '')) {
      data.items[seq] = { ...item, seq };
      if (!cur) added += 1;
    }
  }
  write(data);
  return added;
}
