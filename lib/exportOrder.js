// 발주 1건 → 원본 xlsx 양식(프로모션/팝업) 그대로 다운로드
import { promoStoreTotal, promoStoreQty } from './util';

const N = (v) => Number(v) || 0;

function download(wb, filename) {
  return import('xlsx').then((XLSX) => XLSX.writeFile(wb, filename));
}

// ── 프로모션: 매장 × 규격 수량 매트릭스 ──
export async function exportPromoXlsx(order, cfg) {
  const XLSX = await import('xlsx');
  const specs = order.specs || [];
  const stores = order.stores || [];
  const title = `■ ${cfg?.company ? cfg.company.replace(/\(.*?\)/g, '').trim() || '요기보' : '요기보'} - ${order.name || '프로모션'}`;
  const data = [];
  data.push([title]);
  data.push([]);
  data.push(['1. 발주요청일', '', order.orderDate || '']);
  data.push(['2. 매장도착요청일', '', order.arriveDate || '']);
  data.push(['3. 담당자', '', cfg?.sender || '']);
  data.push(['4. 발주 요청내역']);
  // 헤더 3줄: 규격명 / 사이즈 / 단가
  data.push(['매장명', '구분', '특이사항', ...specs.map((s) => s.name), '매장별 수량', '매장별 정산']);
  data.push(['', '', '', ...specs.map((s) => s.size || ''), '', '']);
  data.push(['', '', '단가', ...specs.map((s) => N(s.price)), '', '']);
  // 매장 행
  stores.forEach((st) => {
    data.push([st.name || '', st.category || '', st.note || '', ...specs.map((s) => N(st.qty?.[s.key])), promoStoreQty(st, specs), promoStoreTotal(st, specs)]);
  });
  // 합계
  const specSums = specs.map((s) => stores.reduce((a, st) => a + N(st.qty?.[s.key]), 0));
  const grandQty = stores.reduce((a, st) => a + promoStoreQty(st, specs), 0);
  const grandAmt = stores.reduce((a, st) => a + promoStoreTotal(st, specs), 0);
  data.push(['합계', '', '', ...specSums, grandQty, grandAmt]);
  // 이미지 URL
  if ((order.images || []).length) { data.push([]); data.push(['발주 이미지']); order.images.forEach((u) => data.push([u])); }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const lastCol = 5 + specs.length; // 0-index of 매장별정산
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
  ws['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 12 }, ...specs.map(() => ({ wch: 9 })), { wch: 10 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (order.name || '프로모션').slice(0, 28));
  return download(wb, `${(order.name || '프로모션').replace(/\s/g, '_')}_프로모션발주.xlsx`);
}

// ── 팝업: 부위별 시트 ──
export async function exportPopupXlsx(order, cfg) {
  const XLSX = await import('xlsx');
  const parts = order.parts || [];
  const company = cfg?.company ? cfg.company.replace(/\(.*?\)/g, '').trim() || '요기보' : '요기보';
  const title = `■ ${company} - ${order.store || '팝업'}`;
  const wb = XLSX.utils.book_new();
  (parts.length ? parts : [{ name: '부위' }]).forEach((pt, idx) => {
    const data = [];
    data.push([title]);
    data.push([]);
    data.push(['1. 발주요청일', '', order.orderDate || '']);
    data.push(['2. 담당자', '', cfg?.sender || '']);
    data.push(['3. 발주 요청내역']);
    data.push(['구분', '내용', '', '', '비고']);
    data.push(['위치', order.store || '', '', '', '-']);
    data.push(['그래픽 부착 부위', pt.attach || '', '', '', '-']);
    data.push(['제작 스펙', pt.spec || '', '', '', '-']);
    data.push(['사이즈', '구분', '출력 사이즈(여유분 포함)', '실측 사이즈', '수량']);
    (pt.sizes || []).forEach((s) => data.push(['', s.gu || '', s.out || '', s.real || '', N(s.qty)]));
    data.push(['금액', N(pt.amount)]);
    if ((pt.images || []).length) { data.push([]); data.push(['발주 이미지']); pt.images.forEach((u) => data.push([u])); }
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 8 }];
    const sn = (pt.name || `부위${idx + 1}`).slice(0, 28).replace(/[\\/?*[\]:]/g, ' ');
    XLSX.utils.book_append_sheet(wb, ws, sn || `부위${idx + 1}`);
  });
  return download(wb, `${(order.store || '팝업').replace(/\s/g, '_')}_팝업발주.xlsx`);
}
