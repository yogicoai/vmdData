// 공용 유틸 (클라이언트/서버 공용 — 브라우저 전용 API 금지)

export const fmt = (n) => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');

export const orderTotal = (o) =>
  (o?.rows || []).reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

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
