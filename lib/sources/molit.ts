// 국토교통부 아파트 매매·전월세 실거래가 (공공데이터포털)
import { cached } from "./cache";

const key = () => process.env.DATA_GO_KR_KEY || "";
export const molitEnabled = () => !!key();

const keyParam = (k: string) => (k.includes("%") ? k : encodeURIComponent(k));
const tag = (xml: string, t: string) => { const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : ""; };
const num = (s: string) => +String(s).replace(/[^\d.]/g, "") || 0;

async function fetchItems(service: string, op: string, lawd: string, ym: string): Promise<string[]> {
  const items: string[] = [];
  for (let page = 1; page < 20; page++) {
    const url = `https://apis.data.go.kr/1613000/${service}/${op}?serviceKey=${keyParam(key())}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${page}`;
    const res = await fetch(url, { cache: "no-store" });
    const xml = await res.text();
    const code = tag(xml, "resultCode") || tag(xml, "returnReasonCode");
    if (code && !/^0+$/.test(code)) throw new Error(`국토부 API 오류 ${code}: ${tag(xml, "resultMsg") || tag(xml, "returnAuthMsg")}`);
    if (!res.ok) throw new Error(`국토부 API HTTP ${res.status}`);
    const chunk = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    items.push(...chunk);
    if (items.length >= num(tag(xml, "totalCount")) || chunk.length === 0) break;
  }
  return items;
}

export function monthsBack(n: number, from = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(from.getFullYear(), from.getMonth() - i, 1);
    return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}`;
  });
}
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export interface Trade { date: string; price: number; floor: string }
export interface ComplexSummary {
  apt: string; dong: string; area: number; buildYear: string;
  lastPrice: number; lastDate: string; count: number; median3: number;
  jeonseMedian: number; jeonseCount: number; wolseCount: number; trades: Trade[];
}

// 인메모리 중복 요청 방지 + DB 캐시 (당월 1시간, 지난달 12시간)
function monthItems(kind: "t" | "r", lawd: string, ym: string) {
  const cur = monthsBack(1)[0];
  const ttl = ym === cur ? 3600e3 : 12 * 3600e3;
  return kind === "t"
    ? cached(`molit:t:${lawd}:${ym}`, ttl, () => fetchItems("RTMSDataSvcAptTrade", "getRTMSDataSvcAptTrade", lawd, ym))
    : cached(`molit:r:${lawd}:${ym}`, ttl, () => fetchItems("RTMSDataSvcAptRent", "getRTMSDataSvcAptRent", lawd, ym));
}

export async function searchComplexes(lawd: string, months = 6): Promise<ComplexSummary[]> {
  if (!molitEnabled()) throw new Error(".env 에 DATA_GO_KR_KEY 가 없습니다.");
  if (!/^\d{5}$/.test(lawd)) throw new Error("시군구 코드(5자리)가 필요합니다.");
  const yms = monthsBack(Math.min(24, Math.max(1, months)));
  const [tl, rl] = await Promise.all([
    Promise.all(yms.map((ym) => monthItems("t", lawd, ym))),
    Promise.all(yms.map((ym) => monthItems("r", lawd, ym))),
  ]);
  type G = { apt: string; dong: string; area: number; buildYear: string; trades: Trade[]; jeonse: number[]; wolse: number };
  const groups = new Map<string, G>();
  const g = (it: string) => {
    const apt = tag(it, "aptNm"), dong = tag(it, "umdNm"), area = Math.round(num(tag(it, "excluUseAr")));
    const k = `${apt}|${dong}|${area}`;
    if (!groups.has(k)) groups.set(k, { apt, dong, area, buildYear: tag(it, "buildYear"), trades: [], jeonse: [], wolse: 0 });
    return groups.get(k)!;
  };
  const date = (it: string) => `${tag(it, "dealYear")}-${tag(it, "dealMonth").padStart(2, "0")}-${tag(it, "dealDay").padStart(2, "0")}`;
  for (const it of tl.flat()) {
    if (tag(it, "cdealType") === "O") continue; // 해제 거래 제외
    g(it).trades.push({ date: date(it), price: num(tag(it, "dealAmount")), floor: tag(it, "floor") });
  }
  for (const it of rl.flat()) {
    const grp = g(it);
    if (num(tag(it, "monthlyRent")) === 0) grp.jeonse.push(num(tag(it, "deposit"))); else grp.wolse++;
  }
  const recent = monthsBack(3).at(-1)!;
  return [...groups.values()].filter((x) => x.trades.length).map((x) => {
    x.trades.sort((a, b) => b.date.localeCompare(a.date));
    const r3 = x.trades.filter((t) => t.date.replace(/-/g, "").slice(0, 6) >= recent).map((t) => t.price);
    return {
      apt: x.apt, dong: x.dong, area: x.area, buildYear: x.buildYear,
      lastPrice: x.trades[0].price, lastDate: x.trades[0].date, count: x.trades.length,
      median3: median(r3.length ? r3 : x.trades.map((t) => t.price)),
      jeonseMedian: median(x.jeonse), jeonseCount: x.jeonse.length, wolseCount: x.wolse,
      trades: x.trades.slice(0, 10),
    };
  }).sort((a, b) => b.count - a.count);
}
