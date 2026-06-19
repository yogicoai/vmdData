import { fmt } from './util';

// cfg: {year,month,deadline,vendor,contact,sender,company,bizNum}
// totals: {promo, popup}
export function buildEmails(cfg, totals) {
  const c = cfg;
  const nm = c.month + 1 > 12 ? 1 : c.month + 1;
  const pT = totals.promo || 0, uT = totals.popup || 0;
  const tot = pT + uT, vat = Math.round(tot * 0.1);
  const dash = '-'.repeat(46);

  const em1 =
`수신: ${c.contact} 담당자님 (${c.vendor})
제목: [요기보코리아] ${c.month}월분 그래픽 견적서 요청
${dash}

안녕하세요, ${c.company} ${c.sender}입니다.

${c.month}월분 그래픽 작업 정산을 진행하고자 하오니,
아래 두 건의 견적서를 ${nm}월 3일까지 보내주시기 바랍니다.

1. 팝업 구성 그래픽 물량 ${c.month}월분 견적서
2. 프로모션 POP 그래픽 물량 ${c.month}월분 견적서

수신 후 내용 확인 및 검토를 진행할 예정입니다.
감사합니다.

${c.company} ${c.sender} 드림`;

  const em2 =
`수신: ${c.contact} 담당자님 (${c.vendor})
제목: [요기보코리아] ${c.month}월분 견적서 금액 재확인 요청
${dash}

안녕하세요, ${c.company} ${c.sender}입니다.

${c.month}월분 견적서 검토 중 일부 항목에서 발주 물량과 금액 차이가 확인되었습니다.

재확인 요청 항목:
- [항목명] : 당사 확인 수량 ___개 / 견적서 수량 ___개
- [항목명] : 당사 확인 단가 ___원 / 견적서 단가 ___원

수정 견적서를 보내주시면 최종 금액 확인 후 진행하겠습니다.
빠른 확인 부탁드립니다. 감사합니다.

${c.company} ${c.sender} 드림`;

  const em3 =
`수신: ${c.contact} 담당자님 (${c.vendor})
제목: [요기보코리아] ${c.month}월분 세금계산서 발행 요청
${dash}

안녕하세요, ${c.company} ${c.sender}입니다.

${c.month}월분 그래픽 작업 정산 최종 금액이 확정되었습니다.
${c.year}년 ${nm}월 ${c.deadline}일까지 아래 정보로 세금계산서 발행을 요청드립니다.

발행 정보
- 공급받는자: ${c.company}
- 사업자등록번호: ${c.bizNum}
- 프로모션 POP 공급가: ${fmt(pT)}원 (VAT 별도)
- 팝업 구성 그래픽 공급가: ${fmt(uT)}원 (VAT 별도)
- 합계 공급가: ${fmt(tot)}원
- 부가세: ${fmt(vat)}원
- VAT 포함 합계: ${fmt(tot + vat)}원

기한 내 발행 부탁드립니다. 감사합니다.

${c.company} ${c.sender} 드림`;

  // 품의 메모
  const vatTot = Math.round(tot * 1.1);
  let line = '본인 → 부서장 → 본부장';
  if (vatTot > 5000000) line = '본인 → 부서장 → 본부장 → 총괄이사 → 대표이사';
  else if (vatTot > 300000) line = '본인 → 부서장 → 본부장 → 총괄이사';
  const dl = new Date(c.year, nm - 1, c.deadline);
  let df = (5 - dl.getDay() + 7) % 7; if (df === 0) df = 7;
  const fri = new Date(dl); fri.setDate(dl.getDate() + df);
  const friStr = `${fri.getFullYear()}-${String(fri.getMonth() + 1).padStart(2, '0')}-${String(fri.getDate()).padStart(2, '0')}`;

  const memo =
`[거래처] ${c.vendor}
[계정과목] 광고선전비 / 판매촉진비 (담당자 확인)
[지급방식] 계좌이체
[합계금액(VAT포함)] ${fmt(vatTot)}원
[목적] ${c.month}월 팝업/프로모션 그래픽 제작물 발주 대금 지급
[내용1] ${c.month}월 프로모션 POP 그래픽 / 공급가 ${fmt(pT)}원 / VAT ${fmt(Math.round(pT * 0.1))}원
[내용2] ${c.month}월 팝업 구성 그래픽 / 공급가 ${fmt(uT)}원 / VAT ${fmt(Math.round(uT * 0.1))}원
[첨부] ${c.month}월 팝업 견적서, ${c.month}월 프로모션 견적서, ${c.month}월 매장별 정산서
[결재라인] ${line}
[자금집행 요청일] ${friStr} (금요일 / 세금계산서 기준 30일 이내)`;

  return { em1, em2, em3, memo };
}
