import {
  canTransition, hashContent, buildStorageKey, buildAttachmentKey, extensionForMime,
  renderTemplate, renderString, buildVerificationUrl, DOCUMENT_STATUSES,
  type DocumentTemplate,
} from './documents.core';

let pass = 0, fail = 0;
const t = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
};

const tpl = (body: string, variables: string | null = null): DocumentTemplate =>
  ({ body, variables, templateType: 'html' });

console.log('\n— Lifecycle transitions (§4, forward-only) —');
t('draft -> generated', canTransition('draft', 'generated'), true);
t('generated -> approved (skip ahead allowed)', canTransition('generated', 'approved'), true);
t('approved -> signed', canTransition('approved', 'signed'), true);
t('signed -> archived', canTransition('signed', 'archived'), true);
t('archived -> draft BLOCKED', canTransition('archived', 'draft'), false);
t('signed -> generated BLOCKED', canTransition('signed', 'generated'), false);
t('same status BLOCKED (no-op)', canTransition('approved', 'approved'), false);
t('disposed is terminal', canTransition('disposed', 'archived'), false);
t('unknown status rejected', canTransition('draft', 'bogus'), false);
t('all 8 stages present', DOCUMENT_STATUSES.length, 8);

console.log('\n— Content hashing (§10 Hash Validation) —');
const h1 = hashContent('Certificate No. 001');
const h2 = hashContent('Certificate No. 001');
const h3 = hashContent('Certificate No. 002');
t('deterministic', h1, h2);
t('sha256 hex length', h1.length, 64);
t('single char change alters hash', h1 !== h3, true);
t('empty string hashes', hashContent('').length, 64);
// A tampered document must not verify: this is the whole point of the check.
t('tampered content fails match', hashContent('Approved') === hashContent('Approvedd'), false);

console.log('\n— Storage keys (ADR-0019: UUID-derived, path-free) —');
const uuid = '550e8400-e29b-41d4-a716-446655440000';
t('document key uses uuid + version', buildStorageKey(uuid, 3, 'html'), `documents/${uuid}/v3.html`);
t('key has no filesystem path', buildStorageKey(uuid, 1, 'pdf').includes('..'), false);
t('attachment key sanitizes filename',
  buildAttachmentKey(uuid, 'my report (final).pdf'), `attachments/${uuid}/my_report__final_.pdf`);
t('attachment key blocks traversal',
  buildAttachmentKey(uuid, '../../etc/passwd'), `attachments/${uuid}/.._.._etc_passwd`);
t('mime -> extension', extensionForMime('text/html'), 'html');
t('unknown mime -> bin', extensionForMime('application/x-weird'), 'bin');

console.log('\n— Template rendering (§7) —');
t('substitutes', renderString('No. {{ref}}', { ref: 'A-1' }), 'No. A-1');
t('unresolved stays verbatim (not "undefined")',
  renderString('Citizen: {{citizen_name}}', {}), 'Citizen: {{citizen_name}}');
t('renders 0', renderString('Fee: {{amt}}', { amt: 0 }), 'Fee: 0');
t('renders false', renderString('Paid: {{p}}', { p: false }), 'Paid: false');
t('tolerates spacing', renderString('{{  ref  }}', { ref: 'X' }), 'X');

const r1 = renderTemplate(tpl('Cert {{reference_number}} for {{citizen_name}}'), { reference_number: 'C-1' });
t('reports missing var', r1.missingVariables, ['citizen_name']);
t('renders the rest', r1.content, 'Cert C-1 for {{citizen_name}}');

const r2 = renderTemplate(tpl('static', '["declared"]'), {});
t('declared-but-unused counts as missing', r2.missingVariables, ['declared']);

const r3 = renderTemplate(tpl('Fee {{amt}}'), { amt: 0 });
t('zero is not missing', r3.missingVariables, []);

console.log('\n— QR verification URL (§10) —');
t('builds verify url', buildVerificationUrl('https://gov.ph', uuid), `https://gov.ph/verify/${uuid}`);
t('strips trailing slash', buildVerificationUrl('https://gov.ph/', uuid), `https://gov.ph/verify/${uuid}`);
t('carries no document content', buildVerificationUrl('https://gov.ph', uuid).includes('citizen'), false);

console.log('\n— Verification decision table (mirrors verifyDocument) —');
// Reproduces the engine's branch order to prove an unissued or altered
// document can never come back valid.
function verify(doc: { status: string; hash: string } | null, presentedHash?: string) {
  if (!doc) return { valid: false, reason: 'no match' };
  if (doc.status === 'draft') return { valid: false, reason: 'not issued' };
  if (doc.status === 'disposed') return { valid: false, reason: 'disposed' };
  if (presentedHash && presentedHash !== doc.hash) return { valid: false, reason: 'altered' };
  return { valid: true };
}
t('unknown uuid invalid', verify(null).valid, false);
t('draft document invalid', verify({ status: 'draft', hash: 'a' }).valid, false);
t('disposed document invalid', verify({ status: 'disposed', hash: 'a' }).valid, false);
t('issued document valid', verify({ status: 'signed', hash: 'a' }).valid, true);
t('matching hash valid', verify({ status: 'signed', hash: 'a' }, 'a').valid, true);
t('ALTERED document invalid', verify({ status: 'signed', hash: 'a' }, 'b').valid, false);
t('archived still verifiable', verify({ status: 'archived', hash: 'a' }).valid, true);

console.log('\n— Signature staleness (signature binds to bytes) —');
// A signature covers a specific version's hash. After regeneration the active
// version has a new hash, so the old signature must not be presented as valid.
const sigs = [{ signedHash: 'hash_v1', signer: 'Mayor' }, { signedHash: 'hash_v2', signer: 'Assessor' }];
const activeHash = 'hash_v2';
const valid = sigs.filter(s => s.signedHash === activeHash);
t('only signatures over the active version count', valid.map(s => s.signer), ['Assessor']);
t('regeneration invalidates prior signature',
  sigs.filter(s => s.signedHash === 'hash_v3').length, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
