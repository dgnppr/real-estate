"use client";
import { useMemo } from "react";
import { ymAdd, ymDiff, type CalcResult, type ListingInput, type Profile } from "@/lib/calc";
import { advise, type Advice } from "@/lib/advice";
import type { DomainRules } from "@/lib/rules";
import { REGION_LABEL } from "@/lib/regions";
import { RATE_TYPE_LABEL } from "@/lib/rules";
import { F, W, ymLabel } from "./ui";

function Bar({ parts, total }: { parts: [string, number][]; total: number }) {
  if (total <= 0) return null;
  return <div className="bar">{parts.filter((p) => p[1] > 0).map(([c, v], i) => <i key={i} style={{ width: `${(v / total) * 100}%`, background: `var(${c})` }} />)}</div>;
}
function Ln({ c, k, v, sub }: { c: string; k: string; v: number; sub?: string }) {
  if (v <= 0) return null;
  return <div className="ln"><span className="k" style={{ ["--c" as string]: `var(${c})` }}>{k}{sub && <small> {sub}</small>}</span><span>{F(v)}</span></div>;
}
function End({ gap, left }: { gap: number; left: number }) {
  return gap > 0
    ? <div className="ln gap"><span className="k" style={{ ["--c" as string]: "var(--bad)" }}>부족</span><span className="bad">{F(gap)}</span></div>
    : <div className="ln gap"><span className="k">남는 돈</span><span className="good">{F(left)}</span></div>;
}
/** 신용대출 줄 — 0원이어도 항상 표시, 차주별 합산 "나 5,000 + 아내 3,000" */
function CreditLn({ o, k, label }: { o: CalcResult; k: "atBuy" | "atMove"; label: string }) {
  const total = o.creditBy.reduce((a, b) => a + b[k], 0);
  const parts = o.creditBy.map((b) => `${b.name} ${F(b[k])}`).join(" + ");
  return (
    <>
      <div className="ln"><span className="k" style={{ ["--c" as string]: "var(--s-credit)" }}>{label}<small> {o.creditBy.length > 1 ? parts : `한도 ${F(o.creditCapTotal)}`}</small></span><span>{F(total)}</span></div>
      {k === "atBuy" && o.creditNote && <div className="hint" style={{ margin: "-2px 0 4px 15px" }}>{o.creditNote}</div>}
    </>
  );
}
const LIMIT_TXT = { LTV: "LTV 한도", 상한: "한도 상한", DSR: "DSR 한도", DTI: "DTI 한도", 규제: "규제로 불가", 자격: "자격 미달" };

/** 대출 선택지 비교 카드 — 누르면 그 선택지로 계산 */
function Options({ o, choice, onChoose }: { o: CalcResult; choice: string; onChoose: (id: string) => void }) {
  if (o.options.length < 2) return null;
  const best = [...o.options].filter((x) => x.eligible).sort((a, b) => a.gap - b.gap || a.pay - b.pay)[0];
  return (
    <div className="opts">
      <button className={`opt ${choice === "auto" ? "on" : ""}`} onClick={() => onChoose("auto")}><small>선택</small><b>자동 추천</b><span>{best?.name ?? "-"}</span></button>
      {o.options.map((x) => (
        <button key={x.id} className={`opt ${choice === x.id ? "on" : ""} ${x.eligible ? "" : "off"} ${o.productId === x.id ? "cur" : ""}`} onClick={() => onChoose(x.id)} title={x.reasons.join("\n")}>
          <small>{x.policy ? "정책대출" : "은행"} · {x.rate}%{x.id === best?.id ? " · 추천" : ""}</small>
          <b>{x.name}</b>
          {x.eligible
            ? <span className={x.gap > 0 ? "bad" : "good"}>{x.gap > 0 ? `${F(x.gap)} 부족` : "가능"} · 대출 {F(x.loan + x.credit)}</span>
            : <span className="muted">자격 미달: {x.reasons[0]}</span>}
        </button>
      ))}
    </div>
  );
}

/** 한 문장 요약: 무엇으로 얼마를 마련하는지 */
function Summary({ s, o }: { s: ListingInput; o: CalcResult }) {
  const parts = [
    o.loan > 0 && `${o.policy ? o.productName : "주담대"} ${F(o.loan)}`,
    o.credit > 0 && `신용대출 ${F(o.credit)}`,
    o.cash1 > 0 && `내 돈 ${F(o.cash1)}`,
  ].filter(Boolean);
  return (
    <p className="sum">
      잔금에 <b>{F(o.need1 + o.loan)}만 원</b>이 필요해요{parts.length ? <> — {parts.join(" + ")}</> : ""}.
      {o.gap1 > 0 ? <> <b className="bad">{F(o.gap1)}만 원</b>이 모자라요.</> : <> 잔금 후 <b>{F(o.leftover)}만 원</b>이 남아요.</>}
      {s.deposit > 0 && (o.gap2 > 0 ? <> 입주 때 보증금 돌려주려면 <b className="bad">{F(o.gap2)}만 원</b> 더 필요해요.</> : <> 입주 때 보증금도 돌려줄 수 있어요.</>)}
    </p>
  );
}

/** 부족할 때 해결 경로 제안 */
function AdviceCards({ a, s, p, onListing, onProfile }: { a: Advice; s: ListingInput; p: Profile; onListing: (x: Partial<ListingInput>) => void; onProfile: (x: Partial<Profile>) => void }) {
  const items = [
    a.maxPrice && { icon: "🏷️", title: `${F(a.maxPrice)} 이하 매물`, desc: "지금 조건 그대로 살 수 있는 최대 매매가", act: null },
    a.monthlyNeeded && { icon: "💰", title: `매달 ${F(a.monthlyNeeded)}만 더 저축`, desc: `월 ${F(p.monthlySave)} → ${F(p.monthlySave + a.monthlyNeeded)}, 잔금 ${ymLabel(s.buyYm)}까지`, act: () => onProfile({ monthlySave: p.monthlySave + a.monthlyNeeded! }) },
    a.earliestYm && { icon: "📅", title: `${ymLabel(a.earliestYm)}에 잔금`, desc: "지금 저축 속도로 가능한 가장 빠른 시점", act: () => onListing({ buyYm: a.earliestYm!, moveYm: ymAdd(a.earliestYm!, Math.max(0, ymDiff(s.buyYm, s.moveYm))) }) },
  ].filter(Boolean) as { icon: string; title: string; desc: string; act: (() => void) | null }[];
  if (!items.length) return <div className="advice"><div className="hint">지금 조건으로는 3년 안에 해결 경로가 없어요. 소득·저축이나 매물 가격대를 바꿔 보세요.</div></div>;
  return (
    <div className="advice">
      <div className="gt">이렇게 하면 살 수 있어요</div>
      <div className="adv-grid">
        {items.map((x) => (
          <div key={x.title} className="adv">
            <span className="ico">{x.icon}</span>
            <div><b>{x.title}</b><small>{x.desc}</small></div>
            {x.act && <button className="btn sm" onClick={x.act}>적용</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultPanel({ p, s, o, rules, onIgnore, onChoose, onListing, onProfile }: {
  p: Profile; s: ListingInput; o: CalcResult; rules: DomainRules;
  onIgnore: (v: boolean) => void; onChoose: (id: string) => void; onListing: (x: Partial<ListingInput>) => void; onProfile: (x: Partial<Profile>) => void;
}) {
  const R = o.rules, ok = o.gap <= 0, dsrLimit = rules.dsrLimit;
  const advice = useMemo(() => (ok ? null : advise(p, s, rules, o)), [ok, p, s, rules, o]);
  return (
    <div>
      <div className={`verdict ${ok ? "ok" : "no"}`}>
        <div className="big">{ok ? "✓ 살 수 있어요" : `${F(o.gap)}만 원 부족해요`}</div>
        <Summary s={s} o={o} />
        <div className="chips">
          <span className="chip">{o.productName} {o.mRateUsed}%</span>
          <span className="chip">월 상환 {W(o.pay2)}</span>
          {o.creditBy.length > 1
            ? o.creditBy.map((b) => <span key={b.name} className={`chip ${b.dsr > dsrLimit + 0.5 ? "warn" : ""}`}>{b.name} DSR {b.dsr.toFixed(0)}%</span>)
            : <span className={`chip ${o.dsr > dsrLimit ? "warn" : ""}`}>DSR {o.dsr.toFixed(0)}/{dsrLimit}%</span>}
        </div>
      </div>

      {advice && <AdviceCards a={advice} s={s} p={p} onListing={onListing} onProfile={onProfile} />}

      <div className="gt" style={{ marginTop: 4 }}>대출 선택지 <small>눌러서 비교 · 자동은 부족액이 가장 적은 쪽</small></div>
      <Options o={o} choice={p.loanProduct ?? "auto"} onChoose={onChoose} />

      {o.ineligible.length > 0 && (
        <div className="alert"><b>⚠ {o.productName} 자격 미달</b> — {o.ineligible.join(" · ")}</div>
      )}
      {(o.blockReason || o.ignored) && (
        <div className="alert">
          <b>⚠ {o.ignored ? "규제 예외를 가정하고 계산 중" : "잔금 때 대출 불가"}</b> — {o.blockReason || "실제로는 규제 때문에 이 방식으로 진행하지 못할 수 있습니다."}
          {R.moveIn && !R.toheo && !o.ignored && <> 입주월을 <b>{ymLabel(ymAdd(s.buyYm, R.moveInMonths))}</b> 이전으로 맞추면 가능합니다.</>}
          <label><input type="checkbox" checked={s.ignoreRules} onChange={(e) => onIgnore(e.target.checked)} /> 규제 예외로 가정하고 계산</label>
        </div>
      )}

      <div className={`steps ${s.deposit > 0 ? "" : "one"}`}>
        <div className="card st">
          <h2>잔금 {ymLabel(s.buyYm)} <small>{s.deposit > 0 ? "① 매수" : "매수 + 입주"}</small></h2>
          <div className="need">{F(o.need1 + o.loan)}</div>
          <Bar parts={[["--s-loan", o.loan], ["--s-cash", o.cash1], ["--s-credit", o.credit], ["--bad", o.gap1]]} total={o.need1 + o.loan} />
          <Ln c="--s-loan" k={o.policy ? o.productName : "주담대"} v={o.loan} sub={LIMIT_TXT[o.limitBy]} />
          <Ln c="--s-cash" k="내 돈" v={o.cash1} sub={`그때 보유 ${F(o.cashAtBuy)}`} />
          <CreditLn o={o} k="atBuy" label="신용대출" />
          <End gap={o.gap1} left={o.leftover} />
          <div className="cost">취득세 {W(o.tax)} · 중개 {W(o.fee)} · 기타 {W(o.misc)} 포함</div>
        </div>
        {s.deposit > 0 && (
          <div className="card st">
            <h2>입주 {ymLabel(s.moveYm)} <small>② 보증금 반환</small></h2>
            <div className="need">{F(s.deposit)}</div>
            <Bar parts={[["--s-cash", o.cash2], ["--s-loan", o.addLoan], ["--s-credit", o.credit2], ["--bad", o.gap2]]} total={s.deposit} />
            <Ln c="--s-cash" k="내 돈" v={o.cash2} sub={`월 ${W(o.holdSave)}×${o.m2}`} />
            <Ln c="--s-loan" k="주담대 추가" v={o.addLoan} />
            <CreditLn o={o} k="atMove" label="신용대출 추가" />
            <End gap={o.gap2} left={o.surplus2} />
          </div>
        )}
      </div>

      <details className="why">
        <summary>계산 근거</summary>
        <ul>
          <li>{REGION_LABEL[s.region]} · LTV {R.ltv}% · {o.policy ? `DTI 심사 (DSR 미적용)` : `한도 ${F(R.cap)} · 스트레스 +${R.stress}%p (${RATE_TYPE_LABEL[p.mRateType ?? "variable"].split(" ")[0]})`}</li>
          <li>{o.policy ? "정책대출" : "주담대"} 차주: {o.mortgageBy} · {o.mRateUsed}% {o.mYearsUsed}년 · 한도 결정: {LIMIT_TXT[o.limitBy]}</li>
          <li>신용대출 한도 합계 {F(o.creditCapTotal)} (연봉 × {rules.creditCapRatio}) · DSR은 {rules.creditDsrYears}년 원리금으로 환산</li>
          <li>현금: 지금 {F(p.saved)} → 잔금 {F(o.cashAtBuy)} (+{o.m1}개월) → 입주 {F(o.cashAtMove)}</li>
        </ul>
      </details>
    </div>
  );
}
