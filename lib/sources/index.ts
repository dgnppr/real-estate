// 시세 소스 어댑터 레지스트리. 새 소스는 SourceAdapter 를 구현해서 ADAPTERS 에 추가하면
// 배치(lib/watch.ts)와 화면이 자동으로 사용합니다.
import type { ListingRow, SnapshotData } from "../db/schema";
import { molitEnabled, searchComplexes } from "./molit";
import { kbAdapter } from "./kb";
import { naverAdapter } from "./naver";

export interface SourceAdapter {
  id: string;
  label: string;
  /** 전역 사용 가능 여부(키·설정) */
  available(): boolean;
  /** 이 매물에 적용 가능한지 (필요한 식별자가 있는지) */
  applicable(l: ListingRow): boolean;
  /** 현재 시세 스냅샷 */
  fetch(l: ListingRow): Promise<SnapshotData | null>;
  /** 설정 안내 */
  hint: string;
}

const molitAdapter: SourceAdapter = {
  id: "molit",
  label: "국토부 실거래가",
  available: molitEnabled,
  applicable: (l) => !!(l.sgg && l.aptName),
  hint: ".env 의 DATA_GO_KR_KEY + 매물의 시군구·단지명(·전용면적)",
  async fetch(l) {
    const list = await searchComplexes(l.sgg!, 6);
    const area = l.areaM2 ? Math.round(l.areaM2) : null;
    const matches = list.filter((x) => x.apt === l.aptName && (area == null || Math.abs(x.area - area) <= 1));
    if (!matches.length) return { note: `최근 6개월 '${l.aptName}' 거래 없음` };
    const x = matches.sort((a, b) => b.count - a.count)[0];
    return { lastPrice: x.lastPrice, lastDate: x.lastDate, median3: x.median3, tradeCount: x.count, jeonseMedian: x.jeonseMedian || undefined };
  },
};

export const ADAPTERS: SourceAdapter[] = [molitAdapter, kbAdapter, naverAdapter];

export function sourceStatus() {
  return ADAPTERS.map((a) => ({ id: a.id, label: a.label, available: a.available(), hint: a.hint }));
}
