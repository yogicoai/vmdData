import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { col, COL } from '@/lib/db';
import { serialize } from '@/lib/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oid(id) {
  try { return new ObjectId(id); } catch { return null; }
}

export async function GET(_req, { params }) {
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const c = await col(COL.orderForms);
  const doc = await c.findOne({ _id });
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(serialize(doc));
}

const EDITABLE = new Set(['title', 'common', 'sheets']);

export async function PATCH(req, { params }) {
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const set = {};
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) set[k] = v;
  set.updatedAt = new Date();
  const c = await col(COL.orderForms);
  const res = await c.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after' });
  if (!res) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(serialize(res));
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const c = await col(COL.orderForms);
  await c.deleteOne({ _id });
  return NextResponse.json({ ok: true });
}
