// 네이버 부동산 호가 어댑터 (자리만 마련)
//
// 네이버 부동산은 공개 API가 없고, 약관상 자동 수집(크롤링)을 금지하며 봇 차단·토큰 검증이 있습니다.
// 그래서 기본값은 꺼져 있습니다. 호가 데이터를 합법적으로 받을 수 있는 엔드포인트(제휴 API, 사내 수집기 등)가
// 있으면 NAVER_API_URL 로 연결하세요. 응답은 매물 호가 목록(만원 단위)을 기대합니다.
import type { SourceAdapter } from "./index";

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export const naverAdapter: SourceAdapter = {
  id: "naver",
  label: "네이버 호가",
  available: () => !!process.env.NAVER_API_URL,
  applicable: (l) => !!l.naverComplexNo,
  hint: "합법적인 호가 데이터 엔드포인트(NAVER_API_URL) 필요",
  async fetch(l) {
    const url = process.env.NAVER_API_URL!.replace("{complexNo}", encodeURIComponent(l.naverComplexNo!)).replace("{area}", String(l.areaM2 ?? ""));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`호가 API HTTP ${res.status}`);
    const j = await res.json();
    const prices: number[] = (j.articles ?? j.items ?? []).map((a: { price?: number }) => a.price).filter((n: unknown): n is number => typeof n === "number" && n > 0);
    if (!prices.length) return { askingCount: 0, note: "매물 호가 없음" };
    return { askingMin: Math.min(...prices), askingMedian: median(prices), askingCount: prices.length };
  },
};
