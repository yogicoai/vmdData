// 공용 유틸 (클라이언트/서버 공용 — 브라우저 전용 API 금지)

export const fmt = (n) => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');

// 한 행의 금액: 금액(amt)을 직접 입력했으면 그 값 우선, 아니면 수량×단가
export const lineAmt = (r) => {
  const a = r?.amt;
  if (a !== undefined && a !== null && a !== '' && !Number.isNaN(Number(a))) return Number(a) || 0;
  return (Number(r?.qty) || 0) * (Number(r?.price) || 0);
};

export const orderTotal = (o) =>
  (o?.rows || []).reduce((a, r) => a + lineAmt(r), 0);

export const sumBy = (orders, type) =>
  (orders || []).filter((o) => o.type === type).reduce((a, o) => a + orderTotal(o), 0);

// ── 발주 양식 2종 모델 ──
// 프로모션 규격 프리셋 (편집 가능 기본값)
export const PROMO_PRESET = [
  { key: 'a5', name: 'A5', size: '150*210', price: 2000 },
  { key: 'a4', name: 'A4', size: '210*297', price: 4000 },
  { key: 'a3', name: 'A3', size: '297*420', price: 7000 },
  { key: 'a2', name: 'A2', size: '420*594', price: 9000 },
  { key: 'a2l', name: 'A2 긴형', size: '420*610', price: 9000 },
  { key: 'hang', name: '행잉 배너 양면형', size: '990*550', price: 37000 },
  { key: 'delivery', name: '택배', size: '-', price: 4000, fee: true },
];

// 프로모션: 한 매장 row의 정산액 = Σ(규격 수량 × 단가)  (택배 포함)
export const promoStoreTotal = (store, specs) =>
  (specs || []).reduce((a, sp) => a + (Number(store?.qty?.[sp.key]) || 0) * (Number(sp.price) || 0), 0);
// 프로모션: 매장 품목 수량 = Σ 규격 수량 (fee=택배 제외)
export const promoStoreQty = (store, specs) =>
  (specs || []).reduce((a, sp) => a + (sp.fee ? 0 : (Number(store?.qty?.[sp.key]) || 0)), 0);

// 발주 1건 총액 (프로모션=매장합, 팝업=부위금액합, 레거시=rows)
export function orderAmount(o) {
  if (!o) return 0;
  if (o.type === 'promo' && Array.isArray(o.stores)) return o.stores.reduce((a, s) => a + promoStoreTotal(s, o.specs || []), 0);
  if (o.type === 'popup' && Array.isArray(o.parts)) return o.parts.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return orderTotal(o);
}

export const sumAmount = (orders, type) =>
  (orders || []).filter((o) => o.type === type).reduce((a, o) => a + orderAmount(o), 0);

// 매장별 집계 (프로모션 발주는 매장별로 explode)
export function settleByStore(orders) {
  const map = {};
  const add = (name, type, amt) => {
    const s = (name && String(name).trim()) || '(매장 미지정)';
    if (!map[s]) map[s] = { store: s, promo: 0, popup: 0 };
    map[s][type] += amt;
  };
  (orders || []).forEach((o) => {
    if (o.type === 'promo' && Array.isArray(o.stores)) {
      o.stores.forEach((st) => add(st.name, 'promo', promoStoreTotal(st, o.specs || [])));
    } else if (o.type === 'popup' && Array.isArray(o.parts)) {
      add(o.store, 'popup', o.parts.reduce((a, p) => a + (Number(p.amount) || 0), 0));
    } else {
      add(o.store, o.type === 'popup' ? 'popup' : 'promo', orderAmount(o));
    }
  });
  return Object.values(map).filter((r) => r.promo || r.popup);
}

// Mongo 문서를 클라이언트로 보내기 전 _id 등을 직렬화
export function serialize(doc) {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.map(serialize);
  if (typeof doc === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      if (v && typeof v === 'object' && typeof v.toHexString === 'function') {
        out[k] = v.toHexString(); // ObjectId
      } else if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (v && typeof v === 'object') {
        out[k] = serialize(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return doc;
}

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
