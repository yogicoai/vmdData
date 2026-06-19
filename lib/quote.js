// 견적서 엑셀 → 금액 항목 추출
// 2단계: ① 헤더(수량/단가/금액 열) 인식 기반  ② 실패 시 "수량×단가=금액" 패턴 fallback

const RE_QTY = /수\s*량|수량|qty|개수|q'?ty/i;
const RE_PRICE = /단\s*가|단가|unit|u\/?price|unitprice/i;
const RE_AMT = /금\s*액|금액|공급가|합계금액|amount|amt|supply|price$/i;
const RE_ITEM = /품\s*목|항목|품명|내역|구분|item|name|description|desc|규격/i;
const RE_SKIP_LABEL = /견적|합계|소계|공급가액|vat|부가|비고|사이즈|의뢰|아래|총\s*계|total|기타|단위/i;

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,\s₩원]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

// ── 헤더 기반 추출 ──
function extractByHeader(rows) {
  let headerIdx = -1, colQty = -1, colPrice = -1, colAmt = -1, colItem = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i]; if (!row) continue;
    let q = -1, p = -1, a = -1, it = -1;
    row.forEach((cell, ci) => {
      const s = typeof cell === 'string' ? cell.trim() : '';
      if (!s) return;
      if (q < 0 && RE_QTY.test(s)) q = ci;
      else if (p < 0 && RE_PRICE.test(s)) p = ci;
      else if (a < 0 && RE_AMT.test(s)) a = ci;
      if (it < 0 && RE_ITEM.test(s)) it = ci;
    });
    if (q >= 0 && p >= 0 && a >= 0) {
      headerIdx = i; colQty = q; colPrice = p; colAmt = a; colItem = it;
      break;
    }
  }
  if (headerIdx < 0) return null;

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]; if (!row) continue;
    const qty = toNum(row[colQty]);
    const price = toNum(row[colPrice]);
    let amt = toNum(row[colAmt]);
    // 품목명: 지정 열 우선, 없으면 가장 왼쪽 텍스트 셀
    let label = '';
    if (colItem >= 0 && typeof row[colItem] === 'string') label = row[colItem].trim();
    if (!label) {
      for (let ci = 0; ci < row.length; ci++) {
        const c = row[ci];
        if (typeof c === 'string' && c.trim() && !RE_SKIP_LABEL.test(c)) { label = c.trim(); break; }
      }
    }
    if (RE_SKIP_LABEL.test(label) && !(qty > 0)) continue; // 합계/소계 행 스킵
    if (!(qty > 0) && !(amt > 0)) continue;
    if (!Number.isFinite(amt) || amt <= 0) {
      if (qty > 0 && price > 0) amt = qty * price; else continue;
    }
    items.push({
      item: label || '(항목명 없음)',
      qty: qty > 0 ? qty : 1,
      price: price > 0 ? price : (qty > 0 ? Math.round(amt / qty) : amt),
      amt: Math.round(amt),
    });
  }
  return items.length ? items : null;
}

// ── 패턴 fallback (기존 로직) ──
function extractByPattern(rows) {
  const items = [];
  rows.forEach((row) => {
    if (!row) return;
    const nums = []; let label = '';
    row.forEach((cell, ci) => {
      if (typeof cell === 'string' && cell.trim() && !label && ci < 6 && !RE_SKIP_LABEL.test(cell) && !/수량|단가|금액|공급/.test(cell)) {
        label = cell.trim();
      }
      const n = toNum(cell);
      if (Number.isFinite(n) && n > 0) nums.push(n);
    });
    if (nums.length >= 3) {
      for (let a = 0; a < nums.length - 2; a++)
        for (let b = a + 1; b < nums.length - 1; b++)
          for (let c = b + 1; c < nums.length; c++) {
            if (Math.abs(nums[a] * nums[b] - nums[c]) < 1 && nums[a] < 10000 && nums[b] >= 100) {
              items.push({ item: label || '(항목명 없음)', qty: nums[a], price: nums[b], amt: nums[c] });
              return;
            }
          }
    }
  });
  return items;
}

/** sheet_to_json(header:1) 결과 rows → 추출 항목 배열 */
export function extractQuote(rows) {
  return extractByHeader(rows) || extractByPattern(rows);
}
