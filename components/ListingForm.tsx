"use client";
import { useEffect, useState } from "react";
import { SGG_LIST, REGION_LABEL, type Region } from "@/lib/regions";
import { regionOf, type DomainRules } from "@/lib/rules";
import type { ComplexSummary } from "@/lib/sources/molit";
import { api, F, Money, Text, Toggle, type Listing } from "./ui";
import { KbBox } from "./KbBox";

const SIDOS = [...new Set(SGG_LIST.map((s) => s.sido))];
const nameOf = (c: string) => SGG_LIST.find((s) => s.code === c)?.name ?? c;

export function ListingForm({ l, onPatch, molitOn, rules, favorites, onSnapshot }: {
  l: Listing; onPatch: (p: Partial<Listing>) => void; molitOn: boolean; rules: DomainRules; favorites: string[];
  onSnapshot: (source: string, data: Record<string, number>) => Promise<void>;
}) {
  const [sgg, setSgg] = useState(l.sgg ?? favorites[0] ?? "");
  const [q, setQ] = useState(l.aptName ?? "");
  const [res, setRes] = useState<ComplexSummary[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState("");

  async function search(code: string) {
    if (!code || !molitOn) return;
    setLoading(true); setErr("");
    try { setRes((await api<{ list: ComplexSummary[] }>(`/api/trades?lawd=${code}&months=6`)).list); }
    catch (e) { setErr("조회 실패: " + (e as Error).message); setRes(null); }
    setLoading(false);
  }
  // 처음 열 때 관심 지역 단지 목록을 미리 불러옴
  useEffect(() => {
    if (!sgg || !molitOn) return;
    let alive = true;
    api<{ list: ComplexSummary[] }>(`/api/trades?lawd=${sgg}&months=6`).then((r) => alive && setRes(r.list)).catch((e) => alive && setErr("조회 실패: " + e.message));
    return () => { alive = false; };
  }, [sgg, molitOn]);

  function pick(code: string) { setSgg(code); setRes(null); }
  function apply(x: ComplexSummary) {
    onPatch({
      name: `${x.apt} ${x.area}㎡`, price: x.lastPrice, kb: x.median3, sgg, region: regionOf(sgg, rules), aptName: x.apt, areaM2: x.area, kbComplexId: null,
      meta: { apt: x.apt, area: x.area, dong: x.dong, lastDate: x.lastDate, median3: x.median3, jeonse: x.jeonseMedian, jeonseCount: x.jeonseCount, sggName: SGG_LIST.find((s) => s.code === sgg)?.full },
    });
  }
  const shown = res?.filter((x) => !q.trim() || x.apt.includes(q.trim())).slice(0, 40);
  const m = l.meta;

  return (
    <div>
      <div className="gt">단지 찾기 <small>국토부 실거래 6개월</small></div>
      <div className="chips2">
        {favorites.map((c) => <button key={c} className={`chip2 ${sgg === c ? "on" : ""}`} onClick={() => pick(c)}>{nameOf(c)}</button>)}
        <select className="chip2" value={favorites.includes(sgg) ? "" : sgg} onChange={(e) => e.target.value && pick(e.target.value)}>
          <option value="">다른 지역…</option>
          {SIDOS.map((sd) => <optgroup key={sd} label={sd}>{SGG_LIST.filter((s) => s.sido === sd).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</optgroup>)}
        </select>
      </div>
      {!molitOn ? (
        <div className="hint">.env 에 DATA_GO_KR_KEY 를 넣으면 실거래 단지를 검색할 수 있습니다.</div>
      ) : (
        <>
          <label className="f"><input placeholder={`${nameOf(sgg)} 단지명 검색`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="res">
            {loading && <div className="hint"><span className="spin" /> 불러오는 중…</div>}
            {err && <div className="hint err">{err} <button className="btn sm" onClick={() => search(sgg)}>다시</button></div>}
            {shown?.length === 0 && <div className="hint">검색 결과가 없습니다.</div>}
            {shown?.map((x) => (
              <button key={`${x.apt}|${x.dong}|${x.area}`} className={`it ${l.aptName === x.apt && l.areaM2 === x.area ? "sel" : ""}`} onClick={() => apply(x)}>
                <b>{x.apt}</b> {x.area}㎡ <span className="hint">{x.dong} · {x.buildYear}</span>
                <small>최근 {F(x.lastPrice)} ({x.lastDate.slice(5)}) · 중위 {F(x.median3)} · {x.count}건{x.jeonseCount ? ` · 전세 ${F(x.jeonseMedian)}` : ""}</small>
              </button>
            ))}
          </div>
        </>
      )}

      <KbBox l={l} onPatch={onPatch} />

      <div className="gt" style={{ marginTop: 14 }}>매물 {m?.dong && <small>{m.sggName} {m.dong}</small>}</div>
      <div className="row2"><Money label="매매가" value={l.price} onChange={(v) => onPatch({ price: v })} /><Money label="KB시세" value={l.kb} onChange={(v) => onPatch({ kb: v })} /></div>
      <div className="row2"><Money label="세입자 보증금" value={l.deposit} onChange={(v) => onPatch({ deposit: v })} /><Money label="월세 수입" value={l.rent} onChange={(v) => onPatch({ rent: v })} /></div>
      {!!m?.jeonseCount && l.deposit !== m.jeonse && <div className="hint" style={{ marginTop: -4, marginBottom: 8 }}>전세 실거래 중위 {F(m.jeonse)} <button className="btn sm" onClick={() => onPatch({ deposit: m.jeonse!, rent: 0 })}>보증금에 적용</button></div>}
      <div className="row2"><Text label="잔금월" type="month" value={l.buyYm} onChange={(v) => onPatch({ buyYm: v })} /><Text label="입주월 (세입자 퇴거)" type="month" value={l.moveYm} onChange={(v) => onPatch({ moveYm: v })} /></div>
      <div className="seg">{(Object.keys(REGION_LABEL) as Region[]).map((k) => <button key={k} className={l.region === k ? "on" : ""} onClick={() => onPatch({ region: k })}>{REGION_LABEL[k]}</button>)}</div>

      <div className="gt" style={{ marginTop: 14 }}>감시</div>
      <Toggle label="시간 단위 시세 감시 + 자동 판정" checked={l.watch} onChange={(v) => onPatch({ watch: v })} />
      {l.watch && <Money label="목표가 (이하로 내려오면 판정에 반영)" value={l.targetPrice} onChange={(v) => onPatch({ targetPrice: v || null })} />}

      <details style={{ marginTop: 10 }}>
        <summary>네이버 호가 직접 기록 · 기타</summary>
        <p className="hint" style={{ marginTop: 0 }}>네이버 부동산은 자동 수집이 막혀 있어, 본 호가를 넣으면 시세 기록에 남고 판정에 쓰입니다.
          {" "}<a href={`https://new.land.naver.com/complexes?ms=37.65,127.06,15`} target="_blank" rel="noopener noreferrer">네이버 부동산</a></p>
        <div className="sr">
          <label className="f"><span>네이버 최저 호가 (만원)</span><input type="text" inputMode="numeric" value={asking} onChange={(e) => setAsking(e.target.value.replace(/\D/g, "").replace(/^0+/, ""))} /></label>
          <button className="btn sm" style={{ alignSelf: "flex-end" }} disabled={!asking} onClick={async () => { await onSnapshot("naver", { askingMin: +asking }); setAsking(""); }}>기록</button>
        </div>
        <div className="row2" style={{ marginTop: 10 }}><Money label="등기·이사 등" value={l.misc} onChange={(v) => onPatch({ misc: v })} /><Text label="이름" value={l.name} onChange={(v) => onPatch({ name: v })} /></div>
      </details>
    </div>
  );
}
