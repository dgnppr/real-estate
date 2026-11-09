"use client";
import { useState } from "react";
import type { ListingRow, SnapshotRow, DecisionRow } from "@/lib/db/schema";

type Jsonify<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
export type Listing = Jsonify<ListingRow>;
export type Snapshot = Jsonify<SnapshotRow>;
export type Decision = Jsonify<DecisionRow>;

/** 만원 → "3억 1,000" */
export const F = (n: number | null | undefined) => {
  if (n == null) return "-";
  n = Math.round(n);
  if (!isFinite(n)) return "무제한";
  const a = Math.abs(n), e = Math.floor(a / 10000), m = a % 10000;
  return (n < 0 ? "-" : "") + (e ? e + "억" + (m ? " " + m.toLocaleString() : "") : m.toLocaleString());
};
export const W = (n: number) => Math.round(n).toLocaleString() + "만";
export const ymLabel = (a?: string | null) => (a ? a.replace("-", ".") : "–");
export const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit" });
};

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j as T;
}

export const VERDICT: Record<string, { label: string; c: string }> = {
  BUY: { label: "매수", c: "var(--v-buy)" },
  WAIT: { label: "관망", c: "var(--v-wait)" },
  PASS: { label: "포기", c: "var(--v-pass)" },
  ERROR: { label: "오류", c: "var(--v-err)" },
};

/**
 * 숫자 입력칸 — 입력 중에는 글자를 그대로 둠 (빈칸 허용, 앞자리 0 제거),
 * 포커스 시 전체 선택이라 0 위에 바로 입력해도 "01" 이 되지 않음.
 * nullable 이면 빈칸 = null, 아니면 빈칸 = 0 으로 저장.
 */
export function NumberField({ value, onChange, step = 1, disabled, nullable, placeholder, className }: {
  value: number | null | undefined; onChange: (v: number | null) => void; step?: number; disabled?: boolean; nullable?: boolean; placeholder?: string; className?: string;
}) {
  const [text, setText] = useState<string | null>(null); // null = 편집 중 아님 → value 표시
  const shown = text ?? (value == null ? "" : String(value));
  return (
    <input className={className} type="text" inputMode="decimal" value={shown} disabled={disabled} placeholder={placeholder} data-step={step}
      onFocus={(e) => { setText(value == null ? "" : String(value)); e.currentTarget.select(); }}
      onBlur={() => setText(null)}
      onChange={(e) => {
        let t = e.target.value.replace(/[^\d.-]/g, "");
        t = t.replace(/^(-?)0+(?=\d)/, "$1"); // 앞자리 0 제거
        setText(t);
        if (t === "" || t === "-" || t === ".") onChange(nullable ? null : 0);
        else if (!Number.isNaN(parseFloat(t))) onChange(parseFloat(t));
      }} />
  );
}

/** 금액 입력 (만원) — 라벨 옆에 억 단위 표시 */
export function Money({ label, value, onChange, disabled, step = 100, nullable, placeholder }: { label: string; value: number | null | undefined; onChange: (v: number) => void; disabled?: boolean; step?: number; nullable?: boolean; placeholder?: string }) {
  return (
    <label className="f">
      <span>{label}<em>{value != null && value >= 10000 ? F(value) : ""}</em></span>
      <NumberField value={value} step={step} disabled={disabled} nullable={nullable} placeholder={placeholder} onChange={(v) => onChange(v as number)} />
    </label>
  );
}
export function Num({ label, value, onChange, step = 0.1, disabled }: { label: string; value: number | null | undefined; onChange: (v: number) => void; step?: number; disabled?: boolean }) {
  return (
    <label className="f">
      <span>{label}</span>
      <NumberField value={value} step={step} disabled={disabled} onChange={(v) => onChange(v ?? 0)} />
    </label>
  );
}
export function Text({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | null | undefined; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="f">
      <span>{label}</span>
      <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="tog">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** 간단한 스파크라인 */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), w = 300, h = 48, pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => (max === min ? h / 2 : pad + (1 - (v - min) / (max - min)) * (h - pad * 2));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="3" fill="var(--accent)" />
    </svg>
  );
}
