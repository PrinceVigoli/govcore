
type NotificationTemplate = { subject: string|null; body: string; variables: string|null; channel: string };
type NotificationPreference = { userId:number; channel:string; eventType:string|null; enabled:boolean };
interface RenderResult { subject: string|null; body: string; missingVariables: string[] }
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function parseVariables(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function renderString(template: string, payload: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

function collectPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found];
}

function renderTemplate(template: NotificationTemplate, payload: Record<string, unknown>): RenderResult {
  const declared = parseVariables(template.variables);
  const used = new Set([...collectPlaceholders(template.body), ...collectPlaceholders(template.subject ?? "")]);
  for (const name of declared) used.add(name);

  const missingVariables = [...used].filter((name) => payload[name] === undefined || payload[name] === null);

  return {
    subject: template.subject ? renderString(template.subject, payload) : null,
    body: renderString(template.body, payload),
    missingVariables,
  };
}

function isChannelEnabled(
  prefs: NotificationPreference[],
  userId: number,
  eventType: string,
): boolean {
  const forUser = prefs.filter((p) => p.userId === userId);
  const specific = forUser.find((p) => p.eventType === eventType);
  if (specific) return specific.enabled;
  const fallback = forUser.find((p) => p.eventType === null);
  if (fallback) return fallback.enabled;
  return true;
}

export { renderString, renderTemplate, collectPlaceholders, parseVariables, isChannelEnabled };
export type { NotificationTemplate, NotificationPreference };
