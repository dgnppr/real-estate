# 🏠 내집마련 계산기

내 자금 상태와 대출 규제(LTV, 주담대 상한, 스트레스 DSR, 6개월 전입의무, 토지거래허가구역)를 기준으로 매물을 살 수 있는지 계산합니다.
감시를 켠 매물은 시간 단위로 시세를 수집하고, 로컬 에이전트 CLI(claude, codex, agy, gemini)가 **매수 / 관망 / 포기**를 판정해 기록합니다.

## 실행

```bash
npm install
cp .env.example .env      # 키 채우기 (이미 .env 가 있으면 생략)
npm run dev               # http://localhost:3000
```

- DB는 `./data/home.db`(SQLite)이고, 첫 요청 때 마이그레이션이 자동으로 적용됩니다.
- `npm run dev`나 `npm start`로 서버가 떠 있으면 **앱 안의 스케줄러**가 설정한 주기(기본 60분)마다 배치를 돌립니다.
- 서버 없이 cron이나 launchd로 돌리려면 `BATCH_IN_APP=0`으로 앱 내 스케줄러를 끄고 `npm run batch`를 등록하세요(아래 참고).

## 키 발급

| 키 | 용도 | 발급처 |
|---|---|---|
| `DATA_GO_KR_KEY` | 국토부 아파트 매매·전월세 실거래가 | data.go.kr에서 "국토교통부_아파트 매매 실거래가 자료"와 "…전월세 실거래가 자료"를 활용신청한 뒤, 마이페이지의 일반 인증키 사용 |
| `ECOS_KEY` | 한국은행 대출금리(주담대·신용) | **ecos.bok.or.kr/api** (Open API 서비스 사이트)에서 로그인 → 인증키 신청. 발급된 키는 같은 사이트의 마이페이지 → 인증키 발급내역에서 확인 |

## 에이전트

- 화면 상단 **⚙ 설정**에서 기본 에이전트를 고릅니다. 설치 여부는 자동으로 감지됩니다.
- 각 CLI는 `data/agent-workspace` 폴더에서 비대화형으로 실행되며, 판정은 JSON Schema로 구조화된 출력을 강제합니다.

| 엔진 | 호출 방식 |
|---|---|
| claude | `claude -p --output-format json --json-schema …` |
| codex | `codex exec -s read-only --output-schema … -o …` |
| agy | `agy -p … --output-format json --json-schema …` |
| gemini | `gemini -p … -o json` (스키마 옵션이 없어 프롬프트로 JSON 요청) |

## 배치 (시간 단위 감시)

1. 매물 화면에서 **감시**를 켜고 시군구, 단지명, 전용면적을 입력합니다. 실거래 검색에서 단지를 고르면 자동으로 채워집니다.
2. 배치가 돌 때마다 다음 순서로 처리합니다: 시세 소스 조회 → 변동이 있으면 스냅샷 저장 → (KB시세 자동 갱신) → 에이전트 판정 → 매수 판정이거나 판정이 바뀌면 macOS 알림.
3. 판정 시점은 설정에서 **시세가 바뀔 때만**(기본) 또는 **배치마다** 중에서 고릅니다.

cron 예시(매시 정각):

```cron
0 * * * * cd /Users/yh.yoon/private/real-estate && /usr/bin/env npm run batch >> data/batch.log 2>&1
```

## 시세 소스

| 소스 | 상태 |
|---|---|
| 국토부 실거래가 | ✅ 공식 API |
| 한국은행 금리 | ✅ 공식 API |
| KB시세·매물 | ✅ `api.kbland.kr` 비공식 API (키 불필요). 국토부 단지 → KB 단지 자동 매칭, 면적 타입별 KB 하한/일반/상한가 · 매물 수·평균 호가 · 전세가. 예고 없이 바뀌거나 막힐 수 있음. `KB_DISABLED=1` 로 끔 |
| 네이버 호가 | ⚠ 자동 수집 불가 (봇 차단 429). 화면에서 본 최저 호가를 직접 기록 |

새 소스는 `SourceAdapter`를 구현해 `lib/sources/index.ts`의 `ADAPTERS`에 추가하면 배치와 화면이 자동으로 사용합니다.

## REST API (다른 에이전트·스크립트에서 호출)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET/PUT | `/api/profile` | 내 현재 상태 |
| GET/POST | `/api/listings` | 매물 목록 / 추가 |
| GET/PATCH/DELETE | `/api/listings/:id` | 매물 + 시뮬레이션 + 스냅샷 + 판정 이력 |
| POST | `/api/listings/:id/decide` | 즉시 판정 `{ provider? }` |
| POST | `/api/listings/:id/watch` | 이 매물만 조회 + 판정 |
| GET/POST | `/api/batch` | 실행 이력 / 전체 실행 `{ force? }` |
| GET | `/api/trades?lawd=11440&months=6&q=` | 실거래 단지 검색 |
| GET | `/api/rates` | ECOS 금리 |
| GET | `/api/regions?q=마포` | 시군구 코드 |
| GET | `/api/kb/match?sgg=11350&dong=상계동&apt=상계주공7` | KB 단지 후보 |
| GET | `/api/kb/price?complexId=965&area=49.94` | KB 면적 타입·시세·매물 |
| GET/PUT/DELETE | `/api/rules` | 대출 규칙 (DELETE = 기본값) |
| POST | `/api/listings/:id/snapshots` | 시세 직접 기록 |
| GET/POST/DELETE | `/api/chat` | 상담 대화 |
| GET/PUT | `/api/settings` | 에이전트·배치 설정, CLI 감지, 소스 상태 |

## 구조

```
lib/calc.ts        계산 엔진 (순수 함수: 규제·대출·DSR·시점별 저축)
lib/regions.ts     시군구 코드·규제지역
lib/agents.ts      로컬 에이전트 CLI 실행기
lib/service.ts     프로필·매물·판정·상담 서비스
lib/watch.ts       배치 감시 + 앱 내 스케줄러
lib/sources/*      시세 소스 어댑터 (molit, ecos, kb, naver)
lib/db/*           Drizzle 스키마 · SQLite
app/api/*          REST API
components/*       화면
legacy/            이전 단일 HTML 버전
```

> 규제 수치는 2025.10.15 대책 기준입니다. 판정은 투자 권유가 아니니 매수 전에 은행과 중개사에서 반드시 확인하세요.
