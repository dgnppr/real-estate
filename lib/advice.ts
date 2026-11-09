// "이렇게 하면 살 수 있어요" — 부족할 때 해결 경로를 역산 (순수 함수)
import { calc, ymAdd, ymDiff, type CalcResult, type ListingInput, type Profile } from "./calc";
import type { DomainRules } from "./rules";

export interface Advice {
  maxPrice: number | null; // 지금 조건으로 살 수 있는 최대 매매가 (KB시세는 같은 비율로 가정)
  monthlyNeeded: number | null; // 잔금까지 매달 더 모아야 할 금액
  earliestYm: string | null; // 지금 저축 속도로 가능한 가장 빠른 잔금월 (36개월 내)
  cashNeeded: number; // 잔금 때 추가로 필요한 현금 (= 부족액)
}

const ok = (o: CalcResult) => o.gap <= 0;

export function advise(p: Profile, s: ListingInput, dr: DomainRules, now?: CalcResult): Advice {
  const cur = now ?? calc(p, s, dr);
  if (ok(cur)) return { maxPrice: null, monthlyNeeded: null, earliestYm: null, cashNeeded: 0 };

  // 1) 최대 매매가: 이분 탐색 (KB시세·보증금은 매매가 비율 유지)
  const ratio = s.price > 0 ? s.kb / s.price : 1;
  let lo = 0, hi = s.price;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const o = calc(p, { ...s, price: mid, kb: mid * ratio, deposit: Math.min(s.deposit, mid) }, dr);
    if (ok(o)) lo = mid; else hi = mid;
  }
  const maxPrice = lo > 1000 ? Math.floor(lo / 100) * 100 : null;

  // 2) 잔금까지 매달 더 모으면? (잔금까지 기간이 있을 때만)
  let monthlyNeeded: number | null = null;
  if (cur.m1 > 0) {
    let a = 0, b = 5000;
    if (ok(calc({ ...p, monthlySave: p.monthlySave + b }, s, dr))) {
      for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (ok(calc({ ...p, monthlySave: p.monthlySave + m }, s, dr))) b = m; else a = m; }
      monthlyNeeded = Math.ceil(b / 10) * 10;
    }
  }

  // 3) 잔금을 미루면? (입주까지 간격 유지, 36개월까지)
  let earliestYm: string | null = null;
  const gapMonths = Math.max(0, ymDiff(s.buyYm, s.moveYm));
  for (let k = 1; k <= 36; k++) {
    const ym = ymAdd(s.buyYm, k);
    if (ok(calc(p, { ...s, buyYm: ym, moveYm: ymAdd(ym, gapMonths) }, dr))) { earliestYm = ym; break; }
  }

  return { maxPrice, monthlyNeeded, earliestYm, cashNeeded: Math.round(cur.gap) };
}
