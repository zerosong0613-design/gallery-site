import { XMLParser } from 'fast-xml-parser';

const ENDPOINT = 'https://apis.data.go.kr/B553457/cultureinfo';
const PAGE_SIZE = 100;
const PERMANENT_DAYS = 365;

const parser = new XMLParser({ parseTagValue: false, trimValues: true });

function serviceKey() {
  const key = process.env.CULTUREINFO_SERVICE_KEY;
  if (!key) {
    throw new Error('CULTUREINFO_SERVICE_KEY 환경변수가 없습니다. .env.example 을 참고해 .env 를 만드세요.');
  }
  // 포털의 Encoding 키는 이미 퍼센트 인코딩돼 있다. 한 번 더 인코딩하면 인증에 실패한다.
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

export async function callApi(path, params) {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`${ENDPOINT}${path}?serviceKey=${serviceKey()}&${query}`);
  const xml = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${xml.slice(0, 200)}`);
  return xml;
}

export function parseList(xml) {
  const doc = parser.parse(xml);
  const header = findKey(doc, 'resultCode');
  if (header !== '00') {
    throw new Error(`API 오류 ${header ?? '(resultCode 없음)'}: ${findKey(doc, 'resultMsg') ?? findKey(doc, 'returnAuthMsg') ?? xml.slice(0, 200)}`);
  }
  const items = findKey(doc, 'item') ?? [];
  return {
    totalCount: Number(findKey(doc, 'totalCount') ?? 0),
    items: Array.isArray(items) ? items : [items],
  };
}

// 응답 래퍼 깊이가 문서화돼 있지 않아 이름으로 찾는다.
function findKey(node, name) {
  if (node === null || typeof node !== 'object') return undefined;
  if (name in node) return node[name];
  for (const child of Object.values(node)) {
    const found = findKey(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

export async function fetchSeoulExhibitions(from, to) {
  const all = [];
  for (let page = 1; ; page++) {
    const xml = await callApi('/realm2', {
      PageNo: page,
      numOfrows: PAGE_SIZE,
      sido: '서울',
      from,
      to,
      sortStdr: 1,
      realmCode: 'D000',
      serviceTp: 'A',
    });
    const { totalCount, items } = parseList(xml);
    all.push(...items);
    if (items.length === 0 || all.length >= totalCount) return all;
  }
}

// 초당 요청 제한이 있어(HTTP 429) 상세는 간격을 두고 한 건씩 부른다.
const DETAIL_INTERVAL_MS = 300;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchDetail(seq) {
  for (let attempt = 0; ; attempt++) {
    try {
      return parseList(await callApi('/detail2', { seq })).items[0];
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// 목록 항목에 /detail2 필드(price, url, phone, placeUrl, placeAddr, placeSeq)를 덧붙인다.
// 상세 조회가 끝내 실패한 항목은 목록 필드만으로 남긴다.
export async function withDetails(items) {
  const merged = [];
  let failed = 0;
  for (const item of items) {
    try {
      merged.push({ ...item, ...(await fetchDetail(item.seq)) });
    } catch {
      merged.push(item);
      failed++;
    }
    await sleep(DETAIL_INTERVAL_MS);
  }
  return { items: merged, failed };
}

const WINDOW_DAYS = 90;

function kstYmd(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date).replaceAll('-', '');
}

// 오늘부터 90일 구간의 서울 전시를 수집해 캐시 JSON 형태로 돌려준다.
export async function collect(now = new Date()) {
  const from = kstYmd(now);
  const to = kstYmd(new Date(now.getTime() + WINDOW_DAYS * 86_400_000));
  const { items, failed } = await withDetails(await fetchSeoulExhibitions(from, to));
  // 빈 응답으로 기존 캐시를 덮어쓰지 않도록 막는다.
  if (items.length === 0) throw new Error(`${from}~${to} 구간에 전시가 0건입니다.`);
  return { from, to, failed, data: { updatedAt: now.toISOString(), ...normalize(items) } };
}

const NAMED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", middot: '·', deg: '°', nbsp: ' ', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
}

function daysBetween(start, end) {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}

// 목록(+상세) 항목을 인계 문서 5장의 스키마로 정제한다.
export function normalize(items) {
  const venues = new Map();
  const exhibitions = [];

  for (const item of items) {
    // gpsX = 경도, gpsY = 위도
    const lng = Number(item.gpsX);
    const lat = Number(item.gpsY);
    // 상세 조회가 실패해 placeSeq 가 없으면 좌표를 장소 키로 쓴다. 같은 장소는 좌표가 완전히 같다.
    const venueId = item.placeSeq ? String(item.placeSeq) : `${lat},${lng}`;
    if (!venues.has(venueId)) {
      venues.set(venueId, {
        id: venueId,
        name: decodeEntities(item.place),
        lat,
        lng,
        sigungu: decodeEntities(item.sigungu),
        address: decodeEntities(item.placeAddr),
        url: String(item.placeUrl ?? ''),
      });
    }

    const start = isoDate(item.startDate);
    const end = isoDate(item.endDate);
    const price = decodeEntities(item.price);
    exhibitions.push({
      seq: String(item.seq),
      title: decodeEntities(item.title),
      start,
      end,
      venueId,
      // culture.go.kr 썸네일은 https 로도 열린다. http 로 두면 혼합 콘텐츠로 차단된다.
      thumbnail: String(item.thumbnail ?? item.imgUrl ?? '').replace(/^http:/, 'https:'),
      price,
      isFree: price.includes('무료'),
      isPermanent: daysBetween(start, end) > PERMANENT_DAYS,
      sourceUrl: String(item.url ?? ''),
      phone: decodeEntities(item.phone),
    });
  }

  return { venues: [...venues.values()], exhibitions };
}
