// 내집마련 자금 계산 엔진 (순수 함수 — 클라이언트/서버/에이전트 공용). 단위: 만원
import type { Region } from "./regions";
import { DEFAULT_RULES, type DomainRules, type LoanProduct, type RateType } from "./rules";

export interface Profile {
  asOf: string; // YYYY-MM 기준월
  saved: number; // 현재 모아둔 돈
  monthlySave: number; // 월 저축 가능액
  income: number; // 연소득 합계 (borrowers 가 있으면 그 합으로 대체)
  otherDebt: number; // 기존 대출 월 상환액 합계
  borrowers?: Borrower[]; // 차주별 (나·배우자)
  mortgageBorrower?: MortgageBorrower; // 주담대 차주: auto=부족액 최소가 되는 쪽 자동 선택
  firstBuyer: boolean;
  mRate: number; mYears: number; // 주담대 금리(%)·만기(년)
  mRateType?: RateType; // 주담대 금리 유형 → 스트레스 가산 반영 비율
  cRate: number; cYears: number; // 신용대출 금리(%)·상환기간(년)
  cRepay?: CreditRepay; // 신용대출 상환 방식 (기본 만기일시 = 매달 이자만)
  autoRate: boolean; // 실시간 금리 사용
  childBirth?: string | null; // 막내 출생일 YYYY-MM-DD (신생아 특례)
  assets?: number | null; // 순자산 (만원, 비우면 모아둔 돈으로 간주)
  loanProduct?: string; // auto | market | 정책상품 id
}

export interface Borrower {
  name: string; income: number; otherDebt: number;
  creditPlan?: number | null; // 받을 신용대출 계획액 (0/비움 = 부족분만큼 자동)
}
export type MortgageBorrower = "auto" | "joint" | "0" | "1";
export type CreditRepay = "bullet" | "amortize";

/** 신용대출 실제 월 납입액 — 만기일시는 이자만, 원리금균등은 cYears 동안 상환 */
export function creditMonthly(P: number, p: Pick<Profile, "cRate" | "cYears" | "cRepay">) {
  if (P <= 0) return 0;
  return (p.cRepay ?? "bullet") === "amortize" ? pmt(P, p.cRate, Math.max(1, p.cYears)) : (P * p.cRate) / 1200;
}

export function borrowersOf(p: Pick<Profile, "income" | "otherDebt" | "borrowers">): Borrower[] {
  const b = (p.borrowers ?? []).filter((x) => x && x.name);
  return b.some((x) => x.income > 0) ? b : [{ name: "나", income: p.income, otherDebt: p.otherDebt }];
}

export interface ListingInput {
  name: string;
  price: number; kb: number; deposit: number; rent: number;
  region: Region;
  sgg?: string | null;
  buyYm: string; moveYm: string; // 잔금월, 입주월(세입자 퇴거)
  misc: number; // 등기·이사 등 기타비용
  ignoreRules: boolean; // 규제 예외 가정
  areaM2?: number | null; // 전용면적 (정책대출 85㎡ 요건)
}

export interface Rates { mortgage: { rate: number; time: string } | null; credit: { rate: number; time: string } | null }

export interface Rules { ltv: number; cap: number; stress: number; moveIn: boolean; moveInMonths: number; toheo: boolean }

export function rules(p: Pick<Profile, "firstBuyer" | "mRateType">, s: Pick<ListingInput, "region" | "price">, dr: DomainRules = DEFAULT_RULES): Rules {
  const r = dr.regions[s.region];
  const ratio = (dr.stressRatio?.[p.mRateType ?? "variable"] ?? 100) / 100;
  const tier = s.price > 250000 ? r.capOver25 ?? r.cap : s.price > 150000 ? r.capOver15 ?? r.cap : r.cap;
  return { ltv: p.firstBuyer ? r.ltvFirst : r.ltv, cap: tier ?? Infinity, stress: Math.round(r.stress * ratio * 100) / 100, moveIn: r.moveInMonths > 0, moveInMonths: r.moveInMonths, toheo: r.toheo };
}

export function acqTax(price: number, first: boolean, relief = 200) {
  const r = price <= 60000 ? 1 : price <= 90000 ? (price / 10000) * 2 / 3 - 3 : 3;
  let t = (price * r / 100) * 1.1; // 취득세 + 지방교육세(85㎡ 이하)
  if (first && price <= 120000) t -= Math.min(relief, price * r / 100);
  return Math.max(0, t);
}

export function brokerFee(p: number) {
  if (p < 5000) return Math.min(p * 0.006, 25);
  if (p < 20000) return Math.min(p * 0.005, 80);
  if (p < 90000) return p * 0.004;
  if (p < 120000) return p * 0.005;
  if (p < 150000) return p * 0.006;
  return p * 0.007;
}

export const pmt = (P: number, rate: number, y: number) => { if (P <= 0) return 0; const r = rate / 1200, n = y * 12; return r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n; };
export const pv = (M: number, rate: number, y: number) => { if (M <= 0) return 0; const r = rate / 1200, n = y * 12; return r ? M * (1 - Math.pow(1 + r, -n)) / r : M * n; };
export const ymDiff = (a: string, b: string) => { if (!a || !b) return 0; const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
export const ymAdd = (a: string, n: number) => { const [y, m] = a.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const nowYm = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** 실시간 금리 사용 시 프로필 금리를 덮어쓴 '실효 프로필' */
export function effectiveProfile(p: Profile, rates: Rates | null): Profile {
  if (!p.autoRate || !rates) return p;
  return { ...p, mRate: rates.mortgage?.rate ?? p.mRate, cRate: rates.credit?.rate ?? p.cRate };
}

export type LimitBy = "LTV" | "상한" | "DSR" | "DTI" | "규제" | "자격";

export interface CalcResult {
  rules: Rules;
  m1: number; m2: number; // 기준월→잔금, 잔금→입주 개월
  cashAtBuy: number;
  tax: number; fee: number; misc: number; costs: number;
  blockReason: string | null; ignored: boolean;
  ltvRoom: number; loanLimit: number; limitBy: LimitBy;
  toSeller: number; loan: number; need1: number; cash1: number; creditCap: number; credit: number; gap1: number; leftover: number;
  pay1: number; holdSave: number; cashAtMove: number;
  cash2: number; addRoom: number; addLoan: number; credit2: number; gap2: number; surplus2: number;
  pay2: number; dsr: number; totalLoan: number; gap: number;
  mortgageBy: string; // 주담대 차주 표시 (나 / 아내 / 공동)
  mortgageChoice: Exclude<MortgageBorrower, "auto">;
  creditBy: { name: string; atBuy: number; atMove: number; cap: number; dsr: number; plan: number }[]; // 차주별 신용대출·DSR
  creditCapTotal: number; // 차주별 신용 한도 합계
  creditNote: string | null; // 신용대출이 계획/한도보다 적게 나온 이유
  productId: string; // market | 정책상품 id
  productName: string;
  policy: boolean; // 정책대출 여부 (DSR 미적용, DTI 심사)
  ineligible: string[]; // 정책대출 자격 미달 사유
  mRateUsed: number; mYearsUsed: number;
  options: LoanOption[]; // 모든 선택지 요약 (calc() 결과에만 채움)
}

export interface LoanOption {
  id: string; name: string; policy: boolean; eligible: boolean; reasons: string[];
  loan: number; credit: number; gap: number; pay: number; rate: number; limitBy: LimitBy; mortgageBy: string;
}

export function calc(p: Profile, s: ListingInput, dr: DomainRules = DEFAULT_RULES): CalcResult {
  const all = calcOptions(p, s, dr);
  const choice = p.loanProduct ?? "auto";
  const picked = choice === "auto"
    ? [...all].sort((a, b) => Number(b.ineligible.length === 0) - Number(a.ineligible.length === 0) || a.gap - b.gap || a.pay2 - b.pay2)[0]
    : all.find((o) => o.productId === choice) ?? all[0];
  const options: LoanOption[] = all.map((o) => ({
    id: o.productId, name: o.productName, policy: o.policy, eligible: o.ineligible.length === 0, reasons: o.ineligible,
    loan: o.loan + o.addLoan, credit: o.credit + o.credit2, gap: o.gap, pay: o.pay2, rate: o.mRateUsed, limitBy: o.limitBy, mortgageBy: o.mortgageBy,
  }));
  return { ...picked, options };
}

/** 시중 주담대 + 사용 가능한 정책대출 각각의 결과 */
export function calcOptions(p: Profile, s: ListingInput, dr: DomainRules = DEFAULT_RULES): CalcResult[] {
  return [calcMarket(p, s, dr), ...dr.products.filter((x) => x.enabled).map((prod) => calcWith(p, s, dr, "joint", prod))];
}

function calcMarket(p: Profile, s: ListingInput, dr: DomainRules): CalcResult {
  const bs = borrowersOf(p);
  const choice = p.mortgageBorrower ?? "auto";
  if (choice !== "auto" || bs.length < 2) return calcWith(p, s, dr, bs.length < 2 || choice === "auto" ? "0" : choice);
  // 자동: 나·배우자·공동 중 부족액이 가장 적고, 같으면 월 상환이 적은 쪽
  return (["joint", "0", "1"] as const).map((c) => calcWith(p, s, dr, c))
    .sort((a, b) => a.gap - b.gap || a.pay2 - b.pay2)[0];
}

/** 정책대출 자격 확인 */
export function eligibility(p: Profile, s: ListingInput, prod: LoanProduct, totalIncome: number): string[] {
  const why: string[] = [];
  const F = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}억` : `${Math.round(n).toLocaleString()}만`);
  if (s.price > prod.maxPrice) why.push(`집값 ${F(s.price)} > ${F(prod.maxPrice)}`);
  if (prod.maxArea && s.areaM2 && s.areaM2 > prod.maxArea + 0.5) why.push(`전용 ${s.areaM2}㎡ > ${prod.maxArea}㎡`);
  if (totalIncome > prod.maxIncome) why.push(`부부 소득 ${F(totalIncome)} > ${F(prod.maxIncome)}`);
  const assets = p.assets ?? p.saved;
  if (assets > prod.maxAssets) why.push(`순자산 ${F(assets)} > ${F(prod.maxAssets)}`);
  if (prod.firstBuyerOnly && !p.firstBuyer) why.push("생애최초 아님");
  if (prod.childWithinMonths) {
    if (!p.childBirth) why.push("자녀 출생일 미입력");
    else {
      const months = ymDiff(p.childBirth.slice(0, 7), s.buyYm);
      if (months > prod.childWithinMonths) why.push(`잔금(${s.buyYm})이 출생 후 ${months}개월 — ${prod.childWithinMonths}개월 초과 (신청 기한 ${ymAdd(p.childBirth.slice(0, 7), prod.childWithinMonths)})`);
      if (months < 0) why.push("출생일이 잔금월 이후");
    }
  }
  return why;
}

function calcWith(p: Profile, s: ListingInput, dr: DomainRules, mb: Exclude<MortgageBorrower, "auto">, prod?: LoanProduct): CalcResult {
  const base = rules(p, s, dr);
  // 정책대출: 상품 LTV·한도, 스트레스 없음, 전입 기한은 상품 기준
  const R: Rules = prod ? { ltv: prod.ltv, cap: prod.maxLoan, stress: 0, moveIn: true, moveInMonths: prod.moveInMonths, toheo: base.toheo } : base;
  const mRate = prod ? prod.rate : p.mRate, mYears = prod ? prod.years : p.mYears;
  const dsrPct = dr.dsrLimit / 100, cy = dr.creditDsrYears;
  const bs = borrowersOf(p);
  const totalIncome = bs.reduce((a, b) => a + b.income, 0);
  const ineligible = prod ? eligibility(p, s, prod, totalIncome) : [];
  const m1 = Math.max(0, ymDiff(p.asOf, s.buyYm));
  const m2 = Math.max(0, ymDiff(s.buyYm, s.moveYm));
  const cashAtBuy = p.saved + p.monthlySave * m1;

  const tax = acqTax(s.price, p.firstBuyer, dr.firstBuyerTaxRelief), fee = brokerFee(s.price), misc = s.misc, costs = tax + fee + misc;
  const tenantRule = s.deposit > 0 && (R.toheo || (R.moveIn && m2 > R.moveInMonths));
  const blockReason = !tenantRule || s.ignoreRules ? null
    : R.toheo ? "토지거래허가구역이라 실거주용 매수만 허가됩니다. 세입자가 있는 집은 매수 자체가 어렵습니다."
    : `${prod ? prod.name : "주담대"}를 받으면 ${R.moveInMonths}개월 안에 전입해야 하는데, 잔금 뒤 ${m2}개월이 지나야 입주할 수 있어서 잔금 시점에 받을 수 없습니다.`;
  const ignored = tenantRule && s.ignoreRules;

  const ltvMax = s.kb * R.ltv / 100;
  const mS = mRate + R.stress;
  // 차주별 스트레스 DSR 월 상환 여력
  const rooms = bs.map((b) => b.income * dsrPct / 12 - b.otherDebt);
  const mIdx = mb === "joint" ? null : Math.min(Number(mb), bs.length - 1);
  const mortgageRoom = () => (mIdx == null ? rooms.reduce((a, r) => a + Math.max(0, r), 0) : Math.max(0, rooms[mIdx]));
  const chargeMortgage = (payment: number) => {
    if (mIdx != null) { rooms[mIdx] -= payment; return; }
    // 공동: 각자 남은 DSR 여력 비율로 나눔 (한 사람만 한도를 넘지 않게)
    const pos = rooms.map((r) => Math.max(0, r)), sum = pos.reduce((a, b) => a + b, 0);
    bs.forEach((b, i) => { rooms[i] -= sum > 0 ? payment * (pos[i] / sum) : totalIncome > 0 ? payment * (b.income / totalIncome) : payment / bs.length; });
  };
  const creditUsed = bs.map(() => 0);
  const takeCredit = (need: number) => {
    const got = bs.map(() => 0);
    const order = bs.map((_, i) => i).sort((a, b) => rooms[b] - rooms[a]);
    for (const i of order) {
      if (need <= 0) break;
      const cap = Math.max(0, bs[i].income * dr.creditCapRatio - creditUsed[i]);
      const amt = Math.max(0, Math.min(need, cap, pv(Math.max(0, rooms[i]), p.cRate, cy)));
      if (amt <= 0) continue;
      got[i] = amt; creditUsed[i] += amt; rooms[i] -= pmt(amt, p.cRate, cy); need -= amt;
    }
    return got;
  };

  // ⓪ 계획한 신용대출을 먼저 확보 (각자 연봉 한도·자기 DSR 안에서)
  const plans = bs.map((b) => Math.max(0, b.creditPlan ?? 0));
  const c0 = bs.map((b, i) => {
    if (!plans[i]) return 0;
    const amt = Math.max(0, Math.min(plans[i], b.income * dr.creditCapRatio, pv(Math.max(0, rooms[i]), p.cRate, cy)));
    creditUsed[i] += amt; rooms[i] -= pmt(amt, p.cRate, cy);
    return amt;
  });
  const credit0 = c0.reduce((a, b) => a + b, 0);

  // ① 잔금
  const ltvRoom = Math.max(0, ltvMax - s.deposit);
  // 정책대출은 DSR 대신 DTI (부부 합산 소득 기준)
  const dtiRoom = prod ? totalIncome * prod.dti / 100 / 12 - bs.reduce((a, b) => a + b.otherDebt, 0) : 0;
  const dsrMax = prod ? pv(Math.max(0, dtiRoom), mS, mYears) : pv(mortgageRoom(), mS, mYears);
  const loanLimit = blockReason || ineligible.length ? 0 : Math.min(ltvRoom, R.cap, dsrMax);
  const limitBy: LimitBy = ineligible.length ? "자격" : blockReason ? "규제" : loanLimit === ltvRoom ? "LTV" : loanLimit === R.cap ? "상한" : prod ? "DTI" : "DSR";
  const toSeller = s.price - s.deposit;
  const loan = Math.min(loanLimit, Math.max(0, toSeller));
  chargeMortgage(pmt(loan, mS, mYears));
  const need1 = Math.max(0, toSeller - loan) + costs;
  const cash1 = Math.min(Math.max(0, cashAtBuy), Math.max(0, need1 - credit0));
  let rem = Math.max(0, need1 - credit0 - cash1);
  const creditCap = totalIncome * dr.creditCapRatio;
  const c1a = takeCredit(rem);
  const c1 = c1a.map((v, i) => v + c0[i]);
  const credit = c1.reduce((a, b) => a + b, 0);
  rem += credit0; // 아래 gap1 계산을 위해 계획분 포함
  const gap1 = Math.max(0, rem - credit);
  const leftover = cashAtBuy - cash1 + Math.max(0, credit0 - Math.max(0, need1 - cash1)); // 계획 신용이 필요보다 많으면 남는 돈

  // 보유 기간 저축 (상환액 차감, 월세 수입 가산)
  const pay1 = pmt(loan, mRate, mYears) + creditMonthly(credit, p);
  const holdSave = p.monthlySave - pay1 + (s.rent || 0);
  const cashAtMove = leftover + holdSave * m2;

  // ② 입주 (보증금 반환)
  const cash2 = Math.max(0, Math.min(cashAtMove, s.deposit));
  rem = s.deposit - cash2;
  // 정책대출은 입주 때 추가 대출 불가
  const addRoom = prod ? 0 : Math.max(0, Math.min(ltvMax, R.cap) - loan);
  const addLoan = Math.max(0, Math.min(rem, addRoom, pv(mortgageRoom(), mS, mYears)));
  rem -= addLoan; chargeMortgage(pmt(addLoan, mS, mYears));
  const c2 = takeCredit(rem);
  const credit2 = c2.reduce((a, b) => a + b, 0);
  rem -= credit2;
  const gap2 = Math.max(0, rem) + Math.max(0, -cashAtMove);
  const surplus2 = Math.max(0, cashAtMove - cash2);

  const pay2 = pay1 + pmt(addLoan, mRate, mYears) + creditMonthly(credit2, p);
  const usedTotal = bs.reduce((a, b, i) => a + (b.income * dsrPct / 12 - rooms[i]), 0);
  const dsr = totalIncome > 0 ? usedTotal / (totalIncome / 12) * 100 : 0;
  const creditBy = bs.map((b, i) => ({
    name: b.name, atBuy: c1[i], atMove: c2[i], cap: b.income * dr.creditCapRatio, plan: plans[i],
    dsr: b.income > 0 ? (b.income * dsrPct / 12 - rooms[i]) / (b.income / 12) * 100 : 0,
  }));
  const creditCapTotal = creditBy.reduce((a, b) => a + b.cap, 0);
  const short = creditBy.filter((b) => b.plan > 0 && b.atBuy + 1 < b.plan);
  const creditNote = short.length
    ? `${short.map((b) => `${b.name} 계획 ${Math.round(b.plan).toLocaleString()} → ${Math.round(b.atBuy).toLocaleString()}`).join(", ")} (연봉 한도·DSR 제한)`
    : credit + credit2 === 0 && gap1 + gap2 > 0 ? `DSR ${dr.dsrLimit}%를 ${prod ? prod.name : "주담대"}가 다 써서 신용대출 여력 없음 (한도 합계 ${Math.round(creditCapTotal).toLocaleString()})` : null;

  return {
    rules: R, m1, m2, cashAtBuy, tax, fee, misc, costs, blockReason, ignored,
    ltvRoom, loanLimit, limitBy, toSeller, loan, need1, cash1, creditCap, credit, gap1, leftover,
    pay1, holdSave, cashAtMove, cash2, addRoom, addLoan, credit2, gap2, surplus2,
    pay2, dsr, totalLoan: loan + credit + addLoan + credit2, gap: gap1 + gap2,
    creditCapTotal, creditNote,
    productId: prod?.id ?? "market", productName: prod?.name ?? "시중 주담대", policy: !!prod, ineligible, mRateUsed: mRate, mYearsUsed: mYears, options: [],
    mortgageChoice: mb, mortgageBy: mIdx == null ? (bs.filter((b) => b.income > 0).length > 1 ? "공동" : (bs.find((b) => b.income > 0) ?? bs[0]).name) : bs[mIdx].name, creditBy,
  };
}

/** 에이전트/요약용: 사람이 읽기 쉬운 핵심 수치 */
export function summarize(s: ListingInput, o: CalcResult) {
  const r = (n: number) => Math.round(n);
  return {
    verdict: o.gap <= 0 ? "가능" : "부족",
    totalShortfall: r(o.gap),
    rules: { ltvPct: o.rules.ltv, loanCap: isFinite(o.rules.cap) ? o.rules.cap : null, stressRatePct: o.rules.stress },
    blockedReason: o.blockReason, assumedRuleException: o.ignored,
    timeline: { monthsUntilBuy: o.m1, monthsBuyToMoveIn: o.m2, cashAtBuy: r(o.cashAtBuy), cashAtMoveIn: r(o.cashAtMove) },
    atBuy: { needCash: r(o.need1 + o.loan), mortgage: r(o.loan), mortgageLimitedBy: o.limitBy, ownCash: r(o.cash1), creditLoan: r(o.credit), shortfall: r(o.gap1), leftover: r(o.leftover), costs: { acquisitionTax: r(o.tax), brokerFee: r(o.fee), misc: r(o.misc) } },
    atMoveIn: { depositToReturn: r(s.deposit), ownCash: r(o.cash2), extraMortgage: r(o.addLoan), extraMortgageRoom: r(o.addRoom), extraCredit: r(o.credit2), shortfall: r(o.gap2), surplus: r(o.surplus2), monthlySavingWhileHolding: r(o.holdSave) },
    monthly: { whileHolding: r(o.pay1), afterMoveIn: r(o.pay2) },
    mortgageBorrower: o.mortgageBy,
    loanProduct: o.productName, loanRatePct: o.mRateUsed,
    options: o.options.map((x) => ({ name: x.name, eligible: x.eligible, ineligibleReasons: x.reasons, loan: r(x.loan), credit: r(x.credit), shortfall: r(x.gap), monthly: r(x.pay), ratePct: x.rate, limitedBy: x.limitBy })),
    byBorrower: o.creditBy.map((b) => ({ name: b.name, creditPlan: r(b.plan), creditAtBuy: r(b.atBuy), creditAtMoveIn: r(b.atMove), creditCap: r(b.cap), stressDsrPct: Math.round(b.dsr * 10) / 10 })),
    creditTotal: r(o.credit + o.credit2), creditCapTotal: r(o.creditCapTotal), creditNote: o.creditNote,
    stressDsrPct: Math.round(o.dsr * 10) / 10,
    totalLoan: r(o.totalLoan),
    unit: "만원",
  };
}
