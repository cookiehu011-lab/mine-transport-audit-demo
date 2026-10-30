const dayKeys = Array.from({ length: 28 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 3, index + 1));
  return date.toISOString().slice(0, 10);
});

const dailyMetrics = dayKeys.map((date, index) => {
  const minedTons = 710 + ((index * 37) % 105);
  const verifiedTransportTons = minedTons - 18 - ((index * 11) % 24);
  const receivedUnloadTons = verifiedTransportTons - 9 - ((index * 7) % 16);
  return {
    date,
    minedTons,
    verifiedTransportTons,
    receivedUnloadTons,
    minedSource: "示例采装计量记录",
    transportSource: "人工核实通过趟次 · 示例扩展样例",
    unloadSource: "示例卸点接收磅单",
    sourceIds: { mining: `MINE-${date}`, transport: `TRANS-${date}`, unload: `UNLOAD-${date}` },
    miningArea: ["西采区", "东采区", "南采区"][index % 3],
    unloadPoint: ["原矿卸点1", "原矿卸点2", "毛料卸点"][index % 3],
  };
});

const vehicleBase = [
  { plate: "蒙A·12345", trips: 46, verifiedTons: 1008.4, averagePayload: 21.92, turnaroundMinutes: 52, suffix: "12345" },
  { plate: "蒙A·67890", trips: 42, verifiedTons: 926.7, averagePayload: 22.06, turnaroundMinutes: 56, suffix: "67890" },
  { plate: "晋B·13579", trips: 49, verifiedTons: 1073.1, averagePayload: 21.90, turnaroundMinutes: 48, suffix: "13579" },
  { plate: "晋B·24680", trips: 44, verifiedTons: 965.3, averagePayload: 21.94, turnaroundMinutes: 54, suffix: "24680" },
];
const vehiclePeriods = vehicleBase.flatMap((vehicle) => [
  { ...vehicle, periodKey: "week", periodLabel: "2026-03-26 至 2026-04-01", sourceRecordId: `VEHICLE-W14-${vehicle.suffix}` },
  { ...vehicle, periodKey: "month", periodLabel: "2026-04-01 至 2026-04-28", trips: vehicle.trips * 4, verifiedTons: Number((vehicle.verifiedTons * 4).toFixed(1)), turnaroundMinutes: vehicle.turnaroundMinutes + 2, sourceRecordId: `VEHICLE-APR-${vehicle.suffix}` },
]);

const sourceRecords = [
  ...dailyMetrics.flatMap((row) => [
    { id: row.sourceIds.mining, date: row.date, metric: "采矿量", value: row.minedTons, unit: "吨", source: row.minedSource, scope: "日期/采区扩展示例统计" },
    { id: row.sourceIds.transport, date: row.date, metric: "核实运输净重", value: row.verifiedTransportTons, unit: "吨", source: row.transportSource, scope: "人工核实通过趟次扩展示例汇总" },
    { id: row.sourceIds.unload, date: row.date, metric: "卸货接收量", value: row.receivedUnloadTons, unit: "吨", source: row.unloadSource, scope: "日期/卸点扩展示例统计" },
  ]),
  ...vehiclePeriods.map((vehicle) => ({ id: vehicle.sourceRecordId, date: vehicle.periodLabel, metric: "车辆周期运力", value: vehicle.verifiedTons, unit: "吨", source: "车辆周期运力扩展示例", scope: `${vehicle.plate} · ${vehicle.trips}趟` })),
];

function parseDemoCsv(text) {
  const input = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let cells = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else { cell += char; if (char === "\n") line += 1; }
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { cells.push(cell); cell = ""; }
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      cells.push(cell);
      if (cells.some((value) => value.trim())) rows.push({ lineNo: rowStart, cells });
      cells = [];
      cell = "";
      line += 1;
      rowStart = line;
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 存在未闭合的引号字段");
  cells.push(cell);
  if (cells.some((value) => value.trim())) rows.push({ lineNo: rowStart, cells });
  return rows;
}

function buildDemoFileReport(file) {
  const rows = file.rows?.length
    ? [
        ["行号", ...file.rows[0].cells],
        ["---", ...file.rows[0].cells.map(() => "---")],
        ...file.rows.map(({ lineNo, cells }) => [lineNo, ...cells]),
      ].map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|").replaceAll("\n", "<br>")).join(" | ")} |`).join("\n")
    : file.excerpt || "文件内容为空";
  return `# 文件整理报告\n\n文件：${file.name}\n\n来源：用户上传文件，独立于平台运营统计\n\n## 内容预览\n\n${rows}\n\n## 来源记录\n\n${file.type} 文件 · ${file.sourceRef}`;
}

window.operationsDemoData = {
  scopeLabel: "模拟回放 · 多周期示例数据",
  supportedFileTypes: [".csv", ".txt", ".md"],
  uploadedFilesJoinOperationalMetrics: false,
  dailyMetrics,
  sourceRecords,
  map: {
    locationLabel: "示例坐标 · 不代表矿区实际位置",
    center: [39.72, 109.83],
    zoom: 12,
    nodes: [
      { id: "pit-west", label: "西采区", type: "采区", x: 18, y: 30 },
      { id: "pit-east", label: "东采区", type: "采区", x: 73, y: 23 },
      { id: "pit-south", label: "南采区", type: "采区", x: 42, y: 77 },
      { id: "scale-a", label: "承重点1", type: "承重点", x: 39, y: 44 },
      { id: "scale-b", label: "承重点2", type: "承重点", x: 70, y: 63 },
      { id: "unload-a", label: "原矿卸点1", type: "卸货点", x: 81, y: 45 },
      { id: "unload-b", label: "原矿卸点2", type: "卸货点", x: 83, y: 79 },
    ],
    routes: [
      { id: "route-1", points: "18,30 30,35 39,44 58,40 68,37 81,45", tripId: "T-0401-007" },
      { id: "route-2", points: "73,23 61,30 49,35 39,44 57,49 70,63", tripId: "T-0401-003" },
      { id: "route-3", points: "42,77 53,68 70,63 77,54 81,45", tripId: "T-0401-001" },
      { id: "route-4", points: "18,30 28,37 39,44 55,52 70,63", tripId: "T-0401-002" },
    ],
    vehicles: [
      { plate: "晋B·24680", tripId: "T-0401-007", status: "满载运输", x: 61, y: 40, route: ["西采区", "承重点1", "原矿卸点1"], lastLocated: "2026-04-01 13:18", locationType: "simulated" },
      { plate: "蒙A·67890", tripId: "T-0401-003", status: "卸货等待", x: 70, y: 55, route: ["东采区", "承重点2", "原矿卸点2"], lastLocated: "2026-04-01 11:26", locationType: "simulated" },
      { plate: "蒙A·12345", tripId: "T-0401-001", status: "空车回场", x: 59, y: 69, route: ["南采区", "承重点1", "原矿卸点2"], lastLocated: "2026-04-01 08:41", locationType: "simulated" },
      { plate: "晋B·13579", tripId: "T-0401-002", status: "承重排队", x: 29, y: 38, route: ["西采区", "承重点1", "原矿卸点1"], lastLocated: "2026-04-01 09:10", locationType: "simulated" },
    ],
  },
  vehiclePeriods,
  chatExamples: [
    { intent: "daily-operation", resultType: "operation-summary", primaryAction: "open-audit", question: "今天运输和卸货情况怎么样？", answer: "当前样例范围内有 8 趟运输记录，其中 5 趟人工核实通过，核实净重 107.70 吨；3 趟仍待复核，暂不计入结算预览。卸货接收量来自独立的示例卸点磅单口径。", period: "2026-04-01 · 示例矿区", metric: "趟次状态 / 核实运输净重 / 卸货接收量", sources: ["运输趟次台账 · 8条", "人工复核状态 · 会话演示数据"], sourceTripIds: ["T-0401-001", "T-0401-002", "T-0401-003", "T-0401-007"], sourceRecordIds: ["MINE-2026-04-01", "TRANS-2026-04-01", "UNLOAD-2026-04-01"] },
    { intent: "vehicle-capacity", resultType: "vehicle-capacity", primaryAction: "open-vehicle", question: "晋B·24680 近一周运力如何？", answer: "扩展示例中该车近一周有效趟次 44 趟，核实运输净重 965.30 吨，平均载重 21.94 吨，平均周转 54 分钟。现有样例没有额定载荷和可运营时长，不能计算利用率。", period: "2026-03-26 至 2026-04-01 · 周", metric: "有效趟数 / 核实净重 / 平均载重 / 周转时长", sources: ["车辆周期运力汇总 · 扩展示例"], sourceRecordIds: ["VEHICLE-W14-24680"], plate: "晋B·24680" },
    { intent: "vehicle-month-capacity", resultType: "vehicle-capacity", primaryAction: "open-vehicle", question: "晋B·24680 本月运力如何？", answer: "扩展示例中该车本月有效趟次 176 趟、核实运输净重 3,861.2 吨，平均载重 21.94 吨，平均周转 56 分钟。现有样例没有额定载荷和可运营时长，不能计算利用率。", period: "2026-04-01 至 2026-04-28 · 月", metric: "有效趟数 / 核实净重 / 平均载重 / 周转时长", sources: ["车辆周期运力汇总 · 扩展示例"], sourceRecordIds: ["VEHICLE-APR-24680"], plate: "晋B·24680" },
    { intent: "production-trend", resultType: "production-trend", primaryAction: "open-source", question: "本月各采区采矿量趋势如何？", answer: "本月采区采装计量按独立示例记录汇总。采矿量来源为采装作业计量，不以运输净重替代；点选日期可查看对应来源范围。", period: "2026-04-01 至 2026-04-28 · 月", metric: "采区采装计量 · 示例吨", sources: ["采装计量日汇总 · 28条扩展示例"], sourceRecordIds: dailyMetrics.map((row) => row.sourceIds.mining) },
    { intent: "unload-trend", resultType: "unload-trend", primaryAction: "open-source", question: "各卸点每天接收量是多少？", answer: "卸货接收量按卸点接收磅单示例单独统计。与核实运输净重的差异可能涉及水分、残料、计量时点或关联缺失；当前演示不据差值直接判断损耗。", period: "2026-04-01 至 2026-04-28 · 月", metric: "卸点接收磅单 · 示例吨", sources: ["卸点接收日汇总 · 28条扩展示例"], sourceRecordIds: dailyMetrics.map((row) => row.sourceIds.unload) },
    { intent: "anomaly-review", resultType: "anomaly-list", primaryAction: "open-audit", question: "AI发现的异常有哪些？", answer: "当前有路线卸点不一致和皮重波动两类待复核线索。它们只提示人工核对计划、卸货记录、影像和称重历史，不等于作弊结论。", period: "2026-04-01 · 当前演示会话", metric: "待复核线索 · 人工状态优先", sources: ["路线与卸货记录对照", "车辆皮重历史记录", "运输称重与示例影像"], sourceTripIds: ["T-0401-001", "T-0401-003", "T-0401-007"] },
    { intent: "report", resultType: "report-preview", primaryAction: "generate-report", question: "生成上周车辆运力与卸货趋势报告。", answer: "报告将分列车辆有效趟次、核实运输净重、平均载重、周转时长及卸点接收趋势，并附指标口径和关联来源。", period: "2026-03-26 至 2026-04-01 · 周", metric: "车辆周期运力 / 卸点接收", sources: ["车辆运力与卸点接收 · 扩展示例汇总"], sourceRecordIds: ["VEHICLE-W14-24680", "UNLOAD-2026-04-01"] },
  ],
};
window.parseDemoCsv = parseDemoCsv;
window.buildDemoFileReport = buildDemoFileReport;
