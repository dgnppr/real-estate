// 앱·REST API·배치·에이전트가 공용으로 쓰는 서비스 계층
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { ensureDb } from "./db/migrate";
import type { ListingRow } from "./db/schema";
import { calc, effectiveProfile, nowYm, summarize, ymAdd, type ListingInput, type Profile } from "./calc";
import { getRates } from "./sources/ecos";
import { runAgent, type ProviderId } from "./agents";
import { REGION_FULL } from "./regions";
import { mergeRules, rulesText, type DomainRules } from "./rules";

/* ---------------- 설정 ---------------- */
export interface Settings {
  provider: ProviderId;
  model: string;
  batchEnabled: boolean;
  intervalMin: number;
  decideOn: "always" | "change"; // 매 배치마다 판정 / 시세가 바뀔 때만
  notify: boolean;
  favoriteSgg: string[]; // 관심 시군구 (검색 기본값)
}
const DEFAULT_SETTINGS: Settings = { provider: "claude", model: "", batchEnabled: true, intervalMin: 60, decideOn: "change", notify: true, favoriteSgg: ["11350", "11320"] };

export async function getSettings(): Promise<Settings> {
  await ensureDb();
  const rows = await db.select().from(schema.settings);
  const s = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s as unknown as Settings;
}

/* ---------------- 도메인 규칙 ---------------- */
export async function getRules(): Promise<DomainRules> {
  await ensureDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "rules"));
  return mergeRules(row?.value as Partial<DomainRules> | undefined);
}
export async function updateRules(patch: Partial<DomainRules> | null) {
  await ensureDb();
  if (patch === null) { await db.delete(schema.settings).where(eq(schema.settings.key, "rules")); return getRules(); }
  const value = mergeRules({ ...(await getRules()), ...patch });
  await db.insert(schema.settings).values({ key: "rules", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  return value;
}
export async function updateSettings(patch: Partial<Settings>) {
  await ensureDb();
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
  return getSettings();
}

/* ---------------- 프로필 (내 현재 상태) ---------------- */
const DEFAULT_PROFILE: Profile = {
  asOf: nowYm(), saved: 20000, monthlySave: 200, income: 8000, otherDebt: 0, firstBuyer: true, mRate: 4.2, mYears: 30, cRate: 5.5, cYears: 1, cRepay: "bullet", autoRate: true,
  borrowers: [{ name: "나", income: 5000, otherDebt: 0 }, { name: "아내", income: 3000, otherDebt: 0 }], mortgageBorrower: "auto",
  childBirth: null, assets: null, loanProduct: "auto",
};

export async function getProfile(): Promise<Profile> {
  await ensureDb();
  const [row] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
  if (!row) { await db.insert(schema.profile).values({ id: 1, ...DEFAULT_PROFILE }); return DEFAULT_PROFILE; }
  return {
    asOf: row.asOf, saved: row.saved, monthlySave: row.monthlySave, income: row.income, otherDebt: row.otherDebt,
    firstBuyer: row.firstBuyer, mRate: row.mRate, mYears: row.mYears, cRate: row.cRate, cYears: row.cYears, autoRate: row.autoRate,
    // 차주를 아직 안 나눴으면 기존 합산 소득을 '나' 한 명으로 둠
    borrowers: row.borrowers?.length ? row.borrowers : [{ name: "나", income: row.income, otherDebt: row.otherDebt }],
    mortgageBorrower: row.mortgageBorrower,
    cRepay: row.cRepay,
    childBirth: row.childBirth, assets: row.assets, loanProduct: row.loanProduct,
  };
}
export async function updateProfile(patch: Partial<Profile>) {
  await getProfile();
  const allowed: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([k]) => k in DEFAULT_PROFILE));
  // 차주별 소득을 바꾸면 합계 컬럼도 맞춰 둠 (요약·호환용)
  if (Array.isArray(patch.borrowers)) {
    allowed.income = patch.borrowers.reduce((a, b) => a + (Number(b.income) || 0), 0);
    allowed.otherDebt = patch.borrowers.reduce((a, b) => a + (Number(b.otherDebt) || 0), 0);
  }
  await db.update(schema.profile).set({ ...allowed, updatedAt: new Date() }).where(eq(schema.profile.id, 1));
  return getProfile();
}

/* ---------------- 매물 ---------------- */
export type ListingPatch = Partial<Omit<ListingRow, "id" | "createdAt" | "updatedAt">>;
const LISTING_KEYS = new Set(["name", "price", "kb", "deposit", "rent", "region", "sgg", "buyYm", "moveYm", "misc", "ignoreRules", "meta", "watch", "aptName", "areaM2", "naverComplexNo", "kbComplexId", "autoSync", "targetPrice", "sort"]);
const pick = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => LISTING_KEYS.has(k)));

export async function listListings() {
  await ensureDb();
  return db.select().from(schema.listings).orderBy(asc(schema.listings.sort), asc(schema.listings.id));
}
export async function getListing(id: number) {
  await ensureDb();
  const [row] = await db.select().from(schema.listings).where(eq(schema.listings.id, id));
  return row ?? null;
}
export async function createListing(input: ListingPatch) {
  await ensureDb();
  const base = nowYm();
  const values = {
    name: "새 매물", price: 70000, kb: 64000, deposit: 0, rent: 0, region: "metro" as const,
    buyYm: ymAdd(base, 6), moveYm: ymAdd(base, 6), misc: 200, ...pick(input as Record<string, unknown>),
  } as typeof schema.listings.$inferInsert;
  const [row] = await db.insert(schema.listings).values(values).returning();
  return row;
}
export async function updateListing(id: number, patch: ListingPatch) {
  await ensureDb();
  const [row] = await db.update(schema.listings).set({ ...pick(patch as Record<string, unknown>), updatedAt: new Date() }).where(eq(schema.listings.id, id)).returning();
  return row ?? null;
}
export async function deleteListing(id: number) {
  await ensureDb();
  await db.delete(schema.snapshots).where(eq(schema.snapshots.listingId, id));
  await db.delete(schema.decisions).where(eq(schema.decisions.listingId, id));
  const r = await db.delete(schema.listings).where(eq(schema.listings.id, id)).returning({ id: schema.listings.id });
  return r.length > 0;
}

export function toInput(l: ListingRow): ListingInput {
  return { name: l.name, price: l.price, kb: l.kb, deposit: l.deposit, rent: l.rent, region: l.region, sgg: l.sgg, buyYm: l.buyYm, moveYm: l.moveYm, misc: l.misc, ignoreRules: l.ignoreRules, areaM2: l.areaM2 };
}

/* ---------------- 시뮬레이션 ---------------- */
export async function safeRates() { try { return await getRates(); } catch { return null; } }

export async function simulate(id: number, override?: Partial<ListingInput>) {
  const l = await getListing(id);
  if (!l) return null;
  const [prof, rates, rules] = await Promise.all([getProfile(), safeRates(), getRules()]);
  const p = effectiveProfile(prof, rates);
  const input = { ...toInput(l), ...override };
  const result = calc(p, input, rules);
  return { listing: l, input, profile: p, rules, result, summary: summarize(input, result) };
}

/* ---------------- 스냅샷 · 판정 이력 ---------------- */
export async function listSnapshots(listingId: number, limit = 48) {
  await ensureDb();
  return db.select().from(schema.snapshots).where(eq(schema.snapshots.listingId, listingId)).orderBy(desc(schema.snapshots.takenAt)).limit(limit);
}
export async function listDecisions(listingId?: number, limit = 30) {
  await ensureDb();
  const q = db.select().from(schema.decisions);
  return (listingId ? q.where(eq(schema.decisions.listingId, listingId)) : q).orderBy(desc(schema.decisions.runAt)).limit(limit);
}

/* ---------------- 에이전트 판정 ---------------- */
export const DECISION_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["BUY", "WAIT", "PASS"], description: "BUY=지금 매수 진행, WAIT=조건 충족 대기·관망, PASS=이 매물 포기" },
    confidence: { type: "number", description: "0~1" },
    headline: { type: "string", description: "한 줄 결론 (한국어, 60자 이내)" },
    reasons: { type: "array", items: { type: "string" }, description: "판단 근거 2~5개 (숫자 포함)" },
    actions: { type: "array", items: { type: "string" }, description: "다음에 할 일 1~4개" },
  },
  required: ["verdict", "confidence", "headline", "reasons", "actions"],
  additionalProperties: false,
} as const;

interface Decision { verdict: "BUY" | "WAIT" | "PASS"; confidence: number; headline: string; reasons: string[]; actions: string[] }

export async function buildContext(id: number) {
  const sim = await simulate(id);
  if (!sim) return null;
  const [snaps, decs, rates] = await Promise.all([listSnapshots(id, 24), listDecisions(id, 3), safeRates()]);
  const l = sim.listing;
  return {
    rulesText: rulesText(sim.rules),
    today: new Date().toISOString().slice(0, 10),
    profile: sim.profile,
    listing: {
      name: l.name, region: REGION_FULL[l.region], sgg: l.sgg, aptName: l.aptName, areaM2: l.areaM2,
      price: l.price, kbEstimate: l.kb, deposit: l.deposit, monthlyRentIncome: l.rent,
      buyYm: l.buyYm, moveInYm: l.moveYm, targetPrice: l.targetPrice, assumeRuleException: l.ignoreRules,
    },
    simulation: sim.summary,
    priceHistory: snaps.map((s) => ({ at: s.takenAt.toISOString().slice(0, 16), source: s.source, ...s.data })),
    previousDecisions: decs.map((d) => ({ at: d.runAt.toISOString().slice(0, 16), verdict: d.verdict, headline: d.headline })),
    rates: rates ? { mortgage: rates.mortgage?.rate, credit: rates.credit?.rate, asOf: rates.mortgage?.time } : null,
  };
}

export async function decide(id: number, trigger: "batch" | "manual", provider?: ProviderId) {
  const settings = await getSettings();
  const prov = provider ?? settings.provider;
  const ctx = await buildContext(id);
  if (!ctx) throw new Error("매물을 찾을 수 없습니다.");
  const prompt = `당신은 한국 아파트 실거주 매수 자금을 검토하는 신중한 분석가입니다. 아래 데이터만 근거로 이 매물을 지금 사도 되는지 판정하세요.
금액 단위는 만원입니다(10000 = 1억). 계산은 이미 되어 있으니 다시 계산하지 말고 해석하세요.

판정 기준:
- 자금 부족(totalShortfall>0)이나 규제 차단(blockedReason)이 있으면 원칙적으로 BUY 불가. 해결 경로가 현실적이면 WAIT, 아니면 PASS.
- 스트레스 DSR 한도 초과면 대출이 안 나오는 것으로 봄.
- priceHistory 추세(최근 실거래·호가·KB)와 targetPrice 를 비교해 가격 매력도를 판단.
- simulation.options 에 대출 선택지(시중 주담대, 신생아 특례 등 정책대출 + 신용대출 조합)별 결과가 있음. 자격이 되는 선택지 중 가장 유리한 것을 기준으로 판정하고, 어떤 대출 조합으로 사는지 reasons·actions 에 명시.
- 정책대출은 자격 요건(소득·자산·집값·면적·출생 후 기한)을 충족해야 하며, 기한이 임박하면 actions 에 신청 기한을 적기.
- 이전 판정과 달라졌다면 무엇이 바뀌었는지 근거에 적기.
- 투자 권유가 아닌 자금·규제 관점의 판단이며, 불확실하면 WAIT.

${ctx.rulesText}

데이터(JSON):
${JSON.stringify(ctx, null, 1)}`;

  const t0 = Date.now();
  try {
    const r = await runAgent({ provider: prov, prompt, schema: DECISION_SCHEMA, model: settings.model || undefined });
    const d = r.json as Decision;
    const [row] = await db.insert(schema.decisions).values({
      listingId: id, trigger, provider: prov, verdict: d.verdict, confidence: d.confidence, headline: d.headline,
      reasons: d.reasons, actions: d.actions, context: ctx.simulation, raw: r.text, durationMs: r.durationMs,
    }).returning();
    return row;
  } catch (e) {
    const [row] = await db.insert(schema.decisions).values({
      listingId: id, trigger, provider: prov, verdict: "ERROR", headline: String((e as Error).message).slice(0, 300), durationMs: Date.now() - t0,
    }).returning();
    return row;
  }
}

/* ---------------- 상담 채팅 ---------------- */
export async function chatHistory(limit = 40) {
  await ensureDb();
  const rows = await db.select().from(schema.agentMessages).orderBy(desc(schema.agentMessages.id)).limit(limit);
  return rows.reverse().map((r) => ({ id: r.id, role: r.role, ...(r.content as { text: string; provider?: string }), at: r.createdAt }));
}
export async function clearChat() { await ensureDb(); await db.delete(schema.agentMessages); }

export async function chat(message: string, provider?: ProviderId, focusId?: number) {
  const settings = await getSettings();
  const prov = provider ?? settings.provider;
  const [profile, listings, rates, history, rules] = await Promise.all([getProfile(), listListings(), safeRates(), chatHistory(12), getRules()]);
  const p = effectiveProfile(profile, rates);
  const overview = listings.map((l) => ({ id: l.id, name: l.name, focus: l.id === focusId || undefined, ...summarize(toInput(l), calc(p, toInput(l), rules)) }));
  await db.insert(schema.agentMessages).values({ role: "user", content: { text: message } });
  const prompt = `당신은 사용자의 내집마련 자금 상담가입니다. 한국어로 짧고 명확하게 답하세요(숫자는 '3억 1,000만'처럼). 금액 단위는 만원입니다.
답변은 채팅 창에 일반 텍스트로 표시되니 마크다운 표·헤더(#)·굵게(**)는 쓰지 말고, 짧은 문단과 '- ' 목록만 쓰세요. 도구나 파일은 사용하지 마세요.
아래는 사용자의 현재 상태와 관심 매물별 계산 결과입니다. 이 데이터를 근거로 답하고, 없는 정보는 추측하지 말고 무엇이 필요한지 말하세요.
수치를 바꿔 보는 질문(what-if)은 주어진 규칙으로 대략 추정하되 추정임을 밝히세요. 투자 권유가 아니라 자금·규제 관점으로 답하세요.

${rulesText(rules)}

[내 상태] ${JSON.stringify(p)}
[매물] ${JSON.stringify(overview)}
[금리] ${JSON.stringify(rates ? { mortgage: rates.mortgage?.rate, credit: rates.credit?.rate } : null)}

[이전 대화]
${history.map((h) => `${h.role === "user" ? "사용자" : "상담가"}: ${h.text}`).join("\n") || "(없음)"}

사용자: ${message}
상담가:`;
  try {
    const r = await runAgent({ provider: prov, prompt, model: settings.model || undefined, timeoutMs: 3 * 60_000 });
    await db.insert(schema.agentMessages).values({ role: "assistant", content: { text: r.text, provider: prov } });
    return { text: r.text, provider: prov, durationMs: r.durationMs };
  } catch (e) {
    const text = `⚠ ${prov} 실행 실패: ${(e as Error).message}`;
    await db.insert(schema.agentMessages).values({ role: "assistant", content: { text, provider: prov } });
    return { text, provider: prov, durationMs: 0, error: true };
  }
}

/* ---------------- 시세 직접 기록 ---------------- */
const SNAP_KEYS = ["lastPrice", "lastDate", "median3", "tradeCount", "jeonseMedian", "askingMin", "askingMedian", "askingCount", "kbMid", "kbLow", "kbHigh", "kbJeonse", "kbDate", "askingAvg", "note"] as const;
export async function addSnapshot(listingId: number, source: string, data: Record<string, unknown>) {
  const l = await getListing(listingId);
  if (!l) throw new Error("매물을 찾을 수 없습니다.");
  const clean = Object.fromEntries(Object.entries(data).filter(([k, v]) => (SNAP_KEYS as readonly string[]).includes(k) && v !== "" && v != null));
  const [row] = await db.insert(schema.snapshots).values({ listingId, source, data: clean }).returning();
  if (l.autoSync && typeof clean.kbMid === "number" && clean.kbMid > 0) await updateListing(listingId, { kb: clean.kbMid });
  return row;
}
