// 로컬 에이전트 CLI 실행기 — claude / codex / agy / gemini 를 같은 인터페이스로 호출
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type ProviderId = "claude" | "codex" | "agy" | "gemini";

export interface ProviderInfo { id: ProviderId; label: string; bin: string; structured: boolean }

export const PROVIDERS: ProviderInfo[] = [
  { id: "claude", label: "Claude Code", bin: process.env.CLAUDE_BIN || "claude", structured: true },
  { id: "codex", label: "Codex", bin: process.env.CODEX_BIN || "codex", structured: true },
  { id: "agy", label: "Antigravity (agy)", bin: process.env.AGY_BIN || "agy", structured: true },
  { id: "gemini", label: "Gemini CLI", bin: process.env.GEMINI_BIN || "gemini", structured: false },
];

export interface RunOptions {
  provider: ProviderId;
  prompt: string;
  schema?: object; // JSON Schema → 구조화 출력
  model?: string;
  timeoutMs?: number;
}

export interface RunResult { provider: ProviderId; text: string; json: unknown | null; durationMs: number; raw: string }

// 에이전트가 프로젝트 파일을 건드리지 않도록 별도 작업 폴더에서 실행
const WORKDIR = path.join(process.cwd(), "data", "agent-workspace");

function exec(bin: string, args: string[], stdin: string | null, timeoutMs: number): Promise<{ out: string; err: string; code: number | null }> {
  mkdirSync(WORKDIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: WORKDIR, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`${bin} 시간 초과 (${Math.round(timeoutMs / 1000)}초)`)); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`${bin} 실행 실패: ${e.message}`)); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ out, err, code }); });
    if (stdin != null) child.stdin.end(stdin); else child.stdin.end();
  });
}

/** 텍스트에서 첫 번째 완결된 JSON 객체를 찾아 파싱 */
export function extractJson(text: string): unknown | null {
  const t = text.replace(/```(?:json)?/g, "");
  for (let start = t.indexOf("{"); start !== -1; start = t.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

export async function runAgent(o: RunOptions): Promise<RunResult> {
  const p = PROVIDERS.find((x) => x.id === o.provider);
  if (!p) throw new Error(`알 수 없는 에이전트: ${o.provider}`);
  const timeout = o.timeoutMs ?? 5 * 60_000;
  const t0 = Date.now();
  const schemaStr = o.schema ? JSON.stringify(o.schema) : null;
  let text = "", json: unknown | null = null, raw = "";

  if (p.id === "claude") {
    const args = ["-p", "--output-format", "json", "--no-session-persistence"];
    if (schemaStr) args.push("--json-schema", schemaStr);
    if (o.model) args.push("--model", o.model);
    const r = await exec(p.bin, args, o.prompt, timeout);
    raw = r.out || r.err;
    const j = extractJson(r.out) as { result?: string; structured_output?: unknown; is_error?: boolean } | null;
    if (!j || j.is_error) throw new Error(`claude 오류: ${(j?.result || r.err || r.out).slice(0, 500)}`);
    text = j.result ?? ""; json = j.structured_output ?? (schemaStr ? extractJson(text) : null);
  } else if (p.id === "codex") {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "codex-"));
    try {
      const outFile = path.join(tmp, "out.txt");
      const args = ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-o", outFile];
      if (schemaStr) { const sf = path.join(tmp, "schema.json"); writeFileSync(sf, schemaStr); args.push("--output-schema", sf); }
      if (o.model) args.push("-m", o.model);
      args.push("-");
      const r = await exec(p.bin, args, o.prompt, timeout);
      raw = r.err.slice(-2000);
      if (r.code !== 0) throw new Error(`codex 오류(${r.code}): ${r.err.slice(-500)}`);
      text = readFileSync(outFile, "utf8").trim();
      json = schemaStr ? extractJson(text) : null;
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  } else if (p.id === "agy") {
    const args = ["-p", o.prompt, "--output-format", "json"];
    if (schemaStr) args.push("--json-schema", schemaStr);
    if (o.model) args.push("--model", o.model);
    const r = await exec(p.bin, args, null, timeout);
    raw = r.out || r.err;
    const j = extractJson(r.out) as { status?: string; response?: string; structured_output?: unknown } | null;
    if (!j || (j.status && j.status !== "SUCCESS")) throw new Error(`agy 오류: ${(r.err || r.out).slice(0, 500)}`);
    text = (j.response ?? "").trim(); json = j.structured_output ?? (schemaStr ? extractJson(text) : null);
  } else {
    // gemini: 스키마 강제 옵션이 없어 프롬프트로 JSON 을 요청하고 파싱
    const prompt = schemaStr ? `${o.prompt}\n\n반드시 다음 JSON Schema 에 맞는 JSON 객체 하나만 출력하세요:\n${schemaStr}` : o.prompt;
    const args = ["-p", prompt, "-o", "json"];
    if (o.model) args.push("-m", o.model);
    const r = await exec(p.bin, args, null, timeout);
    raw = r.out || r.err;
    const j = extractJson(r.out) as { response?: string; error?: { message?: string } } | null;
    if (!j || j.error) throw new Error(`gemini 오류: ${(j?.error?.message || r.err || r.out).slice(0, 500)}`);
    text = (j.response ?? "").trim(); json = schemaStr ? extractJson(text) : null;
  }

  if (schemaStr && json == null) throw new Error(`${p.id}: 구조화된 응답을 파싱하지 못했습니다. 응답: ${text.slice(0, 300)}`);
  return { provider: p.id, text, json, durationMs: Date.now() - t0, raw };
}

/** 설치 여부 확인 */
export async function detectProviders() {
  return Promise.all(PROVIDERS.map(async (p) => {
    try { const r = await exec(p.bin, ["--version"], null, 15_000); return { ...p, installed: r.code === 0, version: (r.out || r.err).trim().split("\n")[0] }; }
    catch { return { ...p, installed: false, version: null }; }
  }));
}
