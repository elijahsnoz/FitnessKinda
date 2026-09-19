/* Runs every Node-side suite. Browser tests live in tests/browser.mjs. */

const SUITES = ['./logic.test.mjs', './api.test.mjs', './security.test.mjs'];

const all = [];
for (const path of SUITES) {
  const { default: run } = await import(path);
  console.log(`\n▸ ${path.replace('./', '').replace('.test.mjs', '')}`);
  all.push(await run());
}

console.log('\n─────────────────────────────');
let failed = 0;
for (const r of all) {
  console.log(`${r.failed ? '✗' : '✓'} ${r.name.padEnd(10)} ${r.passed} passed${r.failed ? `, ${r.failed} FAILED` : ''}`);
  failed += r.failed;
}
const total = all.reduce((n, r) => n + r.passed, 0);
console.log(`─────────────────────────────\n${total} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
