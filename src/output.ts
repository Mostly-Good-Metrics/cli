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
  console.log(JSON.stringify(data, null, 2));
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
