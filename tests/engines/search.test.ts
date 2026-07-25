import {
  tokenize,
  scoreCandidate,
  rankCandidates,
  filterByAllowedTypes,
  ENTITY_TYPE_TO_MODULE,
  ALL_ENTITY_TYPES,
  type SearchCandidate,
} from './search.core';

// Same dependency-free harness as rules.test.ts — no test framework.
let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const cand = (over: Partial<SearchCandidate>): SearchCandidate => ({
  entityType: 'rule', entityId: 1, title: '', subtitle: null, content: '', url: null, ...over,
});

console.log('\n— tokenize —');
check('lowercases and splits', tokenize('Business Permit'), ['business', 'permit']);
check('drops 1-char tokens', tokenize('a business x'), ['business']);
check('splits on punctuation', tokenize('permit,application.form'), ['permit', 'application', 'form']);
check('empty query -> no tokens', tokenize('   '), []);
check('digits kept', tokenize('form 2026'), ['form', '2026']);

console.log('\n— scoreCandidate: weighting —');
// Title hits (5) must outweigh content hits (1).
const titleHit = scoreCandidate(cand({ title: 'permit' }), ['permit']);
const contentHit = scoreCandidate(cand({ content: 'permit' }), ['permit']);
check('title hit scores higher than content hit', (titleHit!.score) > (contentHit!.score), true);
check('title match reported in matchedIn', titleHit!.matchedIn, ['title']);
check('content match reported in matchedIn', contentHit!.matchedIn, ['content']);

const subtitleHit = scoreCandidate(cand({ subtitle: 'permit' }), ['permit']);
check('subtitle between title and content', (subtitleHit!.score < titleHit!.score) && (subtitleHit!.score > contentHit!.score), true);

console.log('\n— scoreCandidate: non-matches return null —');
check('no match -> null (not 0)', scoreCandidate(cand({ title: 'nothing' }), ['permit']), null);
check('empty tokens -> null', scoreCandidate(cand({ title: 'permit' }), []), null);

console.log('\n— scoreCandidate: all-tokens bonus —');
// Matching every token beats matching only some, even with more raw hits.
const allTokens = scoreCandidate(cand({ title: 'business permit application' }), ['business', 'permit']);
const someTokens = scoreCandidate(cand({ title: 'business business business' }), ['business', 'permit']);
check('all-tokens match earns bonus over partial', (allTokens!.score) > (someTokens!.score), true);
check('multi-field match lists each field',
  scoreCandidate(cand({ title: 'permit', content: 'permit' }), ['permit'])!.matchedIn, ['title', 'content']);

console.log('\n— rankCandidates: ordering —');
const ranked = rankCandidates([
  cand({ entityId: 1, content: 'mentions permit once' }),
  cand({ entityId: 2, title: 'permit' }),
  cand({ entityId: 3, title: 'nothing relevant' }),
], 'permit');
check('highest score first', ranked[0].entityId, 2);
check('non-matches excluded', ranked.map((r) => r.entityId), [2, 1]);

console.log('\n— rankCandidates: stable tie-breaking —');
const tied = rankCandidates([
  cand({ entityType: 'rule', entityId: 5, title: 'permit' }),
  cand({ entityType: 'form', entityId: 3, title: 'permit' }),
  cand({ entityType: 'rule', entityId: 2, title: 'permit' }),
], 'permit');
// Equal scores: order by entityType, then entityId — deterministic across runs.
check('ties break by type then id', tied.map((r) => `${r.entityType}:${r.entityId}`), ['form:3', 'rule:2', 'rule:5']);

console.log('\n— rankCandidates: limit —');
const many = Array.from({ length: 10 }, (_, i) => cand({ entityId: i + 1, title: 'permit' }));
check('respects limit', rankCandidates(many, 'permit', 3).length, 3);

console.log('\n— permission filtering (fails closed) —');
const rows = [
  { entityType: 'rule', id: 1 },
  { entityType: 'form', id: 2 },
  { entityType: 'user', id: 3 },
];
check('empty allow-set -> nothing (fails closed)', filterByAllowedTypes(rows, new Set()), []);
check('only allowed types survive',
  filterByAllowedTypes(rows, new Set(['rule', 'user'])).map((r) => r.id), [1, 3]);
check('allowing a type absent from rows is a no-op',
  filterByAllowedTypes(rows, new Set(['document_template'])), []);

console.log('\n— entity/module mapping —');
check('every entity type maps to a module',
  ALL_ENTITY_TYPES.every((t) => typeof ENTITY_TYPE_TO_MODULE[t] === 'string'), true);
check('rule -> rules module', ENTITY_TYPE_TO_MODULE['rule'], 'rules');
check('both identity types map to identity',
  ENTITY_TYPE_TO_MODULE['user'] === 'identity' && ENTITY_TYPE_TO_MODULE['department'] === 'identity', true);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
