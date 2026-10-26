// 끝난 전시 아카이브. 매일 수집본은 '오늘부터 90일'만 담고 덮어쓰기 때문에, 끝난 전시는 다음 날 사라진다.
// 수집할 때마다 직전 수집본·새 수집본을 아카이브에 합쳐 두면, 한 번이라도 수집된 전시는 계속 남는다.
export const ARCHIVE_PATH = 'archive.json';

// 같은 전시(seq)는 나중 자료가 이긴다. firstSeen 은 처음 본 날을 유지한다.
export function mergeArchive(archive, ...datasets) {
  const venues = new Map((archive?.venues ?? []).map((v) => [v.id, v]));
  const exhibitions = new Map((archive?.exhibitions ?? []).map((e) => [e.seq, e]));
  for (const data of datasets) {
    if (!data?.exhibitions) continue;
    const seenAt = data.updatedAt ?? new Date().toISOString();
    for (const v of data.venues ?? []) venues.set(v.id, { ...venues.get(v.id), ...v });
    for (const e of data.exhibitions) {
      const prev = exhibitions.get(e.seq);
      exhibitions.set(e.seq, {
        ...prev,
        ...e,
        // 새 자료에 소개글이 비어 있으면 예전 소개글을 살린다.
        description: e.description || prev?.description || '',
        firstSeen: prev?.firstSeen ?? seenAt,
        lastSeen: seenAt > (prev?.lastSeen ?? '') ? seenAt : prev.lastSeen,
      });
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    venues: [...venues.values()],
    exhibitions: [...exhibitions.values()],
  };
}

// 화면용: 수집본에 아카이브를 합친다. 수집본(최신)이 우선.
export function withArchive(data, archive) {
  if (!archive?.exhibitions?.length) return data;
  const merged = mergeArchive(archive, data);
  return { ...data, venues: merged.venues, exhibitions: merged.exhibitions };
}
