// 서울 전시 목록을 수집해 public/data/exhibitions.json 으로 저장한다.
// 배포본은 api/collect.js 가 Blob 에 저장한 최신본을 쓰고, 이 파일은 로컬 개발과 첫 배포의 대체 데이터다.
import { mkdir, writeFile } from 'node:fs/promises';
import { collect } from '../lib/cultureinfo.mjs';

const OUT = new URL('../public/data/exhibitions.json', import.meta.url);

const { from, to, failed, data } = await collect();

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data, null, 2));

const today = `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}`;
const missingCoords = data.venues.filter((v) => !Number.isFinite(v.lat) || !Number.isFinite(v.lng)).length;
console.log(`${from}~${to}: 전시 ${data.exhibitions.length}건, 장소 ${data.venues.length}곳`);
console.log(`상세 조회 실패 ${failed}건, 가격 있음 ${data.exhibitions.filter((e) => e.price).length}건, 무료 ${data.exhibitions.filter((e) => e.isFree).length}건`);
console.log(`이미 시작 ${data.exhibitions.filter((e) => e.start <= today).length}건, 시작 예정 ${data.exhibitions.filter((e) => e.start > today).length}건`);
console.log(`상설(1년 초과) ${data.exhibitions.filter((e) => e.isPermanent).length}건, 좌표 누락 장소 ${missingCoords}곳`);
