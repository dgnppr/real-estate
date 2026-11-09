"use client";
import { useEffect, useRef, useState } from "react";
import type { ProviderId } from "@/lib/agents";
import { api } from "./ui";
import type { ProviderState } from "./AgentPanel";

interface Msg { id?: number; role: "user" | "assistant"; text: string; provider?: string }

export function Chat({ providers, provider, onProvider, focusId }: { providers: ProviderState[]; provider: ProviderId; onProvider: (p: ProviderId) => void; focusId?: number }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) api<Msg[]>("/api/chat").then(setMsgs).catch(() => {}); }, [open]);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [msgs, busy]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const m = text.trim(); if (!m || busy) return;
    setText(""); setMsgs((x) => [...x, { role: "user", text: m }]); setBusy(true);
    try { const r = await api<{ text: string; provider: string }>("/api/chat", { method: "POST", json: { message: m, provider, listingId: focusId } }); setMsgs((x) => [...x, { role: "assistant", text: r.text, provider: r.provider }]); }
    catch (err) { setMsgs((x) => [...x, { role: "assistant", text: "⚠ " + (err as Error).message }]); }
    setBusy(false);
  }
  async function clear() { if (!confirm("대화 기록을 지울까요?")) return; await api("/api/chat", { method: "DELETE" }); setMsgs([]); }

  return (
    <>
      <button className="fab" onClick={() => setOpen((o) => !o)}>{open ? "닫기" : "💬 상담"}</button>
      {open && (
        <div className="drawer" role="dialog" aria-label="자금 상담">
          <div className="dh">
            <b>자금 상담</b>
            <div style={{ display: "flex", gap: 6 }}>
              <select className="sel" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }} value={provider} onChange={(e) => onProvider(e.target.value as ProviderId)}>
                {providers.map((p) => <option key={p.id} value={p.id} disabled={!p.installed}>{p.label}</option>)}
              </select>
              <button className="btn sm" onClick={clear}>지우기</button>
            </div>
          </div>
          <div className="msgs" ref={box}>
            {msgs.length === 0 && <div className="hint">내 자금 상태와 등록된 매물을 근거로 답합니다. 예: “2번 매물 입주월을 3개월 당기면?”, “월 저축을 얼마로 늘려야 1번 살 수 있어?”</div>}
            {msgs.map((m, i) => <div key={m.id ?? i} className={`msg ${m.role === "user" ? "u" : "a"}`}>{m.text}{m.provider && <small>{m.provider}</small>}</div>)}
            {busy && <div className="msg a"><span className="spin" /> {provider} 생각 중…</div>}
          </div>
          <form onSubmit={send}>
            <textarea value={text} placeholder="질문하기 (Enter 전송, Shift+Enter 줄바꿈)" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
            <button className="btn pri" disabled={busy || !text.trim()}>전송</button>
          </form>
        </div>
      )}
    </>
  );
}
