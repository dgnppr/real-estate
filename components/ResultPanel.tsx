"use client";
import { ymAdd, type CalcResult, type ListingInput, type Profile } from "@/lib/calc";
import { REGION_LABEL } from "@/lib/regions";
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

export function ResultPanel({ p, s, o, dsrLimit, onIgnore, onChoose }: { p: Profile; s: ListingInput; o: CalcResult; dsrLimit: number; onIgnore: (v: boolean) => void; onChoose: (id: string) => void }) {
  const R = o.rules, ok = o.gap <= 0;
  return (
    <div>
      <Options o={o} choice={p.loanProduct ?? "auto"} onChoose={onChoose} />
      <div className={`verdict ${ok ? "ok" : "no"}`}>
        <div className="big">{ok ? "✓ 살 수 있어요" : `${F(o.gap)}만 원 부족`}</div>
        <div className="sm">
          현금 흐름: 지금 {F(p.saved)} → 잔금({ymLabel(s.buyYm)}) {F(o.cashAtBuy)} → 입주({ymLabel(s.moveYm)}) {F(o.cashAtMove)}
        </div>
        <div className="chips">
          <span className="chip">{o.productName} {o.mRateUsed}%</span>
          <span className="chip">{REGION_LABEL[s.region]} · LTV {R.ltv}%{o.policy ? " · DTI 심사" : ""}</span>
          <span className="chip">{o.policy ? "정책대출" : "주담대"} {F(o.loan + o.addLoan)} · {o.mortgageBy}{!o.policy && p.mortgageBorrower === "auto" && o.creditBy.length > 1 ? "(자동)" : ""}</span>
          <span className="chip">월 상환 {W(o.pay2)}</span>
          {o.creditBy.length > 1
            ? o.creditBy.map((b) => <span key={b.name} className={`chip ${b.dsr > dsrLimit + 0.5 ? "warn" : ""}`}>{b.name} DSR {b.dsr.toFixed(0)}%</span>)
            : <span className={`chip ${o.dsr > dsrLimit ? "warn" : ""}`}>DSR {o.dsr.toFixed(0)}/{dsrLimit}%</span>}
        </div>
      </div>

      {o.ineligible.length > 0 && (
        <div className="alert"><b>⚠ {o.productName} 자격 미달</b> — {o.ineligible.join(" · ")}</div>
      )}
      {(o.blockReason || o.ignored) && (
        <div className="alert">
          <b>⚠ {o.ignored ? "규제 예외를 가정하고 계산 중" : "잔금 때 주담대 불가"}</b> — {o.blockReason || "실제로는 규제 때문에 이 방식으로 진행하지 못할 수 있습니다."}
          {R.moveIn && !R.toheo && !o.ignored && <> 입주월을 <b>{ymLabel(ymAdd(s.buyYm, R.moveInMonths))}</b> 이전으로 맞추면 가능합니다.</>}
          <label><input type="checkbox" checked={s.ignoreRules} onChange={(e) => onIgnore(e.target.checked)} /> 규제 예외로 가정하고 계산</label>
        </div>
      )}

      <div className="steps">
        <div className="card st">
          <h2>① 잔금 <small>{ymLabel(s.buyYm)}</small></h2>
          <div className="need">{F(o.need1 + o.loan)}</div>
          <Bar parts={[["--s-loan", o.loan], ["--s-cash", o.cash1], ["--s-credit", o.credit], ["--bad", o.gap1]]} total={o.need1 + o.loan} />
          <Ln c="--s-loan" k={o.policy ? o.productName : "주담대"} v={o.loan} sub={LIMIT_TXT[o.limitBy]} />
          <Ln c="--s-cash" k="내 돈" v={o.cash1} />
          <CreditLn o={o} k="atBuy" label="신용대출" />
          <End gap={o.gap1} left={o.leftover} />
          <div className="cost">취득세 {W(o.tax)} · 중개 {W(o.fee)} · 기타 {W(o.misc)} 포함</div>
        </div>
        <div className="card st">
          <h2>② 입주 <small>{ymLabel(s.moveYm)}</small></h2>
          <div className="need">{F(s.deposit)}<small>보증금 반환</small></div>
          <Bar parts={[["--s-cash", o.cash2], ["--s-loan", o.addLoan], ["--s-credit", o.credit2], ["--bad", o.gap2]]} total={s.deposit} />
          <Ln c="--s-cash" k="내 돈" v={o.cash2} sub={`월 ${W(o.holdSave)}×${o.m2}`} />
          <Ln c="--s-loan" k="주담대 추가" v={o.addLoan} />
          {s.deposit > 0 && <CreditLn o={o} k="atMove" label="신용대출 추가" />}
          {s.deposit > 0 || o.cashAtMove < 0 ? <End gap={o.gap2} left={o.surplus2} /> : <div className="hint">돌려줄 보증금이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
