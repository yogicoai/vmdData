import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { col, COL } from '@/lib/db';
import { serialize } from '@/lib/util';
import { formToOrder } from '@/lib/orderform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oid(id) { try { return new ObjectId(id); } catch { return null; } }

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
  // 발주요청서를 이 정산에 귀속 표시(자동수집 중복 방지 + 반영 상태)
  await forms.updateOne({ _id: formId }, { $set: { settlementId: settlement._id.toHexString() } });

  return NextResponse.json({
    ok: true,
    settlementId: settlement._id.toHexString(),
    order: serialize(order),
  });
}
