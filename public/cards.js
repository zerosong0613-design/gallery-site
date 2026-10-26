// 서버가 그린 카드 목록 페이지(모아 보기·전시장·지난 전시)에 붙는 스크립트.
// 가볼래요 버튼을 살리고, 깨진 포스터는 제목으로 대신한다.
import './mine-ui.js';

// error 이벤트는 버블링하지 않아 캡처로 받는다.
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (img.tagName !== 'IMG' || !img.closest('.poster')) return;
  img.parentElement.classList.add('noimg');
  img.replaceWith(document.createTextNode(img.dataset.title ?? ''));
}, true);
