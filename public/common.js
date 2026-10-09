// 목록 화면과 상세 화면이 함께 쓰는 데이터 로딩과 표기 규칙.
export const SOON_DAYS = 7;
const DAY_MS = 86_400_000;

// 사용자 시간대와 무관하게 서울 날짜를 쓴다.
export function seoulToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
export const dotted = (iso) => iso.replaceAll('-', '.');

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 외부 데이터의 링크는 http(s) 만 통과시킨다.
const safeUrl = (url) => (/^https?:\/\//i.test(url ?? '') ? url : '');

export function leftLabel(e) {
  if (e.upcoming) return { text: `${e.daysToStart}일 뒤 시작`, soon: false };
  if (e.isPermanent) return { text: '상설', soon: false };
  if (e.daysLeft === 0) return { text: '오늘 종료', soon: true };
  return { text: `${e.daysLeft}일 남음`, soon: e.daysLeft <= SOON_DAYS };
}

// 가격은 자유 텍스트다. '-', '미정', '홈페이지 참고' 처럼 금액이 없는 값은 정보 없음으로 본다.
export const hasAmount = (e) => /\d/.test(e.price);
export const priceParts = (e) => e.price.split(/\s*\/\s*/).filter(Boolean);

// 확장자 없는 주소를 쓴다(vercel.json 의 cleanUrls). detail.html 로 가면 로컬 서버가 쿼리를 떼고 리다이렉트한다.
export const detailHref = (e) => `detail?seq=${encodeURIComponent(e.seq)}`;

export async function loadExhibitions() {
  // 매일 갱신되는 수집본을 먼저 찾고, 없으면(로컬 개발, 첫 수집 전) 배포에 포함된 사본을 쓴다.
  let res = await fetch('api/exhibitions').catch(() => null);
  if (!res?.ok || !res.headers.get('content-type')?.includes('json')) res = await fetch('data/exhibitions.json');
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();

  const today = seoulToday();
  const venues = new Map(data.venues.map((v) => [v.id, { ...v, url: safeUrl(v.url) }]));
  const exhibitions = data.exhibitions
    .filter((e) => e.end >= today)
    .map((e) => ({
      ...e,
      sourceUrl: safeUrl(e.sourceUrl),
      venue: venues.get(e.venueId),
      upcoming: e.start > today,
      daysLeft: daysBetween(today, e.end),
      daysToStart: daysBetween(today, e.start),
      km: null,
    }));
  return { today, updatedAt: data.updatedAt, exhibitions };
}
