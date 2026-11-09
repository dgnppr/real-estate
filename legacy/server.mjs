// 내집마련 계산기 로컬 서버 (의존성 없음, Node 18+)
// 실행: node server.mjs  →  http://localhost:5178
// .env 에 DATA_GO_KR_KEY(국토부 실거래가), ECOS_KEY(한국은행) 를 넣으면 실시간 조회가 켜집니다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(DIR, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PORT = +process.env.PORT || 5178;
const MOLIT_KEY = process.env.DATA_GO_KR_KEY || "";
const ECOS_KEY = process.env.ECOS_KEY || "";
const ECOS_STAT = process.env.ECOS_STAT_CODE || "121Y006"; // 예금은행 대출금리(신규취급액)

/* ---------- 캐시 ---------- */
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

/* ---------- 국토부 실거래가 ---------- */
const keyParam = k => (k.includes("%") ? k : encodeURIComponent(k));
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : ""; };
const num = s => +String(s).replace(/[^\d.]/g, "") || 0;

async function molit(service, op, lawd, ym) {
  const items = [];
  for (let page = 1; page < 20; page++) {
    const url = `https://apis.data.go.kr/1613000/${service}/${op}?serviceKey=${keyParam(MOLIT_KEY)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${page}`;
    const res = await fetch(url);
    const xml = await res.text();
    const code = tag(xml, "resultCode") || tag(xml, "returnReasonCode");
    if (code && !/^0+$/.test(code)) throw new Error(`국토부 API 오류 ${code}: ${tag(xml, "resultMsg") || tag(xml, "returnAuthMsg")}`);
    if (!res.ok) throw new Error(`국토부 API HTTP ${res.status}`);
    const chunk = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    items.push(...chunk);
    const total = num(tag(xml, "totalCount"));
    if (items.length >= total || chunk.length === 0) break;
  }
  return items;
}

function monthsBack(n) {
  const out = [], d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
const curYm = monthsBack(1)[0];
const ttlFor = ym => (ym === curYm ? 3600e3 : 12 * 3600e3);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

async function getTrades(lawd, months) {
  const yms = monthsBack(months);
  const [tradeLists, rentLists] = await Promise.all([
    Promise.all(yms.map(ym => cached(`t:${lawd}:${ym}`, ttlFor(ym), () => molit("RTMSDataSvcAptTrade", "getRTMSDataSvcAptTrade", lawd, ym)))),
    Promise.all(yms.map(ym => cached(`r:${lawd}:${ym}`, ttlFor(ym), () => molit("RTMSDataSvcAptRent", "getRTMSDataSvcAptRent", lawd, ym)))),
  ]);
  const groups = new Map();
  const g = (it) => {
    const apt = tag(it, "aptNm"), dong = tag(it, "umdNm"), area = Math.round(num(tag(it, "excluUseAr")));
    const k = `${apt}|${dong}|${area}`;
    if (!groups.has(k)) groups.set(k, { apt, dong, area, buildYear: tag(it, "buildYear"), trades: [], jeonse: [], wolse: 0 });
    return groups.get(k);
  };
  const date = it => `${tag(it, "dealYear")}-${tag(it, "dealMonth").padStart(2, "0")}-${tag(it, "dealDay").padStart(2, "0")}`;
  for (const it of tradeLists.flat()) {
    if (tag(it, "cdealType") === "O") continue; // 해제된 거래 제외
    g(it).trades.push({ date: date(it), price: num(tag(it, "dealAmount")), floor: tag(it, "floor") });
  }
  for (const it of rentLists.flat()) {
    const grp = g(it);
    if (num(tag(it, "monthlyRent")) === 0) grp.jeonse.push(num(tag(it, "deposit"))); else grp.wolse++;
  }
  const recent = monthsBack(3).at(-1);
  return [...groups.values()].filter(x => x.trades.length).map(x => {
    x.trades.sort((a, b) => b.date.localeCompare(a.date));
    const r3 = x.trades.filter(t => t.date.replace(/-/g, "").slice(0, 6) >= recent).map(t => t.price);
    return {
      apt: x.apt, dong: x.dong, area: x.area, buildYear: x.buildYear,
      lastPrice: x.trades[0].price, lastDate: x.trades[0].date, count: x.trades.length,
      median3: median(r3.length ? r3 : x.trades.map(t => t.price)),
      jeonseMedian: median(x.jeonse), jeonseCount: x.jeonse.length, wolseCount: x.wolse,
      trades: x.trades.slice(0, 10),
    };
  }).sort((a, b) => b.count - a.count);
}

/* ---------- 한국은행 ECOS 금리 ---------- */
async function ecos(pathPart) {
  const res = await fetch(`https://ecos.bok.or.kr/api/${pathPart}`);
  const j = await res.json();
  if (j.RESULT) throw new Error(`ECOS 오류 ${j.RESULT.CODE}: ${j.RESULT.MESSAGE}`);
  return j;
}
async function getRates() {
  const list = await ecos(`StatisticItemList/${ECOS_KEY}/json/kr/1/200/${ECOS_STAT}`);
  const items = list.StatisticItemList?.row || [];
  const find = re => items.find(r => r.CYCLE === "M" && re.test(r.ITEM_NAME)) || items.find(r => re.test(r.ITEM_NAME));
  const yms = monthsBack(8);
  const pick = async (re) => {
    const it = find(re);
    if (!it) return null;
    const j = await ecos(`StatisticSearch/${ECOS_KEY}/json/kr/1/20/${ECOS_STAT}/M/${yms.at(-1)}/${yms[0]}/${it.ITEM_CODE}`);
    const rows = j.StatisticSearch?.row || [];
    const last = rows.at(-1);
    return last ? { rate: +last.DATA_VALUE, time: last.TIME, item: it.ITEM_NAME, history: rows.map(r => ({ time: r.TIME, rate: +r.DATA_VALUE })) } : null;
  };
  const [mortgage, credit] = await Promise.all([pick(/주택담보/), pick(/일반신용/)]);
  return { mortgage, credit };
}

/* ---------- HTTP ---------- */
const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (u.pathname === "/" || u.pathname === "/index.html")
      return send(res, 200, await readFile(path.join(DIR, "home-simulator.html"), "utf8"), "text/html; charset=utf-8");
    if (u.pathname === "/api/status") return send(res, 200, { molit: !!MOLIT_KEY, ecos: !!ECOS_KEY });
    if (u.pathname === "/api/trades") {
      if (!MOLIT_KEY) return send(res, 400, { error: ".env 에 DATA_GO_KR_KEY 가 없습니다." });
      const lawd = u.searchParams.get("lawd") || "";
      const months = Math.min(24, Math.max(1, +u.searchParams.get("months") || 6));
      if (!/^\d{5}$/.test(lawd)) return send(res, 400, { error: "lawd(법정동 시군구 5자리)가 필요합니다." });
      return send(res, 200, { lawd, months, list: await getTrades(lawd, months) });
    }
    if (u.pathname === "/api/rates") {
      if (!ECOS_KEY) return send(res, 400, { error: ".env 에 ECOS_KEY 가 없습니다." });
      return send(res, 200, await cached("rates", 6 * 3600e3, getRates));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: String(e.message || e) });
  }
}).listen(PORT, () => {
  console.log(`내집마련 계산기: http://localhost:${PORT}`);
  console.log(`  실거래가 API: ${MOLIT_KEY ? "ON" : "OFF (.env DATA_GO_KR_KEY)"}  /  금리 API: ${ECOS_KEY ? "ON" : "OFF (.env ECOS_KEY)"}`);
});
