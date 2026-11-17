// 수집 결과를 Vercel Blob 한 곳에 덮어써 보관한다.
import { BlobNotFoundError, head } from '@vercel/blob';

export const CACHE_PATH = 'exhibitions.json';

// Blob 에 저장한 JSON 을 읽는다.
// - 파일이 아직 없거나(첫 수집 전) 토큰이 없으면(로컬) null.
// - 그 밖의 실패(네트워크, Blob 장애, 깨진 JSON)는 던진다.
//   예전에는 모든 실패를 null 로 삼켰는데, 그러면 아카이브를 잠깐 못 읽은 날
//   수집 작업이 '아카이브 없음'으로 알고 덮어써 지난 전시 기록이 통째로 사라지고,
//   화면에서는 지난 전시 페이지가 404 가 됐다. 실패를 '없음'과 구분해야 둘 다 막힌다.
export async function readBlob(path) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  let url;
  try {
    ({ url } = await head(path));
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`blob ${path} ${res.status}`);
  return res.json();
}
