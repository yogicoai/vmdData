'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from './_components/Toast';
import { fmt } from '@/lib/util';

export default function Dashboard() {
  const { toast, ToastEl } = useToast();
  const [list, setList] = useState(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth()); // 기본: 전월(발주월)

  async function reload() {
    const r = await fetch('/api/settlements', { cache: 'no-store' });
    if (r.ok) setList(await r.json());
    else setList([]);
  }
  useEffect(() => { reload(); }, []);

  async function createMonth() {
    const r = await fetch('/api/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: Number(year), month: Number(month) }),
    });
    const d = await r.json();
    if (r.ok) { toast('새 정산월을 만들었어요'); reload(); }
    else if (r.status === 409) { toast('이미 있는 정산월이에요'); reload(); }
    else toast(d.error || '생성 실패');
  }

  return (
    <div className="page">
      <div className="card">
        <div className="lbl">정산 월 추가</div>
        <h2>새 정산월 시작</h2>
        <p className="sub">정산 대상 월은 “발주가 나간 달”입니다. 예: 5월 발주분 → 6월에 정산.</p>
        <div className="grid3">
          <div className="fld"><label>연도</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <div className="fld"><label>월 (발주월)</label>
            <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <div className="fld" style={{ alignSelf: 'end' }}>
            <button className="btn primary" onClick={createMonth}>+ 정산월 만들기</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="lbl">이력</div>
        <h2>월별 정산</h2>
        <p className="sub">과거 정산이 모두 보관됩니다. 클릭하면 해당 월 정산으로 이동합니다.</p>
        {list === null ? (
          <div className="empty">불러오는 중…</div>
        ) : list.length === 0 ? (
          <div className="empty">아직 정산월이 없어요. 위에서 추가하세요.</div>
        ) : (
          <div className="settle-list">
            {list.map((s) => (
              <Link key={s._id} href={`/settlements/${s._id}`} className="settle-card">
                <div className="m">{s.year}년 {s.month}월</div>
                <div className="t">발주 {s.orderCount}건 · {s.status === 'done' ? '완료' : '진행중'}</div>
                <div className="amt">{fmt(s.totalVat)}원 <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-faint)' }}>(VAT포함)</span></div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {ToastEl}
    </div>
  );
}
