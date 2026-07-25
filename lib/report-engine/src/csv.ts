// Book 10 — CSV export serialization. Pure and total, so it's unit-testable
// and can't be the thing that breaks a scheduled export at 2am. RFC-4180-style
// quoting: fields containing a comma, quote, or newline are wrapped in double
// quotes with embedded quotes doubled.

export function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);

  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0 && !columns) return "";
  const header = columns ?? Object.keys(rows[0] ?? {});
  const lines = [header.map(toCsvValue).join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => toCsvValue(row[key])).join(","));
  }
  // CRLF line endings — the RFC-4180 default, and what spreadsheet apps expect.
  return lines.join("\r\n");
}
