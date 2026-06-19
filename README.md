# 요기보 그래픽 정산 관리 (vmdData)

현대드림애드 월별 그래픽 대금 정산 업무 도구. 기존 단일 HTML 2개(발주요청서 생성기 + 정산관리, localStorage)를
**Next.js 16 + MongoDB + FTP(오픈호스팅)** 팀 웹앱으로 통합한 버전.

## 기능
- **정산 대시보드** (`/`): 월별 정산 이력 보관·조회, 새 정산월 생성
- **정산 상세** (`/settlements/[id]`): 설정 / 발주 건 관리 / 견적 대조 / 매장별 정산서 / 이메일·품의 (기존 5탭)
  - 견적서 엑셀 업로드 → 헤더(수량/단가/금액) 인식 + 패턴 fallback 2단계 추출 후 발주 합계와 대조
  - 매장별 정산서 엑셀 다운로드, 이메일 3종 + 지출품의 메모 자동 생성
  - 기존 HTML 백업 `.json`(구버전 `{cfg,...}` 형식) 가져오기 지원
- **발주요청서** (`/order-forms`, `/order-forms/[id]`): 현장 시공팀 전달용 발주요청서 작성 → PDF 인쇄
  - 이미지는 **오픈호스팅 FTP**에 업로드되고 DB엔 공개 URL만 저장 (base64 탈피)
  - **정산으로 보내기**: 발주요청서 내용을 해당 월 정산에 발주 건으로 자동 등록

## 데이터 모델 (MongoDB, DB명 `vmdData`)
- `settlements` — 월별 1문서. cfg + `orders[]` + `quoteItems[]` 임베드. `{year,month}` 기준
- `orderForms` — 발주요청서. `common` + `sheets[]`(이미지 URL 포함)
- `users` — 로그인 계정 (인증은 추후 단계)

## 개발
```bash
npm install
cp .env.example .env.local   # 값 채우기 (MONGODB_URI, FTP_*)
npm run dev                  # http://localhost:3000
npm run seed                 # 초기 사용자(yogico) 생성 — 인증 단계에서 사용
```

## 환경변수 (`.env.local`)
| 키 | 설명 |
|---|---|
| `MONGODB_URI` / `MONGODB_DB` | MongoDB 연결 / DB명(`vmdData`) |
| `FTP_HOST` `FTP_PORT` `FTP_USER` `FTP_PASSWORD` `FTP_SECURE` | yogibo.openhost FTP 접속 |
| `FTP_UPLOAD_DIR` | 이미지 업로드 디렉터리(웹 경로) |
| `PUBLIC_IMAGE_BASE` | 위 디렉터리의 공개 URL 베이스 |
| `SESSION_SECRET` | 세션 서명용 (인증 단계) |

## 배포 메모
FTP 아웃바운드(21번 + passive)는 서버리스에서 불안정할 수 있어 **상시 서버(Cloudtype/Railway)** 권장.

## 남은 작업
- [ ] 로그인/인증 (계정 `yogico` / `2026`) — **마지막 단계**
- [ ] 실제 MongoDB·FTP 자격증명 연결
- [ ] 실제 견적서 샘플로 추출 정확도 튜닝
