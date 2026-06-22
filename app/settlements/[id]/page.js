'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '../../_components/Toast';
import { fmt, orderTotal, sumBy, lineAmt } from '@/lib/util';
import { extractQuote } from '@/lib/quote';
import { buildEmails } from '@/lib/emails';

const CFG_FIELDS = ['deadline', 'vendor', 'contact', 'sender', 'company', 'bizNum'];
const uid = () => Date.now() + '_' + Math.random().toString(36).slice(2, 7);

export default function SettlementPage() {
  const { id } = useParams();
  const { toast, ToastEl } = useToast();
  const [S, setS] = useState(null);
  const [tab, setTab] = useState('setup');
  const [openOrder, setOpenOrder] = useState(null);
  const [forms, setForms] = useState([]);
  const [saveState, setSaveState] = useState('idle');
  const skipSave = useRef(true);

  const reloadForms = useCallback(() => {
    fetch(`/api/order-forms?settlementId=${id}`, { cache: 'no-store' }).then((r) => r.ok && r.json()).then((d) => d && setForms(d));
  }, [id]);

  // 로드
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/settlements/${id}`, { cache: 'no-store' });
      if (r.ok) { skipSave.current = true; setS(await r.json()); }
      else toast('정산을 불러올 수 없어요');
    })();
    reloadForms();
  }, [id, reloadForms]);

  // 자동 저장 (디바운스)
  useEffect(() => {
    if (!S) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const t = setTimeout(async () => {
      const body = {};
      ['year', 'month', ...CFG_FIELDS, 'orders', 'quoteItems', 'quoteFiles', 'status', 'steps'].forEach((k) => { body[k] = S[k]; });
      setSaveState('saving');
      try {
        await fetch(`/api/settlements/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        setSaveState('saved');
      } catch { setSaveState('idle'); }
    }, 600);
    return () => clearTimeout(t);
  }, [S, id]);

  const patch = useCallback((p) => setS((prev) => ({ ...prev, ...p })), []);
  // 항상 최신 상태(prev) 기준으로 orders를 갱신 — 빠른 연속 입력에서도 유실 없음
  const updateOrders = useCallback((fn) => setS((prev) => ({ ...prev, orders: fn(prev.orders) })), []);

  if (!S) return <div className="page"><div className="empty">불러오는 중…</div></div>;

  const promo = sumBy(S.orders, 'promo');
  const popup = sumBy(S.orders, 'popup');
  const cfg = { year: S.year, month: S.month, deadline: S.deadline, vendor: S.vendor, contact: S.contact, sender: S.sender, company: S.company, bizNum: S.bizNum };

  // ── 발주건 조작 ──
  // 발주를 수정하면 '작성중'으로 되돌림(다시 '등록 완료' 눌러 확정) — 자동저장은 백업으로 항상 동작
  const editOrder = (oid, fn) => updateOrders((orders) => orders.map((o) => o.id === oid ? { ...fn(o), registered: false } : o));
  const addOrder = (type) => {
    const o = { id: uid(), type, name: type === 'promo' ? '프로모션 발주' : '팝업 발주', store: '', rows: [{ item: '', qty: 1, price: 0 }], registered: false };
    setOpenOrder(o.id);
    updateOrders((orders) => [...orders, o]);
    toast(type === 'promo' ? '프로모션 발주를 추가했어요' : '팝업 발주를 추가했어요');
  };
  const delOrder = (oid) => { if (!confirm('이 발주 건을 삭제할까요?')) return; updateOrders((orders) => orders.filter((o) => o.id !== oid)); };
  const upOrder = (oid, k, v) => editOrder(oid, (o) => ({ ...o, [k]: v }));
  const upRow = (oid, ri, k, v) => editOrder(oid, (o) => ({ ...o, rows: o.rows.map((r, i) => i === ri ? { ...r, [k]: v } : r) }));
  // 수량/단가 입력 시: 직접입력 금액(amt)은 비워서 자동계산으로 복귀
  const upRowQP = (oid, ri, k, v) => editOrder(oid, (o) => ({ ...o, rows: o.rows.map((r, i) => i === ri ? { ...r, [k]: v, amt: '' } : r) }));
  // 금액 직접입력
  const upRowAmt = (oid, ri, v) => editOrder(oid, (o) => ({ ...o, rows: o.rows.map((r, i) => i === ri ? { ...r, amt: v } : r) }));
  const addRow = (oid) => editOrder(oid, (o) => ({ ...o, rows: [...o.rows, { item: '', qty: 1, price: 0 }] }));
  const delRow = (oid, ri) => editOrder(oid, (o) => ({ ...o, rows: o.rows.filter((_, i) => i !== ri) }));
  // 등록 완료: 검증 후 확정
  const registerOrder = (oid) => {
    const o = S.orders.find((x) => x.id === oid);
    if (!o) return;
    if (!o.store || !o.store.trim()) { toast('매장명을 먼저 입력하세요'); return; }
    if (orderTotal(o) <= 0) { toast('금액을 입력하세요 (수량×단가 또는 금액 직접입력)'); return; }
    updateOrders((orders) => orders.map((x) => x.id === oid ? { ...x, registered: true } : x));
    setOpenOrder(null);
    toast('등록 완료 ✓');
  };

  // ── ⓪ 발주요청서 ──
  // 이 정산월에 연결된 새 발주요청서 생성 → 편집기 새 탭으로
  const createOrderForm = async () => {
    const r = await fetch('/api/order-forms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlementId: id, common: { vendor: S.vendor, vendorMgr: S.contact, buyer: S.company } }),
    });
    if (r.ok) { const d = await r.json(); window.open(`/order-forms/${d._id}`, '_blank'); setTimeout(reloadForms, 500); }
    else toast('생성 실패');
  };
  // 발주요청서 → 정산 발주건으로 반영(불러오기). importForm은 드롭다운/카드 공용.
  const importForm = async (formId) => {
    const r = await fetch(`/api/order-forms/${formId}/to-settlement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settlementId: id }),
    });
    if (r.ok) {
      const fresh = await fetch(`/api/settlements/${id}`, { cache: 'no-store' });
      skipSave.current = true; setS(await fresh.json());
      toast('정산 발주건으로 반영했어요');
    } else toast('반영 실패');
  };
  const reflectedFormIds = new Set((S.orders || []).map((o) => o.sourceFormId).filter(Boolean));

  // ── 견적 대조 ──
  const handleQuotes = async (files) => {
    const XLSX = await import('xlsx');
    const items = []; const names = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        wb.SheetNames.forEach((sn) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null });
          extractQuote(rows).forEach((it) => items.push(it));
        });
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
    toast('정산서가 다운로드되었어요');
  };

  const emails = buildEmails(cfg, { promo, popup });
  const copyT = (text) => navigator.clipboard.writeText(text).then(() => toast('복사했어요!')).catch(() => toast('복사 실패'));
  const toggleStep = (key) => { const next = !(S.steps?.[key]); patch({ steps: { ...(S.steps || {}), [key]: next } }); toast(next ? '단계 완료 ✓' : '완료 해제'); };

  // 월말 정산 흐름: 발주 취합 → ①견적대조 → ②정산서 → ③세금계산서 → ④품의
  const TABS = [
    { k: 'setup', label: '설정' },
    { k: 'orders', label: '⓪ 발주' },
    { k: 'compare', label: '① 견적 대조', step: 'compare' },
    { k: 'settle', label: '② 매장별 정산서', step: 'settle' },
    { k: 'tax', label: '③ 세금계산서', step: 'tax' },
    { k: 'memo', label: '④ 지출품의', step: 'memo' },
  ];

  return (
    <>
      <div className="tabs">
        <div className="tabs-inner">
          {TABS.map((t) => {
            const done = t.step && S.steps?.[t.step];
            return (
              <button key={t.k} className={'tab' + (tab === t.k ? ' on' : '') + (done ? ' done' : '')} onClick={() => setTab(t.k)}>
                {done ? '✓ ' : ''}{t.label}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 16 }}>
            {saveState !== 'idle' && (
              <span className={'savestate ' + saveState}><span className="dot" />{saveState === 'saving' ? '저장 중…' : '저장됨'}</span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{S.year}년 {S.month}월 정산</span>
          </span>
        </div>
      </div>

      <div className="page">
        {/* ── 설정 ── */}
        {tab === 'setup' && (
          <>
            <div className="card">
              <div className="lbl">기본 정보</div>
              <h2>정산 설정</h2>
              <p className="sub">정산 대상 월은 “발주가 나간 달”입니다. 이메일·품의서에 자동 반영됩니다.</p>
              <div className="grid3">
                <div className="fld"><label>정산 대상 연도</label>
                  <input type="number" value={S.year} onChange={(e) => patch({ year: Number(e.target.value) })} /></div>
                <div className="fld"><label>정산 대상 월 (발주월)</label>
                  <input type="number" min={1} max={12} value={S.month} onChange={(e) => patch({ month: Number(e.target.value) })} /></div>
                <div className="fld"><label>세금계산서 마감일 (익월)</label>
                  <input type="number" value={S.deadline} onChange={(e) => patch({ deadline: Number(e.target.value) })} /></div>
                <div className="fld"><label>업체명</label>
                  <input value={S.vendor} onChange={(e) => patch({ vendor: e.target.value })} /></div>
                <div className="fld"><label>업체 담당자</label>
                  <input value={S.contact} onChange={(e) => patch({ contact: e.target.value })} /></div>
                <div className="fld"><label>발신자 (본인)</label>
                  <input value={S.sender} onChange={(e) => patch({ sender: e.target.value })} /></div>
                <div className="fld"><label>회사명</label>
                  <input value={S.company} onChange={(e) => patch({ company: e.target.value })} /></div>
                <div className="fld"><label>사업자등록번호</label>
                  <input value={S.bizNum} onChange={(e) => patch({ bizNum: e.target.value })} /></div>
              </div>
            </div>
          </>
        )}

        {/* ── ⓪ 발주 (발주요청서 + 발주 건) ── */}
        {tab === 'orders' && (
          <>
            <div className="card">
              <div className="lbl">⓪ 발주</div>
              <h2>발주요청서 (현장 시공팀 전달용)</h2>
              <p className="sub">이 달 나간 발주를 발주요청서로 작성해 PDF로 전달하고, ‘정산 발주건으로 반영’하면 아래 발주 건에 자동 등록됩니다.</p>
              <div className="btn-row" style={{ marginTop: 0, marginBottom: forms.length ? 12 : 0 }}>
                <button className="btn primary sm" onClick={createOrderForm}>+ 새 발주요청서 작성</button>
              </div>
              {forms.length > 0 && (
                <div className="tbl-wrap"><table>
                  <thead><tr><th style={{ textAlign: 'left' }}>발주요청서</th><th style={{ width: 70 }}>페이지</th><th style={{ width: 90 }}>반영</th><th style={{ width: 220 }}></th></tr></thead>
                  <tbody>
                    {forms.map((f) => (
                      <tr key={f._id}>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>{f.title || f.place || '(제목 없음)'}</td>
                        <td>{f.sheetCount}</td>
                        <td>{reflectedFormIds.has(f._id) ? <span className="badge ok">반영됨</span> : <span className="badge gray">미반영</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <a className="btn sm" href={`/order-forms/${f._id}`} target="_blank" rel="noreferrer">열기·편집</a>{' '}
                          <button className="btn sm green" onClick={() => importForm(f._id)}>정산 발주건으로 반영</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>

            <div className="strip">
              <div className="stat"><div className="l">등록된 발주 건</div><div className="v">{S.orders.length}건</div></div>
              <div className="stat"><div className="l">프로모션 합계</div><div className="v p">{fmt(promo)}원</div></div>
              <div className="stat"><div className="l">팝업 합계</div><div className="v">{fmt(popup)}원</div></div>
              <div className="stat"><div className="l">전체 (VAT포함)</div><div className="v g">{fmt((promo + popup) * 1.1)}원</div></div>
            </div>
            <div className="card">
              <div className="lbl">발주 등록</div>
              <h2>이 달에 나간 발주 건</h2>
              <p className="sub">프로모션·팝업 발주를 건별로 등록하거나, 발주요청서에서 바로 불러오세요. 금액은 ‘수량×단가’로 자동계산되며, <b>금액 칸에 직접 입력하면 그 값이 우선</b>됩니다.</p>
              <div className="btn-row" style={{ marginTop: 0, marginBottom: 8 }}>
                <button className="btn primary sm" onClick={() => addOrder('promo')}>+ 프로모션 발주 추가</button>
                <button className="btn amber sm" onClick={() => addOrder('popup')}>+ 팝업 발주 추가</button>
              </div>
              <div>
                {S.orders.length === 0 ? (
                  <div className="empty">아직 등록된 발주 건이 없어요. 위 버튼으로 추가하세요.</div>
                ) : S.orders.map((o) => {
                  const open = openOrder === o.id;
                  return (
                    <div key={o.id} className={'order-item' + (open ? ' open' : '')}>
                      <div className="order-head" onClick={() => setOpenOrder(open ? null : o.id)}>
                        <span className={'badge ' + o.type}>{o.type === 'promo' ? '프로모션' : '팝업'}</span>
                        <span className="nm">{o.name || '(이름 없음)'}</span>
                        <span className={'badge ' + (o.registered ? 'ok' : 'gray')}>{o.registered ? '등록완료' : '작성중'}</span>
                        <span className="amt">{fmt(orderTotal(o))}원</span>
                        <button className="del-btn" onClick={(e) => { e.stopPropagation(); delOrder(o.id); }}>×</button>
                      </div>
                      {open && (
                        <div className="order-body">
                          <div className="grid2" style={{ marginBottom: 10 }}>
                            <div className="fld"><label>발주명</label>
                              <input value={o.name} onChange={(e) => upOrder(o.id, 'name', e.target.value)} /></div>
                            <div className="fld"><label>매장명 (정산서 집계 기준)</label>
                              <input value={o.store} placeholder="예: 신세계 대전 / 스타필드 하남" onChange={(e) => upOrder(o.id, 'store', e.target.value)} /></div>
                          </div>
                          <div className="tbl-wrap"><table>
                            <thead><tr><th>품목/항목</th><th style={{ width: 60 }}>수량</th><th style={{ width: 90 }}>단가</th><th style={{ width: 100 }}>금액</th><th style={{ width: 36 }}></th></tr></thead>
                            <tbody>
                              {o.rows.map((r, ri) => (
                                <tr key={ri}>
                                  <td><input className="txt" value={r.item} placeholder="품목/항목명" onChange={(e) => upRow(o.id, ri, 'item', e.target.value)} /></td>
                                  <td style={{ width: 60 }}><input type="number" value={r.qty || ''} onChange={(e) => upRowQP(o.id, ri, 'qty', Number(e.target.value))} /></td>
                                  <td style={{ width: 90 }}><input type="number" value={r.price || ''} placeholder="-" onChange={(e) => upRowQP(o.id, ri, 'price', Number(e.target.value))} /></td>
                                  <td style={{ width: 110 }}><input type="number" className="num" style={{ textAlign: 'right' }}
                                    value={(r.amt !== '' && r.amt != null) ? r.amt : (((r.qty || 0) * (r.price || 0)) || '')}
                                    placeholder="금액 직접입력"
                                    onChange={(e) => upRowAmt(o.id, ri, e.target.value === '' ? '' : Number(e.target.value))} /></td>
                                  <td style={{ width: 36 }}><button className="del-btn" onClick={() => delRow(o.id, ri)}>×</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table></div>
                          <button className="add-row-btn" onClick={() => addRow(o.id)}>+ 항목 추가</button>
                          <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {o.registered && <span className="badge ok">✓ 등록됨</span>}
                            <button className="btn green" onClick={() => registerOrder(o.id)}>등록 완료</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── ① 견적 대조 (견적서 요청 → 대조 → 재확인) ── */}
        {tab === 'compare' && (
          <>
            <EmailCard title="✉ 견적서 요청 메일" text={emails.em1} onCopy={copyT} sub="이 달 발주분 견적서를 업체에 요청합니다. 받은 견적서는 아래에서 업로드해 대조하세요." />
            <QuoteCompare S={S} promo={promo} popup={popup} onFiles={handleQuotes} />
            <EmailCard title="✉ 금액 재확인 요청 메일 (차이 있을 때)" text={emails.em2} onCopy={copyT} sub="[항목명]·수량·단가를 실제 내용으로 수정 후 복사하세요." editable />
            <StepDone done={!!S.steps?.compare} onToggle={() => toggleStep('compare')} label="견적 대조" />
          </>
        )}

        {/* ── 매장별 정산서 ── */}
        {tab === 'settle' && (
          <div className="card">
            <div className="lbl">산출물</div>
            <h2>매장별 정산서</h2>
            <p className="sub">등록된 모든 발주 건이 매장 기준으로 자동 합산됩니다.</p>
            <SettleTable rows={settleRows()} />
            <div className="btn-row">
              <button className="btn green" onClick={downloadSettle}>매장별 정산서 엑셀 다운로드</button>
            </div>
            <StepDone done={!!S.steps?.settle} onToggle={() => toggleStep('settle')} label="매장별 정산서" />
          </div>
        )}

        {/* ── ③ 세금계산서 발행 요청 ── */}
        {tab === 'tax' && (
          <>
            <EmailCard title="✉ 세금계산서 발행 요청 메일" text={emails.em3} onCopy={copyT} sub="정산 금액이 확정되면 업체에 세금계산서 발행을 요청합니다." />
            <StepDone done={!!S.steps?.tax} onToggle={() => toggleStep('tax')} label="세금계산서 요청" />
          </>
        )}

        {/* ── ④ 지출품의 ── */}
        {tab === 'memo' && (
          <>
            <EmailCard title="📋 지출품의서 작성 참고" text={emails.memo} onCopy={copyT} sub="아래 내용을 그룹웨어 지출품의서에 붙여넣어 상신하세요." />
            <StepDone done={!!S.steps?.memo} onToggle={() => toggleStep('memo')} label="지출품의 상신" />
          </>
        )}
      </div>
      {ToastEl}
    </>
  );
}

function StepDone({ done, onToggle, label }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: done ? 'var(--green-soft)' : '#fff', borderColor: done ? 'var(--green)' : 'var(--line)' }}>
      <span style={{ fontWeight: 700, color: done ? 'var(--green)' : 'var(--ink-soft)' }}>
        {done ? `✓ ‘${label}’ 단계 완료` : `‘${label}’ 단계가 끝나면 완료로 표시하세요`}
      </span>
      <button className={'btn ' + (done ? '' : 'green')} onClick={onToggle}>{done ? '완료 해제' : '이 단계 완료'}</button>
    </div>
  );
}

function SettleTable({ rows }) {
  let tp = 0, tu = 0;
  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th>매장명</th><th style={{ width: 110 }}>프로모션</th><th style={{ width: 110 }}>팝업</th><th style={{ width: 110 }}>합계</th><th style={{ width: 120 }}>합계(VAT포함)</th></tr></thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={5} className="empty">발주 건을 등록하면 매장 기준으로 자동 집계됩니다</td></tr>
        ) : (<>
          {rows.map((r, i) => { tp += r.promo; tu += r.popup; const t = r.promo + r.popup; return (
            <tr key={i}>
              <td style={{ textAlign: 'left', fontWeight: 600 }}>{r.store}</td>
              <td className="num">{r.promo ? fmt(r.promo) : '·'}</td>
              <td className="num">{r.popup ? fmt(r.popup) : '·'}</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmt(t)}</td>
              <td className="num">{fmt(t * 1.1)}</td>
            </tr>); })}
          <tr className="row-total"><td>TOTAL</td><td className="num">{fmt(tp)}</td><td className="num">{fmt(tu)}</td><td className="num">{fmt(tp + tu)}</td><td className="num">{fmt((tp + tu) * 1.1)}</td></tr>
        </>)}
      </tbody>
    </table></div>
  );
}

function QuoteCompare({ S, promo, popup, onFiles }) {
  const dropRef = useRef(null);
  const fileRef = useRef(null);
  const qT = (S.quoteItems || []).reduce((a, q) => a + (q.amt || 0), 0);
  const my = promo + popup;
  const diff = qT - my;
  const hasData = (S.quoteItems || []).length || (S.quoteFiles || []).length;
  return (
    <>
      <div className="card">
        <div className="lbl">검증</div>
        <h2>업체 견적서 대조</h2>
        <p className="sub">현대드림애드 견적서(.xls/.xlsx)를 끌어다 놓으면 금액 항목을 추출해 발주 합계와 비교합니다.</p>
        <div className="drop" ref={dropRef}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('over'); }}
          onDragLeave={() => dropRef.current?.classList.remove('over')}
          onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('over'); onFiles(e.dataTransfer.files); }}>
          견적서 파일을 끌어다 놓거나 클릭해서 선택<br /><span style={{ fontSize: 12 }}>(.xls · .xlsx / 여러 개 가능)</span>
        </div>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" multiple style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />
        {S.quoteFiles?.length > 0 && <p className="note">업로드: {S.quoteFiles.join(', ')}</p>}
      </div>
      {hasData ? (
        <div className="card">
          <h2>발주 vs 견적</h2>
          <div className="strip" style={{ marginTop: 10 }}>
            <div className="stat"><div className="l">내 발주 합계(공급가)</div><div className="v p">{fmt(my)}원</div></div>
            <div className="stat"><div className="l">견적서 합계(공급가)</div><div className="v">{fmt(qT)}원</div></div>
            <div className="stat"><div className="l">차이</div><div className={'v ' + (diff === 0 ? 'g' : 'r')}>{(diff > 0 ? '+' : '') + fmt(diff)}원</div></div>
          </div>
          <div>{diff === 0
            ? <span className="badge ok">✓ 금액 일치</span>
            : <span className="badge diff">⚠ {fmt(Math.abs(diff))}원 차이 — 항목 확인 필요</span>}</div>
          <div className="tbl-wrap" style={{ marginTop: 14 }}><table>
            <thead><tr><th>견적서 추출 항목</th><th style={{ width: 60 }}>수량</th><th style={{ width: 90 }}>단가</th><th style={{ width: 100 }}>금액</th></tr></thead>
            <tbody>
              {S.quoteItems.map((q, i) => (
                <tr key={i}><td style={{ textAlign: 'left' }}>{q.item}</td><td className="num">{q.qty}</td><td className="num">{fmt(q.price)}</td><td className="num">{fmt(q.amt)}</td></tr>
              ))}
              <tr className="row-total"><td colSpan={3}>견적서 합계(공급가 추정)</td><td className="num">{fmt(qT)}</td></tr>
            </tbody>
          </table></div>
          <p className="note">헤더(수량/단가/금액 열)를 먼저 인식하고, 실패하면 “수량 × 단가 = 금액” 패턴으로 추출합니다. 합계가 안 맞으면 원본도 확인하세요.</p>
        </div>
      ) : null}
    </>
  );
}

function EmailCard({ title, text, onCopy, sub, editable }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      <div className="email-box" contentEditable={editable} suppressContentEditableWarning>{text}</div>
      <div className="btn-row"><button className="btn primary" onClick={() => onCopy(text)}>본문 복사</button></div>
    </div>
  );
}
