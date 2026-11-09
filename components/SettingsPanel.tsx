"use client";
import { useState } from "react";
import { borrowersOf, type Borrower, type CreditRepay, type MortgageBorrower, type Profile } from "@/lib/calc";
import type { Settings } from "@/lib/service";
import { RATE_TYPE_LABEL, type DomainRules, type LoanProduct, type RateType, type RegionRule } from "@/lib/rules";
import type { ProviderId } from "@/lib/agents";
import type { Region } from "@/lib/regions";
import { SGG_LIST } from "@/lib/regions";
import { F, Money, Num, NumberField, Text, Toggle } from "./ui";
import type { ProviderState } from "./AgentPanel";

type Tab = "me" | "rules" | "agent";
const REGION_NAMES: Record<Region, string> = { reg: "규제지역", metro: "수도권 비규제", local: "지방" };

export function SettingsPanel({ tab: initial, onClose, profile, onProfile, rules, onRules, onResetRules, settings, onSettings, providers, rates, ecosOn, sources }: {
  tab: Tab; onClose: () => void;
  profile: Profile; onProfile: (p: Partial<Profile>) => void;
  rules: DomainRules; onRules: (r: Partial<DomainRules>) => void; onResetRules: () => void;
  settings: Settings; onSettings: (s: Partial<Settings>) => void;
  providers: ProviderState[]; rates: { mortgage: { rate: number; time: string } | null; credit: { rate: number } | null } | null; ecosOn: boolean;
  sources: { id: string; label: string; available: boolean; hint: string }[];
}) {
  const [tab, setTab] = useState<Tab>(initial);
  const autoRate = !!(profile.autoRate && rates);
  const setProduct = (i: number, patch: Partial<LoanProduct>) => onRules({ products: rules.products.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setRegion = (r: Region, patch: Partial<RegionRule>) => onRules({ regions: { ...rules.regions, [r]: { ...rules.regions[r], ...patch } } });
  const regText = rules.regulatedSgg.join(", ");

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="설정">
        <div className="panel-h">
          <div className="seg" style={{ margin: 0, flex: 1 }}>
            <button className={tab === "me" ? "on" : ""} onClick={() => setTab("me")}>내 상태</button>
            <button className={tab === "rules" ? "on" : ""} onClick={() => setTab("rules")}>대출 규칙</button>
            <button className={tab === "agent" ? "on" : ""} onClick={() => setTab("agent")}>에이전트·감시</button>
          </div>
          <button className="btn sm" onClick={onClose}>닫기</button>
        </div>

        <div className="panel-b">
          {tab === "me" && (
            <>
              <p className="hint">모든 매물 계산에 공통으로 쓰입니다. 기준월부터 매달 월 저축만큼 쌓인다고 계산합니다.</p>
              <div className="row2"><Text label="기준월" type="month" value={profile.asOf} onChange={(v) => onProfile({ asOf: v })} /><Toggle label="생애최초 주택구입" checked={profile.firstBuyer} onChange={(v) => onProfile({ firstBuyer: v })} /></div>
              <div className="row2"><Money label="지금 모아둔 돈" value={profile.saved} onChange={(v) => onProfile({ saved: v })} /><Money label="월 저축" value={profile.monthlySave} onChange={(v) => onProfile({ monthlySave: v })} /></div>
              <div className="row2">
                <Text label="막내 출생일 (신생아 특례)" type="date" value={profile.childBirth ?? ""} onChange={(v) => onProfile({ childBirth: v || null })} />
                <Money label="순자산 (정책대출 자산 요건)" placeholder="비우면 모아둔 돈" nullable value={profile.assets ?? null} onChange={(v) => onProfile({ assets: v || null })} />
              </div>
              <div className="gt" style={{ marginTop: 12 }}>차주 <small>신용대출은 각자 소득·DSR 안에서 따로 받습니다</small></div>
              {(() => {
                const bs: Borrower[] = borrowersOf(profile).length >= 2 ? borrowersOf(profile) : [...borrowersOf(profile), { name: "아내", income: 0, otherDebt: 0 }];
                const set = (i: number, patch: Partial<Borrower>) => onProfile({ borrowers: bs.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
                return (
                  <>
                    {bs.map((b, i) => (
                      <div className="row3" key={i}>
                        <Text label="이름" value={b.name} onChange={(v) => set(i, { name: v })} />
                        <Money label="연소득" value={b.income} onChange={(v) => set(i, { income: v })} />
                        <Money label="기존 대출 월상환" value={b.otherDebt} onChange={(v) => set(i, { otherDebt: v })} />
                        <Money label="신용대출 계획" placeholder="자동" nullable value={b.creditPlan ?? null} onChange={(v) => set(i, { creditPlan: v || null })} />
                      </div>
                    ))}
                    <label className="f"><span>주담대 차주</span>
                      <select value={profile.mortgageBorrower ?? "auto"} onChange={(e) => onProfile({ mortgageBorrower: e.target.value as MortgageBorrower })}>
                        <option value="auto">자동 (부족액이 가장 적은 쪽)</option>
                        <option value="joint">공동 (부부 소득 합산)</option>
                        {bs.map((b, i) => <option key={i} value={String(i)}>{b.name} 단독</option>)}
                      </select></label>
                    <p className="hint">신용대출 계획을 넣으면 그 금액(각자 연봉 × 한도 배수, 자기 DSR 안에서)을 먼저 받고 남은 DSR로 주담대를 계산합니다. 비워 두면 모자란 만큼만 자동으로 받습니다. 한 사람 명의로 주담대를 받으면, 다른 사람은 자기 DSR로 신용대출을 받을 여지가 생깁니다. 공동은 합산 소득으로 주담대 한도가 커지지만 그만큼 DSR을 같이 씁니다.</p>
                  </>
                );
              })()}
              <div className="gt" style={{ marginTop: 12 }}>주담대</div>
              <label className="f" style={{ marginBottom: 8 }}><span>금리 유형 (스트레스 DSR 가산 비율이 달라짐)</span>
                <select value={profile.mRateType ?? "variable"} onChange={(e) => onProfile({ mRateType: e.target.value as RateType })}>
                  {(Object.keys(RATE_TYPE_LABEL) as RateType[]).map((t) => (
                    <option key={t} value={t}>{RATE_TYPE_LABEL[t]} — 스트레스 {rules.stressRatio[t]}% 반영 (규제지역 +{Math.round(rules.regions.reg.stress * rules.stressRatio[t]) / 100}%p)</option>
                  ))}
                </select></label>
              <div className="row2"><Num label="금리 %" value={autoRate ? rates!.mortgage?.rate ?? profile.mRate : profile.mRate} disabled={autoRate} onChange={(v) => onProfile({ mRate: v })} /><Num label="만기 (년)" step={5} value={profile.mYears} onChange={(v) => onProfile({ mYears: v })} /></div>

              <div className="gt" style={{ marginTop: 12 }}>신용대출</div>
              {(() => {
                const cRate = autoRate ? rates!.credit?.rate ?? profile.cRate : profile.cRate;
                const repay = profile.cRepay ?? "bullet";
                const bs = borrowersOf(profile);
                const caps = bs.map((b) => ({ name: b.name, cap: b.income * rules.creditCapRatio }));
                const total = caps.reduce((a, c) => a + c.cap, 0);
                const monthly = (P: number) => (repay === "amortize" ? (P * (cRate / 1200)) / (1 - Math.pow(1 + cRate / 1200, -Math.max(1, profile.cYears) * 12)) : (P * cRate) / 1200);
                const dsrMonthly = (P: number) => (P * (cRate / 1200)) / (1 - Math.pow(1 + cRate / 1200, -rules.creditDsrYears * 12));
                return (
                  <>
                    <div className="row3c">
                      <Num label="금리 %" value={cRate} disabled={autoRate} onChange={(v) => onProfile({ cRate: v })} />
                      <label className="f"><span>상환 방식</span>
                        <select value={repay} onChange={(e) => onProfile({ cRepay: e.target.value as CreditRepay })}>
                          <option value="bullet">만기일시 (이자만, 매년 연장)</option>
                          <option value="amortize">원리금균등</option>
                        </select></label>
                      <Num label={repay === "bullet" ? "만기 (년)" : "상환 기간 (년)"} step={1} value={profile.cYears} onChange={(v) => onProfile({ cYears: Math.max(1, v) })} />
                    </div>
                    <div className="credit-sum">
                      {caps.map((c) => <div key={c.name}><small>{c.name} 한도</small><b>{F(c.cap)}</b></div>)}
                      <div className="tot"><small>합계 한도</small><b>{F(total)}</b></div>
                    </div>
                    <p className="hint">
                      한도 = 각자 연봉 × {rules.creditCapRatio}배 (⚖ 규칙에서 변경). 합계 한도를 다 받으면 실제 월 납입은 약 <b>{Math.round(monthly(total)).toLocaleString()}만</b>
                      ({repay === "bullet" ? "이자만" : `${profile.cYears}년 원리금`})이지만, 은행 DSR은 {rules.creditDsrYears}년 원리금으로 환산해 월 <b>{Math.round(dsrMonthly(total)).toLocaleString()}만</b>으로 계산합니다.
                      그래서 신용대출을 많이 받으면 그만큼 주담대 한도가 줄어듭니다. 실제로 얼마를 받는지는 결과 화면의 신용대출 줄에 사람별로 나옵니다.
                    </p>
                  </>
                );
              })()}
              <Toggle label={`한국은행 실시간 금리 사용${ecosOn ? "" : " (ECOS_KEY 필요)"}`} checked={profile.autoRate} disabled={!ecosOn} onChange={(v) => onProfile({ autoRate: v })} />
            </>
          )}

          {tab === "rules" && (
            <>
              <p className="hint">기준: <b>{rules.label}</b>. 규제가 바뀌면 여기서 고치세요. 모든 계산과 에이전트 판정에 바로 반영됩니다.</p>
              <Text label="기준 이름" value={rules.label} onChange={(v) => onRules({ label: v })} />
              <div className="cmp" style={{ marginTop: 10 }}>
                <table className="t">
                  <thead><tr><th></th>{(Object.keys(REGION_NAMES) as Region[]).map((r) => <th key={r}>{REGION_NAMES[r]}</th>)}</tr></thead>
                  <tbody>
                    {([
                      ["LTV 일반 %", "ltv"], ["LTV 생애최초 %", "ltvFirst"], ["주담대 상한 (만원)", "cap"], ["15~25억 상한", "capOver15"], ["25억 초과 상한", "capOver25"],
                      ["스트레스 가산 %p", "stress"], ["전입 의무 (개월, 0=없음)", "moveInMonths"],
                    ] as [string, keyof RegionRule][]).map(([label, k]) => (
                      <tr key={k}><td>{label}</td>{(Object.keys(REGION_NAMES) as Region[]).map((r) => (
                        <td key={r}><NumberField className="cell" step={k === "stress" ? 0.25 : k.startsWith("cap") ? 1000 : 1} placeholder="없음" nullable={k.startsWith("cap")}
                          value={rules.regions[r][k] as number | null} onChange={(v) => setRegion(r, { [k]: v } as Partial<RegionRule>)} /></td>
                      ))}</tr>
                    ))}
                    <tr><td>토지거래허가 (실거주 의무)</td>{(Object.keys(REGION_NAMES) as Region[]).map((r) => (
                      <td key={r}><input type="checkbox" checked={rules.regions[r].toheo} onChange={(e) => setRegion(r, { toheo: e.target.checked })} /></td>
                    ))}</tr>
                  </tbody>
                </table>
              </div>
              <div className="row2" style={{ marginTop: 10 }}>
                <Num label="DSR 한도 %" step={1} value={rules.dsrLimit} onChange={(v) => onRules({ dsrLimit: v })} />
                <Num label="신용대출 한도 (연소득 ×)" step={0.1} value={rules.creditCapRatio} onChange={(v) => onRules({ creditCapRatio: v })} />
              </div>
              <div className="row2">
                <Num label="신용대출 DSR 환산 만기 (년)" step={1} value={rules.creditDsrYears} onChange={(v) => onRules({ creditDsrYears: v })} />
                <Money label="생애최초 취득세 감면 한도" value={rules.firstBuyerTaxRelief} onChange={(v) => onRules({ firstBuyerTaxRelief: v })} />
              </div>
              <div className="gt" style={{ marginTop: 14 }}>정책대출 상품 <small>DSR 대신 DTI로 심사, 스트레스 금리 없음</small></div>
              <div className="cmp">
                <table className="t">
                  <thead><tr><th></th>{rules.products.map((x) => <th key={x.id}>{x.name}</th>)}</tr></thead>
                  <tbody>
                    <tr><td>사용</td>{rules.products.map((x, i) => <td key={x.id}><input type="checkbox" checked={x.enabled} onChange={(e) => setProduct(i, { enabled: e.target.checked })} /></td>)}</tr>
                    {([
                      ["금리 %", "rate", 0.05], ["만기 (년)", "years", 5], ["한도 (만원)", "maxLoan", 1000], ["LTV %", "ltv", 5], ["DTI %", "dti", 5],
                      ["집값 상한 (만원)", "maxPrice", 1000], ["전용 상한 ㎡", "maxArea", 1], ["소득 상한 (만원)", "maxIncome", 500], ["순자산 상한 (만원)", "maxAssets", 100],
                      ["출생 후 개월 (0=무관)", "childWithinMonths", 1], ["전입 기한 (개월)", "moveInMonths", 1],
                    ] as [string, keyof LoanProduct, number][]).map(([label, k, step]) => (
                      <tr key={k}><td>{label}</td>{rules.products.map((x, i) => (
                        <td key={x.id}><NumberField className="cell" step={step} value={x[k] as number} onChange={(v) => setProduct(i, { [k]: v ?? 0 } as Partial<LoanProduct>)} /></td>
                      ))}</tr>
                    ))}
                    <tr><td>생애최초만</td>{rules.products.map((x, i) => <td key={x.id}><input type="checkbox" checked={x.firstBuyerOnly} onChange={(e) => setProduct(i, { firstBuyerOnly: e.target.checked })} /></td>)}</tr>
                  </tbody>
                </table>
              </div>
              {rules.products.map((x) => <p key={x.id} className="hint" style={{ margin: "4px 0" }}><b>{x.name}</b>: {x.note}</p>)}
              <div className="gt" style={{ marginTop: 14 }}>금리 유형별 스트레스 가산 반영 비율 %</div>
              <div className="row4">
                {(Object.keys(RATE_TYPE_LABEL) as RateType[]).map((t) => (
                  <Num key={t} label={RATE_TYPE_LABEL[t].split(" ")[0]} step={10} value={rules.stressRatio[t]} onChange={(v) => onRules({ stressRatio: { ...rules.stressRatio, [t]: v } })} />
                ))}
              </div>
              <p className="hint">예: 규제지역 스트레스 {rules.regions.reg.stress}%p × 주기형 {rules.stressRatio.periodic}% = +{Math.round(rules.regions.reg.stress * rules.stressRatio.periodic) / 100}%p 로 DSR 계산.</p>
              <label className="f"><span>규제지역 시군구 코드 (쉼표 구분, 11* = 서울 전체)</span>
                <textarea className="sel" rows={3} defaultValue={regText} onBlur={(e) => onRules({ regulatedSgg: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) })} />
              </label>
              <div className="hint">{rules.regulatedSgg.length}개 항목 · 노원·도봉: {["11350", "11320"].map((c) => SGG_LIST.find((s) => s.code === c)?.name).join("·")}은 {rules.regulatedSgg.some((c) => c === "11*" || c === "11350") ? "규제지역" : "비규제"}</div>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => confirm("대출 규칙을 기본값(2025.10.15 대책)으로 되돌릴까요?") && onResetRules()}>기본값으로 초기화</button>
            </>
          )}

          {tab === "agent" && (
            <>
              <label className="f"><span>판정·상담 에이전트 (로컬 CLI)</span>
                <select value={settings.provider} onChange={(e) => onSettings({ provider: e.target.value as ProviderId })}>
                  {providers.map((p) => <option key={p.id} value={p.id} disabled={!p.installed}>{p.label} {p.installed ? `(${p.version})` : "(설치 안 됨)"}</option>)}
                </select></label>
              <div style={{ height: 8 }} />
              <Text label="모델 (비우면 CLI 기본값)" value={settings.model} onChange={(v) => onSettings({ model: v })} placeholder="예: opus, gpt-5" />
              <div className="gt" style={{ marginTop: 14 }}>감시 배치</div>
              <Toggle label="배치 켜기" checked={settings.batchEnabled} onChange={(v) => onSettings({ batchEnabled: v })} />
              <div className="row2">
                <Num label="주기 (분)" step={5} value={settings.intervalMin} onChange={(v) => onSettings({ intervalMin: Math.max(5, v) })} />
                <label className="f"><span>판정 시점</span>
                  <select value={settings.decideOn} onChange={(e) => onSettings({ decideOn: e.target.value as Settings["decideOn"] })}>
                    <option value="change">시세가 바뀔 때만</option><option value="always">배치마다</option>
                  </select></label>
              </div>
              <Toggle label="macOS 알림 (매수 판정·판정 변경)" checked={settings.notify} onChange={(v) => onSettings({ notify: v })} />
              <div className="gt" style={{ marginTop: 14 }}>시세 소스</div>
              {sources.map((s) => <div key={s.id} className="hint" style={{ marginBottom: 4 }}><span className={`dot ${s.available ? "on" : ""}`} />{s.label} — {s.available ? "자동 수집" : s.hint}</div>)}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
