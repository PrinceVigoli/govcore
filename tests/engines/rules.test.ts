import { evaluateGroup, RuleEvaluationError, type RuleGroup, type RuleCondition } from './rules.core';

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function throws(name: string, fn: () => unknown) {
  try { fn(); fail++; console.log(`  FAIL  ${name} (expected throw)`); }
  catch { pass++; console.log(`  PASS  ${name}`); }
}

const g = (id: number, parentGroupId: number | null, op = 'AND'): RuleGroup =>
  ({ id, parentGroupId, logicalOperator: op, sortOrder: 0 });
const c = (id: number, groupId: number, field: string, operator: string, value: unknown): RuleCondition =>
  ({ id, groupId, field, operator, value: JSON.stringify(value), sortOrder: 0 });

console.log('\n— Operators —');
const ops: Array<[string, unknown, unknown, boolean]> = [
  ['equals', 5, 5, true], ['equals', 5, 6, false],
  ['not_equals', 'a', 'b', true],
  ['greater_than', 10, 5, true], ['greater_than', 5, 10, false],
  ['greater_than_or_equal', 5, 5, true],
  ['less_than', 3, 8, true],
  ['less_than_or_equal', 8, 8, true],
  ['contains', 'sari_sari_store', 'sari', true],
  ['contains', 'abc', 'xyz', false],
  ['in', 'b', ['a','b','c'], true], ['in', 'z', ['a','b'], false],
  ['not_in', 'z', ['a','b'], true],
];
for (const [op, actual, expected, want] of ops) {
  const groups = [g(1, null)];
  const conds = [c(1, 1, 'f', op, expected)];
  check(`${op}(${JSON.stringify(actual)}, ${JSON.stringify(expected)})`,
    evaluateGroup(1, groups, conds, { f: actual }), want);
}

console.log('\n— contains on arrays —');
check('contains array hit',
  evaluateGroup(1, [g(1,null)], [c(1,1,'tags','contains','x')], { tags: ['x','y'] }), true);

console.log('\n— AND / OR —');
const andG = [g(1, null, 'AND')];
const andC = [c(1,1,'a','equals',1), c(2,1,'b','equals',2)];
check('AND both true', evaluateGroup(1, andG, andC, { a:1, b:2 }), true);
check('AND one false', evaluateGroup(1, andG, andC, { a:1, b:9 }), false);

const orG = [g(1, null, 'OR')];
check('OR one true', evaluateGroup(1, orG, andC, { a:1, b:9 }), true);
check('OR none true', evaluateGroup(1, orG, andC, { a:0, b:9 }), false);

console.log('\n— Nested: (A AND B) OR C —');
// root OR { child AND [a,b], c }
const nG = [g(1,null,'OR'), g(2,1,'AND')];
const nC = [c(1,2,'a','equals',1), c(2,2,'b','equals',2), c(3,1,'c','equals',3)];
check('inner AND satisfied', evaluateGroup(1, nG, nC, { a:1,b:2,c:0 }), true);
check('outer C satisfied',   evaluateGroup(1, nG, nC, { a:0,b:0,c:3 }), true);
check('neither satisfied',   evaluateGroup(1, nG, nC, { a:1,b:9,c:0 }), false);

console.log('\n— Empty groups —');
check('empty AND group is true',  evaluateGroup(1, [g(1,null,'AND')], [], {}), true);
check('empty OR group is false',  evaluateGroup(1, [g(1,null,'OR')],  [], {}), false);

console.log('\n— Error handling —');
throws('missing field throws', () => evaluateGroup(1, [g(1,null)], [c(1,1,'nope','equals',1)], { other: 1 }));
throws('bad operator throws',  () => evaluateGroup(1, [g(1,null)], [c(1,1,'f','regex_match',1)], { f: 1 }));
throws('missing group throws', () => evaluateGroup(99, [g(1,null)], [], {}));

console.log('\n— Type strictness (engine compares strictly) —');
check('string "5" !== number 5', evaluateGroup(1,[g(1,null)],[c(1,1,'f','equals',5)],{ f:'5' }), false);
check('gt with string operand is false', evaluateGroup(1,[g(1,null)],[c(1,1,'f','greater_than',5)],{ f:'9' }), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
