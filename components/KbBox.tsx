"use client";
import { useEffect, useState } from "react";
import type { KbComplex, KbPrice, KbType } from "@/lib/sources/kb";
import { api, F, type Listing } from "./ui";

type Cand = KbComplex & { score: number };

/** 매물에 연결된 KB 단지·시세 표시 + 후보 변경 */
export function KbBox({ l, onPatch }: { l: Listing; onPatch: (p: Partial<Listing>) => void }) {
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [types, setTypes] = useState<KbType[]>([]);
  const [price, setPrice] = useState<KbPrice | null>(null);
  const [err, setErr] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const id = l.kbComplexId ? Number(l.kbComplexId) : null;

  // 단지명이 있고 KB 단지가 아직 없으면 자동 매칭
  useEffect(() => {
    if (!l.sgg || !l.aptName) return;
    let alive = true;
    const p = new URLSearchParams({ sgg: l.sgg, apt: l.aptName, ...(l.meta?.dong ? { dong: l.meta.dong } : {}) });
    api<Cand[]>(`/api/kb/match?${p}`).then((c) => {
      if (!alive) return;
      setCands(c);
      if (!l.kbComplexId && c[0] && c[0].score >= 0.5) onPatch({ kbComplexId: String(c[0].id) });
    }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 단지가 바뀔 때만 다시 매칭
  }, [l.sgg, l.aptName, l.meta?.dong]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const key = `${id}:${l.areaM2 ?? ""}`;
    api<{ types: KbType[]; price: KbPrice | null }>(`/api/kb/price?complexId=${id}&area=${l.areaM2 ?? ""}`)
      .then((r) => { if (alive) { setTypes(r.types); setPrice(r.price); setErr(""); } })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoadedKey(key));
    return () => { alive = false; };
  }, [id, l.areaM2]);

  if (!l.aptName && !id) return null;
  const loading = !!id && loadedKey !== `${id}:${l.areaM2 ?? ""}`;
  const name = cands?.find((c) => c.id === id)?.name;

  return (
    <div className="kb">
      <div className="gt">KB부동산 <small>{loading ? <span className="spin" /> : price?.kbDate ? `시세 기준 ${price.kbDate}` : ""}</small></div>
      {cands && cands.length > 0 && (
        <select className="sel" value={id ?? ""} onChange={(e) => onPatch({ kbComplexId: e.target.value || null })}>
          <option value="">KB 단지 선택…</option>
          {cands.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.dong} ({Math.round(c.score * 100)}%)</option>)}
        </select>
      )}
      {cands?.length === 0 && !id && <div className="hint">KB에서 같은 단지를 찾지 못했습니다.</div>}
      {err && <div className="hint err">{err}</div>}
      {price && (
        <>
          <div className="kbgrid">
            <div><small>KB 하한</small><b>{F(price.kbLow)}</b></div>
            <div className="mid"><small>KB 일반</small><b>{F(price.kbMid)}</b></div>
            <div><small>KB 상한</small><b>{F(price.kbHigh)}</b></div>
            <div><small>매물 {price.askingCount}건 평균</small><b>{price.askingAvg ? F(price.askingAvg) : "-"}</b></div>
            <div><small>KB 전세</small><b>{F(price.kbJeonse)}</b></div>
            <div><small>최근 실거래</small><b>{price.lastTrade ? F(price.lastTrade) : "-"}</b></div>
          </div>
          <div className="hint">
            {name ?? `KB ${id}`} · 전용 {price.exclusive}㎡{types.length > 1 ? ` (타입 ${types.length}개 중 가장 가까운 면적)` : ""}
            {price.kbChange ? ` · 지난주 대비 ${price.kbChange > 0 ? "+" : ""}${F(price.kbChange)}` : ""}
            {l.kb !== price.kbMid && <> · <button className="btn sm" onClick={() => onPatch({ kb: price.kbMid })}>KB시세 적용</button></>}
            {price.askingAvg > 0 && l.price !== price.askingAvg && <> <button className="btn sm" onClick={() => onPatch({ price: price.askingAvg })}>매매가=평균 호가</button></>}
          </div>
        </>
      )}
    </div>
  );
}
