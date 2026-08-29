export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("  ");

  console.log(headerLine);
  console.log(sep);
  for (const row of rows) {
    console.log(row.map((c, i) => (c ?? "").padEnd(widths[i])).join("  "));
  }
}

export function json(data: unknown): void {
  const serialized = JSON.stringify(data, null, 2);
  const expression = jqExpression();
  if (!expression) {
    console.log(serialized);
    return;
  }

  const result = spawnSync("jq", [expression], { input: serialized, encoding: "utf-8" });
  if (result.error) {
    throw new Error("Unable to run jq. Install jq or remove --jq.");
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "jq filter failed.");
  }
  process.stdout.write(result.stdout);
}

export function formatTrend(trend: number): string {
  const pct = (trend * 100).toFixed(1);
  return trend >= 0 ? `+${pct}%` : `${pct}%`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}
import { spawnSync } from "node:child_process";
import { getRuntimeOptions } from "./runtime.js";

function jqExpression(): string | undefined {
  return getRuntimeOptions().jq;
}
