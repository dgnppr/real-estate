"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { borrowersOf, calc, effectiveProfile, nowYm, ymAdd, type ListingInput, type Profile } from "@/lib/calc";
import type { ProviderId } from "@/lib/agents";
import type { Settings } from "@/lib/service";
import { DEFAULT_RULES, type DomainRules } from "@/lib/rules";
import { api, F, VERDICT, type Decision, type Listing } from "./ui";
import { ResultPanel } from "./ResultPanel";
import { ListingForm } from "./ListingForm";
import { AgentPanel, type ProviderState } from "./AgentPanel";
import { SettingsPanel } from "./SettingsPanel";
import { Chat } from "./Chat";

interface SettingsResp {
  settings: Settings;
  providers: ProviderState[];
  sources: { id: string; label: string; available: boolean; hint: string }[];
  keys: { molit: boolean; ecos: boolean };
}
type RatesResp = { mortgage: { rate: number; time: string } | null; credit: { rate: number; time: string } | null } | null;

const toInput = (l: Listing): ListingInput => ({ name: l.name, price: l.price, kb: l.kb, deposit: l.deposit, rent: l.rent, region: l.region, sgg: l.sgg, buyYm: l.buyYm, moveYm: l.moveYm, misc: l.misc, ignoreRules: l.ignoreRules, areaM2: l.areaM2 });

function useDebounced<T>(save: (key: string, patch: T) => Promise<void>, ms = 400) {
  const pending = useRef(new Map<string, { patch: T; timer: ReturnType<typeof setTimeout> }>());
  return useCallback((key: string, patch: T) => {
    const cur = pending.current.get(key);
    if (cur) clearTimeout(cur.timer);
    const merged = { ...(cur?.patch ?? {}), ...patch } as T;
    pending.current.set(key, { patch: merged, timer: setTimeout(() => { pending.current.delete(key); void save(key, merged); }, ms) });
  }, [save, ms]);
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rules, setRules] = useState<DomainRules>(DEFAULT_RULES);
  const [listings, setListings] = useState<Listing[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rates, setRates] = useState<RatesResp>(null);
  const [info, setInfo] = useState<SettingsResp | null>(null);
  const [latest, setLatest] = useState<Record<number, Decision | undefined>>({});
  const [version, setVersion] = useState(0);
  const [panel, setPanel] = useState<null | "me" | "rules" | "agent">(null);
  const [batch, setBatch] = useState<{ running: boolean; log: string[] }>({ running: false, log: [] });
  const [error, setError] = useState("");

  const reloadListings = useCallback(async () => {
    const ls = await api<Listing[]>("/api/listings");
    setListings(ls);
    setActiveId((a) => (a && ls.some((l) => l.id === a) ? a : ls[0]?.id ?? null));
    const decs = await Promise.all(ls.map((l) => api<{ decisions: Decision[] }>(`/api/listings/${l.id}`).then((d) => [l.id, d.decisions[0]] as const).catch(() => [l.id, undefined] as const)));
    setLatest(Object.fromEntries(decs));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [p, r] = await Promise.all([api<Profile>("/api/profile"), api<{ rules: DomainRules }>("/api/rules"), reloadListings()]);
        setProfile(p); setRules(r.rules);
      } catch (e) { setError((e as Error).message); }
      api<SettingsResp>("/api/settings").then(setInfo).catch(() => {});
      api<RatesResp>("/api/rates").then(setRates).catch(() => {});
    })();
  }, [reloadListings]);

  const err = (e: unknown) => setError((e as Error).message);
  const saveListing = useDebounced<Partial<Listing>>(useCallback(async (id, patch) => { await api(`/api/listings/${id}`, { method: "PATCH", json: patch }).catch(err); }, []));
  const saveProfile = useDebounced<Partial<Profile>>(useCallback(async (_k, patch) => { await api("/api/profile", { method: "PUT", json: patch }).catch(err); }, []));
  const saveRules = useDebounced<Partial<DomainRules>>(useCallback(async (_k, patch) => { await api("/api/rules", { method: "PUT", json: patch }).catch(err); }, []));

  const patchListing = (id: number, p: Partial<Listing>) => { setListings((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))); saveListing(String(id), p); };
  const patchProfile = (p: Partial<Profile>) => { setProfile((x) => (x ? { ...x, ...p } : x)); saveProfile("me", p); };
  const patchRules = (p: Partial<DomainRules>) => { setRules((r) => ({ ...r, ...p })); saveRules("rules", p); };
  const resetRules = async () => setRules(await api<DomainRules>("/api/rules", { method: "DELETE" }));
  const patchSettings = async (p: Partial<Settings>) => {
    setInfo((x) => (x ? { ...x, settings: { ...x.settings, ...p } } : x));
    await api("/api/settings", { method: "PUT", json: p }).catch(err);
  };

  async function addListing() {
    const cur = listings.find((l) => l.id === activeId);
    const base = cur ? { ...toInput(cur), name: `매물 ${listings.length + 1}` } : { name: "새 매물", buyYm: ymAdd(nowYm(), 6), moveYm: ymAdd(nowYm(), 6), region: "reg" };
    const row = await api<Listing>("/api/listings", { method: "POST", json: base });
    setListings((ls) => [...ls, row]); setActiveId(row.id);
  }
  async function removeListing(l: Listing) {
    if (!confirm(`'${l.name}' 매물을 삭제할까요?\n시세 기록과 판정 이력도 함께 삭제됩니다.`)) return;
    await api(`/api/listings/${l.id}`, { method: "DELETE" });
    setListings((ls) => ls.filter((x) => x.id !== l.id));
    if (activeId === l.id) setActiveId(listings.find((x) => x.id !== l.id)?.id ?? null);
  }
  async function runAll() {
    setBatch({ running: true, log: [] });
    try { const r = await api<{ log: string[] }>("/api/batch", { method: "POST", json: { force: true } }); setBatch({ running: false, log: r.log }); }
    catch (e) { setBatch({ running: false, log: [(e as Error).message] }); }
    await reloadListings(); setVersion((v) => v + 1);
  }

  const eff = useMemo(() => (profile ? effectiveProfile(profile, rates) : null), [profile, rates]);
  const active = listings.find((l) => l.id === activeId) ?? null;
  const provider = info?.settings.provider ?? "claude";
  const providers = info?.providers ?? [];

  if (error && !profile) return <div className="wrap"><div className="card empty">불러오기 실패: {error}</div></div>;
  if (!profile || !eff) return <div className="wrap"><div className="card empty"><span className="spin" /> 불러오는 중…</div></div>;

  return (
    <div className="wrap">
      <header className="top">
        <h1>🏠 내집마련</h1>
        <div className="live">
          <button className="btn sm" disabled={batch.running} onClick={runAll}>{batch.running ? <><span className="spin" /> 감시 중</> : "▶ 지금 감시"}</button>
          <button className="btn sm" onClick={() => setPanel("rules")}>⚖ 규칙</button>
          <button className="btn sm" onClick={() => setPanel("agent")}>⚙ 설정</button>
        </div>
      </header>

      {error && <div className="alert"><b>오류</b> {error} <button className="btn sm" onClick={() => setError("")}>닫기</button></div>}
      {batch.log.length > 0 && <div className="card hint" style={{ whiteSpace: "pre-wrap", marginBottom: 14 }}>{batch.log.join("\n")} <button className="btn sm" onClick={() => setBatch({ running: false, log: [] })}>닫기</button></div>}

      <button className="mebar" onClick={() => setPanel("me")}>
        <span>내 상태</span>
        <b>보유 {F(profile.saved)}</b><b>월 저축 {F(profile.monthlySave)}</b>
        {borrowersOf(profile).map((b, i) => <b key={i}>{b.name} {F(b.income)}</b>)}
        {profile.firstBuyer && <b>생애최초</b>}
        {profile.childBirth && <b>👶 {profile.childBirth}</b>}
        <b>금리 {eff.mRate}%{profile.autoRate && rates ? " (실시간)" : ""}</b>
        <em>수정 ›</em>
      </button>

      <div className="tabs">
        {listings.map((l) => {
          const d = latest[l.id];
          return (
            <div key={l.id} className={`tab ${l.id === activeId ? "on" : ""}`} onClick={() => setActiveId(l.id)}>
              {l.watch && <span title="감시 중">👁</span>}{l.name}
              {d && <span className="vb" style={{ ["--c" as string]: VERDICT[d.verdict].c }}>{VERDICT[d.verdict].label}</span>}
              <button className="x" title="삭제" aria-label={`${l.name} 삭제`} onClick={(e) => { e.stopPropagation(); void removeListing(l); }}>×</button>
            </div>
          );
        })}
        <button className="tab ghost" onClick={addListing}>＋ 매물</button>
      </div>

      {!active ? (
        <div className="card empty">아직 매물이 없습니다. <b>＋ 매물</b>을 눌러 노원·도봉 단지를 찾아보세요.</div>
      ) : (
        <div className="grid">
          <div className="card">
            <ListingForm key={active.id} l={active} onPatch={(p) => patchListing(active.id, p)} molitOn={!!info?.keys.molit} rules={rules}
              favorites={info?.settings.favoriteSgg ?? ["11350", "11320"]}
              onSnapshot={async (source, data) => { await api(`/api/listings/${active.id}/snapshots`, { method: "POST", json: { source, data } }).catch(err); await reloadListings(); setVersion((v) => v + 1); }} />
          </div>
          <div>
            <ResultPanel p={eff} s={toInput(active)} o={calc(eff, toInput(active), rules)} dsrLimit={rules.dsrLimit} onIgnore={(v) => patchListing(active.id, { ignoreRules: v })} onChoose={(id) => patchProfile({ loanProduct: id })} />
            <AgentPanel key={active.id} listingId={active.id} providers={providers} provider={provider} onProvider={(p: ProviderId) => patchSettings({ provider: p })} version={version}
              onChanged={async () => { await reloadListings(); }} />
          </div>
        </div>
      )}

      <p className="foot">단위 만원 · 규칙 기준: {rules.label} (⚖ 규칙에서 수정) · 판정은 투자 권유가 아니니 매수 전에 은행·중개사에서 꼭 확인하세요.</p>

      {panel && info && (
        <SettingsPanel tab={panel} onClose={() => setPanel(null)} profile={profile} onProfile={patchProfile} rules={rules} onRules={patchRules} onResetRules={resetRules}
          settings={info.settings} onSettings={patchSettings} providers={providers} rates={rates} ecosOn={info.keys.ecos} sources={info.sources} />
      )}
      <Chat providers={providers} provider={provider} onProvider={(p) => patchSettings({ provider: p })} focusId={active?.id} />
    </div>
  );
}
