'use client';
import { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '../../_components/Toast';
import { fmt, orderAmount, sumAmount, settleByStore, promoStoreTotal, PROMO_PRESET } from '@/lib/util';
import { buildEmails } from '@/lib/emails';

const CFG_FIELDS = ['deadline', 'vendor', 'contact', 'sender', 'company', 'bizNum'];
const uid = () => Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const STEPS = [
  { key: 'setup', label: '설정' }, { key: 'orders', label: '발주' }, { key: 'compare', label: '견적 대조' },
  { key: 'settle', label: '정산서' }, { key: 'tax', label: '세금계산서' }, { key: 'memo', label: '지출품의' },
];

const emptyPromo = () => ({ id: uid(), type: 'promo', name: '', arriveDate: '', specs: PROMO_PRESET.map((s) => ({ ...s })), stores: [{ name: '', category: '', note: '', qty: {} }], images: [] });
const emptyPopup = () => ({ id: uid(), type: 'popup', name: '', store: '', orderDate: '', parts: [{ name: '백월', attach: '', spec: '', sizes: [{ gu: 'A', out: '', real: '', qty: 1 }], amount: '', images: [] }] });

async function uploadImages(files, toast) {
  const urls = [];
  for (const f of files) {
    if (!f.type?.startsWith('image/')) continue;
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok) urls.push(d.url); else toast?.(d.error || '업로드 실패');
    } catch { toast?.('업로드 실패'); }
  }
  return urls;
}

export default function SettlementWizard() {
  const { id } = useParams();
  const router = useRouter();
  const { toast, ToastEl } = useToast();
  const [S, setS] = useState(null);
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const [chooser, setChooser] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const skipSave = useRef(true);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/settlements/${id}`, { cache: 'no-store' });
      if (r.ok) { skipSave.current = true; setS(await r.json()); } else toast('정산을 불러올 수 없어요');
    })();
  }, [id]);

  useEffect(() => {
    if (!S) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const t = setTimeout(async () => {
      const body = {};
      ['year', 'month', ...CFG_FIELDS, 'orders', 'quoteItems', 'quoteFiles', 'status', 'checks', 'final'].forEach((k) => { body[k] = S[k]; });
      setSaveState('saving');
      try { await fetch(`/api/settlements/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setSaveState('saved'); }
      catch { setSaveState('idle'); }
    }, 600);
    return () => clearTimeout(t);
  }, [S, id]);

  const patch = useCallback((p) => setS((prev) => ({ ...prev, ...p })), []);
  if (!S) return <div className="page"><div className="empty">불러오는 중…</div></div>;

  const promo = sumAmount(S.orders, 'promo');
  const popup = sumAmount(S.orders, 'popup');
  // 세금계산서·품의에 들어갈 확정 금액(견적서 기준). 비어있으면 발주 총액 사용.
  const hasFinalP = S.final?.promo !== undefined && S.final?.promo !== null && S.final?.promo !== '';
  const hasFinalU = S.final?.popup !== undefined && S.final?.popup !== null && S.final?.popup !== '';
  const promoFinal = hasFinalP ? Number(S.final.promo) : promo;
  const popupFinal = hasFinalU ? Number(S.final.popup) : popup;
  const cfg = { year: S.year, month: S.month, deadline: S.deadline, vendor: S.vendor, contact: S.contact, sender: S.sender, company: S.company, bizNum: S.bizNum };
  const emails = buildEmails(cfg, { promo: promoFinal, popup: popupFinal });
  const copyT = (t) => navigator.clipboard.writeText(t).then(() => toast('복사했어요!')).catch(() => toast('복사 실패'));
  const toggleCheck = (oid) => patch({ checks: { ...(S.checks || {}), [oid]: !(S.checks?.[oid]) } });
  const setFinal = (k, v) => patch({ final: { ...(S.final || {}), [k]: v } });

  const saveOrder = (order, isNew) => {
    setS((prev) => ({ ...prev, orders: isNew ? [...prev.orders, order] : prev.orders.map((o) => o.id === order.id ? order : o) }));
    setEditOrder(null);
    toast(isNew ? '발주를 추가했어요' : '발주를 수정했어요');
  };
  const delOrder = (oid) => { if (!confirm('이 발주를 삭제할까요?')) return; setS((prev) => ({ ...prev, orders: prev.orders.filter((o) => o.id !== oid) })); };

  // 받은 견적서 첨부(파일명 기록만). 대조는 아래 체크리스트로 수동 확인.
  const handleQuotes = (files) => {
    const names = [...files].map((f) => f.name);
    patch({ quoteFiles: [...(S.quoteFiles || []), ...names] });
    toast(names.length + '개 견적서를 첨부했어요');
  };

  const rows = settleByStore(S.orders);
  const downloadSettle = async () => {
    const XLSX = await import('xlsx');
    const data = [[`[${S.year % 100}년 ${S.month}월 매장별 정산서] 팝업 / 프로모션`], [], ['매장명', '프로모션', '팝업', '매장별 TOTAL', 'TOTAL(VAT포함)']];
    let tp = 0, tu = 0;
    rows.forEach((r) => { tp += r.promo; tu += r.popup; data.push([r.store, r.promo, r.popup, r.promo + r.popup, Math.round((r.promo + r.popup) * 1.1)]); });
    data.push(['TOTAL', tp, tu, tp + tu, Math.round((tp + tu) * 1.1)]);
    const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{ wch: 24 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 17 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '취합');
    XLSX.writeFile(wb, `_${S.year}_${S.month}월_매장별_정산서.xlsx`); toast('정산서를 다운로드했어요');
  };

  const cur = STEPS[step];
  const go = (i) => { if (i >= 0 && i < STEPS.length) { setStep(i); window.scrollTo(0, 0); } };

  return (
    <>
      <div className="stepper">
        {STEPS.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <div className={'bar' + (i <= step ? ' done' : '')} />}
            <div className={'st clickable' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => go(i)}>
              <span className="dot">{i < step ? '✓' : i + 1}</span><span className="nm">{s.label}</span>
            </div>
          </Fragment>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', paddingLeft: 12 }}>
          {saveState !== 'idle' && <span className={'savestate ' + saveState}><span className="dot" />{saveState === 'saving' ? '저장 중…' : '저장됨'}</span>}
        </span>
      </div>

      <div className="page" style={{ paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 10 }}>{S.year}년 {S.month}월 정산 · {step + 1}/{STEPS.length}</div>

        {cur.key === 'setup' && (
          <div className="card">
            <div className="lbl">STEP 1 · 정산 설정</div>
            <h2>정산 기본 정보</h2>
            <p className="sub">업체·발신자 정보는 기본값이 채워져 있어요. 정산 대상 월은 “발주가 나간 달”입니다.</p>
            <div className="grid2">
              <div className="fld"><label>정산 대상 연도</label><input type="number" value={S.year} onChange={(e) => patch({ year: Number(e.target.value) })} /></div>
              <div className="fld"><label>정산 대상 월 (발주월)</label><input type="number" min={1} max={12} value={S.month} onChange={(e) => patch({ month: Number(e.target.value) })} /></div>
              <div className="fld"><label>업체명</label><input value={S.vendor} onChange={(e) => patch({ vendor: e.target.value })} /></div>
              <div className="fld"><label>업체 담당자</label><input value={S.contact} onChange={(e) => patch({ contact: e.target.value })} /></div>
              <div className="fld"><label>발신자 (본인)</label><input value={S.sender} onChange={(e) => patch({ sender: e.target.value })} /></div>
              <div className="fld"><label>회사명</label><input value={S.company} onChange={(e) => patch({ company: e.target.value })} /></div>
              <div className="fld"><label>사업자등록번호</label><input value={S.bizNum} onChange={(e) => patch({ bizNum: e.target.value })} /></div>
              <div className="fld"><label>세금계산서 마감일 (익월)</label><input type="number" value={S.deadline} onChange={(e) => patch({ deadline: Number(e.target.value) })} /></div>
            </div>
          </div>
        )}

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
              <p className="sub">‘발주 추가’ → 형태(프로모션·팝업)를 고르면 형태에 맞는 양식이 열립니다.</p>
              <button className="btn primary lg" onClick={() => setChooser(true)}>+ 발주 추가</button>
              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                {S.orders.length === 0 ? <div className="empty">아직 발주가 없어요.</div> : S.orders.map((o) => (
                  <div key={o.id} className="order-item" style={{ cursor: 'pointer' }} onClick={() => setEditOrder({ order: JSON.parse(JSON.stringify(o)), isNew: false })}>
                    <div className="order-head">
                      <span className={'badge ' + o.type}>{o.type === 'promo' ? '프로모션' : '팝업'}</span>
                      <span className="nm">{o.type === 'promo' ? (o.name || '(발주명 없음)') + ` · 매장 ${(o.stores || []).length}곳` : (o.store || '(매장 없음)') + (o.name ? ` · ${o.name}` : '')}</span>
                      <span className="amt">{fmt(orderAmount(o))}원</span>
                      <button className="del-btn" onClick={(e) => { e.stopPropagation(); delOrder(o.id); }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {cur.key === 'compare' && (
          <QuoteChecklist S={S} orders={S.orders} promo={promo} popup={popup} promoFinal={promoFinal} popupFinal={popupFinal}
            onToggle={toggleCheck} onFinal={setFinal} onFiles={handleQuotes} emailReq={emails.em1} onCopy={copyT} />
        )}

        {cur.key === 'settle' && (
          <div className="card">
            <div className="lbl">STEP 4 · 매장별 정산서</div>
            <h2>매장별 정산서</h2>
            <p className="sub">프로모션은 매장별로, 팝업은 매장 기준으로 자동 집계됩니다.</p>
            <SettleTable rows={rows} />
            <div className="btn-row"><button className="btn green" onClick={downloadSettle}>엑셀 다운로드</button></div>
            <p className="note">※ 내부 ‘매장별 정산서’ 취합 양식이 있으면 그 양식에 맞춰 출력하도록 적용 예정.</p>
          </div>
        )}

        {cur.key === 'tax' && (
          <div className="card"><div className="lbl">STEP 5 · 세금계산서</div><h2>세금계산서 발행 요청</h2>
            <p className="sub">정산 금액 확정 후 업체에 세금계산서 발행을 요청하세요.</p>
            <div className="email-box">{emails.em3}</div>
            <div className="btn-row"><button className="btn primary" onClick={() => copyT(emails.em3)}>메일 본문 복사</button></div>
          </div>
        )}
        {cur.key === 'memo' && (
          <div className="card"><div className="lbl">STEP 6 · 지출품의</div><h2>지출품의서 내용</h2>
            <p className="sub">아래 내용을 그룹웨어 지출품의서에 붙여넣어 상신하세요.</p>
            <div className="email-box">{emails.memo}</div>
            <div className="btn-row"><button className="btn primary" onClick={() => copyT(emails.memo)}>내용 복사</button></div>
          </div>
        )}
      </div>

      <div className="wizard-foot"><div className="inner">
        <button className="btn ghost" onClick={() => (step === 0 ? router.push('/') : go(step - 1))}>{step === 0 ? '나가기' : '이전'}</button>
        {step < STEPS.length - 1
          ? <button className="btn primary" style={{ flex: 1 }} onClick={() => go(step + 1)}>다음 · {STEPS[step + 1].label}</button>
          : <button className="btn green" style={{ flex: 1 }} onClick={() => { patch({ status: 'done' }); toast('정산 완료 처리했어요'); router.push('/'); }}>정산 완료</button>}
      </div></div>

      {chooser && (
        <div className="modal-back" onClick={() => setChooser(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>발주 형태 선택</h3>
            <p className="msub">형태에 따라 입력 양식이 달라요.</p>
            <div className="type-pick">
              <div className="type-card promo on" onClick={() => { setEditOrder({ order: emptyPromo(), isNew: true }); setChooser(false); }}>
                <div className="ico">🎯</div><div className="tt">프로모션 발주</div><div className="td">매장 × 규격 수량 매트릭스</div>
              </div>
              <div className="type-card popup on" onClick={() => { setEditOrder({ order: emptyPopup(), isNew: true }); setChooser(false); }}>
                <div className="ico">🏬</div><div className="tt">팝업 발주</div><div className="td">부위별 스펙 · 금액</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOrder && (editOrder.order.type === 'promo'
        ? <PromoForm init={editOrder} onSave={saveOrder} onClose={() => setEditOrder(null)} toast={toast} />
        : <PopupForm init={editOrder} onSave={saveOrder} onClose={() => setEditOrder(null)} toast={toast} />)}
      {ToastEl}
    </>
  );
}

/* ── 프로모션: 매장 × 규격 매트릭스 ── */
function PromoForm({ init, onSave, onClose, toast }) {
  const [o, setO] = useState(init.order);
  const [showSpec, setShowSpec] = useState(false);
  const [uploading, setUploading] = useState(false);
  const specs = o.specs || [];
  const setStore = (si, p) => setO((x) => ({ ...x, stores: x.stores.map((s, i) => i === si ? { ...s, ...p } : s) }));
  const setQty = (si, key, v) => setO((x) => ({ ...x, stores: x.stores.map((s, i) => i === si ? { ...s, qty: { ...s.qty, [key]: v } } : s) }));
  const addStore = () => setO((x) => ({ ...x, stores: [...x.stores, { name: '', category: '', note: '', qty: {} }] }));
  const delStore = (si) => setO((x) => ({ ...x, stores: x.stores.filter((_, i) => i !== si) }));
  const setSpec = (idx, p) => setO((x) => ({ ...x, specs: x.specs.map((s, i) => i === idx ? { ...s, ...p } : s) }));
  const addSpec = () => setO((x) => ({ ...x, specs: [...x.specs, { key: 'k' + uid(), name: '새 규격', size: '', price: 0 }] }));
  const delSpec = (idx) => setO((x) => ({ ...x, specs: x.specs.filter((_, i) => i !== idx) }));

  const grandAmt = (o.stores || []).reduce((a, s) => a + promoStoreTotal(s, specs), 0);
  const upload = async (files) => { setUploading(true); const u = await uploadImages(files, toast); setO((x) => ({ ...x, images: [...(x.images || []), ...u] })); setUploading(false); };

  const save = () => { if (!o.name?.trim()) { toast('발주명을 입력하세요'); return; } if (!(o.stores || []).some((s) => s.name?.trim())) { toast('매장을 1곳 이상 입력하세요'); return; } onSave(o, init.isNew); };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3><span className="badge promo" style={{ marginRight: 8 }}>프로모션</span>{init.isNew ? '발주 추가' : '발주 수정'}</h3>
        <div className="grid2" style={{ margin: '16px 0 14px' }}>
          <div className="fld"><label>발주명</label><input value={o.name} placeholder="예: 6월 전사프로모션" onChange={(e) => setO({ ...o, name: e.target.value })} /></div>
          <div className="fld"><label>매장 도착 요청일</label><input value={o.arriveDate} placeholder="2026. 5. 29(금)" onChange={(e) => setO({ ...o, arriveDate: e.target.value })} /></div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="lbl" style={{ margin: 0 }}>규격 · 단가</div>
          <button className="btn sm ghost" onClick={() => setShowSpec((v) => !v)}>{showSpec ? '접기' : '규격·단가 편집'}</button>
        </div>
        {showSpec && (
          <div className="tbl-wrap" style={{ marginBottom: 12 }}><table>
            <thead><tr><th style={{ textAlign: 'left' }}>규격명</th><th>사이즈</th><th style={{ width: 90 }}>단가</th><th style={{ width: 50 }}>택배</th><th style={{ width: 34 }}></th></tr></thead>
            <tbody>{specs.map((sp, i) => (
              <tr key={sp.key}>
                <td><input className="txt" value={sp.name} onChange={(e) => setSpec(i, { name: e.target.value })} /></td>
                <td><input value={sp.size} onChange={(e) => setSpec(i, { size: e.target.value })} /></td>
                <td><input type="number" className="num" value={sp.price || ''} onChange={(e) => setSpec(i, { price: Number(e.target.value) })} /></td>
                <td><input type="checkbox" checked={!!sp.fee} onChange={(e) => setSpec(i, { fee: e.target.checked })} /></td>
                <td><button className="del-btn" onClick={() => delSpec(i)}>×</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {showSpec && <button className="add-row-btn" style={{ marginBottom: 14 }} onClick={addSpec}>+ 규격 추가</button>}

        <div className="lbl">매장별 발주 수량</div>
        <div className="tbl-wrap"><table>
          <thead><tr>
            <th style={{ textAlign: 'left', minWidth: 110 }}>매장명</th><th style={{ minWidth: 70 }}>구분</th>
            {specs.map((sp) => <th key={sp.key} style={{ minWidth: 52 }}>{sp.name}</th>)}
            <th style={{ minWidth: 90 }}>정산</th><th style={{ width: 30 }}></th>
          </tr></thead>
          <tbody>
            {o.stores.map((s, si) => (
              <tr key={si}>
                <td><input className="txt" value={s.name} placeholder="매장명" onChange={(e) => setStore(si, { name: e.target.value })} /></td>
                <td><input value={s.category} placeholder="스탠드" onChange={(e) => setStore(si, { category: e.target.value })} /></td>
                {specs.map((sp) => <td key={sp.key}><input type="number" value={s.qty[sp.key] || ''} onChange={(e) => setQty(si, sp.key, Number(e.target.value))} /></td>)}
                <td className="num" style={{ fontWeight: 700 }}>{fmt(promoStoreTotal(s, specs))}</td>
                <td><button className="del-btn" onClick={() => delStore(si)}>×</button></td>
              </tr>
            ))}
            <tr className="row-total">
              <td style={{ textAlign: 'left' }}>합계</td><td></td>
              {specs.map((sp) => <td key={sp.key} className="num">{o.stores.reduce((a, s) => a + (Number(s.qty[sp.key]) || 0), 0)}</td>)}
              <td className="num">{fmt(grandAmt)}</td><td></td>
            </tr>
          </tbody>
        </table></div>
        <button className="add-row-btn" onClick={addStore}>+ 매장 추가</button>

        <ImageStrip images={o.images} uploading={uploading} onUpload={upload} onRemove={(idx) => setO({ ...o, images: o.images.filter((_, i) => i !== idx) })} />
        <FormFoot isNew={init.isNew} onClose={onClose} onSave={save} />
      </div>
    </div>
  );
}

/* ── 팝업: 부위별 스펙 + 금액 ── */
function PopupForm({ init, onSave, onClose, toast }) {
  const [o, setO] = useState(init.order);
  const setPart = (pi, p) => setO((x) => ({ ...x, parts: x.parts.map((pt, i) => i === pi ? { ...pt, ...p } : pt) }));
  const addPart = () => setO((x) => ({ ...x, parts: [...x.parts, { name: '', attach: '', spec: '', sizes: [{ gu: 'A', out: '', real: '', qty: 1 }], amount: '', images: [] }] }));
  const delPart = (pi) => setO((x) => ({ ...x, parts: x.parts.filter((_, i) => i !== pi) }));
  const setSize = (pi, si, p) => setO((x) => ({ ...x, parts: x.parts.map((pt, i) => i === pi ? { ...pt, sizes: pt.sizes.map((s, j) => j === si ? { ...s, ...p } : s) } : pt) }));
  const addSize = (pi) => setO((x) => ({ ...x, parts: x.parts.map((pt, i) => i === pi ? { ...pt, sizes: [...pt.sizes, { gu: '', out: '', real: '', qty: 1 }] } : pt) }));
  const delSize = (pi, si) => setO((x) => ({ ...x, parts: x.parts.map((pt, i) => i === pi ? { ...pt, sizes: pt.sizes.filter((_, j) => j !== si) } : pt) }));

  const total = (o.parts || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const uploadPart = async (pi, files) => { const u = await uploadImages(files, toast); setO((x) => ({ ...x, parts: x.parts.map((pt, i) => i === pi ? { ...pt, images: [...(pt.images || []), ...u] } : pt) })); };

  const save = () => { if (!o.store?.trim()) { toast('매장명(위치)을 입력하세요'); return; } onSave(o, init.isNew); };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3><span className="badge popup" style={{ marginRight: 8 }}>팝업</span>{init.isNew ? '발주 추가' : '발주 수정'}</h3>
        <div className="grid2" style={{ margin: '16px 0 14px' }}>
          <div className="fld"><label>매장명 (위치)</label><input value={o.store} placeholder="예: 스타필드 하남" onChange={(e) => setO({ ...o, store: e.target.value })} /></div>
          <div className="fld"><label>발주요청일</label><input value={o.orderDate} placeholder="2026. 2. 27(금)" onChange={(e) => setO({ ...o, orderDate: e.target.value })} /></div>
        </div>

        {o.parts.map((pt, pi) => (
          <div key={pi} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input className="txt" value={pt.name} placeholder="부위명 (예: 백월 / 바닥 띠지)" style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontWeight: 700, background: 'var(--surface-2)' }} onChange={(e) => setPart(pi, { name: e.target.value })} />
              <button className="del-btn" onClick={() => delPart(pi)}>×</button>
            </div>
            <div className="grid2" style={{ marginBottom: 10 }}>
              <div className="fld"><label>그래픽 부착 부위</label><input value={pt.attach} placeholder="백월용 칼락스장 위 덧방" onChange={(e) => setPart(pi, { attach: e.target.value })} /></div>
              <div className="fld"><label>제작 스펙</label><input value={pt.spec} placeholder="포멕스 / 그레이켈지" onChange={(e) => setPart(pi, { spec: e.target.value })} /></div>
            </div>
            <div className="tbl-wrap"><table>
              <thead><tr><th style={{ width: 44 }}>구분</th><th>출력 사이즈(여유분)</th><th>실측 사이즈</th><th style={{ width: 50 }}>수량</th><th style={{ width: 30 }}></th></tr></thead>
              <tbody>
                {pt.sizes.map((sz, si) => (
                  <tr key={si}>
                    <td><input value={sz.gu} onChange={(e) => setSize(pi, si, { gu: e.target.value })} /></td>
                    <td><input className="txt" value={sz.out} placeholder="3180 * 1570" onChange={(e) => setSize(pi, si, { out: e.target.value })} /></td>
                    <td><input className="txt" value={sz.real} placeholder="3080 * 1470" onChange={(e) => setSize(pi, si, { real: e.target.value })} /></td>
                    <td><input type="number" value={sz.qty || ''} onChange={(e) => setSize(pi, si, { qty: Number(e.target.value) })} /></td>
                    <td><button className="del-btn" onClick={() => delSize(pi, si)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <button className="add-row-btn" onClick={() => addSize(pi)}>+ 사이즈 추가</button>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
              <div className="fld" style={{ width: 180 }}><label>이 부위 금액 (직접입력)</label><input type="number" value={pt.amount} placeholder="0" onChange={(e) => setPart(pi, { amount: e.target.value })} /></div>
              <div style={{ flex: 1 }} />
            </div>
            <ImageStrip images={pt.images} onUpload={(files) => uploadPart(pi, files)} onRemove={(idx) => setPart(pi, { images: pt.images.filter((_, i) => i !== idx) })} label="부위 이미지" />
          </div>
        ))}
        <button className="add-row-btn" onClick={addPart}>+ 부위 추가</button>

        <div className="row-total" style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 'var(--radius-sm)', marginTop: 14, fontWeight: 800 }}>
          <span>팝업 발주 합계</span><span className="num" style={{ fontSize: 17 }}>{fmt(total)}원</span>
        </div>
        <FormFoot isNew={init.isNew} onClose={onClose} onSave={save} />
      </div>
    </div>
  );
}

function ImageStrip({ images = [], uploading, onUpload, onRemove, label = '이미지 (부착부위·시안)' }) {
  return (
    <>
      <div className="fld" style={{ margin: '16px 0 6px' }}><label>{label}</label></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {images.map((url, i) => (
          <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={() => onRemove(i)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, padding: '1px 6px', cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <label className="btn ghost sm" style={{ cursor: 'pointer', height: 72, width: 72, flexDirection: 'column', gap: 2 }}>
          {uploading ? '…' : <><span style={{ fontSize: 18 }}>+</span><span style={{ fontSize: 11 }}>업로드</span></>}
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => onUpload([...e.target.files])} />
        </label>
      </div>
    </>
  );
}

function FormFoot({ isNew, onClose, onSave }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 22, position: 'sticky', bottom: 0, background: 'var(--surface)', paddingTop: 8 }}>
      <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
      <button className="btn primary" style={{ flex: 2 }} onClick={onSave}>{isNew ? '발주 추가' : '수정 완료'}</button>
    </div>
  );
}

function SettleTable({ rows }) {
  let tp = 0, tu = 0;
  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th style={{ textAlign: 'left' }}>매장명</th><th style={{ width: 96 }}>프로모션</th><th style={{ width: 96 }}>팝업</th><th style={{ width: 96 }}>합계</th><th style={{ width: 110 }}>VAT포함</th></tr></thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={5} className="empty">발주를 등록하면 매장 기준으로 집계됩니다</td></tr> : (<>
          {rows.map((r, i) => { tp += r.promo; tu += r.popup; const t = r.promo + r.popup; return (
            <tr key={i}><td style={{ textAlign: 'left', fontWeight: 600 }}>{r.store}</td><td className="num">{r.promo ? fmt(r.promo) : '·'}</td><td className="num">{r.popup ? fmt(r.popup) : '·'}</td><td className="num" style={{ fontWeight: 800 }}>{fmt(t)}</td><td className="num">{fmt(t * 1.1)}</td></tr>); })}
          <tr className="row-total"><td>TOTAL</td><td className="num">{fmt(tp)}</td><td className="num">{fmt(tu)}</td><td className="num">{fmt(tp + tu)}</td><td className="num">{fmt((tp + tu) * 1.1)}</td></tr>
        </>)}
      </tbody>
    </table></div>
  );
}

function orderCheckItems(o) {
  if (o.type === 'promo') {
    return (o.stores || []).map((st, i) => ({
      key: `${o.id}:s${i}`,
      title: st.name || '(매장)',
      detail: (o.specs || []).filter((sp) => Number(st.qty?.[sp.key]) > 0).map((sp) => `${sp.name}×${st.qty[sp.key]}`).join(' · ') || '수량 없음',
      amt: promoStoreTotal(st, o.specs || []),
    }));
  }
  return (o.parts || []).map((pt, i) => ({
    key: `${o.id}:p${i}`,
    title: pt.name || '(부위)',
    detail: [pt.spec, (pt.sizes || []).filter((s) => s.out || s.qty).map((s) => `${s.gu ? s.gu + ' ' : ''}${s.out || ''}${s.qty ? ' ×' + s.qty : ''}`).join(', ')].filter(Boolean).join(' / ') || '-',
    amt: Number(pt.amount) || 0,
  }));
}

function QuoteChecklist({ S, orders, promo, popup, promoFinal, popupFinal, onToggle, onFinal, onFiles, emailReq, onCopy }) {
  const fileRef = useRef(null);
  const [collapsed, setCollapsed] = useState({});
  const checks = S.checks || {};
  const allItems = orders.flatMap(orderCheckItems);
  const doneCount = allItems.filter((it) => checks[it.key]).length;
  const allChecked = allItems.length > 0 && doneCount === allItems.length;
  return (
    <>
      <div className="card">
        <div className="lbl">STEP 3 · 견적 대조</div>
        <h2>견적서 요청 & 대조</h2>
        <p className="sub">업체에 견적서를 요청하고, 받은 견적서를 보면서 발주 항목을 하나하나 대조해 체크하세요.</p>
        <div className="email-box" style={{ maxHeight: 160 }}>{emailReq}</div>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => onCopy(emailReq)}>견적서 요청 메일 복사</button>
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>받은 견적서 첨부</button>
        </div>
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.pdf" multiple style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />
        {S.quoteFiles?.length > 0 && <p className="note">첨부: {S.quoteFiles.join(', ')}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 17 }}>대조 체크리스트</h2>
          {allItems.length > 0 && (allChecked
            ? <span className="badge ok">✓ 전체 이상 없음</span>
            : <span className="badge gray">{doneCount}/{allItems.length} 확인</span>)}
        </div>
        <p className="sub">발주를 펼쳐 매장·부위별 내용을 견적서와 대조하고 체크하세요.</p>
        {orders.length === 0 ? <div className="empty">발주가 없습니다. STEP 2에서 먼저 등록하세요.</div> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {orders.map((o) => {
              const items = orderCheckItems(o);
              const oChk = items.filter((it) => checks[it.key]).length;
              const oDone = items.length > 0 && oChk === items.length;
              const col = collapsed[o.id];
              return (
                <div key={o.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <div onClick={() => setCollapsed((c) => ({ ...c, [o.id]: !c[o.id] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', cursor: 'pointer', background: oDone ? 'var(--green-soft)' : 'var(--surface-2)' }}>
                    <span className={'badge ' + o.type}>{o.type === 'promo' ? '프로모션' : '팝업'}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14.5 }}>{o.type === 'promo' ? (o.name || '(발주명 없음)') : (o.store || '(매장 없음)')}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: oDone ? 'var(--green)' : 'var(--ink-3)' }}>{oDone ? '✓ 완료' : `${oChk}/${items.length}`}</span>
                    <span className="num" style={{ fontWeight: 800, minWidth: 70, textAlign: 'right' }}>{fmt(orderAmount(o))}원</span>
                    <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{col ? '▸' : '▾'}</span>
                  </div>
                  {!col && (
                    <div style={{ padding: '10px 12px 12px', display: 'grid', gap: 6 }}>
                      {items.length === 0 ? <div className="note" style={{ padding: '4px 4px' }}>대조할 항목이 없어요.</div> : items.map((it) => (
                        <label key={it.key} className={'check-row' + (checks[it.key] ? ' on' : '')} style={{ padding: '11px 13px' }}>
                          <input type="checkbox" checked={!!checks[it.key]} onChange={() => onToggle(it.key)} />
                          <div className="nm" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>{it.title}</span>
                            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>{it.detail}</span>
                          </div>
                          <span className="amt">{fmt(it.amt)}원</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17 }}>확정 금액 (견적서 기준)</h2>
        <p className="sub">세금계산서·지출품의서에 들어갈 최종 공급가입니다. 발주 합계가 기본값이며, 견적서 금액과 다르면 수정하세요.</p>
        <div className="grid2">
          <div className="fld"><label>프로모션 공급가</label>
            <input type="number" value={S.final?.promo ?? ''} placeholder={String(promo)} onChange={(e) => onFinal('promo', e.target.value)} />
            <div className="note">발주 합계: {fmt(promo)}원</div></div>
          <div className="fld"><label>팝업 공급가</label>
            <input type="number" value={S.final?.popup ?? ''} placeholder={String(popup)} onChange={(e) => onFinal('popup', e.target.value)} />
            <div className="note">발주 합계: {fmt(popup)}원</div></div>
        </div>
        <div className="strip" style={{ marginTop: 14 }}>
          <div className="stat"><div className="l">합계 공급가</div><div className="v p">{fmt(promoFinal + popupFinal)}</div></div>
          <div className="stat"><div className="l">부가세</div><div className="v">{fmt(Math.round((promoFinal + popupFinal) * 0.1))}</div></div>
          <div className="stat"><div className="l">VAT포함 합계</div><div className="v g">{fmt(Math.round((promoFinal + popupFinal) * 1.1))}</div></div>
        </div>
      </div>
    </>
  );
}
