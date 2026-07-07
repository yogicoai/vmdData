'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './_components/Toast';
import { fmt } from '@/lib/util';

const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export default function Dashboard() {
  const router = useRouter();
  const { toast, ToastEl } = useToast();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth()); // 기본: 전월(발주월)
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await fetch('/api/settlements', { cache: 'no-store' });
    setList(r.ok ? await r.json() : []);
  }
  useEffect(() => { reload(); }, []);

  async function start() {
    setBusy(true);
    const r = await fetch('/api/settlements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: Number(year), month: Number(month) }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) { router.push(`/settlements/${d._id}`); }
    else if (r.status === 409) { toast('이미 있는 정산월이에요'); router.push(`/settlements/${d._id}`); }
    else toast(d.error || '생성 실패');
  }

  async function del(id, e) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm('이 정산월을 삭제할까요? 되돌릴 수 없습니다.')) return;
    const r = await fetch(`/api/settlements/${id}`, { method: 'DELETE' });
    if (r.ok) { toast('삭제했어요'); reload(); } else toast('삭제 실패');
  }

  const years = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="page">
      <div style={{ padding: '12px 2px 22px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.8px' }}>그래픽 정산</h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 14.5, marginTop: 6 }}>매월 팝업·프로모션 발주를 취합해 정산까지 한 번에.</p>
        <button className="btn primary lg" style={{ marginTop: 18 }} onClick={() => setOpen(true)}>+ 정산 작성하기</button>
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-2)', margin: '4px 2px 12px' }}>정산 이력</div>
      {list === null ? (
        <div className="empty">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="empty">아직 정산이 없어요. ‘정산 작성하기’로 시작하세요.</div>
      ) : (
        <div className="board">
          <div className="row head">
            <div>정산월</div>
            <div className="col-cnt">발주</div>
            <div className="num" style={{ textAlign: 'right' }}>금액(VAT포함)</div>
            <div>상태</div>
            <div className="col-date">작성일</div>
            <div></div>
          </div>
          {list.map((s) => (
            <div key={s._id} className="row" onClick={() => router.push(`/settlements/${s._id}`)}>
              <div className="mm">{s.year}년 {s.month}월</div>
              <div className="cell col-cnt">{s.orderCount}건</div>
              <div className="amt num" style={{ textAlign: 'right' }}>{fmt(s.totalVat)}원</div>
              <div><span className={'badge ' + (s.status === 'done' ? 'ok' : 'gray')}>{s.status === 'done' ? '완료' : '진행중'}</span></div>
              <div className="cell col-date">{fmtDate(s.createdAt)}</div>
              <div><button className="del-btn" onClick={(e) => del(s._id, e)}>×</button></div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>정산 작성하기</h3>
            <p className="msub">정산할 <b>발주월</b>을 선택하세요. 예: 5월 발주 → ‘2026년 5월’</p>
            <div className="grid2" style={{ marginBottom: 20 }}>
              <div className="fld"><label>연도</label>
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
              </div>
              <div className="fld"><label>월</label>
                <select value={month} onChange={(e) => setMonth(e.target.value)}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>취소</button>
              <button className="btn primary" style={{ flex: 2 }} disabled={busy} onClick={start}>{busy ? '생성 중…' : '정산 시작하기'}</button>
            </div>
          </div>
        </div>
      )}
      {ToastEl}
    </div>
  );
}
