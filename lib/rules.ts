// 도메인 규칙 (대출 규제·세금) — 설정 화면에서 수정, DB settings.rules 에 저장
import type { Region } from "./regions";

export interface RegionRule {
  ltv: number; // 일반(무주택) LTV %
  ltvFirst: number; // 생애최초 LTV %
  cap: number | null; // 주담대 상한 (만원), null = 없음
  capOver15: number | null; // 15억 초과~25억 이하 주택 상한 (규제지역)
  capOver25: number | null; // 25억 초과 주택 상한 (규제지역)
  stress: number; // 스트레스 가산금리 %p
  moveInMonths: number; // 주담대 후 전입 의무 개월 (0 = 없음)
  toheo: boolean; // 토지거래허가(실거주 의무 → 세입자 낀 매수 불가)
}

/** 정책 주담대 상품 (신생아 특례·디딤돌 등) — DSR 대신 DTI, 스트레스 금리 없음 */
export interface LoanProduct {
  id: string;
  name: string;
  enabled: boolean;
  rate: number; // 금리 % (고정)
  years: number; // 만기
  maxLoan: number; // 한도 (만원)
  ltv: number; // LTV %
  dti: number; // DTI % (부부 합산 소득)
  maxPrice: number; // 주택가격 상한 (만원)
  maxArea: number; // 전용면적 상한 ㎡ (0 = 제한 없음)
  maxIncome: number; // 부부 합산 연소득 상한 (만원)
  maxAssets: number; // 순자산 상한 (만원)
  childWithinMonths: number; // 출생 후 N개월 이내 신청 (0 = 자녀 요건 없음)
  firstBuyerOnly: boolean;
  moveInMonths: number; // 대출 후 전입 기한 (개월)
  note: string;
}

export interface DomainRules {
  label: string; // 기준 (예: 2025.10.15 대책)
  regions: Record<Region, RegionRule>;
  regulatedSgg: string[]; // 규제지역 시군구 코드 (서울은 전부 포함하려면 "11*")
  dsrLimit: number; // DSR 한도 %
  creditCapRatio: number; // 신용대출 한도 = 연소득 × 배수
  creditDsrYears: number; // DSR 계산 시 신용대출 환산 만기(년)
  firstBuyerTaxRelief: number; // 생애최초 취득세 감면 한도 (만원)
  products: LoanProduct[]; // 정책대출 선택지
}

export const DEFAULT_PRODUCTS: LoanProduct[] = [
  {
    id: "newborn", name: "신생아 특례 디딤돌", enabled: true, rate: 3.8, years: 30, maxLoan: 40000, ltv: 70, dti: 60,
    maxPrice: 90000, maxArea: 85, maxIncome: 20000, maxAssets: 48800, childWithinMonths: 24, firstBuyerOnly: false, moveInMonths: 1,
    note: "출생 2년 내 신청, 부부합산 소득 2억 이하(2025~27 출생), 9억·85㎡ 이하, 한도 4억(6.27 이후). 금리는 소득·만기별 1.8~4.5% — 주택도시기금에서 확인",
  },
  {
    id: "didimdol", name: "디딤돌 (생애최초)", enabled: true, rate: 3.5, years: 30, maxLoan: 24000, ltv: 70, dti: 60,
    maxPrice: 60000, maxArea: 85, maxIncome: 7000, maxAssets: 48800, childWithinMonths: 0, firstBuyerOnly: true, moveInMonths: 1,
    note: "생애최초: 소득 7천 이하, 6억·85㎡ 이하, 한도 2.4억(수도권, 6.27 이후). 금리 2.85~4.15% — 확인 필요",
  },
];

export const DEFAULT_RULES: DomainRules = {
  label: "2025.10.15 대책",
  regions: {
    reg: { ltv: 40, ltvFirst: 70, cap: 60000, capOver15: 40000, capOver25: 20000, stress: 3.0, moveInMonths: 6, toheo: true },
    metro: { ltv: 70, ltvFirst: 70, cap: 60000, capOver15: null, capOver25: null, stress: 3.0, moveInMonths: 6, toheo: false },
    local: { ltv: 70, ltvFirst: 80, cap: null, capOver15: null, capOver25: null, stress: 0.75, moveInMonths: 0, toheo: false },
  },
  // 서울 전역 + 경기 12곳 (과천, 광명, 성남 3구, 수원 영통·장안·팔달, 안양 동안, 용인 수지, 의왕, 하남)
  regulatedSgg: ["11*", "41290", "41210", "41131", "41133", "41135", "41111", "41115", "41117", "41173", "41465", "41430", "41450"],
  dsrLimit: 40,
  creditCapRatio: 1,
  creditDsrYears: 5,
  firstBuyerTaxRelief: 200,
  products: DEFAULT_PRODUCTS,
};

/** 저장된 값이 일부만 있어도 기본값과 병합 */
export function mergeRules(saved: Partial<DomainRules> | null | undefined): DomainRules {
  if (!saved) return DEFAULT_RULES;
  return {
    ...DEFAULT_RULES, ...saved,
    // 저장된 상품은 기본값과 id 로 병합 (새로 추가된 기본 상품도 보이도록)
    products: DEFAULT_PRODUCTS.map((d) => ({ ...d, ...saved.products?.find((x) => x.id === d.id) }))
      .concat((saved.products ?? []).filter((x) => !DEFAULT_PRODUCTS.some((d) => d.id === x.id))),
    regions: {
      reg: { ...DEFAULT_RULES.regions.reg, ...saved.regions?.reg },
      metro: { ...DEFAULT_RULES.regions.metro, ...saved.regions?.metro },
      local: { ...DEFAULT_RULES.regions.local, ...saved.regions?.local },
    },
  };
}

export function isRegulated(code: string, dr: DomainRules = DEFAULT_RULES) {
  return dr.regulatedSgg.some((c) => (c.endsWith("*") ? code.startsWith(c.slice(0, -1)) : c === code));
}

export function regionOf(code: string, dr: DomainRules = DEFAULT_RULES): Region {
  if (isRegulated(code, dr)) return "reg";
  if (/^(11|41|28)/.test(code)) return "metro";
  return "local";
}

/** 에이전트 프롬프트용 규칙 요약 */
export function rulesText(dr: DomainRules) {
  const r = dr.regions, cap = (n: number | null) => (n == null ? "없음" : `${n / 10000}억`);
  return `규제 기준(${dr.label}, 사용자가 설정한 값):
- 규제지역: LTV 일반 ${r.reg.ltv}% / 생애최초 ${r.reg.ltvFirst}%, 주담대 상한 ${cap(r.reg.cap)}(15~25억 ${cap(r.reg.capOver15)}, 25억 초과 ${cap(r.reg.capOver25)}), 스트레스 +${r.reg.stress}%p, 전입의무 ${r.reg.moveInMonths || "없음"}개월${r.reg.toheo ? ", 토지거래허가(실거주 의무 → 세입자 낀 매수 불가)" : ""}
- 수도권 비규제: LTV ${r.metro.ltv}%/${r.metro.ltvFirst}%, 상한 ${cap(r.metro.cap)}, 스트레스 +${r.metro.stress}%p, 전입의무 ${r.metro.moveInMonths || "없음"}개월
- 지방: LTV ${r.local.ltv}%/${r.local.ltvFirst}%, 상한 ${cap(r.local.cap)}, 스트레스 +${r.local.stress}%p
- 스트레스 DSR 한도 ${dr.dsrLimit}%, 신용대출 연소득 ${dr.creditCapRatio}배 이내
${dr.products.filter((x) => x.enabled).map((x) => `- 정책대출 ${x.name}: 금리 ${x.rate}% 고정, 한도 ${x.maxLoan / 10000}억, LTV ${x.ltv}%, DTI ${x.dti}% (DSR 미적용), 집값 ${x.maxPrice / 10000}억·${x.maxArea || "-"}㎡ 이하, 소득 ${x.maxIncome}만 이하, 순자산 ${x.maxAssets}만 이하${x.childWithinMonths ? `, 출생 ${x.childWithinMonths}개월 이내` : ""}${x.firstBuyerOnly ? ", 생애최초" : ""}`).join("\n")}`;
}
