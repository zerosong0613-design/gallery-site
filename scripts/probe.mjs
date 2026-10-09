// 인계 문서 6장의 미확인 항목을 실제 응답으로 확인한다.
//   npm run probe            → /realm2 첫 항목의 seq 로 /detail2 원본 XML 출력 + 썸네일 https 확인
//   npm run probe -- <seq>   → 지정한 seq 로 /detail2 원본 XML 출력
import { callApi, parseList } from '../lib/cultureinfo.mjs';

let seq = process.argv[2];
let thumbnail;

if (!seq) {
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const xml = await callApi('/realm2', {
    PageNo: 1, numOfrows: 1, sido: '서울', from: today, to: today, sortStdr: 1, realmCode: 'D000', serviceTp: 'A',
  });
  const { totalCount, items } = parseList(xml);
  console.log(`/realm2 정상. 오늘 진행 중 ${totalCount}건. 첫 항목 태그: ${Object.keys(items[0]).join(', ')}`);
  seq = items[0].seq;
  thumbnail = items[0].thumbnail;
}

// 요청변수 이름이 확인되지 않아 seq 로 시도한다. 결과가 비면 원본 XML 을 보고 고친다.
console.log(`\n/detail2?seq=${seq} 원본 응답:\n`);
console.log(await callApi('/detail2', { seq }));

if (thumbnail) {
  const httpsUrl = thumbnail.replace(/^http:/, 'https:');
  try {
    const res = await fetch(httpsUrl, { method: 'HEAD' });
    console.log(`\n썸네일 https: ${res.status} ${res.headers.get('content-type') ?? ''} (${httpsUrl})`);
  } catch (err) {
    console.log(`\n썸네일 https 실패: ${err.cause?.code ?? err.message} (${httpsUrl})`);
  }
}
