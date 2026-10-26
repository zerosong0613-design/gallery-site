import { detailHtml, dotted, loadExhibitions } from './common.js';

// 상세는 서버가 완성해서 보낸다(api/site.js). 여기서는 깨진 포스터만 치운다.
// 서버 렌더 없이 정적 파일로 열린 경우(로컬 serve)에만 브라우저에서 그린다.
const $ = (id) => document.getElementById(id);

function bindPoster() {
  $('detail').querySelector('.d-poster img')?.addEventListener('error', (ev) => ev.target.parentElement.remove());
}

async function renderInBrowser() {
  const seq = new URLSearchParams(location.search).get('seq') ?? location.pathname.split('/').pop();
  try {
    const { exhibitions, updatedAt } = await loadExhibitions();
    $('updated').textContent = `${dotted(updatedAt.slice(0, 10))} 수집.`;
    const found = exhibitions.find((e) => e.seq === seq);
    if (!found) {
      $('detail').innerHTML = '<p class="empty">끝났거나 목록에 없는 전시예요. <a href="/">진행 중인 전시 보기</a></p>';
      return;
    }
    document.title = `${found.title} — 서울 전시`;
    $('detail').innerHTML = detailHtml(found, exhibitions);
    bindPoster();
  } catch {
    $('detail').innerHTML = '<p class="empty">전시 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>';
  }
}

if ($('detail').querySelector('article')) bindPoster();
else if (!$('detail').dataset.missing) renderInBrowser();
