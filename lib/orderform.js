// 발주요청서(orderForm) → 정산 발주건(order) 변환 (서버 공용)
const uid = () => Date.now() + '_' + Math.random().toString(36).slice(2, 7);

export function formToOrder(form) {
  const common = form.common || {};
  const sheets = form.sheets || [];
  const store = common.place || form.title || '불러온 발주';
  const hay = JSON.stringify(common) + JSON.stringify(sheets.map((s) => s.name));
  const isPopup = /팝업|pop[ -]?up/i.test(hay);
  const rows = [];
  sheets.forEach((sh) => {
    (sh.rows || []).forEach((rw) => {
      rows.push({
        item: `${sh.name || ''} ${rw.gu || ''}`.trim(),
        qty: Number(rw.qty) || 0,
        price: Number(rw.price) || 0,
      });
    });
  });
  return {
    id: uid(),
    type: isPopup ? 'popup' : 'promo',
    name: store || '불러온 발주',
    store,
    rows: rows.length ? rows : [{ item: '', qty: 1, price: 0 }],
    sourceFormId: form._id?.toHexString?.() || String(form._id),
  };
}
