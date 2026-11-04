const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('src/data/trips.js', 'utf8'), context);
vm.runInNewContext(fs.readFileSync('src/data/operations.js', 'utf8'), context);
const data = context.window.operationsDemoData;

test('keeps production, verified transport and unloading quantities independently sourced', () => {
  assert.ok(data.dailyMetrics.length >= 14);
  for (const row of data.dailyMetrics) {
    assert.notEqual(row.minedSource, row.transportSource);
    assert.notEqual(row.transportSource, row.unloadSource);
    assert.equal(typeof row.minedTons, 'number');
    assert.equal(typeof row.verifiedTransportTons, 'number');
    assert.equal(typeof row.receivedUnloadTons, 'number');
    assert.ok(row.sourceIds.mining && row.sourceIds.transport && row.sourceIds.unload);
  }
  assert.equal(new Set(data.dailyMetrics.flatMap((row) => Object.values(row.sourceIds))).size, data.dailyMetrics.length * 3);
});

test('uses explicit synthetic location and route replay labels for all map vehicles', () => {
  assert.ok(data.map.vehicles.length >= 4);
  for (const vehicle of data.map.vehicles) {
    assert.ok(vehicle.plate);
    assert.ok(vehicle.tripId);
    assert.ok(vehicle.route.length >= 2);
    assert.ok(vehicle.lastLocated);
    assert.equal(vehicle.locationType, 'simulated');
  }
  assert.equal(data.map.locationLabel, '示例坐标 · 不代表矿区实际位置');
});

test('provides independently sourced week and month vehicle capacity summaries', () => {
  for (const periodKey of ['week', 'month']) {
    const rows = data.vehiclePeriods.filter((row) => row.periodKey === periodKey);
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.ok(row.sourceRecordId);
      assert.ok(Math.abs(row.trips * row.averagePayload - row.verifiedTons) < 1.5);
    }
  }
  assert.equal(data.vehiclePeriods.find((row) => row.periodKey === 'week').periodLabel, '2026-04-22 至 2026-04-28');
  assert.equal(data.chatExamples.find((item) => item.intent === 'vehicle-capacity').sourceRecordIds[0], 'VEHICLE-W17-24680');
});

test('covers distinct chat intents with source-linked answers and report actions', () => {
  assert.ok(data.chatExamples.length >= 5);
  assert.ok(data.chatExamples.some((item) => item.intent === 'vehicle-capacity'));
  assert.ok(data.chatExamples.some((item) => item.intent === 'production-trend'));
  assert.ok(data.chatExamples.some((item) => item.intent === 'unload-trend'));
  for (const item of data.chatExamples) {
    assert.ok(item.question);
    assert.ok(item.answer);
    assert.ok(item.sources.length);
    assert.ok(item.sourceTripIds?.length || item.sourceRecordIds?.length);
    for (const id of item.sourceTripIds || []) assert.ok(context.window.seedTrips.some((trip) => trip.id === id), `missing trip ${id}`);
    for (const id of item.sourceRecordIds || []) assert.ok(data.sourceRecords.some((record) => record.id === id), `missing source record ${id}`);
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(data.chatExamples.map(({ intent, resultType, primaryAction }) => [intent, resultType, primaryAction]))),
    [
      ['daily-operation', 'operation-summary', 'open-audit'],
      ['vehicle-capacity', 'vehicle-capacity', 'open-vehicle'],
      ['vehicle-month-capacity', 'vehicle-capacity', 'open-vehicle'],
      ['production-trend', 'production-trend', 'open-source'],
      ['unload-trend', 'unload-trend', 'open-source'],
      ['anomaly-review', 'anomaly-list', 'open-audit'],
      ['report', 'report-preview', 'generate-report'],
    ],
  );
  assert.equal(data.chatExamples.filter((item) => item.primaryAction === 'generate-report').length, 1);
});

test('builds the operations report prompt from the full monthly sample window', () => {
  const report = data.chatExamples.find((item) => item.intent === 'report');
  assert.match(report.question, /本月/);
  assert.match(report.period, /2026-04-01 至 2026-04-28/);
  assert.equal(data.dailyMetrics.length, 28);
  for (const row of data.dailyMetrics) {
    for (const id of Object.values(row.sourceIds)) assert.ok(report.sourceRecordIds.includes(id));
  }
  assert.equal(report.sourceRecordIds.filter((id) => id.startsWith('VEHICLE-APR-')).length, 4);
});

test('keeps supported file types explicit and uploaded files separate from platform totals', () => {
  assert.deepEqual(Array.from(data.supportedFileTypes), ['.csv', '.txt', '.md']);
  assert.equal(data.uploadedFilesJoinOperationalMetrics, false);
});

test('parses quoted CSV cells, escaped quotes, embedded commas and line numbers', () => {
  const rows = context.window.parseDemoCsv('\uFEFF日期,备注,车辆\r\n2026-04-01,"采区,东侧","车""A"""\r\n');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { lineNo: 1, cells: ['日期', '备注', '车辆'] },
    { lineNo: 2, cells: ['2026-04-01', '采区,东侧', '车"A"'] },
  ]);
});

test('rejects CSV with an unclosed quoted field', () => {
  assert.throws(() => context.window.parseDemoCsv('a,b\n1,"未闭合'), /未闭合的引号/);
});

test('builds uploaded CSV reports with the parsed preview rows and source reference', () => {
  const report = context.window.buildDemoFileReport({
    name: 'sample.csv',
    type: 'CSV',
    excerpt: 'CSV表格预览见下方',
    sourceRef: '第1–2行（含表头）',
    rows: [
      { lineNo: 1, cells: ['日期', '采区', '采矿量吨'] },
      { lineNo: 2, cells: ['2026-04-28', '西采区', '764'] },
    ],
  });
  assert.match(report, /\| 行号 \| 日期 \| 采区 \| 采矿量吨 \|/);
  assert.match(report, /\| 2 \| 2026-04-28 \| 西采区 \| 764 \|/);
  assert.match(report, /第1–2行（含表头）/);
  assert.doesNotMatch(report, /CSV表格预览见下方/);
});

test('loads operations data and app scripts in one browser global scope', () => {
  const operationsSource = fs.readFileSync('src/data/operations.js', 'utf8');
  const appSource = fs.readFileSync('src/app.js', 'utf8');
  assert.doesNotThrow(() => new vm.Script(`${operationsSource}\n${appSource}`));
});

test('routes every sample question to its own intent', () => {
  // 曾出现「今天运输和卸货」被判成卸点趋势：今日汇总须先于卸点关键词判断
  const appSource = fs.readFileSync('src/app.js', 'utf8');
  const start = appSource.indexOf('function matchChatIntent');
  const end = appSource.indexOf('\n}\n', start) + 2;
  const sandbox = {};
  vm.runInNewContext(`${appSource.slice(start, end)}\nthis.matchChatIntent = matchChatIntent;`, sandbox);
  for (const example of data.chatExamples) {
    assert.equal(sandbox.matchChatIntent(example.question), example.intent, example.question);
  }
});
