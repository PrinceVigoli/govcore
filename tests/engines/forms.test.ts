// Mirror of formsEngine validation helpers (isEmpty, parseConfig, compare)
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}
function compare(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "greater_than": return typeof actual==="number"&&typeof expected==="number"&&actual>expected;
    case "greater_than_or_equal": return typeof actual==="number"&&typeof expected==="number"&&actual>=expected;
    case "less_than": return typeof actual==="number"&&typeof expected==="number"&&actual<expected;
    case "less_than_or_equal": return typeof actual==="number"&&typeof expected==="number"&&actual<=expected;
    default: return false;
  }
}
let pass=0,fail=0;
const t=(n:string,a:unknown,e:unknown)=>{const ok=JSON.stringify(a)===JSON.stringify(e);if(ok)pass++;else fail++;console.log(`${ok?'PASS':'FAIL'}  ${n}`)};

console.log('— isEmpty (drives `required`) —');
t('undefined empty', isEmpty(undefined), true);
t('null empty', isEmpty(null), true);
t('"" empty', isEmpty(''), true);
t('[] empty', isEmpty([]), true);
t('0 NOT empty', isEmpty(0), false);          // numeric zero must be a valid answer
t('false NOT empty', isEmpty(false), false);  // unchecked switch must be a valid answer
t('"a" not empty', isEmpty('a'), false);

console.log('\n— cross_field compare —');
t('gt numbers', compare(10,'greater_than',5), true);
t('gt string operand false', compare('10','greater_than',5), false);
t('equals strict', compare('5','equals',5), false);
t('unknown operator false', compare(1,'between',2), false);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail>0)process.exit(1);
