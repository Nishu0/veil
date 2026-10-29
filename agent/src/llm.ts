import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LLM_MODEL } from "./config.js";

export type LlmAdvice = { targetLeverage: number; rationale: string; model: string; source: "llm" | "fallback"; error?: string };

/**
 * Asks the model (DeepSeek through the opencode CLI) for a target leverage and a
 * short rationale. Any failure falls back to the deterministic policy value, so
 * the agent never blocks on the LLM and the LLM never bypasses the guardrails.
 */
export async function advise(context: object, bounds: { min: number; max: number }, fallback: { target: number; why: string }): Promise<LlmAdvice> {
  const prompt = [
    "You are the risk officer for a tokenized-RWA vault that runs a short TSLA iAsset perp on Injective.",
    "The equity oracle freezes from Friday close to Monday open while trading continues, so positions can gap.",
    `Choose a target leverage between ${bounds.min.toFixed(2)} and ${bounds.max.toFixed(2)} (hard limits enforced in code).`,
    "House policy: run at the session maximum unless something specific in the state justifies less; the maximum already includes the weekend-gap buffer.",
    "State: " + JSON.stringify(context),
    'Reply with ONLY one JSON object, no markdown: {"targetLeverage": <number>, "rationale": "<max 2 sentences, plain English, cite the numbers>"}',
  ].join("\n");
  try {
    const out = await run(prompt, 30_000);
    const m = out.match(/\{[^{}]*"targetLeverage"[^{}]*\}/g);
    if (!m) throw new Error("no JSON in model output");
    const j = JSON.parse(m[m.length - 1]);
    const t = Number(j.targetLeverage);
    if (!Number.isFinite(t) || typeof j.rationale !== "string") throw new Error("bad JSON shape");
    return { targetLeverage: t, rationale: j.rationale.slice(0, 400), model: LLM_MODEL, source: "llm" };
  } catch (e) {
    return { targetLeverage: fallback.target, rationale: fallback.why, model: "deterministic-policy", source: "fallback", error: String((e as Error).message ?? e).slice(0, 200) };
  }
}

function run(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // empty cwd: the model gets no repo context and nothing to act on
    const cwd = mkdtempSync(path.join(tmpdir(), "veil-llm-"));
    const p = spawn("opencode", ["run", "-m", LLM_MODEL, prompt], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("LLM timeout")); }, timeoutMs);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(out.replace(/\x1b\[[0-9;]*m/g, "")) : reject(new Error(`opencode exited ${code}: ${out.slice(-200)}`)); });
  });
}
