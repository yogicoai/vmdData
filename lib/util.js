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
