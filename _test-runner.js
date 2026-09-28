// _test-runner.js — copied VERBATIM from elitr-app/api/_test-runner.js at commit 3c7d46d (brief 93).
// Its self-test stays in the source repo, where it was earned: it reads that repo's package.json and paths.
// api/_test-runner.js
// ONE RUNNER FOR EVERY SUITE. Twenty-four test files had grown FIVE runner shapes between them,
// and three of the differences were defects rather than style:
//
//   1. TEN FILES COULD NOT OBSERVE AN ASYNC FAILURE. Their `test` called fn() inside a
//      try/catch, so an `async` test returned a promise immediately, was tallied as a PASS, and
//      its assertion failed later as an unhandled rejection. Measured, both exit styles:
//        process.exit(failed ? 1 : 0)   \u2192  "2/2 passed"  exit 0   \u2014 the failure vanishes entirely
//        if (failed) process.exit(1)    \u2192  "2/2 passed"  exit 1   \u2014 a crash, and a lying tally
//      The first is worse and the mechanism is worth naming: an explicit process.exit() PREEMPTS
//      node's unhandled-rejection handling, so the process is gone before the rejection surfaces.
//      That is how brief 35's test 25 ran green against code with the guarded behaviour deleted.
//
//   2. ONE FILE'S EXIT CODE DEPENDED ON A TIMER. _watch-archive.test.js joined its two async
//      tests with setTimeout(\u2026, 50) and printed the tally from inside it. Reproduced both
//      directions: with a fast stub a broken async assertion exits 1; with a 200ms delay in the
//      same test the tally prints first and the process exits 0. It passed because the stubs are
//      fast, which is the worst available reason for a green suite.
//
//   3. ZERO REGISTERED TESTS PASSED. Every shape printed "0/0 passed" and exited 0. A file whose
//      tests never registered \u2014 a bad require, an early return, a slip inside a helper \u2014 was
//      indistinguishable from a file with nothing to say. The dead-assertion problem at file
//      scope.
//
// WHY process.exitCode AND NOT process.exit(). process.exit() can truncate pending stdout, which
// would cut off the very output naming what failed \u2014 and it is the same preemption that caused
// defect 1. Setting exitCode lets node exit naturally once the loop drains, so the tally always
// flushes and any straggling rejection still gets its say.
//
// HOW TO USE IT, and the last line matters:
//   const { test, run } = require('./_test-runner');
//   test('1. \u2026', () => { \u2026 });
//   test('2. \u2026', async () => { \u2026 });
//   run();
//
// run() is called UNAWAITED, and that is correct in CommonJS: there is no top-level await here,
// node exits when the event loop empties, and it honours whatever process.exitCode holds at that
// moment \u2014 which run() sets before it resolves. Do NOT add an `await` (CommonJS will not give you
// one) and do NOT add a process.exit() after it (that is defect 1, reintroduced).

const registered = [];
const seen = new Set();
const duplicates = [];

// REGISTRATION IS SEPARATE FROM EXECUTION, which is the whole fix for defect 1: the driver can
// await a test only if it holds the function rather than having already called it.
function test(name, fn) {
  // A DUPLICATE NAME IS A FAILURE, not a warning. A copy-pasted block whose name shadowed an
  // earlier one is a block whose assertions nobody reads, and the tally looks the same either way.
  if (seen.has(name)) duplicates.push(name);
  seen.add(name);
  registered.push([name, fn]);
}

// run(label?) \u2014 awaits every test in registration order, catching a synchronous throw and a
// rejected promise alike. Returns the tally, so a caller can assert on it (the runner's own test
// does exactly that, without using the runner).
// `beforeEach` exists because one suite needs it and inlining it into 31 tests would be worse:
// _ecosystem-store.test.js reset its in-memory KV stub before every test, inside the driver it
// is losing. A hook keeps that a property of the suite rather than something 31 tests each have
// to remember.
async function run(label, { beforeEach } = {}) {
  const t0 = Date.now();
  let passed = 0, failed = 0, ran = 0;
  for (const [name, fn] of registered) {
    ran++;
    try {
      if (beforeEach) await beforeEach();
      await fn();                       // AWAIT \u2014 a rejected promise lands in this catch
      passed++;
      console.log('  \u2713 ' + name);
    } catch (e) {
      failed++;
      console.log('  \u2717 ' + name + '\n      ' + ((e && e.message) || e));
    }
  }
  for (const name of duplicates) {
    failed++;
    console.log('  \u2717 DUPLICATE TEST NAME: ' + name
      + '\n      two tests share this name, so one of them is not being read as its own result');
  }
  // ZERO REGISTERED IS A FAILURE. A file that registers nothing has not passed; it has not run.
  if (!registered.length) {
    failed++;
    console.log('  \u2717 NO TESTS REGISTERED'
      + '\n      this file registered zero tests \u2014 a bad require, an early return, or a slip in a'
      + '\n      helper looks exactly like a suite with nothing to say');
  }
  // FOUR NUMBERS, because passed/total alone cannot tell "all passed" from "most never ran".
  const head = label ? label + ' \u2014 ' : '';
  console.log(`\n${head}${registered.length} registered, ${ran} run, ${passed} passed, ${failed} failed`
    + ` (${Date.now() - t0}ms)`);
  if (failed) process.exitCode = 1;
  return { registered: registered.length, ran, passed, failed };
}

// Exported for the runner's own test, which needs a clean slate between cases.
function _reset() { registered.length = 0; seen.clear(); duplicates.length = 0; }

module.exports = { test, run, _reset };
