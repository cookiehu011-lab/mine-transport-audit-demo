const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function app() {
  const c = vm.createContext({ window: {}, localStorage: { getItem: () => null }, cancelAnimationFrame() {}, clearTimeout() {}, setInterval() {}, requestAnimationFrame() {} });
  for (const f of ['src/data/trips.js', 'src/data/operations.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), c);
  vm.runInContext(fs.readFileSync('src/app.js', 'utf8').replace(/applyTheme\(\);\s*renderApp\(document.querySelector\("#app"\)\);\s*$/, ''), c);
  vm.runInContext('render = () => {};', c);
  return (s) => vm.runInContext(s, c);
}
test('video entry opens an isolated pending trip without changing settlement totals', () => {
  const run=app();run('startGuidedDemo({});');
  assert.equal(run('activeView'), 'workbench');assert.equal(run('selectedTripId'), 'T-0401-007');
  assert.equal(run('customerExperience.guided'), true);
  assert.equal(run('getStatus(sampleTrips.get("T-0401-007"))'), 'pending');
  assert.equal(run('getVerifiedNetTotal().toFixed(2)'), '107.70');
});
test('settlement step keeps the narrated pending trip visible as excluded', () => {
  const run=app();run('startGuidedDemo({}); showGuidedStep({}, 3);');
  assert.equal(run('activeView'),'settlement');
  assert.equal(run('getVerifiedTrips().some(t => t.id === "T-0401-007")'),false);
  assert.match(run('renderGuidedJourney()'), /T-0401-007/);
  assert.match(run('renderGuidedJourney()'), /未计入结算/);
});
test('only an explicit human review adds the narrated trip to settlement', () => {
  const run=app();run('startGuidedDemo({}); handleReview({}, "T-0401-007", "verified"); showGuidedStep({}, 3);');
  assert.equal(run('getVerifiedNetTotal().toFixed(2)'), '131.50');
  assert.equal(run('reviewStatuses["T-0401-007"]'),'pending');
  assert.match(run('renderGuidedJourney()'), /已计入结算/);
});
test('reset clears demo decisions and exit restores the previous selection and filters', () => {
  const run=app();run('selectedTripId="T-0401-003"; searchValues.audit="皮重"; startGuidedDemo({}); handleReview({}, "T-0401-007", "verified"); resetGuidedDemo({});');
  assert.equal(run('getVerifiedNetTotal().toFixed(2)'), '107.70');
  assert.equal(run('selectedTripId'),'T-0401-007');
  run('exitCustomerExperience({});');
  assert.equal(run('customerExperience'),null);assert.equal(run('selectedTripId'),'T-0401-003');
  assert.equal(run('searchValues.audit'),'皮重');
});
test('report step fills the sample question without submitting or changing review state', () => {
  const run=app();run('startGuidedDemo({}); showGuidedStep({}, 5);');
  assert.equal(run('activeView'),'ai');assert.match(run('chatDraft'),/本月/);
  assert.equal(run('chatQuestion'),'');assert.equal(run('getVerifiedTrips().length'),5);
});

test('exit restores query draft, analysis period and audit filter changed by the guide', () => {
  const run=app();run('chatDraft="原查询草稿"; analyticsPeriod="week"; auditFilter="verified"; startGuidedDemo({}); showGuidedStep({}, 4); showGuidedStep({}, 5); exitCustomerExperience({});');
  assert.equal(run('chatDraft'),'原查询草稿');assert.equal(run('analyticsPeriod'),'week');assert.equal(run('auditFilter'),'verified');
});

test('free navigation updates the guide step and does not show a false current step', () => {
  const run=app();run('startGuidedDemo({}); selectView({}, "analytics");');
  assert.match(run('renderGuidedJourney()'), /data-guide-step="4" aria-current="step"/);
  run('selectView({}, "vehicles");');
  assert.doesNotMatch(run('renderGuidedJourney()'),/aria-current="step"/);
});
