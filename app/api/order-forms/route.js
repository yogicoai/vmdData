import { NextResponse } from 'next/server';
import { col, COL } from '@/lib/db';
import { serialize } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function blankSheet(name) {
  return {
    name: name || '백월', part: '백월', spec: '포멕스 (칼락스 장 위 덧방)', finish: '-',
    rows: [{ gu: 'A', out: '2410(W) * 1570(H)', real: '2310(W) * 1470(H)', qty: '1', price: '', memo: '-' }],
    img1: null, img1label: '발주 시안 이미지',
    img2: null, img2label: '그래픽 부착 부위',
  };
}

function defaultCommon() {
  return {
    ono: '', date: '', due: '', buyer: '(주)요기코퍼레이션 / 요기보코리아',
    buyerMgr: '마케팅디자인팀 김성경', buyerTel: '', vendor: '(주)현대드림애드',
    vendorMgr: '권상미', vendorTel: '', place: '', delivery: '현장 시공',
    payment: '세금계산서 발행 후 익월 말일', vat: '별도', remark: '',
  };
}

// GET /api/order-forms — 목록(요약)
export async function GET() {
  const c = await col(COL.orderForms);
  const docs = await c.find({}, { sort: { updatedAt: -1, createdAt: -1 } }).toArray();
  const list = docs.map((d) => ({
    _id: d._id.toHexString(),
    title: d.title || d.common?.place || '(제목 없음)',
    place: d.common?.place || '',
    sheetCount: (d.sheets || []).length,
    updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
  }));
  return NextResponse.json(list);
}

// POST /api/order-forms — 새 발주요청서
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const doc = {
    title: body.title || '',
    common: { ...defaultCommon(), ...(body.common || {}) },
    sheets: Array.isArray(body.sheets) && body.sheets.length ? body.sheets : [blankSheet('백월')],
    createdAt: now,
    updatedAt: now,
  };
  const c = await col(COL.orderForms);
  const res = await c.insertOne(doc);
  return NextResponse.json(serialize({ ...doc, _id: res.insertedId }), { status: 201 });
}
