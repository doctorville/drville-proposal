# 닥터빌 제안서 생성기 (drville-proposal)

제안처 정보와 요구사항 원문(RFP·메일·통화 메모)을 넣으면 AI가
**제안처 최신 동향을 찾아 요약**하고 **요구사항을 분석**해, 닥터빌 표준 템플릿 그대로
웹브로셔(HTML)와 PPT(16:9) 제안서를 만듭니다.

- 사이트: https://doctorville.github.io/drville-proposal/
- 원문 데이터: 닥터빌 웹브로셔 + 닥터빌 광고제안서(2026.06)
- 운영: 엠서클 닥터빌 콘텐츠운영팀

## 사용 방법

1. **기관명**을 입력하면 '기관 최신 정보'에 최근 뉴스·동향, 주력 분야, 요구사항 참고 포인트가 표시됩니다(20~60초).
   필요한 포인트는 `+ 요구사항`으로 요구사항 칸에 바로 추가할 수 있습니다. 내용은 출처 링크에서 사실 여부를 확인하세요.
2. 요구사항 원문을 붙여넣고 `웹브로셔 생성`을 누릅니다.
3. 미리보기 확인 후 `HTML 저장` / `PPT 생성 (16:9)`.

AI가 채우는 항목: 요구사항 요약·목표·타겟·KPI(원문 수치만), 요구사항별 대응 방안·활용 상품(Insight),
서비스 추천, 제목·제안 배경·서비스별 포인트·진행 프로세스 문구. 회원 수·실적·단가는 템플릿 고정값만 씁니다.

## 구조

```
index.html        생성기(웹브로셔·PPT 템플릿 포함, GitHub Pages)
config.js         AI 프록시 주소 (Actions가 자동 작성)
worker/           AI 프록시 (Cloudflare Worker)
  worker.js       /analyze 요구사항 분석, /research 기관 최신 정보(웹 검색), /health
  wrangler.toml
.github/workflows/deploy-worker.yml   Worker 자동 배포 + 시크릿 등록 + config.js 갱신
```

API 키는 Cloudflare Worker 시크릿에만 저장되고 사이트·저장소·브라우저에는 들어가지 않습니다.
Worker는 `https://doctorville.github.io` 에서 온 요청만 처리합니다.

## 최초 설정 (관리자 1회)

1. **Cloudflare 계정** (무료) 생성 → 대시보드 `Workers & Pages`에 한 번 들어가 workers.dev 서브도메인을 만듭니다.
2. Cloudflare **API 토큰** 생성: 내 프로필 → API Tokens → Create Token → `Edit Cloudflare Workers` 템플릿.
   계정 ID는 대시보드 오른쪽 아래(또는 Workers 개요)에서 확인합니다.
3. 이 저장소 `Settings → Secrets and variables → Actions → New repository secret` 에 등록:

   | 이름 | 값 |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | 2번 토큰 |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
   | `ANTHROPIC_API_KEY` | Anthropic API 키 (`sk-ant-...`) |
   | `ACCESS_CODE` (권장) | 팀 접근 코드. 등록하면 사이트에서 코드를 한 번 입력해야 AI를 쓸 수 있습니다 |

4. `Actions → Deploy AI proxy (Cloudflare Worker) → Run workflow` 실행.
   Worker가 배포되고 `config.js`에 주소가 자동으로 들어가며, 1~2분 뒤 사이트에서 AI 기능이 켜집니다.

키를 바꾸려면 GitHub 시크릿을 수정한 뒤 워크플로를 다시 실행하면 됩니다.

## 비용·보안 주의

- 공개 사이트이므로 `ACCESS_CODE` 등록과 Anthropic Console의 월 사용 한도 설정을 권장합니다.
- 이 저장소는 공개(Public)입니다. 광고 단가표·회원 통계가 소스에 포함되어 있습니다.
- 계약 조건, 내부 전략, 개인정보가 담긴 요구사항 원문은 사내 지침에 따라 팀장·사업부장 승인 후 입력하세요.
- 광고 단가가 포함된 제안서는 외부 발송 전 승인을 받으세요.

## 수정 방법

기준 수치는 `index.html`의 `SOURCE`, 서비스 설명은 `SERVICES`, 광고 상품·단가는 `ADS` · `SEMINAR` · `PRICE` 상수를 고칩니다.
`main`에 커밋하면 GitHub Pages에 자동 반영됩니다.
