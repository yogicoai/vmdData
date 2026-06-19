import { NextResponse } from 'next/server';
import { uploadToFtp } from '@/lib/ftp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/upload  (multipart/form-data, field 'file') → { url }
export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    // 파일명: 타임스탬프 + 랜덤 + 확장자
    const orig = (file.name || 'image').toLowerCase();
    const ext = (orig.match(/\.[a-z0-9]+$/) || ['.jpg'])[0];
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `${Date.now()}_${rand}${ext}`;

    const url = await uploadToFtp(buffer, filename);
    return NextResponse.json({ url, filename });
  } catch (err) {
    console.error('[upload]', err);
    return NextResponse.json({ error: err.message || '업로드 실패' }, { status: 500 });
  }
}
