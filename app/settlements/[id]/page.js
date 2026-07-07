'use client';
import { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '../../_components/Toast';
import { fmt, orderTotal, sumBy, lineAmt } from '@/lib/util';
import { extractQuote } from '@/lib/quote';
import { buildEmails } from '@/lib/emails';

const CFG_FIELDS = ['deadline', 'vendor', 'contact', 'sender', 'company', 'bizNum'];
const uid = () => Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const STEPS = [
  { key: 'setup', label: '설정' },
  { key: 'orders', label: '발주' },
  { key: 'compare', label: '견적 대조' },
  { key: 'settle', label: '정산서' },
  { key: 'tax', label: '세금계산서' },
  { key: 'memo', label: '지출품의' },
];

export default function SettlementWizard() {
  const { id } = useParams();
  const router = useRouter();
  const { toast, ToastEl } = useToast();
  const [S, setS] = useState(null);
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const [editOrder, setEditOrder] = useState(null); // 발주 추가/편집 모달용 {order, isNew}
  const skipSave = useRef(true);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/settlements/${id}`, { cache: 'no-store' });
      if (r.ok) { skipSave.current = true; setS(await r.json()); }
      else toast('정산을 불러올 수 없어요');
    })();
  }, [id]);

  useEffect(() => {
    if (!S) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const t = setTimeout(async () => {
      const body = {};
      ['year', 'month', ...CFG_FIELDS, 'orders', 'quoteItems', 'quoteFiles', 'status'].forEach((k) => { body[k] = S[k]; });
      setSaveState('saving');
      try {
        await fetch(`/api/settlements/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        setSaveState('saved');
      } catch { setSaveState('idle'); }
    }, 600);
    return () => clearTimeout(t);
  }, [S, id]);

  const patch = useCallback((p) => setS((prev) => ({ ...prev, ...p })), []);

  if (!S) return <div className="page"><div className="empty">불러오는 중…</div></div>;

  const promo = sumBy(S.orders, 'promo');
  const popup = sumBy(S.orders, 'popup');
  const cfg = { year: S.year, month: S.month, deadline: S.deadline, vendor: S.vendor, contact: S.contact, sender: S.sender, company: S.company, bizNum: S.bizNum };
  const emails = buildEmails(cfg, { promo, popup });
  const copyT = (text) => navigator.clipboard.writeText(text).then(() => toast('복사했어요!')).catch(() => toast('복사 실패'));

  // ── 발주 저장(모달) ──
  const saveOrder = (order, isNew) => {
    setS((prev) => {
      const orders = isNew ? [...prev.orders, order] : prev.orders.map((o) => o.id === order.id ? order : o);
      return { ...prev, orders };
    });
    setEditOrder(null);
    toast(isNew ? '발주를 추가했어요' : '발주를 수정했어요');
  };
  const delOrder = (oid) => { if (!confirm('이 발주를 삭제할까요?')) return; setS((prev) => ({ ...prev, orders: prev.orders.filter((o) => o.id !== oid) })); };

  // ── 견적 대조 ──
  const handleQuotes = async (files) => {
    const XLSX = await import('xlsx');
    const items = []; const names = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        wb.SheetNames.forEach((sn) => extractQuote(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null })).forEach((it) => items.push(it)));
        names.push(f.name);
      } catch { toast('읽을 수 없어요: ' + f.name); }
    }
    patch({ quoteItems: items, quoteFiles: names });
  };

  // ── 매장별 정산서 ──
  const settleRows = () => {
    const map = {};
    S.orders.forEach((o) => {
      const store = o.store || '(매장 미지정)';
      if (!map[store]) map[store] = { store, promo: 0, popup: 0 };
      map[store][o.type] += orderTotal(o);
    });
    return Object.values(map).filter((r) => r.promo || r.popup);
  };
  const downloadSettle = async () => {
    const XLSX = await import('xlsx');
    const rows = settleRows(); const data = [];
    data.push([`[${S.year % 100}년 ${S.month}월 매장별 정산서] 팝업 / 프로모션`]); data.push([]);
    data.push(['매장명', '프로모션', '팝업', '매장별 TOTAL', 'TOTAL(VAT포함)']);
    let tp = 0, tu = 0;
    rows.forEach((r) => { tp += r.promo; tu += r.popup; data.push([r.store, r.promo, r.popup, r.promo + r.popup, Math.round((r.promo + r.popup) * 1.1)]); });
    data.push(['TOTAL', tp, tu, tp + tu, Math.round((tp + tu) * 1.1)]);
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 24 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 17 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '취합');
    XLSX.writeFile(wb, `_${S.year}_${S.month}월_매장별_정산서.xlsx`);
    toast('정산서를 다운로드했어요');
  };

  const cur = STEPS[step];
  const go = (i) => { if (i >= 0 && i < STEPS.length) setStep(i); window.scrollTo(0, 0); };

  return (
    <>
      <div className="stepper">
        {STEPS.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <div className={'bar' + (i <= step ? ' done' : '')} />}
            <div className={'st clickable' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => go(i)}>
              <span className="dot">{i < step ? '✓' : i + 1}</span>
              <span className="nm">{s.label}</span>
            </div>
          </Fragment>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', paddingLeft: 12 }}>
          {saveState !== 'idle' && <span className={'savestate ' + saveState}><span className="dot" />{saveState === 'saving' ? '저장 중…' : '저장됨'}</span>}
        </span>
      </div>

      <div className="page" style={{ paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 10 }}>{S.year}년 {S.month}월 정산 · {step + 1}/{STEPS.length}</div>

        {/* 1. 설정 */}
        {cur.key === 'setup' && (
          <div className="card">
            <div className="lbl">STEP 1 · 정산 설정</div>
            <h2>정산 기본 정보</h2>
            <p className="sub">업체·발신자 정보는 기본값이 채워져 있어요. 정산 대상 월은 “발주가 나간 달”입니다.</p>
            <div className="grid2">
              <div className="fld"><label>정산 대상 연도</label>
                <input type="number" value={S.year} onChange={(e) => patch({ year: Number(e.target.value) })} /></div>
              <div className="fld"><label>정산 대상 월 (발주월)</label>
                <input type="number" min={1} max={12} value={S.month} onChange={(e) => patch({ month: Number(e.target.value) })} /></div>
              <div className="fld"><label>업체명</label><input value={S.vendor} onChange={(e) => patch({ vendor: e.target.value })} /></div>
              <div className="fld"><label>업체 담당자</label><input value={S.contact} onChange={(e) => patch({ contact: e.target.value })} /></div>
              <div className="fld"><label>발신자 (본인)</label><input value={S.sender} onChange={(e) => patch({ sender: e.target.value })} /></div>
              <div className="fld"><label>회사명</label><input value={S.company} onChange={(e) => patch({ company: e.target.value })} /></div>
              <div className="fld"><label>사업자등록번호</label><input value={S.bizNum} onChange={(e) => patch({ bizNum: e.target.value })} /></div>
              <div className="fld"><label>세금계산서 마감일 (익월)</label><input type="number" value={S.deadline} onChange={(e) => patch({ deadline: Number(e.target.value) })} /></div>
            </div>
          </div>
        )}

        {/* 2. 발주 */}
        {cur.key === 'orders' && (
          <>
            <div className="strip">
              <div className="stat"><div className="l">발주 건수</div><div className="v">{S.orders.length}건</div></div>
              <div className="stat"><div className="l">프로모션</div><div className="v p">{fmt(promo)}</div></div>
              <div className="stat"><div className="l">팝업</div><div className="v" style={{ color: '#b45309' }}>{fmt(popup)}</div></div>
              <div className="stat"><div className="l">합계(VAT포함)</div><div className="v g">{fmt((promo + popup) * 1.1)}</div></div>
            </div>
            <div className="card">
              <div className="lbl">STEP 2 · 발주</div>
              <h2>이 달에 나간 발주</h2>
              <p className="sub">‘발주 추가’를 누르고 형태(프로모션·팝업)를 고른 뒤 발주명·매장·품목을 입력하세요.</p>
              <button className="btn primary lg" onClick={() => setEditOrder({ order: { id: uid(), type: 'promo', name: '', store: '', rows: [{ item: '', qty: 1, price: 0 }], images: [] }, isNew: true })}>+ 발주 추가</button>

              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                {S.orders.length === 0 ? (
                  <div className="empty">아직 발주가 없어요.</div>
                ) : S.orders.map((o) => (
                  <div key={o.id} className="order-item" onClick={() => setEditOrder({ order: JSON.parse(JSON.stringify(o)), isNew: false })} style={{ cursor: 'pointer' }}>
                    <div className="order-head">
                      <span className={'badge ' + o.type}>{o.type === 'promo' ? '프로모션' : '팝업'}</span>
                      <span className="nm">{o.name || '(발주명 없음)'}{o.store ? ` · ${o.store}` : ''}</span>
                      {o.images?.length > 0 && <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>🖼 {o.images.length}</span>}
                      <span className="amt">{fmt(orderTotal(o))}원</span>
                      <button className="del-btn" onClick={(e) => { e.stopPropagation(); delOrder(o.id); }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 3. 견적 대조 */}
        {cur.key === 'compare' && <QuoteCompare S={S} promo={promo} popup={popup} onFiles={handleQuotes} emailReq={emails.em1} emailRecheck={emails.em2} onCopy={copyT} />}

        {/* 4. 정산서 */}
        {cur.key === 'settle' && (
          <div className="card">
            <div className="lbl">STEP 4 · 매장별 정산서</div>
            <h2>매장별 정산서</h2>
            <p className="sub">등록된 발주가 매장 기준으로 자동 집계됩니다.</p>
            <SettleTable rows={settleRows()} />
            <div className="btn-row"><button className="btn green" onClick={downloadSettle}>엑셀 다운로드</button></div>
            <p className="note">※ 내부 정산서 양식(팝업/프로모션)이 있으면 그 양식에 맞춰 출력되도록 적용 예정.</p>
          </div>
        )}

        {/* 5. 세금계산서 */}
        {cur.key === 'tax' && (
          <div className="card">
            <div className="lbl">STEP 5 · 세금계산서</div>
            <h2>세금계산서 발행 요청</h2>
            <p className="sub">정산 금액 확정 후 업체에 세금계산서 발행을 요청하세요.</p>
            <div className="email-box">{emails.em3}</div>
            <div className="btn-row"><button className="btn primary" onClick={() => copyT(emails.em3)}>메일 본문 복사</button></div>
          </div>
        )}

        {/* 6. 지출품의 */}
        {cur.key === 'memo' && (
          <div className="card">
            <div className="lbl">STEP 6 · 지출품의</div>
            <h2>지출품의서 내용</h2>
            <p className="sub">아래 내용을 그룹웨어 지출품의서에 붙여넣어 상신하세요.</p>
            <div className="email-box">{emails.memo}</div>
            <div className="btn-row"><button className="btn primary" onClick={() => copyT(emails.memo)}>내용 복사</button></div>
          </div>
        )}
      </div>

      {/* 하단 마법사 네비 */}
      <div className="wizard-foot">
        <div className="inner">
          <button className="btn ghost" onClick={() => (step === 0 ? router.push('/') : go(step - 1))}>{step === 0 ? '나가기' : '이전'}</button>
          {step < STEPS.length - 1
            ? <button className="btn primary" style={{ flex: 1 }} onClick={() => go(step + 1)}>다음 · {STEPS[step + 1].label}</button>
            : <button className="btn green" style={{ flex: 1 }} onClick={() => { patch({ status: 'done' }); toast('정산 완료 처리했어요'); router.push('/'); }}>정산 완료</button>}
        </div>
      </div>

      {editOrder && <OrderModal init={editOrder} onSave={saveOrder} onClose={() => setEditOrder(null)} toast={toast} />}
      {ToastEl}
    </>
  );
}

/* ── 발주 추가/편집 모달 ── */
function OrderModal({ init, onSave, onClose, toast }) {
  const [o, setO] = useState(init.order);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));
  const setRow = (ri, k, v) => setO((p) => ({ ...p, rows: p.rows.map((r, i) => i === ri ? { ...r, [k]: v, ...(k === 'qty' || k === 'price' ? { amt: '' } : {}) } : r) }));
  const setAmt = (ri, v) => setO((p) => ({ ...p, rows: p.rows.map((r, i) => i === ri ? { ...r, amt: v } : r) }));
  const addRow = () => setO((p) => ({ ...p, rows: [...p.rows, { item: '', qty: 1, price: 0 }] }));
  const delRow = (ri) => setO((p) => ({ ...p, rows: p.rows.filter((_, i) => i !== ri) }));
  const total = (o.rows || []).reduce((a, r) => a + lineAmt(r), 0);

  const upload = async (files) => {
    setUploading(true);
    const urls = [];
    for (const f of files) {
      if (!f.type?.startsWith('image/')) continue;
      try {
        const fd = new FormData(); fd.append('file', f);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        const d = await r.json();
        if (r.ok) urls.push(d.url); else toast(d.error || '업로드 실패');
      } catch { toast('업로드 실패'); }
    }
    setO((p) => ({ ...p, images: [...(p.images || []), ...urls] }));
    setUploading(false);
  };
  const removeImg = (idx) => setO((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }));

  const save = () => {
    if (!o.name?.trim()) { toast('발주명을 입력하세요'); return; }
    if (!o.store?.trim()) { toast('매장명을 입력하세요'); return; }
    onSave(o, init.isNew);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3>{init.isNew ? '발주 추가' : '발주 수정'}</h3>
        <p className="msub">발주 형태를 고르고 내용을 입력하세요.</p>

        <div className="type-pick" style={{ marginBottom: 18 }}>
          <div className={'type-card promo' + (o.type === 'promo' ? ' on' : '')} onClick={() => set('type', 'promo')}>
            <div className="ico">🎯</div><div className="tt">프로모션 발주</div><div className="td">프로모션 POP 그래픽</div>
          </div>
          <div className={'type-card popup' + (o.type === 'popup' ? ' on' : '')} onClick={() => set('type', 'popup')}>
            <div className="ico">🏬</div><div className="tt">팝업 발주</div><div className="td">팝업 구성 그래픽</div>
          </div>
        </div>

        <div className="grid2" style={{ marginBottom: 14 }}>
          <div className="fld"><label>발주명</label><input value={o.name} placeholder="예: 6월 프로모션 POP" onChange={(e) => set('name', e.target.value)} /></div>
          <div className="fld"><label>매장명</label><input value={o.store} placeholder="예: 신세계 대전" onChange={(e) => set('store', e.target.value)} /></div>
        </div>

        <div className="fld" style={{ marginBottom: 6 }}><label>품목 · 수량 · 단가</label></div>
        <div className="tbl-wrap"><table>
          <thead><tr><th style={{ textAlign: 'left' }}>품목</th><th style={{ width: 56 }}>수량</th><th style={{ width: 90 }}>단가</th><th style={{ width: 110 }}>금액</th><th style={{ width: 34 }}></th></tr></thead>
          <tbody>
            {o.rows.map((r, ri) => (
              <tr key={ri}>
                <td><input className="txt" value={r.item} placeholder="품목명" onChange={(e) => setRow(ri, 'item', e.target.value)} /></td>
                <td><input type="number" value={r.qty || ''} onChange={(e) => setRow(ri, 'qty', Number(e.target.value))} /></td>
                <td><input type="number" value={r.price || ''} placeholder="-" onChange={(e) => setRow(ri, 'price', Number(e.target.value))} /></td>
                <td><input type="number" className="num" value={(r.amt !== '' && r.amt != null) ? r.amt : (((r.qty || 0) * (r.price || 0)) || '')} placeholder="직접입력" onChange={(e) => setAmt(ri, e.target.value === '' ? '' : Number(e.target.value))} /></td>
                <td><button className="del-btn" onClick={() => delRow(ri)}>×</button></td>
              </tr>
            ))}
            <tr className="row-total"><td colSpan={3}>합계</td><td className="num">{fmt(total)}</td><td></td></tr>
          </tbody>
        </table></div>
        <button className="add-row-btn" onClick={addRow}>+ 품목 추가</button>

        <div className="fld" style={{ margin: '18px 0 6px' }}><label>이미지 (부착부위·시안)</label></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(o.images || []).map((url, i) => (
            <div key={i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removeImg(i)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, padding: '1px 6px', cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <label className="btn ghost sm" style={{ cursor: 'pointer', height: 74, width: 74, flexDirection: 'column', gap: 2 }}>
            {uploading ? '…' : <><span style={{ fontSize: 18 }}>+</span><span style={{ fontSize: 11 }}>이미지</span></>}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => upload([...e.target.files])} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn primary" style={{ flex: 2 }} onClick={save}>{init.isNew ? '발주 추가' : '수정 완료'}</button>
        </div>
      </div>
    </div>
  );
}

function SettleTable({ rows }) {
  let tp = 0, tu = 0;
  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th style={{ textAlign: 'left' }}>매장명</th><th style={{ width: 96 }}>프로모션</th><th style={{ width: 96 }}>팝업</th><th style={{ width: 96 }}>합계</th><th style={{ width: 110 }}>VAT포함</th></tr></thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={5} className="empty">발주를 등록하면 매장 기준으로 집계됩니다</td></tr>
        ) : (<>
          {rows.map((r, i) => { tp += r.promo; tu += r.popup; const t = r.promo + r.popup; return (
            <tr key={i}>
              <td style={{ textAlign: 'left', fontWeight: 600 }}>{r.store}</td>
              <td className="num">{r.promo ? fmt(r.promo) : '·'}</td>
              <td className="num">{r.popup ? fmt(r.popup) : '·'}</td>
              <td className="num" style={{ fontWeight: 800 }}>{fmt(t)}</td>
              <td className="num">{fmt(t * 1.1)}</td>
            </tr>); })}
          <tr className="row-total"><td>TOTAL</td><td className="num">{fmt(tp)}</td><td className="num">{fmt(tu)}</td><td className="num">{fmt(tp + tu)}</td><td className="num">{fmt((tp + tu) * 1.1)}</td></tr>
        </>)}
      </tbody>
    </table></div>
  );
}

function QuoteCompare({ S, promo, popup, onFiles, emailReq, emailRecheck, onCopy }) {
  const dropRef = useRef(null);
  const fileRef = useRef(null);
  const qT = (S.quoteItems || []).reduce((a, q) => a + (q.amt || 0), 0);
  const my = promo + popup;
  const diff = qT - my;
  const hasData = (S.quoteItems || []).length || (S.quoteFiles || []).length;
  return (
    <>
      <div className="card">
        <div className="lbl">STEP 3 · 견적 대조</div>
        <h2>업체 견적서 대조</h2>
        <p className="sub">먼저 견적서를 요청하고, 받은 견적서를 업로드해 발주 합계와 비교하세요.</p>
        <div className="email-box" style={{ maxHeight: 180 }}>{emailReq}</div>
        <div className="btn-row" style={{ marginTop: 10, marginBottom: 4 }}><button className="btn sm" onClick={() => onCopy(emailReq)}>견적서 요청 메일 복사</button></div>
        <div className="drop" ref={dropRef} style={{ marginTop: 12 }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('over'); }}
          onDragLeave={() => dropRef.current?.classList.remove('over')}
          onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('over'); onFiles(e.dataTransfer.files); }}>
          견적서(.xls·.xlsx) 끌어다 놓거나 클릭
        </div>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" multiple style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />
        {S.quoteFiles?.length > 0 && <p className="note">업로드: {S.quoteFiles.join(', ')}</p>}
      </div>
      {hasData ? (
        <div className="card">
          <div className="strip">
            <div className="stat"><div className="l">내 발주 합계</div><div className="v p">{fmt(my)}</div></div>
            <div className="stat"><div className="l">견적서 합계</div><div className="v">{fmt(qT)}</div></div>
            <div className="stat"><div className="l">차이</div><div className={'v ' + (diff === 0 ? 'g' : 'r')}>{(diff > 0 ? '+' : '') + fmt(diff)}</div></div>
          </div>
          <div style={{ marginBottom: 8 }}>{diff === 0 ? <span className="badge ok">✓ 금액 일치</span> : <span className="badge diff">⚠ {fmt(Math.abs(diff))}원 차이 — 확인 필요</span>}</div>
          <div className="tbl-wrap"><table>
            <thead><tr><th style={{ textAlign: 'left' }}>추출 항목</th><th style={{ width: 56 }}>수량</th><th style={{ width: 90 }}>단가</th><th style={{ width: 100 }}>금액</th></tr></thead>
            <tbody>
              {S.quoteItems.map((q, i) => (<tr key={i}><td style={{ textAlign: 'left' }}>{q.item}</td><td className="num">{q.qty}</td><td className="num">{fmt(q.price)}</td><td className="num">{fmt(q.amt)}</td></tr>))}
              <tr className="row-total"><td colSpan={3}>견적서 합계</td><td className="num">{fmt(qT)}</td></tr>
            </tbody>
          </table></div>
          {diff !== 0 && (
            <>
              <div className="email-box" style={{ maxHeight: 160 }}>{emailRecheck}</div>
              <div className="btn-row"><button className="btn sm" onClick={() => onCopy(emailRecheck)}>금액 재확인 메일 복사</button></div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
