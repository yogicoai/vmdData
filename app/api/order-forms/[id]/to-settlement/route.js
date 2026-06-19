import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { col, COL } from '@/lib/db';
import { serialize } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oid(id) { try { return new ObjectId(id); } catch { return null; } }

const uid = () => Date.now() + '_' + Math.random().toString(36).slice(2, 7);

// 발주요청서 한 건 → orders 변환 (기존 importOrderJson 로직 이식)
function formToOrder(form) {
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

// POST /api/order-forms/[id]/to-settlement  body: {settlementId} 또는 {year,month}
export async function POST(req, { params }) {
  const { id } = await params;
  const formId = oid(id);
  if (!formId) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const forms = await col(COL.orderForms);
  const settlements = await col(COL.settlements);

  const form = await forms.findOne({ _id: formId });
  if (!form) return NextResponse.json({ error: '발주요청서를 찾을 수 없습니다.' }, { status: 404 });

  // 대상 정산월 결정 (settlementId 우선, 없으면 year/month, 없으면 생성)
  let settlement = null;
  if (body.settlementId) {
    const sid = oid(body.settlementId);
    if (sid) settlement = await settlements.findOne({ _id: sid });
  }
  if (!settlement && body.year && body.month) {
    const year = Number(body.year), month = Number(body.month);
    settlement = await settlements.findOne({ year, month });
    if (!settlement) {
      const now = new Date();
      const doc = {
        year, month, deadline: 10, vendor: '(주)현대드림애드', contact: '권상미',
        sender: '마케팅디자인팀 김성경', company: '(주)요기코퍼레이션', bizNum: '000-00-00000',
        orders: [], quoteItems: [], quoteFiles: [], status: 'draft', createdAt: now, updatedAt: now,
      };
      const res = await settlements.insertOne(doc);
      settlement = { ...doc, _id: res.insertedId };
    }
  }
  if (!settlement) {
    return NextResponse.json({ error: '대상 정산월(settlementId 또는 year/month)이 필요합니다.' }, { status: 400 });
  }

  const order = formToOrder(form);
  // 이미 동일 발주요청서를 보낸 적 있으면 교체, 아니면 추가
  const existing = (settlement.orders || []).filter((o) => o.sourceFormId !== order.sourceFormId);
  const nextOrders = [...existing, order];

  await settlements.updateOne(
    { _id: settlement._id },
    { $set: { orders: nextOrders, updatedAt: new Date() } },
  );

  return NextResponse.json({
    ok: true,
    settlementId: settlement._id.toHexString(),
    order: serialize(order),
  });
}
