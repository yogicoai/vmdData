'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '../_components/Toast';

export default function OrderForms() {
  const router = useRouter();
  const { toast, ToastEl } = useToast();
  const [list, setList] = useState(null);

  async function reload() {
    const r = await fetch('/api/order-forms', { cache: 'no-store' });
    setList(r.ok ? await r.json() : []);
  }
  useEffect(() => { reload(); }, []);

  async function create() {
    const now = new Date();
    const r = await fetch('/api/order-forms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderYear: now.getFullYear(), orderMonth: now.getMonth() + 1 }),
    });
    if (r.ok) { const d = await r.json(); router.push(`/order-forms/${d._id}`); }
    else toast('생성 실패');
  }

  async function del(id, e) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm('이 발주요청서를 삭제할까요?')) return;
    await fetch(`/api/order-forms/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="page">
      <div className="card">
        <div className="lbl">발주요청서</div>
        <h2>현장 시공팀 전달용 발주요청서</h2>
        <p className="sub">작성 후 PDF로 인쇄하고, “정산으로 보내기”로 해당 월 정산에 발주 건을 자동 등록합니다.</p>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="btn primary" onClick={create}>+ 새 발주요청서</button>
        </div>
      </div>

      <div className="card">
        <h2>목록</h2>
        {list === null ? <div className="empty">불러오는 중…</div>
          : list.length === 0 ? <div className="empty">아직 발주요청서가 없어요.</div>
          : (
            <div className="settle-list">
              {list.map((f) => (
                <Link key={f._id} href={`/order-forms/${f._id}`} className="settle-card">
                  <div className="m" style={{ fontSize: 16 }}>{f.title || f.place || '(제목 없음)'}</div>
                  <div className="t">{f.sheetCount}개 페이지</div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button className="btn sm ghost" onClick={(e) => del(f._id, e)}>삭제</button>
                  </div>
                </Link>
              ))}
            </div>
          )}
      </div>
      {ToastEl}
    </div>
  );
}
