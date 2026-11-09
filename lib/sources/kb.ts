// KB부동산 시세·매물 어댑터 (api.kbland.kr — 비공식, 예고 없이 바뀌거나 막힐 수 있음)
// 일반 요청만 보내고(위장 헤더 없음), 결과를 캐시해 호출을 최소화합니다. KB_DISABLED=1 이면 끔.
import { cached } from "./cache";
import type { SourceAdapter } from "./index";
import type { ListingRow } from "../db/schema";

const BASE = "https://api.kbland.kr";
const q = (params: Record<string, string | number>) =>
  Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");

let lastCall = 0;
async function kbGet<T>(path: string, params: Record<string, string | number> = {}, timeoutMs = 20_000): Promise<T> {
  const wait = lastCall + 700 - Date.now(); // 연속 호출 간격 0.7초
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(`${BASE}${path}${Object.keys(params).length ? "?" + q(params) : ""}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`KB ${path} HTTP ${res.status}`);
  const j = await res.json();
  if (j?.dataHeader?.resultCode !== "10000") throw new Error(`KB ${path} 오류: ${j?.dataHeader?.message ?? "알 수 없음"}`);
  return j.dataBody.data as T;
}

export const kbEnabled = () => process.env.KB_DISABLED !== "1";

/* ---------- 단지 색인 (수도권만, 하루 캐시) ---------- */
export interface KbComplex { id: number; name: string; bjd: string; dong: string; addr: string }

export async function kbIndex(): Promise<KbComplex[]> {
  return cached("kb:index:v1", 24 * 3600e3, async () => {
    const all = await kbGet<{ 단지기본일련번호: number; 단지명: string; 법정동코드: string; 주소: string }[]>("/land-price/price/fastPriceComplexName", {}, 120_000);
    return all.filter((x) => /^(11|41|28)/.test(x.법정동코드)).map((x) => ({
      id: x.단지기본일련번호, name: x.단지명, bjd: x.법정동코드, addr: x.주소, dong: x.주소.split(" ")[2] ?? "",
    }));
  });
}

const norm = (s: string) => s.replace(/아파트|단지|고층|저층|\s|[()[\],.·-]/g, "");
const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
const bigrams = (s: string) => { const a = new Set<string>(); for (let i = 0; i < s.length - 1; i++) a.add(s.slice(i, i + 2)); if (s.length === 1) a.add(s); return a; };
function similarity(a: string, b: string) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigrams(na.replace(/\d+/g, "")), B = bigrams(nb.replace(/\d+/g, ""));
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  let s = A.size + B.size ? (2 * inter) / (A.size + B.size) : 0;
  if (nb.includes(na.replace(/\d+/g, "")) || na.includes(nb.replace(/\d+/g, ""))) s = Math.max(s, 0.6);
  const xa = nums(a), xb = nums(b);
  if (xa.length && xb.length) s += xa.some((n) => xb.includes(n)) ? 0.3 : -0.5;
  return s;
}

/** 국토부 단지(시군구·동·단지명) → KB 단지 후보 (점수순) */
export async function matchKbComplex(sgg: string, dong: string | null | undefined, apt: string) {
  const idx = (await kbIndex()).filter((c) => c.bjd.startsWith(sgg));
  const pool = dong ? idx.filter((c) => c.dong === dong) : idx;
  return (pool.length ? pool : idx)
    .map((c) => ({ ...c, score: Math.round(similarity(apt, c.name) * 100) / 100 }))
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

/* ---------- 면적 타입별 시세 ---------- */
export interface KbType { areaSeq: number; exclusive: number; low: number; mid: number; high: number; jeonse: number; listings: number; households: number }

export async function kbTypes(complexId: number): Promise<KbType[]> {
  return cached(`kb:types:${complexId}`, 3600e3, async () => {
    const rows = await kbGet<Record<string, string | number>[]>("/land-complex/complex/mpriByType", { 단지기본일련번호: complexId });
    return rows.map((r) => ({
      areaSeq: Number(r.면적일련번호), exclusive: Number(r.전용면적), low: Number(r.매매하한가) || 0, mid: Number(r.매매일반거래가) || 0,
      high: Number(r.매매상한가) || 0, jeonse: Number(r.전세일반거래가) || 0, listings: Number(r.매매건수) || 0, households: Number(r.세대수) || 0,
    })).sort((a, b) => a.exclusive - b.exclusive);
  });
}

/** 전용면적(㎡)에 가장 가까운 타입 (같은 면적이 여럿이면 세대수 많은 것) */
export function pickType(types: KbType[], areaM2: number | null | undefined) {
  if (!types.length) return null;
  if (!areaM2) return [...types].sort((a, b) => b.households - a.households)[0];
  return [...types].sort((a, b) => Math.abs(a.exclusive - areaM2) - Math.abs(b.exclusive - areaM2) || b.households - a.households)[0];
}

export interface KbPrice {
  complexId: number; areaSeq: number; exclusive: number;
  kbLow: number; kbMid: number; kbHigh: number; kbJeonse: number; kbDate: string; kbChange: number;
  askingAvg: number; askingCount: number; jeonseAskingAvg: number;
  lastTrade: number | null; lastTradeDate: string | null;
}

/** 특정 면적 타입의 KB시세 + KB 매물 평균 호가 (30분 캐시) */
export async function kbPrice(complexId: number, areaSeq: number): Promise<KbPrice> {
  return cached(`kb:price:${complexId}:${areaSeq}`, 30 * 60e3, async () => {
    const d = await kbGet<Record<string, unknown> & { 시세?: Record<string, unknown>[]; 최근실거래가?: Record<string, unknown> }>("/land-price/price/BasePrcInfoNew", { 단지기본일련번호: complexId, 면적일련번호: areaSeq });
    const s = (d.시세 ?? []).find((x) => Number(x.면적일련번호) === areaSeq) ?? d.시세?.[0] ?? {};
    const ymd = (v: unknown) => (typeof v === "string" && v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : null);
    return {
      complexId, areaSeq, exclusive: Number(s.전용면적) || 0,
      kbLow: Number(s.매매하한가) || 0, kbMid: Number(s.매매일반거래가) || 0, kbHigh: Number(s.매매상한가) || 0,
      kbJeonse: Number(s.전세일반거래가) || 0, kbDate: ymd(s.시세기준년월일) ?? "", kbChange: Number(s.매매변동금액) || 0,
      askingAvg: Math.round(Number(d.매물매매평균가) || 0), askingCount: Number(d.매매건수) || 0, jeonseAskingAvg: Math.round(Number(d.매물전세평균가) || 0),
      lastTrade: Number(d.최근실거래가?.거래금액) || null, lastTradeDate: ymd(d.최근실거래가?.계약년월일),
    };
  });
}

/** 매물에 대한 KB 단지·타입 결정 (저장된 kbComplexId 우선, 없으면 자동 매칭) */
export async function resolveKb(l: Pick<ListingRow, "kbComplexId" | "sgg" | "aptName" | "areaM2" | "meta">) {
  let complexId = l.kbComplexId ? Number(l.kbComplexId) : null;
  let matched: Awaited<ReturnType<typeof matchKbComplex>>[number] | null = null;
  if (!complexId && l.sgg && l.aptName) {
    const cands = await matchKbComplex(l.sgg, l.meta?.dong, l.aptName);
    if (cands[0] && cands[0].score >= 0.5) { matched = cands[0]; complexId = cands[0].id; }
  }
  if (!complexId) return null;
  const type = pickType(await kbTypes(complexId), l.areaM2);
  if (!type) return null;
  return { complexId, type, matched };
}

export const kbAdapter: SourceAdapter = {
  id: "kb",
  label: "KB시세·매물",
  available: kbEnabled,
  applicable: (l) => !!(l.kbComplexId || (l.sgg && l.aptName)),
  hint: "KB부동산 (비공식 API, 키 불필요)",
  async fetch(l) {
    const r = await resolveKb(l);
    if (!r) return { note: "KB 단지를 찾지 못함 (매물에서 KB 단지를 직접 선택하세요)" };
    const p = await kbPrice(r.complexId, r.type.areaSeq);
    return {
      kbLow: p.kbLow, kbMid: p.kbMid, kbHigh: p.kbHigh, kbJeonse: p.kbJeonse, kbDate: p.kbDate, kbChange: p.kbChange,
      askingAvg: p.askingAvg || undefined, askingCount: p.askingCount, kbComplexId: r.complexId, kbArea: p.exclusive,
    };
  },
};
