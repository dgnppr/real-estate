"use client";
import { useCallback, useEffect, useState } from "react";
import type { ProviderId } from "@/lib/agents";
import { api, F, Spark, timeAgo, VERDICT, type Decision, type Snapshot } from "./ui";

export interface ProviderState { id: ProviderId; label: string; installed: boolean; version: string | null }

function DecisionView({ d, compact }: { d: Decision; compact?: boolean }) {
  const v = VERDICT[d.verdict];
  const [open, setOpen] = useState(false);
  return (
    <div className="dec" style={{ ["--c" as string]: v.c }}>
      <div className="h"><span className="vb" style={{ ["--c" as string]: v.c }}>{v.label}</span>{d.headline}</div>
      {!compact && d.actions && d.actions.length > 0 && <ul className="acts">{d.actions.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      {!compact && d.reasons && d.reasons.length > 0 && (
        <>
          <button className="linkbtn" onClick={() => setOpen((x) => !x)}>{open ? "근거 접기" : `판단 근거 ${d.reasons.length}개 보기`}</button>
          {open && <ul>{d.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        </>
      )}
      <div className="meta">
        {timeAgo(d.runAt)} · {d.provider} · {d.trigger === "batch" ? "배치" : "수동"}
        {d.confidence != null && ` · 확신 ${Math.round(d.confidence * 100)}%`}
        {d.durationMs != null && ` · ${(d.durationMs / 1000).toFixed(0)}초`}
      </div>
    </div>
  );
}

export function AgentPanel({ listingId, providers, provider, onProvider, version, onChanged }: {
  listingId: number; providers: ProviderState[]; provider: ProviderId; onProvider: (p: ProviderId) => void; version: number; onChanged: () => void;
}) {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [decs, setDecs] = useState<Decision[]>([]);
  const [busy, setBusy] = useState<"" | "decide" | "watch">("");
  const [log, setLog] = useState<string[]>([]);

  const fetchDetail = useCallback(() => api<{ snapshots: Snapshot[]; decisions: Decision[] }>(`/api/listings/${listingId}`), [listingId]);
  const load = useCallback(async () => { const d = await fetchDetail(); setSnaps(d.snapshots); setDecs(d.decisions); }, [fetchDetail]);
  // 매물이 바뀌면 부모가 key 로 컴포넌트를 새로 만듦
  useEffect(() => {
    let alive = true;
    fetchDetail().then((d) => { if (alive) { setSnaps(d.snapshots); setDecs(d.decisions); } }).catch(() => {});
    return () => { alive = false; };
  }, [fetchDetail, version]);

  async function decideNow() {
    setBusy("decide"); setLog([]);
    try { await api(`/api/listings/${listingId}/decide`, { method: "POST", json: { provider } }); } catch (e) { setLog([(e as Error).message]); }
    await load(); setBusy("");
  }
  async function watchNow() {
    setBusy("watch");
    try { const r = await api<{ log: string[] }>(`/api/listings/${listingId}/watch`, { method: "POST" }); setLog(r.log); } catch (e) { setLog([(e as Error).message]); }
    await load(); onChanged(); setBusy("");
  }

  const latest = decs[0];
  const priceSeries = [...snaps].reverse().filter((s) => s.source === "kb").map((s) => s.data.askingAvg ?? s.data.kbMid).filter((v): v is number => typeof v === "number");

  return (
    <div className="card ai">
      <div className="ai-head">
        <h2>🤖 에이전트 판정</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="sel" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }} value={provider} onChange={(e) => onProvider(e.target.value as ProviderId)}>
            {providers.map((p) => <option key={p.id} value={p.id} disabled={!p.installed}>{p.label}{p.installed ? "" : " (없음)"}</option>)}
          </select>
          <button className="btn sm" disabled={!!busy} onClick={watchNow} title="시세 소스 조회 후 판정">{busy === "watch" ? <span className="spin" /> : "조회+판정"}</button>
          <button className="btn sm pri" disabled={!!busy} onClick={decideNow}>{busy === "decide" ? <><span className="spin" /> 판단 중…</> : "지금 판정"}</button>
        </div>
      </div>
      {latest ? <DecisionView d={latest} /> : <div className="hint">아직 판정이 없습니다. “지금 판정”을 누르거나 감시를 켜 두면 배치가 판정합니다.</div>}
      {log.length > 0 && <div className="hint" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{log.join("\n")}</div>}

      <div className="hist">
        <div>
          <div className="gt">시세 기록 <small>{snaps.length}건</small></div>
          <Spark values={priceSeries} />
          {snaps.length === 0 && <div className="hint">감시를 켜면 배치가 시세를 쌓습니다.</div>}
          {snaps.slice(0, 8).map((s) => (
            <div className="row" key={s.id}>
              <span>{timeAgo(s.takenAt)} · {s.source}</span>
              <span>{s.data.note ?? [s.data.lastPrice && `실거래 ${F(s.data.lastPrice)}`, s.data.kbMid && `KB ${F(s.data.kbMid)}`, s.data.askingAvg && `호가평균 ${F(s.data.askingAvg)}·${s.data.askingCount}건`, s.data.askingMin && `최저호가 ${F(s.data.askingMin)}`].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="gt">판정 이력 <small>{decs.length}건</small></div>
          {decs.slice(1, 7).map((d) => <DecisionView key={d.id} d={d} compact />)}
          {decs.length <= 1 && <div className="hint">이전 판정이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
