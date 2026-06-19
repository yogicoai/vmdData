'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '../../_components/Toast';
import { fmt } from '@/lib/util';
import '../orderform.css';

const COMMON_FIELDS = [
  ['ono', '발주번호', '자동 생성됨'], ['date', '발주요청일', '2026. 6. 10(수)'], ['due', '납품·시공 요청일', '2026. 6. 20(금)'],
  ['buyer', '발주처', ''], ['buyerMgr', '발주 담당자', ''], ['buyerTel', '발주처 연락처', '010-0000-0000'],
  ['vendor', '공급처', ''], ['vendorMgr', '공급처 담당자', ''], ['vendorTel', '공급처 연락처', '-'],
];

const num = (v) => Number(v) || 0;

export default function OrderFormEditor() {
  const { id } = useParams();
  const { toast, ToastEl } = useToast();
  const [F, setF] = useState(null);
  const skipSave = useRef(true);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/order-forms/${id}`, { cache: 'no-store' });
      if (r.ok) { skipSave.current = true; setF(await r.json()); }
      else toast('불러올 수 없어요');
    })();
  }, [id]);

  useEffect(() => {
    if (!F) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const t = setTimeout(() => {
      fetch(`/api/order-forms/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: F.title, common: F.common, sheets: F.sheets }),
      });
    }, 600);
    return () => clearTimeout(t);
  }, [F, id]);

  const setCommon = (k, v) => setF((p) => ({ ...p, common: { ...p.common, [k]: v } }));
  const setSheets = (fn) => setF((p) => ({ ...p, sheets: fn(p.sheets) }));

  if (!F) return <div className="page"><div className="empty">불러오는 중…</div></div>;

  const c = F.common;
  const autoOno = () => c.ono || (() => {
    const d = new Date();
    return `YGB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const grandTotal = F.sheets.reduce((t, sh) => t + (sh.rows || []).reduce((a, r) => a + num(r.qty) * num(r.price), 0), 0);

  // ── 시트/행 조작 ──
  const blankSheet = (name) => ({
    name: name || '새 항목', part: '백월', spec: '포멕스 (칼락스 장 위 덧방)', finish: '-',
    rows: [{ gu: 'A', out: '2410(W) * 1570(H)', real: '2310(W) * 1470(H)', qty: '1', price: '', memo: '-' }],
    img1: null, img1label: '발주 시안 이미지', img2: null, img2label: '그래픽 부착 부위',
  });
  const upSheet = (si, k, v) => setSheets((s) => s.map((sh, i) => i === si ? { ...sh, [k]: v } : sh));
  const upRow = (si, ri, k, v) => setSheets((s) => s.map((sh, i) => i !== si ? sh : { ...sh, rows: sh.rows.map((r, j) => j === ri ? { ...r, [k]: v } : r) }));
  const addRow = (si) => setSheets((s) => s.map((sh, i) => i === si ? { ...sh, rows: [...sh.rows, { gu: '', out: '', real: '', qty: '1', price: '', memo: '-' }] } : sh));
  const delRow = (si, ri) => setSheets((s) => s.map((sh, i) => i === si ? { ...sh, rows: sh.rows.filter((_, j) => j !== ri) } : sh));
  const addSheet = () => { setSheets((s) => [...s, blankSheet()]); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 60); };
  const delSheet = (si) => { if (!confirm('이 페이지를 삭제할까요?')) return; setSheets((s) => s.filter((_, i) => i !== si)); };
  const dupSheet = (si) => setSheets((s) => { const c2 = JSON.parse(JSON.stringify(s[si])); const n = [...s]; n.splice(si + 1, 0, c2); return n; });
  const moveSheet = (si, d) => setSheets((s) => { const ni = si + d; if (ni < 0 || ni >= s.length) return s; const n = [...s]; [n[si], n[ni]] = [n[ni], n[si]]; return n; });

  // ── 이미지 업로드(FTP) ──
  const uploadImg = async (file, si, n) => {
    if (!file || !file.type.startsWith('image/')) return;
    upSheet(si, '_uploading' + n, true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok) { setSheets((s) => s.map((sh, i) => i === si ? { ...sh, ['img' + n]: d.url, ['_uploading' + n]: false } : sh)); toast('이미지 업로드 완료'); }
      else { upSheet(si, '_uploading' + n, false); toast(d.error || '업로드 실패 (FTP 설정 확인)'); }
    } catch { upSheet(si, '_uploading' + n, false); toast('업로드 실패'); }
  };
  const pickImg = (si, n) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = (e) => uploadImg(e.target.files[0], si, n); i.click(); };
  const removeImg = (si, n) => upSheet(si, 'img' + n, null);

  return (
    <>
      <div className="of-toolbar" style={{ background: '#1a1a1a', color: '#fff', padding: '11px 26px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 46, zIndex: 40 }}>
        <input value={F.title || ''} placeholder="발주요청서 제목 (예: 더현대 대구 6층)" onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))}
          style={{ flex: 1, maxWidth: 360, padding: '7px 10px', borderRadius: 6, border: '1px solid #444', background: '#2a2a2a', color: '#fff', fontFamily: 'inherit', fontSize: 13 }} />
        <button className="btn" onClick={() => window.print()}>PDF로 인쇄</button>
        <SendToSettlement formId={id} toast={toast} />
      </div>

      <div className="orderform">
        <div className="page">
          <p className="hint">공통 정보를 한 번 입력하면 모든 페이지 상단에 자동으로 들어갑니다. 이미지는 클릭/드래그로 업로드(오픈호스팅)됩니다.<br />완성 후 「PDF로 인쇄」 → 대상을 ‘PDF로 저장’으로 선택하세요.</p>

          {/* 공통 정보 */}
          <div className="common-card">
            <div className="lbl">공통 정보 (모든 페이지 공통)</div>
            <div className="common-grid">
              {COMMON_FIELDS.map(([k, label, ph]) => (
                <div className="fld" key={k}><label>{label}</label>
                  <input value={c[k] || ''} placeholder={ph} onChange={(e) => setCommon(k, e.target.value)} /></div>
              ))}
              <div className="fld wide"><label>납품·시공 장소</label>
                <input value={c.place || ''} placeholder="예: 더현대 대구 6층 키즈스튜디오" onChange={(e) => setCommon('place', e.target.value)} /></div>
              <div className="fld"><label>납품 방식</label><input value={c.delivery || ''} onChange={(e) => setCommon('delivery', e.target.value)} /></div>
              <div className="fld"><label>결제 조건</label><input value={c.payment || ''} onChange={(e) => setCommon('payment', e.target.value)} /></div>
              <div className="fld"><label>VAT</label><input value={c.vat || ''} onChange={(e) => setCommon('vat', e.target.value)} /></div>
              <div className="fld wide"><label>특기사항 / 주의사항</label>
                <input value={c.remark || ''} placeholder="예: 출력 사이즈는 여유분 포함 / 실측 사이즈 기준 시공" onChange={(e) => setCommon('remark', e.target.value)} /></div>
            </div>
          </div>

          {/* 시트들 */}
          {F.sheets.map((sh, si) => {
            const isLast = si === F.sheets.length - 1;
            let sheetAmt = 0;
            return (
              <div className="sheet" key={si}>
                <div className="sheet-tools">
                  <button onClick={() => moveSheet(si, -1)}>▲</button>
                  <button onClick={() => moveSheet(si, 1)}>▼</button>
                  <button onClick={() => dupSheet(si)}>복제</button>
                  <button className="danger" onClick={() => delSheet(si)}>삭제</button>
                </div>

                <div className="doc-head">
                  <div className="title">요기보 그래픽 발주요청서</div>
                  <div className="ono">
                    <b>발주번호</b> {autoOno()}<br />
                    <b>발주요청일</b> {c.date || '-'} &nbsp;|&nbsp; <b>납품·시공요청일</b> {c.due || '-'}
                  </div>
                </div>
                <div className="party-row">
                  <div className="party-col"><div className="ph">발주처 (요청)</div><div className="pl">{c.buyer}</div>
                    담당 {c.buyerMgr} {c.buyerTel ? '· ' + c.buyerTel : ''}</div>
                  <div className="party-col"><div className="ph">공급처 (제작)</div><div className="pl">{c.vendor}</div>
                    담당 {c.vendorMgr} {c.vendorTel ? '· ' + c.vendorTel : ''}</div>
                </div>

                <div className="sheet-name">[{si + 1}] {sh.name}</div>
                <table className="info-table">
                  <tbody>
                    <tr><td>그래픽 항목명</td><td colSpan={3}><input className="ed" value={sh.name} onChange={(e) => upSheet(si, 'name', e.target.value)} /></td></tr>
                    <tr><td>부착 위치</td><td><input className="ed" value={sh.part} onChange={(e) => upSheet(si, 'part', e.target.value)} /></td>
                      <td>납품·시공 장소</td><td>{c.place || '-'}</td></tr>
                    <tr><td>재질 (스펙)</td><td><input className="ed" value={sh.spec} onChange={(e) => upSheet(si, 'spec', e.target.value)} /></td>
                      <td>후가공</td><td><input className="ed" value={sh.finish} onChange={(e) => upSheet(si, 'finish', e.target.value)} /></td></tr>
                  </tbody>
                </table>

                <table className="size-table">
                  <thead><tr>
                    <th className="c-gu">구분</th><th>출력 사이즈(여유분 포함)</th><th>실측 사이즈</th>
                    <th className="c-qty">수량</th><th className="c-price">단가</th><th className="c-amt">금액</th><th>비고</th><th className="c-del"></th>
                  </tr></thead>
                  <tbody>
                    {sh.rows.map((r, ri) => {
                      const amt = num(r.qty) * num(r.price); sheetAmt += amt;
                      return (
                        <tr key={ri}>
                          <td className="c-gu"><input className="ed" value={r.gu} onChange={(e) => upRow(si, ri, 'gu', e.target.value)} /></td>
                          <td className="lft"><input className="ed out" value={r.out} onChange={(e) => upRow(si, ri, 'out', e.target.value)} /></td>
                          <td className="lft"><input className="ed" value={r.real} onChange={(e) => upRow(si, ri, 'real', e.target.value)} /></td>
                          <td className="c-qty"><input className="ed" value={r.qty} onChange={(e) => upRow(si, ri, 'qty', e.target.value)} /></td>
                          <td className="c-price"><input className="ed num" value={r.price} placeholder="-" onChange={(e) => upRow(si, ri, 'price', e.target.value)} /></td>
                          <td className="c-amt num">{fmt(amt)}</td>
                          <td className="lft"><input className="ed" value={r.memo} onChange={(e) => upRow(si, ri, 'memo', e.target.value)} /></td>
                          <td className="c-del" onClick={() => delRow(si, ri)}>×</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><td colSpan={5}>항목 합계 (공급가)</td><td className="c-amt num">{fmt(sheetAmt)}</td><td colSpan={2}></td></tr></tfoot>
                </table>
                <button className="add-size" onClick={() => addRow(si)}>+ 사이즈 행 추가</button>

                <div className="img-grid">
                  {[1, 2].map((n) => {
                    const img = sh['img' + n]; const has = !!img; const uploading = sh['_uploading' + n];
                    return (
                      <div key={n} className={'img-slot ' + (has ? 'has-img' : 'no-img') + (uploading ? ' uploading' : '')}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('over')}
                        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); uploadImg(e.dataTransfer.files[0], si, n); }}
                        onClick={() => { if (!has && !uploading) pickImg(si, n); }}>
                        <div className="slot-label"><input className="ed" value={sh['img' + n + 'label'] || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => upSheet(si, 'img' + n + 'label', e.target.value)} /></div>
                        {has ? (
                          <><button className="remove-img" onClick={(e) => { e.stopPropagation(); removeImg(si, n); }}>삭제</button>
                            <div className="slot-body"><img src={img} alt="" /></div></>
                        ) : (
                          <div className="placeholder">{uploading ? '업로드 중…' : <>클릭 또는 드래그해서 이미지 추가<br /><span style={{ fontSize: 10.5, color: '#bbb' }}>부착부위 사진 · 발주 시안 등</span></>}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isLast && (
                  <table className="foot-table" style={{ marginTop: 12 }}>
                    <tbody>
                      <tr><td>총 합계 (공급가)</td><td className="num" style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700 }}>{fmt(grandTotal)} 원</td><td>VAT</td><td>{c.vat}</td></tr>
                      <tr><td>VAT 포함 합계</td><td className="num" style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700 }}>{fmt(Math.round(grandTotal * 1.1))} 원</td><td>납품 방식</td><td>{c.delivery}</td></tr>
                      <tr><td>결제 조건</td><td colSpan={3} style={{ textAlign: 'left', paddingLeft: 6 }}>{c.payment}</td></tr>
                      <tr><td>특기사항</td><td colSpan={3} style={{ textAlign: 'left', paddingLeft: 6 }}>{c.remark || '-'}</td></tr>
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          <div className="add-sheet-bar">
            <button className="add-sheet-btn" onClick={addSheet}>+ 발주 항목(페이지) 추가</button>
          </div>
        </div>
      </div>
      {ToastEl}
    </>
  );
}

function SendToSettlement({ formId, toast }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [sel, setSel] = useState('');

  useEffect(() => { if (open) fetch('/api/settlements', { cache: 'no-store' }).then((r) => r.json()).then(setList).catch(() => {}); }, [open]);

  const send = async () => {
    const body = sel ? { settlementId: sel } : { year: Number(year), month: Number(month) };
    const r = await fetch(`/api/order-forms/${formId}/to-settlement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { toast('정산으로 보냈어요'); setOpen(false); }
    else toast('실패 — 정산월을 확인하세요');
  };

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn primary" style={{ background: '#fff', color: '#1a1a1a', borderColor: '#fff' }} onClick={() => setOpen(!open)}>정산으로 보내기</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, width: 280, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 50 }}>
          <div className="fld" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>기존 정산월 선택</label>
            <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--line)' }}>
              <option value="">— 새 정산월 생성 —</option>
              {list.map((s) => <option key={s._id} value={s._id}>{s.year}년 {s.month}월</option>)}
            </select>
          </div>
          {!sel && (
            <div className="grid2" style={{ marginBottom: 10 }}>
              <div className="fld"><label style={{ fontSize: 12 }}>연도</label><input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
              <div className="fld"><label style={{ fontSize: 12 }}>월</label><input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            </div>
          )}
          <button className="btn primary" style={{ width: '100%' }} onClick={send}>보내기</button>
        </div>
      )}
    </div>
  );
}
