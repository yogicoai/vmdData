import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { col, COL } from '@/lib/db';
import { serialize } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oid(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// GET /api/settlements/[id] — 정산 전체 문서
export async function GET(_req, { params }) {
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const c = await col(COL.settlements);
  const doc = await c.findOne({ _id });
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(serialize(doc));
}

// 수정 허용 필드 (whitelist)
const EDITABLE = new Set([
  'year', 'month', 'deadline', 'vendor', 'contact', 'sender', 'company', 'bizNum',
  'orders', 'quoteItems', 'quoteFiles', 'status', 'steps',
]);

// PATCH /api/settlements/[id] — 부분 또는 전체 저장
export async function PATCH(req, { params }) {
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const set = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) set[k] = v;
  }
  set.updatedAt = new Date();
  const c = await col(COL.settlements);
  const res = await c.findOneAndUpdate(
    { _id },
    { $set: set },
    { returnDocument: 'after' },
  );
  if (!res) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(serialize(res));
}

// DELETE /api/settlements/[id]
export async function DELETE(_req, { params }) {
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const c = await col(COL.settlements);
  await c.deleteOne({ _id });
  return NextResponse.json({ ok: true });
}
