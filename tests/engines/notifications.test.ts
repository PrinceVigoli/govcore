import {
  renderString, renderTemplate, collectPlaceholders, parseVariables, isChannelEnabled,
  type NotificationTemplate, type NotificationPreference,
} from './notifications.core';

let pass = 0, fail = 0;
const t = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
};

const tpl = (body: string, subject: string | null = null, variables: string | null = null): NotificationTemplate =>
  ({ body, subject, variables, channel: 'email' });

console.log('\n— renderString —');
t('substitutes a variable', renderString('Hi {{name}}', { name: 'Juan' }), 'Hi Juan');
t('substitutes repeated', renderString('{{a}}-{{a}}', { a: 'x' }), 'x-x');
t('tolerates inner spaces', renderString('Hi {{ name }}', { name: 'Juan' }), 'Hi Juan');
t('leaves unknown verbatim', renderString('Hi {{name}}', {}), 'Hi {{name}}');
t('leaves null verbatim (not "null")', renderString('Hi {{name}}', { name: null }), 'Hi {{name}}');
t('renders number 0', renderString('Total: {{n}}', { n: 0 }), 'Total: 0');
t('renders boolean false', renderString('Flag: {{f}}', { f: false }), 'Flag: false');
t('dotted key supported', renderString('{{a.b}}', { 'a.b': 'v' }), 'v');
t('no placeholders untouched', renderString('plain text', { a: 1 }), 'plain text');

console.log('\n— collectPlaceholders —');
t('finds all unique', collectPlaceholders('{{a}} {{b}} {{a}}').sort(), ['a', 'b']);
t('empty when none', collectPlaceholders('hello'), []);

console.log('\n— parseVariables —');
t('parses array', parseVariables('["a","b"]'), ['a', 'b']);
t('null -> []', parseVariables(null), []);
t('malformed -> []', parseVariables('{oops'), []);
t('non-array -> []', parseVariables('{"a":1}'), []);

console.log('\n— renderTemplate: missing variable detection —');
const r1 = renderTemplate(tpl('Dear {{citizen_name}}, ref {{reference_number}}'), { citizen_name: 'Juan' });
t('reports missing', r1.missingVariables, ['reference_number']);
t('renders what it can', r1.body, 'Dear Juan, ref {{reference_number}}');

const r2 = renderTemplate(tpl('Dear {{n}}', 'Permit {{ref}}'), { n: 'A', ref: 'X1' });
t('renders subject too', r2.subject, 'Permit X1');
t('nothing missing', r2.missingVariables, []);

// A variable declared in `variables` but never used in the body still counts
// as part of the template's contract.
const r3 = renderTemplate(tpl('static body', null, '["declared_only"]'), {});
t('declared-but-unused is missing', r3.missingVariables, ['declared_only']);

const r4 = renderTemplate(tpl('Hi {{a}}', null, '["a"]'), { a: 'x' });
t('declared and supplied is fine', r4.missingVariables, []);

const r5 = renderTemplate(tpl('n={{n}}'), { n: 0 });
t('zero is NOT missing', r5.missingVariables, []);
const r6 = renderTemplate(tpl('f={{f}}'), { f: false });
t('false is NOT missing', r6.missingVariables, []);
const r7 = renderTemplate(tpl('e={{e}}'), { e: '' });
t('empty string is NOT missing', r7.missingVariables, []);

console.log('\n— isChannelEnabled (opt-out semantics) —');
const P = (userId: number, channel: string, eventType: string | null, enabled: boolean): NotificationPreference =>
  ({ userId, channel, eventType, enabled });

t('no rows -> enabled', isChannelEnabled([], 1, 'WorkflowApproved'), true);
t('channel default off', isChannelEnabled([P(1, 'email', null, false)], 1, 'AnyEvent'), false);
t('channel default on', isChannelEnabled([P(1, 'email', null, true)], 1, 'AnyEvent'), true);
t('event-specific overrides default off->on',
  isChannelEnabled([P(1, 'email', null, false), P(1, 'email', 'Approved', true)], 1, 'Approved'), true);
t('event-specific overrides default on->off',
  isChannelEnabled([P(1, 'email', null, true), P(1, 'email', 'Reminder', false)], 1, 'Reminder'), false);
t('unrelated event falls back to default',
  isChannelEnabled([P(1, 'email', null, false), P(1, 'email', 'Approved', true)], 1, 'Other'), false);
t("other user's prefs ignored",
  isChannelEnabled([P(2, 'email', null, false)], 1, 'Approved'), true);

console.log('\n— backoff (mirrors engine) —');
const backoffMs = (attempt: number) => Math.min(60_000 * 2 ** (attempt - 1), 60 * 60_000);
t('attempt 1 = 1min', backoffMs(1), 60_000);
t('attempt 2 = 2min', backoffMs(2), 120_000);
t('attempt 3 = 4min', backoffMs(3), 240_000);
t('caps at 1hr', backoffMs(20), 3_600_000);

console.log('\n— priority ordering (mirrors engine) —');
const RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };
const items = [{ p: 'low' }, { p: 'high' }, { p: 'normal' }, { p: 'high' }];
items.sort((a, b) => (RANK[a.p] ?? 1) - (RANK[b.p] ?? 1));
t('high first, low last', items.map(i => i.p), ['high', 'high', 'normal', 'low']);
const unknown = [{ p: 'weird' }, { p: 'high' }, { p: 'low' }];
unknown.sort((a, b) => (RANK[a.p] ?? 1) - (RANK[b.p] ?? 1));
t('unknown priority ranks as normal', unknown.map(i => i.p), ['high', 'weird', 'low']);

console.log('\n— notification status rollup (mirrors refreshNotificationStatus) —');
function rollup(statuses: string[]): string {
  const anySent = statuses.some(s => s === 'sent');
  const allTerminal = statuses.every(s => s === 'sent' || s === 'dead_letter' || s === 'cancelled');
  if (anySent && allTerminal) return 'sent';
  if (!anySent && allTerminal) return 'failed';
  return 'queued';
}
t('all sent -> sent', rollup(['sent', 'sent']), 'sent');
t('one sent one dead -> sent', rollup(['sent', 'dead_letter']), 'sent');
t('all dead -> failed', rollup(['dead_letter', 'dead_letter']), 'failed');
t('still pending -> queued', rollup(['sent', 'pending']), 'queued');
t('retrying -> queued', rollup(['failed']), 'queued');
t('all cancelled -> failed (route overrides to cancelled)', rollup(['cancelled']), 'failed');

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
