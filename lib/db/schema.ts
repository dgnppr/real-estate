import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  asOf: text("as_of").notNull(),
  saved: real("saved").notNull(),
  monthlySave: real("monthly_save").notNull(),
  income: real("income").notNull(),
  otherDebt: real("other_debt").notNull().default(0),
  firstBuyer: integer("first_buyer", { mode: "boolean" }).notNull().default(true),
  mRate: real("m_rate").notNull(),
  mYears: integer("m_years").notNull(),
  cRate: real("c_rate").notNull(),
  cYears: integer("c_years").notNull(),
  autoRate: integer("auto_rate", { mode: "boolean" }).notNull().default(true),
  borrowers: text("borrowers", { mode: "json" }).$type<{ name: string; income: number; otherDebt: number }[]>(),
  mRateType: text("m_rate_type", { enum: ["variable", "mixed", "periodic", "fixed"] }).notNull().default("variable"),
  childBirth: text("child_birth"),
  assets: real("assets"),
  loanProduct: text("loan_product").notNull().default("auto"),
  cRepay: text("c_repay", { enum: ["bullet", "amortize"] }).notNull().default("bullet"),
  mortgageBorrower: text("mortgage_borrower", { enum: ["auto", "joint", "0", "1"] }).notNull().default("auto"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const listings = sqliteTable("listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  price: real("price").notNull(),
  kb: real("kb").notNull(),
  deposit: real("deposit").notNull().default(0),
  rent: real("rent").notNull().default(0),
  region: text("region", { enum: ["reg", "metro", "local"] }).notNull(),
  sgg: text("sgg"),
  buyYm: text("buy_ym").notNull(),
  moveYm: text("move_ym").notNull(),
  misc: real("misc").notNull().default(200),
  ignoreRules: integer("ignore_rules", { mode: "boolean" }).notNull().default(false),
  meta: text("meta", { mode: "json" }).$type<ListingMeta | null>(),
  // 감시(배치) 설정
  watch: integer("watch", { mode: "boolean" }).notNull().default(false),
  aptName: text("apt_name"), // 실거래 매칭용 단지명
  areaM2: real("area_m2"), // 전용면적(㎡, 반올림 매칭)
  naverComplexNo: text("naver_complex_no"),
  kbComplexId: text("kb_complex_id"),
  autoSync: integer("auto_sync", { mode: "boolean" }).notNull().default(true), // 스냅샷으로 KB시세 자동 갱신
  targetPrice: real("target_price"), // 이 가격 이하면 알림
  sort: integer("sort").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export interface ListingMeta {
  apt?: string; area?: number; dong?: string; sggName?: string;
  lastDate?: string; median3?: number; jeonse?: number; jeonseCount?: number;
}

// 외부 API 응답 캐시 (실거래가·금리)
export const apiCache = sqliteTable("api_cache", {
  key: text("key").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// 에이전트 대화 (Claude 메시지 원본을 그대로 저장 — append-only)
export const agentMessages = sqliteTable("agent_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// 소스별 시세 스냅샷 (배치가 쌓음)
export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // molit | naver | kb | manual
  takenAt: integer("taken_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  data: text("data", { mode: "json" }).$type<SnapshotData>().notNull(),
});

export interface SnapshotData {
  lastPrice?: number; lastDate?: string; median3?: number; tradeCount?: number;
  jeonseMedian?: number; askingMin?: number; askingMedian?: number; askingCount?: number;
  kbMid?: number; kbLow?: number; kbHigh?: number; kbJeonse?: number; kbDate?: string; kbChange?: number;
  askingAvg?: number; kbComplexId?: number; kbArea?: number;
  note?: string;
}

// 에이전트 판정 기록
export const decisions = sqliteTable("decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listingId: integer("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  runAt: integer("run_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  trigger: text("trigger").notNull(), // batch | manual
  provider: text("provider").notNull(),
  verdict: text("verdict", { enum: ["BUY", "WAIT", "PASS", "ERROR"] }).notNull(),
  confidence: real("confidence"),
  headline: text("headline"),
  reasons: text("reasons", { mode: "json" }).$type<string[]>(),
  actions: text("actions", { mode: "json" }).$type<string[]>(),
  context: text("context", { mode: "json" }), // 판정에 쓴 입력 요약
  raw: text("raw"),
  durationMs: integer("duration_ms"),
});

// 배치 실행 로그
export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(), // running | ok | error
  log: text("log", { mode: "json" }).$type<string[]>(),
});

// 키-값 설정 (에이전트 엔진, 배치 주기 등)
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export type ProfileRow = typeof profile.$inferSelect;
export type SnapshotRow = typeof snapshots.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type ListingRow = typeof listings.$inferSelect;
