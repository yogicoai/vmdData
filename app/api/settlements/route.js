import { NextResponse } from 'next/server';
import { col, COL } from '@/lib/db';
import { serialize, orderTotal, sumBy } from '@/lib/util';
import { formToOrder } from '@/lib/orderform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 기본 설정값 (기존 HTML의 S.cfg 그대로)
function defaultCfg() {
  return {
    deadline: 10,
    vendor: '(주)현대드림애드',
    contact: '권상미',
    sender: '마케팅디자인팀 김성경',
    company: '(주)요기코퍼레이션',
    bizNum: '000-00-00000',
  };
}

// GET /api/settlements — 월별 정산 목록(요약)
export async function GET() {
  const c = await col(COL.settlements);
  const docs = await c.find({}, { sort: { year: -1, month: -1 } }).toArray();
  const list = docs.map((d) => {
    const orders = d.orders || [];
    const promo = sumBy(orders, 'promo');
    const popup = sumBy(orders, 'popup');
    return {
      _id: d._id.toHexString(),
      year: d.year,
      month: d.month,
      status: d.status || 'draft',
      orderCount: orders.length,
      total: promo + popup,
      totalVat: Math.round((promo + popup) * 1.1),
      updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
    };
  });
  return NextResponse.json(list);
}

// POST /api/settlements — 새 정산월 생성 {year, month}
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const year = Number(body.year);
  const month = Number(body.month);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year/month 가 올바르지 않습니다.' }, { status: 400 });
  }
  const c = await col(COL.settlements);
  const exists = await c.findOne({ year, month });
  if (exists) {
    return NextResponse.json({ error: '이미 존재하는 정산월입니다.', _id: exists._id.toHexString() }, { status: 409 });
  }
  const now = new Date();
  const doc = {
    year, month,
    ...defaultCfg(),
    orders: [],
    quoteItems: [],
    quoteFiles: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  const res = await c.insertOne(doc);
  const sid = res.insertedId;

  // STEP3 자동수집: 발주월(orderYear/orderMonth)이 일치하고 아직 어느 정산에도 반영 안 된 발주요청서를 발주건으로 자동 등록
  let orders = [];
  const formsCol = await col(COL.orderForms);
  const forms = await formsCol.find({
    orderYear: year, orderMonth: month,
    $or: [{ settlementId: null }, { settlementId: { $exists: false } }],
  }).toArray();
  if (forms.length) {
    orders = forms.map((f) => formToOrder(f));
    await c.updateOne({ _id: sid }, { $set: { orders, updatedAt: new Date() } });
    await formsCol.updateMany(
      { _id: { $in: forms.map((f) => f._id) } },
      { $set: { settlementId: sid.toHexString() } },
    );
  }
  return NextResponse.json(serialize({ ...doc, _id: sid, orders }), { status: 201 });
}
