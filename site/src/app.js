const { getNetWeight, seedTrips, vehicleTareChecks } = window;
const operationsData = window.operationsDemoData;
const parseCsvFile = window.parseDemoCsv;
const buildFileReport = window.buildDemoFileReport;

const navGroups = [
  { label: "监控", items: [{ id: "workbench", label: "运营驾驶舱", icon: "workbench" }] },
  { label: "业务", items: [{ id: "audit", label: "运输稽核", icon: "audit" }, { id: "vehicles", label: "车辆档案", icon: "vehicles" }, { id: "settlement", label: "结算预览", icon: "settlement" }] },
  { label: "数据", items: [{ id: "analytics", label: "生产与运力分析", icon: "analytics" }, { id: "ai", label: "AI工作台", icon: "ai" }] },
];
const navItems = navGroups.flatMap((group) => group.items);

const statusLabels = {
  pending: "待复核",
  verified: "核实通过",
  confirmedAnomaly: "确认存在异常",
};

const sampleTrips = new Map(seedTrips.map((trip) => [trip.id, trip]));
const reviewStatuses = Object.fromEntries(
  seedTrips.map((trip) => [trip.id, trip.reviewStatus]),
);
const followUpCases = Object.fromEntries(
  seedTrips.map((trip) => [trip.id, { type: "", progress: "", reason: "", requiredInfo: "", supplement: "", handling: "" }]),
);
let customerExperience = null;
const plates = [...new Set(seedTrips.map((trip) => trip.plate))];
const searchValues = { audit: "", vehicles: "", settlement: "", analytics: "" };
let analyticsPeriod = "week";
let analyticsDate = operationsData.dailyMetrics.at(-1).date;
let selectedChat = null;
let aiDockView = "hidden";
let auditFilter = "all";
let chatQuestion = "";
let chatDraft = "";
let chatAnswer = null;
let chatState = "complete";
let chatStreamText = "";
let chatStreamTimer = null;
let chatQueryId = 0;
let reports = [];
let pendingUpload = null;
let fileReports = [];
let selectedSourceId = null;
let vehicleReturnView = "workbench";
let detailReturnView = "workbench";
let replayPlaying = false;
let replayProgress = 0.62;
let replayFrame = null;
let cockpitSelected = new Set(["晋B·24680", "蒙A·67890"]);
const cockpitHidden = new Set();
let cockpitZoom = 1;
let cockpitPan = { x: 0, y: 0 };
let anomalyHideTimer = null;
let anomalyAutoHideDone = false;
let cockpitDevTab = "vehicle";
let cockpitCamera = null;
let cockpitGeometry = null;
let cockpitObserver = null;
let sidebarCollapsed = false;
let contextEntry = false;
let theme = readStoredTheme();
let monitorModalOpen = false;
let monitorMode = "live";
let monitorReplay = null;
let reportPreview = null;

let activeView = "workbench";
let selectedTripId = "T-0401-007";
let selectedVehiclePlate = "蒙A·67890";
let eventCursor = 0;
let notice = "";
let workflowForm = null;
let aiFeedback = {}; // tripId -> { vote: "accurate" | "inaccurate", reason }
let feedbackOpenTripId = null;

function readStoredTheme() {
  try {
    return localStorage.getItem("mine-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#050b18" : "#f3f6fb");
}

const formatWeight = (value) => Number(value).toFixed(2);
const timeToMinutes = (value) => value.split(":").map(Number).reduce((hours, part) => hours * 60 + part);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const getReviewStatuses = () => customerExperience?.reviewStatuses ?? reviewStatuses;
const getFollowUpCases = () => customerExperience?.followUpCases ?? followUpCases;
const getStatus = (trip) => getReviewStatuses()[trip.id];
const getFollowUp = (trip) => getFollowUpCases()[trip.id];
const getUnresolvedTrips = () =>
  seedTrips.filter((trip) => getStatus(trip) === "pending");
const getVerifiedTrips = () =>
  seedTrips.filter((trip) => getStatus(trip) === "verified");
const getOpenAnomalies = () =>
  seedTrips.filter((trip) => trip.issue && getStatus(trip) === "pending");
const getOpenFollowUps = () =>
  seedTrips.filter((trip) => getStatus(trip) === "confirmedAnomaly" && getFollowUp(trip).progress !== "completed");
const getVerifiedNetTotal = () =>
  getVerifiedTrips().reduce((sum, trip) => sum + getNetWeight(trip), 0);

const iconPaths = {
  workbench: '<path d="M3 14a9 9 0 0 1 18 0"/><path d="m12 14 4-4"/><circle cx="12" cy="14" r="1.4"/><path d="M5 19h14"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/>',
  scale: '<path d="M4 18h16"/><rect x="6" y="11" width="12" height="7" rx="1"/><path d="M12 11V5M9 5h6"/>',
  alert: '<path d="M12 3 22 21H2z"/><path d="M12 10v5M12 18v.5"/>',
  pick: '<path d="M14 4c3 0 6 2 7 5-3-1-6-1-9 1"/><path d="M13 9 4 20"/>',
  unload: '<path d="M4 14h16l-2 6H6z"/><path d="M12 3v8M8 7l4 4 4-4"/>',
  camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  fold: '<path d="M4 6h16M4 12h10M4 18h16"/><path d="m20 9-3 3 3 3"/>',
  unfold: '<path d="M4 6h16M10 12h10M4 18h16"/><path d="m4 9 3 3-3 3"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  audit: '<path d="M5 4.75h10l3 3v11.5H5z"/><path d="M14.75 4.75v3.5h3.5M8 12h7M8 15.5h5"/>',
  vehicles: '<path d="M3 7h12l3 5v6H3z"/><path d="M18 12h3v5h-3M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
  settlement: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  analytics: '<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-6"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="11" r="1"/><circle cx="15" cy="13" r="1"/>',
  ai: '<path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M5.6 18.4l2.1-2.1M12 18v3M18.4 18.4l-2.1-2.1M18 12h3M18.4 5.6l-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
  location: '<path d="M20 10.2c0 5.1-8 11-8 11s-8-5.9-8-11a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/>',
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
}

function renderNav() {
  return `
    <aside class="side-nav" aria-label="主导航">
      ${navGroups.map((group) => `
        <div class="nav-group">${group.label}</div>
        ${group.items.map((item) => `
          <button class="nav-item ${activeView === item.id ? "active" : ""}" data-view="${item.id}" title="${item.label}" ${activeView === item.id ? 'aria-current="page"' : ""}>
            ${icon(item.icon)}<span class="nav-label">${item.label}</span>
            ${item.id === "audit" ? `<span class="nav-count">${getUnresolvedTrips().length}</span>` : ""}
          </button>
        `).join("")}
      `).join("")}
      <button class="nav-fold" data-toggle-sidebar title="${sidebarCollapsed ? "展开" : "收起"}" aria-label="${sidebarCollapsed ? "展开侧栏" : "收起侧栏"}">${icon(sidebarCollapsed ? "chevronRight" : "chevronLeft")}</button>
    </aside>
  `;
}

function renderSearch(view, placeholder) {
  const value = searchValues[view];
  return `
    <label class="module-search">
      ${icon("search")}
      <input type="search" data-search-for="${view}" aria-label="${placeholder}" placeholder="${placeholder}" value="${value}" autocomplete="off" />
    </label>
  `;
}

iconPaths.search = '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.3 4.3"/>';

function statusPill(status) {
  return `<span class="tag ${statusTone(status)}">${statusLabels[status]}</span>`;
}

function matchesTrip(trip, value, fields) {
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field(trip) ?? "").toLocaleLowerCase().includes(needle));
}

function renderPageHeader(title, subtitle = "", actions = "") {
  return `<header class="page-head"><div><h1>${title}<span class="tag muted">示例数据</span></h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
}

function renderContextBack(view, label) {
  // 从左侧导航直接进入车辆档案/结算预览时没有来源页，不显示返回
  if (!contextEntry) return "";
  return `<button class="back-link" data-back-context="${view}">‹ 返回${label}</button>`;
}

const viewLabels = { workbench: "运营驾驶舱", audit: "运输稽核", analytics: "生产与运力分析", ai: "AI工作台", vehicles: "车辆档案", settlement: "结算预览" };

function renderCustomerExperience() {
  const steps = [
    { id: "discovery", title: "发现异常", detail: "驾驶舱集中展示待核查趟次和 AI 异常线索。", action: "进入驾驶舱", view: "workbench", evidence: "T-0401-007 · 卸货点不一致" },
    { id: "evidence", title: "核对证据", detail: "在同一趟详情比对计划路线、实际卸货、完整车辆影像和毛重、皮重、净重。", action: "查看 T-0401-007", view: "audit", tripId: "T-0401-007", evidence: "路线 · 影像 · 称重" },
    { id: "decision", title: "人工处置", detail: "由人工选择核实通过、退回补充或确认异常；AI 不代替结论。", action: "进行人工复核", view: "audit", tripId: "T-0401-007", evidence: "复核结论与处置进度分开" },
    { id: "archive", title: "沉淀车辆档案", detail: "确认异常后，在对应车牌档案查看原因和处置进展。", action: "查看晋B·24680", view: "vehicles", plate: "晋B·24680", evidence: "同一趟记录 · 异常闭环" },
    { id: "settlement", title: "联动结算", detail: "只有人工核实通过计入净重；待复核和确认异常不计入。", action: "查看结算预览", view: "settlement", tripId: "T-0401-002", evidence: "AI建议通过 · 人工核实通过" },
  ];
  const ratings = Object.values(customerExperience.assessments);
  const reviewedCount = ratings.length;
  const visitedCount = Object.values(customerExperience.visited).filter(Boolean).length;
  return `
    <main class="customer-experience">
      <header class="customer-header"><div><span class="customer-mark">矿</span><span>客户能力验收体验</span></div><div><button class="text-button" data-open-guide>▷ 演示导览</button><button class="text-button" data-exit-customer>退出体验</button></div></header>
      <section class="customer-persona"><span class="eyebrow">矿山运营 / 计量结算负责人</span><h1>一趟运输，从异常发现到结算</h1><p>按同一趟示例记录，体验 AI 提示、证据核对、人工处置和跨模块联动。</p><div class="customer-demo-boundary"><span>本地示例数据</span><span>AI规则模拟</span><span>体验操作退出后重置</span></div></section>
      <section class="customer-journey"><div class="section-heading"><h2>能力验收路径</h2><span>已体验 ${visitedCount} / ${steps.length} · 已评价 ${reviewedCount} / ${steps.length}</span></div>
        ${steps.map((step, index) => `<article class="journey-step ${customerExperience.visited[step.id] ? "visited" : ""}"><div class="journey-step-number">0${index + 1}</div><div class="journey-step-body"><div class="journey-step-head"><strong>${step.title}</strong><span>${step.evidence}</span></div><p>${step.detail}</p><div class="journey-step-actions"><button class="button secondary" data-customer-view="${step.view}" data-customer-stage="${step.id}" ${step.tripId ? `data-customer-trip="${step.tripId}"` : ""} ${step.plate ? `data-customer-plate="${step.plate}"` : ""}>${step.action}</button><div class="journey-rating" aria-label="客户自评 ${step.title}">${["符合", "需调整", "不符合"].map((value) => `<button class="rating-option ${customerExperience.assessments[step.id] === value ? "selected" : ""}" data-customer-rating="${step.id}" data-rating-value="${value}" aria-pressed="${customerExperience.assessments[step.id] === value}">${value}</button>`).join("")}</div></div></div><span class="journey-visited">${customerExperience.visited[step.id] ? "已体验" : "待体验"}</span></article>`).join("")}
      </section>
      <div class="customer-free-browse"><span>也可自由查看其他示例</span><button class="text-button" data-customer-view="audit" data-customer-stage="evidence" data-customer-trip="T-0401-003">皮重异常 ›</button><button class="text-button" data-customer-trip="T-0401-002">AI建议通过 ›</button></div>
      <p class="customer-boundary">此处确认的是 Demo 展示的能力，不等于正式系统现场验收。影像、数据及 AI 结论均为示例；真实部署范围按项目约定。</p>
    </main>
  `;
}

// ---------- 运营驾驶舱 ----------
// 地图为露天矿影像上的示意叠加：节点、路线和车辆位置来自 operationsData.map 的百分比坐标，按舞台尺寸换算成像素。
const cockpitStageProgress = { 承重排队: 20, 满载运输: 55, 卸货等待: 75, 空车回场: 90 };
const cockpitLayers = [
  { key: "vehicles", label: "车辆", icon: "vehicles" },
  { key: "routes", label: "路线", icon: "route" },
  { key: "scales", label: "地磅", icon: "scale" },
  { key: "anomaly", label: "异常", icon: "alert" },
];
const cockpitNodeTypes = { 采区: ["pit", "pick"], 承重点: ["scale", "scale"], 卸货点: ["unload", "unload"] };
const replayStartMinutes = timeToMinutes("08:05");
const replayEndMinutes = timeToMinutes("14:52");
const replayBaseProgress = 0.62;

function renderRing(percent, size, tone, label = `${Math.round(percent)}%`) {
  const radius = size / 2 - 3.5;
  const length = 2 * Math.PI * radius;
  return `<span class="ring ring-${tone}" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" aria-hidden="true"><circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}"/><circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-dasharray="${length * percent / 100} ${length}"/></svg><b style="font-size:${size > 50 ? 14 : 11}px">${label}</b></span>`;
}

function cockpitStations() {
  const stations = {};
  seedTrips.forEach((trip) => {
    [[trip.grossStation, "重车过磅", trip.times.gross], [trip.tareStation, "空车回皮", trip.times.tare]].forEach(([station, kind, time]) => {
      const name = station.replace("（示例）", "");
      const entry = (stations[name] ||= { name, kind, count: 0, last: "" });
      entry.count += 1;
      if (time > entry.last) entry.last = time;
    });
  });
  return Object.values(stations).sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

function statusTone(status) {
  return { verified: "ok", pending: "warn", confirmedAnomaly: "danger" }[status];
}

function renderCockpitKpis() {
  const verified = getVerifiedTrips();
  const minedTons = operationsData.dailyMetrics.reduce((sum, row) => sum + row.minedTons, 0);
  const cards = [
    { tone: "blue", icon: "vehicles", title: "今日运输趟次", value: `${verified.length}<small>/${seedTrips.length}</small>`, foot: "核实通过 / 今日总趟次", view: "audit" },
    { tone: "violet", icon: "scale", title: "核实运输净重", value: `${formatWeight(getVerifiedNetTotal())}<small>吨</small>`, foot: "仅人工核实通过计入", view: "settlement" },
    { tone: "amber", icon: "alert", title: "待复核 AI 线索", value: `${getOpenAnomalies().length}<small>条</small>`, foot: "AI 提示，待人工复核", view: "audit" },
    { tone: "teal", icon: "pick", title: "本月采矿量", value: `${(minedTons / 10000).toFixed(2)}<small>万吨</small>`, foot: "28 天扩展示例", view: "analytics" },
  ];
  return cards.map((card) => `<button class="kpi-card" data-view="${card.view}"><span class="kpi-icon tone-${card.tone}"><span>${icon(card.icon)}</span></span><span class="kpi-body"><span class="kpi-title">${card.title}</span><strong class="kpi-value">${card.value}</strong><span class="kpi-foot tone-${card.tone}">${card.foot}</span></span></button>`).join("");
}

function renderCockpitTrips() {
  const order = { pending: 0, confirmedAnomaly: 1, verified: 2 };
  const trips = [...seedTrips].sort((a, b) => order[getStatus(a)] - order[getStatus(b)] || b.times.gross.localeCompare(a.times.gross));
  const count = (status) => seedTrips.filter((trip) => getStatus(trip) === status).length;
  return `<div class="panel-head"><h2>运输关键指标</h2><span class="tag blue">今日 · 模拟</span></div>
    <div class="cockpit-stats"><div><b class="tone-text-blue">${seedTrips.length}</b><span>今日趟次</span></div><div><b class="tone-text-ok">${count("verified")}</b><span>核实通过</span></div><div><b class="tone-text-warn">${count("pending")}</b><span>待复核</span></div><div><b class="tone-text-danger">${count("confirmedAnomaly")}</b><span>确认异常</span></div></div>
    <div class="list">${trips.map((trip) => `<button class="list-row cockpit-row" data-open-trip="${trip.id}"><span class="row-icon">${icon("vehicles")}</span><span class="row-main"><strong>${trip.id} · ${trip.plate}</strong><small><i class="dot ${statusTone(getStatus(trip))}"></i>${trip.issue && getStatus(trip) === "pending" ? trip.issue : statusLabels[getStatus(trip)]} · 净重 ${formatWeight(getNetWeight(trip))}t</small></span><span title="AI 置信度">${renderRing(trip.confidence, 44, getStatus(trip) === "verified" ? "ok" : "warn")}</span></button>`).join("")}</div>`;
}

function renderCockpitClues() {
  const clues = seedTrips.filter((trip) => trip.issue);
  const open = getOpenAnomalies();
  const distribution = [
    { label: "建议通过", count: seedTrips.filter((trip) => !trip.issue).length, tone: "ok" },
    { label: "卸点不一致", count: clues.filter((trip) => trip.issue === "卸货点不一致").length, tone: "danger" },
    { label: "皮重波动", count: clues.filter((trip) => trip.issue === "皮重波动异常").length, tone: "warn" },
  ];
  const max = Math.max(...distribution.map((item) => item.count), 1);
  return `<div class="panel-head"><h2>AI 稽核线索</h2><span class="tag warn">只是建议 · 人工定论</span></div>
    <div class="clue-top"><div class="clue-kpis"><div><b class="tone-text-warn">${open.length}</b><span>待复核线索</span></div><div><b class="tone-text-danger">${open.filter((trip) => trip.confidence >= 80).length}</b><span>高置信 ≥80%</span></div></div>
      <div class="clue-dist"><span>今日 AI 研判分布（${seedTrips.length} 趟）</span><div class="clue-bars">${distribution.map((item) => `<div class="clue-bar"><b>${item.count}</b><span class="clue-bar-stack">${Array.from({ length: Math.max(1, Math.round(item.count / max * 10)) }, () => `<i class="tone-bg-${item.tone}"></i>`).join("")}</span>${item.label}</div>`).join("")}</div></div></div>
    <div class="list">${clues.length ? clues.map((trip) => `<button class="list-row cockpit-row clue-row" data-open-trip="${trip.id}"><i class="dot ${getStatus(trip) === "pending" ? (trip.issue === "卸货点不一致" ? "danger" : "warn") : statusTone(getStatus(trip))}"></i><span class="row-main"><strong>${trip.issue} – ${trip.id}</strong><small>置信度 ${trip.confidence}% · ${trip.plate} · ${getStatus(trip) === "pending" ? (trip.issue === "卸货点不一致" ? `实际 ${trip.unloadRecord}` : `皮重 ${trip.tareWeight}t / 均值 ${trip.tareMean}t`) : statusLabels[getStatus(trip)]}</small></span><span class="row-side">${trip.times.unload}</span></button>`).join("") : '<div class="empty-state">当前没有 AI 线索</div>'}</div>`;
}

function renderCockpitDevices() {
  const rows = cockpitDevTab === "vehicle"
    ? plates.map((plate) => {
        const own = seedTrips.filter((trip) => trip.plate === plate);
        const verifiedCount = own.filter((trip) => getStatus(trip) === "verified").length;
        const mapVehicle = operationsData.map.vehicles.find((vehicle) => vehicle.plate === plate);
        const hasClue = own.some((trip) => trip.issue && getStatus(trip) === "pending");
        return `<button class="list-row cockpit-row ${cockpitSelected.has(plate) ? "active" : ""}" data-cockpit-vehicle="${plate}" aria-pressed="${cockpitSelected.has(plate)}"><span class="row-icon">${icon("vehicles")}</span><span class="row-main"><strong>${plate}</strong><small><i class="dot ${hasClue ? "warn" : "ok"}"></i>${mapVehicle?.status || "—"}${hasClue ? " · 有待复核线索" : ""}</small></span><span title="核实通过 / 今日趟次">${renderRing(verifiedCount / own.length * 100, 44, hasClue ? "warn" : "blue", `${verifiedCount}/${own.length}`)}</span></button>`;
      })
    : cockpitStations().map((station) => `<div class="list-row cockpit-row"><span class="row-icon">${icon("scale")}</span><span class="row-main"><strong>${station.name}</strong><small><i class="dot blue"></i>${station.kind} · 最近 ${station.last}</small></span><span class="row-side"><b>${station.count}</b> 次</span></div>`);
  return `<div class="panel-head"><h2>车辆与地磅状态</h2><span class="tag blue">${plates.length} 车 · 模拟定位</span></div>
    <div class="device-tabs"><button class="${cockpitDevTab === "vehicle" ? "selected" : ""}" data-cockpit-devtab="vehicle">${icon("vehicles")}车辆</button><button class="${cockpitDevTab === "scale" ? "selected" : ""}" data-cockpit-devtab="scale">${icon("scale")}地磅</button></div>
    <div class="list">${rows.join("")}</div>`;
}

function renderCockpitVideo() {
  const cameras = cockpitStations().map((station) => station.name).concat(["原矿卸点1", "原矿卸点2"]);
  cockpitCamera ||= cameras[0];
  const trip = sampleTrips.get("T-0401-007");
  return `<div class="panel-head"><h2>视频监控</h2><span class="tag warn">模拟画面</span></div>
    <div class="cockpit-video"><video src="./public/videos/cctv-demo.mp4" autoplay muted loop playsinline></video><span class="cockpit-video-badge"><i></i>模拟 · 未接现场摄像头</span><span class="cockpit-video-osd" data-cockpit-osd>2026-04-01 ${trip.times.gross}:00</span></div>
    <div class="cockpit-video-caption">${icon("camera")}<span data-cockpit-caption>${cockpitCamera === cameras[0] ? `${cockpitCamera} · ${trip.plate} · ${trip.id} 重车过磅` : `${cockpitCamera} · 模拟画面（接入后按趟次联动）`}</span></div>
    <div class="cockpit-video-actions"><select class="cockpit-select" data-cockpit-camera aria-label="选择摄像头">${cameras.map((name) => `<option ${name === cockpitCamera ? "selected" : ""}>${name}</option>`).join("")}</select><button class="glass-button" data-open-monitor="${trip.id}">${icon("camera")}查看回放</button></div>`;
}

function renderCockpit() {
  return `
    <div class="cockpit ${[...cockpitHidden].map((key) => `hide-${key}`).join(" ")}">
      <section class="cockpit-stage" data-cockpit-stage>
        <div class="map-viewport" data-cockpit-viewport>
          <div class="cockpit-image"></div>
          <svg class="cockpit-svg" data-cockpit-svg aria-hidden="true"></svg>
          <div class="cockpit-layer layer-nodes" data-cockpit-nodes></div>
          <div class="cockpit-layer layer-vehicles" data-cockpit-vehicles></div>
          <div class="cockpit-layer layer-cards" data-cockpit-cards></div>
          <div class="cockpit-layer layer-tags" data-cockpit-tags></div>
        </div>
        <div class="cockpit-tint"></div>
        <div class="cockpit-title"><svg viewBox="0 0 640 64" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="cockpit-title-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E4FA8" stop-opacity=".95"/><stop offset=".55" stop-color="#1B2A5F" stop-opacity=".92"/><stop offset="1" stop-color="#0A1128" stop-opacity=".78"/></linearGradient><linearGradient id="cockpit-title-edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4F8DFF" stop-opacity="0"/><stop offset=".16" stop-color="#4F8DFF"/><stop offset=".5" stop-color="#EAF2FF"/><stop offset=".84" stop-color="#4F8DFF"/><stop offset="1" stop-color="#4F8DFF" stop-opacity="0"/></linearGradient></defs><path class="cockpit-title-fill" d="M0 0H640L590 54H50Z"/><path class="cockpit-title-topline" d="M0 1.4H640"/><path class="cockpit-title-line" d="M28 10 64 50H576L612 10"/></svg><h1>矿山运营驾驶舱</h1></div>
        <div class="cockpit-subtitle"><span class="sim-pill">模拟回放</span><span>2026-04-01 · ${operationsData.map.locationLabel}</span></div>
        <button class="glass-button cockpit-fullscreen" data-cockpit-fullscreen>${icon("fullscreen")}全屏显示</button>
        <div class="cockpit-kpis">${renderCockpitKpis()}</div>
        <div class="map-zoom" role="group" aria-label="地图缩放"><button data-cockpit-zoom="in" aria-label="放大">＋</button><button data-cockpit-zoom="out" aria-label="缩小">－</button><button data-cockpit-zoom="reset" aria-label="重置缩放">重置</button></div>
        <div class="cockpit-layer-buttons">${cockpitLayers.map((layer) => `<button class="${cockpitHidden.has(layer.key) ? "" : "selected"}" data-cockpit-layer="${layer.key}" aria-pressed="${!cockpitHidden.has(layer.key)}">${icon(layer.icon)}${layer.label}</button>`).join("")}</div>
        <div class="cockpit-replay"><button class="cockpit-play" data-replay-toggle aria-label="${replayPlaying ? "暂停回放" : "播放回放"}"></button><span class="cockpit-clock" data-replay-clock></span><div class="cockpit-track" data-replay-track><i data-replay-fill></i><b data-replay-knob></b></div><span class="cockpit-replay-range">08:05 — 14:52 · 模拟</span></div>
      </section>
      <section class="cockpit-panels">
        <article class="panel cockpit-panel">${renderCockpitTrips()}</article>
        <article class="panel cockpit-panel">${renderCockpitClues()}</article>
        <article class="panel cockpit-panel" data-cockpit-devices>${renderCockpitDevices()}</article>
        <article class="panel cockpit-panel">${renderCockpitVideo()}</article>
      </section>
    </div>
  `;
}

// Catmull-Rom 转三次贝塞尔，让示意折线变成平滑路线
function smoothRoutePath(points) {
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const k = 0.18;
    path += ` C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return path;
}

function cockpitVehiclePanLimits(stage) {
  return {
    x: (cockpitZoom - 1) * stage.clientWidth / 2,
    y: (cockpitZoom - 1) * stage.clientHeight / 2,
  };
}

function applyCockpitTransform(root) {
  const stage = root.querySelector("[data-cockpit-stage]");
  const viewport = root.querySelector("[data-cockpit-viewport]");
  if (!stage || !viewport) return;
  const limits = cockpitVehiclePanLimits(stage);
  cockpitPan = {
    x: Math.max(-limits.x, Math.min(limits.x, cockpitPan.x)),
    y: Math.max(-limits.y, Math.min(limits.y, cockpitPan.y)),
  };
  viewport.style.transform = `translate(${cockpitPan.x}px, ${cockpitPan.y}px) scale(${cockpitZoom})`;
}

function mountCockpit(root) {
  cockpitObserver?.disconnect();
  cockpitObserver = null;
  const stage = root.querySelector("[data-cockpit-stage]");
  if (!stage) {
    stopReplay();
    return;
  }
  applyCockpitTransform(root);
  // 滚轮缩放（以光标为中心），放大后可拖拽平移
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const next = Math.min(3, Math.max(1, cockpitZoom * Math.exp(-event.deltaY * 0.0012)));
    cockpitPan.x += (cockpitZoom - next) * (event.clientX - (rect.left + rect.width / 2));
    cockpitPan.y += (cockpitZoom - next) * (event.clientY - (rect.top + rect.height / 2));
    cockpitZoom = next;
    applyCockpitTransform(root);
  }, { passive: false });
  stage.addEventListener("pointerdown", (event) => {
    if (cockpitZoom <= 1 || event.button !== 0 || event.target.closest("button, select, input, a")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const baseX = cockpitPan.x;
    const baseY = cockpitPan.y;
    stage.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      cockpitPan.x = baseX + moveEvent.clientX - startX;
      cockpitPan.y = baseY + moveEvent.clientY - startY;
      applyCockpitTransform(root);
    };
    const up = () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
    };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
  });
  cockpitObserver = new ResizeObserver(() => drawCockpitMap(root));
  cockpitObserver.observe(stage);
  // 进入驾驶舱时重置异常标签的自动隐藏计时
  clearTimeout(anomalyHideTimer);
  anomalyAutoHideDone = false;
  drawReplayBar(root);
}

function drawCockpitMap(root) {
  const stage = root.querySelector("[data-cockpit-stage]");
  if (!stage) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const wide = width > 860;
  const left = wide ? 290 : 30;
  const right = wide ? 150 : 30;
  // 宽屏时底部让位给悬浮面板，路线和节点压在可视区内
  const bottom = wide ? 310 : 30;
  const project = (x, y) => [left + ((x - 12) / 76) * (width - left - right), 120 + ((y - 20) / 62) * (height - 120 - bottom)];
  const nodeByLabel = Object.fromEntries(operationsData.map.nodes.map((node) => [node.label, node]));
  const routes = operationsData.map.routes.map((route) => ({ ...route, path: smoothRoutePath(route.points.split(" ").map((pair) => project(...pair.split(",").map(Number)))) }));
  const selectedTrips = new Set(operationsData.map.vehicles.filter((vehicle) => cockpitSelected.has(vehicle.plate)).map((vehicle) => vehicle.tripId));
  // 卸点不一致：按「计划卸点→实际卸点」分组，多趟偏离相同时只画一套标记
  const groups = new Map();
  getOpenAnomalies().filter((trip) => trip.issue === "卸货点不一致").forEach((trip) => {
    const key = `${trip.plannedRoute.at(-1)}→${trip.unloadRecord}`;
    groups.set(key, (groups.get(key) || []).concat(trip));
  });
  const anomalies = [...groups.values()].map((trips) => {
    const planned = nodeByLabel[trips[0].plannedRoute.at(-1)];
    const actual = nodeByLabel[trips[0].unloadRecord];
    return planned && actual ? { trips, plan: planned.label, actual: actual.label, from: project(planned.x, planned.y), to: project(actual.x, actual.y) } : null;
  }).filter(Boolean);

  const svg = root.querySelector("[data-cockpit-svg]");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `<defs><linearGradient id="route-gradient" x1="0" x2="1"><stop offset="0" stop-color="#35d6ff"/><stop offset="1" stop-color="#6aa0ff"/></linearGradient><filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g class="routes-group">${routes.map((route) => {
      const active = selectedTrips.has(route.tripId);
      return `<path class="route-halo ${active ? "active" : ""}" d="${route.path}"/><path id="cockpit-${route.id}" class="route-line ${active ? "active" : ""}" d="${route.path}"/><path id="cockpit-progress-${route.id}" class="route-progress" d="${route.path}" filter="url(#route-glow)"/>`;
    }).join("")}</g>
    <g class="anomaly-group">${anomalies.map((item) => `<path class="anomaly-line" d="M${item.from[0]},${item.from[1]} Q${(item.from[0] + item.to[0]) / 2 + 40},${(item.from[1] + item.to[1]) / 2} ${item.to[0]},${item.to[1]}" filter="url(#route-glow)"/><circle class="anomaly-pulse" cx="${item.to[0]}" cy="${item.to[1] - 4}" r="10"/>`).join("")}</g>`;

  // 记录每条路线的长度与进度线，回放时按已驶过比例裁剪显示
  routes.forEach((route) => {
    route.baseEl = svg.querySelector(`#cockpit-${route.id}`);
    route.progressEl = svg.querySelector(`#cockpit-progress-${route.id}`);
    route.len = route.baseEl.getTotalLength();
    route.progressEl.style.strokeDasharray = `0 ${route.len}`;
  });

  root.querySelector("[data-cockpit-nodes]").innerHTML = operationsData.map.nodes.map((node) => {
    const [x, y] = project(node.x, node.y);
    const [kind, glyph] = cockpitNodeTypes[node.type];
    return `<div class="map-node node-${kind}" style="left:${x}px;top:${y}px"><span class="map-node-pin">${icon(glyph)}</span><span class="map-node-stem"></span><span class="map-node-base"></span><span class="map-node-label">${node.label}<em>${node.type}</em></span></div>`;
  }).join("");
  root.querySelector("[data-cockpit-tags]").innerHTML = anomalies.map((item) => `<button class="anomaly-tag" style="left:${item.to[0] + 14}px;top:${item.to[1] + 16}px" data-open-trip="${item.trips[0].id}">⚠ <b>${item.trips.length} 趟卸货点不一致</b> · 计划 ${item.plan}，实际 ${item.actual}</button>`).join("");
  // 异常标签默认展示 5 秒后自动消失；重绘时维持已隐藏状态
  const tags = root.querySelectorAll(".anomaly-tag");
  if (anomalyAutoHideDone) {
    tags.forEach((tag) => tag.classList.add("anomaly-hidden"));
  } else if (anomalies.length) {
    clearTimeout(anomalyHideTimer);
    anomalyHideTimer = setTimeout(() => {
      root.querySelectorAll(".anomaly-tag").forEach((tag) => tag.classList.add("anomaly-hidden"));
      anomalyAutoHideDone = true;
    }, 5000);
  }

  // 车辆沿所属路线移动：先找出示例坐标在路线上的最近位置，作为回放基准
  const vehicles = operationsData.map.vehicles.map((vehicle) => {
    const routeEntry = routes.find((route) => route.tripId === vehicle.tripId);
    const path = routeEntry.baseEl;
    const length = path.getTotalLength();
    const [vx, vy] = project(vehicle.x, vehicle.y);
    let base = 0;
    let bestDistance = Infinity;
    for (let step = 0; step <= 120; step += 1) {
      const point = path.getPointAtLength(length * step / 120);
      const distance = (point.x - vx) ** 2 + (point.y - vy) ** 2;
      if (distance < bestDistance) { bestDistance = distance; base = step / 120; }
    }
    return { ...vehicle, path, length, base, progressEl: routeEntry.progressEl, trip: sampleTrips.get(vehicle.tripId) };
  });
  cockpitGeometry = { width, height, vehicles };
  drawCockpitVehicles(root);
}

function cockpitVehiclePosition(vehicle) {
  const point = vehicle.path.getPointAtLength(vehicle.length * ((vehicle.base + (replayProgress - replayBaseProgress) * 0.9 + 1) % 1));
  return [point.x, point.y];
}

// 回放进行中（或已拖动过进度条）时，展示车辆已驶过的路线段
function drawCockpitVehicles(root) {
  const vehicleLayer = root.querySelector("[data-cockpit-vehicles]");
  if (!cockpitGeometry || !vehicleLayer) return;
  const { width, height, vehicles } = cockpitGeometry;
  const showProgress = replayPlaying || replayProgress !== replayBaseProgress;
  vehicleLayer.innerHTML = vehicles.map((vehicle) => {
    const [x, y] = cockpitVehiclePosition(vehicle);
    const fraction = (vehicle.base + (replayProgress - replayBaseProgress) * 0.9 + 1) % 1;
    vehicle.progressEl.style.strokeDasharray = `${showProgress ? vehicle.length * fraction : 0} ${vehicle.length}`;
    const flagged = vehicle.trip.issue && getStatus(vehicle.trip) === "pending";
    return `<button class="map-vehicle ${flagged ? "flagged" : ""} ${cockpitSelected.has(vehicle.plate) ? "selected" : ""}" style="left:${x}px;top:${y}px" data-cockpit-vehicle="${vehicle.plate}" aria-pressed="${cockpitSelected.has(vehicle.plate)}"><span class="map-vehicle-dot">${icon("vehicles")}</span><span class="map-vehicle-stem"></span><span class="map-vehicle-base"></span><span class="map-vehicle-plate">${vehicle.plate}</span></button>`;
  }).join("");
  const cardWidth = width > 1500 ? 318 : 292;
  const cardHeight = 70;
  const placed = [];
  root.querySelector("[data-cockpit-cards]").innerHTML = vehicles.filter((vehicle) => cockpitSelected.has(vehicle.plate)).map((vehicle) => [vehicle, cockpitVehiclePosition(vehicle)]).sort((a, b) => a[1][1] - b[1][1]).map(([vehicle, [x, y]]) => {
    const cardX = Math.max(270, Math.min(x - 36, width - cardWidth - 140));
    let cardY = Math.max(92, Math.min(y - 120, height - cardHeight - 70));
    // 与已放置的卡片重叠时往下错开
    for (let guard = 0; guard < 8 && placed.some((item) => Math.abs(item.x - cardX) < cardWidth + 8 && Math.abs(item.y - cardY) < cardHeight + 8); guard += 1) cardY += cardHeight + 10;
    placed.push({ x: cardX, y: cardY });
    const anchorX = cardX + 30;
    const anchorY = cardY + (y > cardY ? cardHeight : 0);
    const status = getStatus(vehicle.trip);
    const flagged = vehicle.trip.issue && status === "pending";
    return `<span class="map-leader" style="left:${anchorX}px;top:${anchorY}px;width:${Math.max(Math.hypot(x - anchorX, y - anchorY) - 20, 0)}px;transform:rotate(${Math.atan2(y - anchorY, x - anchorX)}rad)"></span>
      <button class="map-trip-card ${flagged ? "flagged" : ""}" style="left:${cardX}px;top:${cardY}px;width:${cardWidth}px" data-open-trip="${vehicle.tripId}">${renderRing(cockpitStageProgress[vehicle.status] ?? 50, 52, flagged ? "warn" : "ok")}<span class="map-trip-text"><strong>${vehicle.route[0]} → ${vehicle.route.at(-1)}</strong><small>${vehicle.status} · 定位 ${vehicle.lastLocated.slice(11)}</small><small class="muted">${vehicle.plate} · ${vehicle.tripId}</small></span><span class="map-trip-weight">净重<b class="tone-text-${status === "verified" ? "ok" : "warn"}">${getNetWeight(vehicle.trip).toFixed(1)}t</b>${flagged ? `<em>${vehicle.trip.issue.slice(0, 5)}</em>` : statusLabels[status]}</span></button>`;
  }).join("");
}

function drawReplayBar(root) {
  const minutes = Math.round(replayStartMinutes + (replayEndMinutes - replayStartMinutes) * replayProgress);
  const clock = root.querySelector("[data-replay-clock]");
  if (!clock) return;
  clock.textContent = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  root.querySelector("[data-replay-fill]").style.width = `${replayProgress * 100}%`;
  root.querySelector("[data-replay-knob]").style.left = `${replayProgress * 100}%`;
  const play = root.querySelector("[data-replay-toggle]");
  play.classList.toggle("playing", replayPlaying);
  play.setAttribute("aria-label", replayPlaying ? "暂停回放" : "播放回放");
}

function stopReplay() {
  replayPlaying = false;
  cancelAnimationFrame(replayFrame);
  replayFrame = null;
}

function startReplay(root) {
  replayPlaying = true;
  let last = 0;
  const tick = (time) => {
    if (!replayPlaying || !root.querySelector("[data-cockpit-stage]")) return stopReplay();
    if (last) replayProgress = (replayProgress + (time - last) / 40000) % 1;
    last = time;
    drawReplayBar(root);
    drawCockpitVehicles(root);
    replayFrame = requestAnimationFrame(tick);
  };
  replayFrame = requestAnimationFrame(tick);
}

function handleCockpitClick(root, event) {
  const vehicle = event.target.closest("[data-cockpit-vehicle]");
  if (vehicle) {
    const plate = vehicle.dataset.cockpitVehicle;
    if (cockpitSelected.has(plate)) cockpitSelected.delete(plate);
    else cockpitSelected.add(plate);
    drawCockpitMap(root);
    root.querySelector("[data-cockpit-devices]").innerHTML = renderCockpitDevices();
    return true;
  }
  const devTab = event.target.closest("[data-cockpit-devtab]");
  if (devTab) {
    cockpitDevTab = devTab.dataset.cockpitDevtab;
    root.querySelector("[data-cockpit-devices]").innerHTML = renderCockpitDevices();
    return true;
  }
  const layer = event.target.closest("[data-cockpit-layer]");
  if (layer) {
    const key = layer.dataset.cockpitLayer;
    const visible = cockpitHidden.has(key);
    if (visible) cockpitHidden.delete(key);
    else cockpitHidden.add(key);
    layer.classList.toggle("selected", visible);
    layer.setAttribute("aria-pressed", visible);
    root.querySelector(".cockpit").classList.toggle(`hide-${key}`, !visible);
    return true;
  }
  const zoomButton = event.target.closest("[data-cockpit-zoom]");
  if (zoomButton) {
    const action = zoomButton.dataset.cockpitZoom;
    if (action === "reset") {
      cockpitZoom = 1;
      cockpitPan = { x: 0, y: 0 };
    } else {
      const next = Math.min(3, Math.max(1, cockpitZoom * (action === "in" ? 1.35 : 1 / 1.35)));
      cockpitPan.x *= next / cockpitZoom;
      cockpitPan.y *= next / cockpitZoom;
      cockpitZoom = next;
    }
    applyCockpitTransform(root);
    return true;
  }
  if (event.target.closest("[data-replay-toggle]")) {
    if (replayPlaying) stopReplay();
    else startReplay(root);
    drawReplayBar(root);
    return true;
  }
  const track = event.target.closest("[data-replay-track]");
  if (track) {
    const box = track.getBoundingClientRect();
    replayProgress = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    drawReplayBar(root);
    drawCockpitVehicles(root);
    return true;
  }
  if (event.target.closest("[data-cockpit-fullscreen]")) {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.querySelector(".cockpit")?.requestFullscreen?.();
    return true;
  }
  return false;
}

// 视频角标时钟：只在驾驶舱的视频面板存在时走字
let cockpitOsdSeconds = timeToMinutes("13:05") * 60;
setInterval(() => {
  const osd = document.querySelector("[data-cockpit-osd]");
  if (!osd) return;
  cockpitOsdSeconds += 1;
  const parts = [Math.floor(cockpitOsdSeconds / 3600), Math.floor(cockpitOsdSeconds % 3600 / 60), cockpitOsdSeconds % 60];
  osd.textContent = `2026-04-01 ${parts.map((part) => String(part).padStart(2, "0")).join(":")}`;
}, 1000);

function eventText(trip) {
  const caseReason = getFollowUp(trip)?.reason;
  if (getStatus(trip) === "confirmedAnomaly" && caseReason) return caseReason;
  if (trip.issue === "皮重波动异常") {
    const difference = Number((trip.tareWeight - trip.tareMean).toFixed(2));
    return `回皮 ${formatWeight(trip.tareWeight)} 吨，较历史均值 ${formatWeight(trip.tareMean)} 吨低 ${formatWeight(Math.abs(difference))} 吨。`;
  }
  return `计划卸货点与卸货记录不一致：${trip.plannedRoute.at(-1)} / ${trip.unloadRecord}。`;
}

function followUpLabel(trip) {
  const item = getFollowUp(trip);
  if (item.type === "supplement") return item.progress === "awaitingSupplement" ? "待补充" : "已补充";
  if (item.type === "anomaly") return { toHandle: "待处置", processing: "处理中", completed: "处置完成" }[item.progress];
  return "";
}

function renderAuditRow(trip) {
  const assessment = aiAssessment(trip);
  const followUp = followUpLabel(trip);
  return `
    <button class="list-row audit-row ${assessment.kind === "anomaly" ? "flagged" : ""} ${selectedTripId === trip.id ? "selected" : ""}" data-select-trip="${trip.id}" aria-pressed="${selectedTripId === trip.id}">
      <span class="row-main">
        <span class="audit-row-top"><strong>${trip.id}</strong>${statusPill(getStatus(trip))}</span>
        <span>${trip.plate} · ${trip.material} · ${trip.times.gross}</span>
        <span class="audit-row-finding"><span class="tag ${assessment.kind === "anomaly" ? "violet" : "cyan"}">${assessment.finding}</span>${trip.issue ? `<em>${trip.issue}</em>` : ""}${followUp ? `<span class="tag muted">${followUp}</span>` : ""}</span>
      </span>
    </button>
  `;
}

function routeMismatch(trip) {
  return trip.plannedRoute.at(-1) !== trip.unloadRecord;
}

function tareDeviation(trip) {
  return Number((trip.tareWeight - trip.tareMean).toFixed(2));
}

function confidenceInfo(trip) {
  const value = Number(trip.confidence) || 0;
  const tier = value >= 90 ? "高" : value >= 70 ? "中" : "低";
  return { value, tier, text: `置信度${tier} · ${value}%`, short: `置信 ${value}%`, low: value < 70 };
}

function aiAssessment(trip) {
  if (routeMismatch(trip)) {
    return {
      kind: "anomaly",
      finding: "AI发现异常",
      heading: "建议人工核对卸货记录",
      reason: `计划卸货点为${trip.plannedRoute.at(-1)}，卸货记录为${trip.unloadRecord}；${trip.photoObservation}本趟毛重 ${formatWeight(trip.grossWeight)} 吨、皮重 ${formatWeight(trip.tareWeight)} 吨，净重 ${formatWeight(getNetWeight(trip))} 吨。`,
    };
  }
  const delta = tareDeviation(trip);
  if (Math.abs(delta) > 1) {
    return {
      kind: "anomaly",
      finding: "AI发现异常",
      heading: "建议复核本趟回皮记录",
      reason: `本趟皮重 ${formatWeight(trip.tareWeight)} 吨，历史均值 ${formatWeight(trip.tareMean)} 吨，偏差 ${delta > 0 ? "+" : "−"}${formatWeight(Math.abs(delta))} 吨，超过演示阈值 ±1.00 吨；${trip.photoObservation}净重 ${formatWeight(getNetWeight(trip))} 吨。`,
    };
  }
  return {
    kind: "pass",
    finding: "AI建议通过",
    heading: "未发现明显异常，建议人工核实通过",
    reason: `计划卸货点与记录一致；${trip.photoObservation}毛重 ${formatWeight(trip.grossWeight)} 吨 − 皮重 ${formatWeight(trip.tareWeight)} 吨 = 净重 ${formatWeight(getNetWeight(trip))} 吨。`,
  };
}

function renderRoute(trip) {
  const mismatch = routeMismatch(trip);
  const actualRoute = [...trip.plannedRoute.slice(0, -1), trip.unloadRecord];
  const roleOf = (index, total) => (index === 0 ? "出发" : index === total - 1 ? "卸货" : `途经 ${index}`);
  return `
    <section class="block">
      <div class="panel-head"><h3>路线比对</h3><span class="tag ${mismatch ? "danger" : "ok"}">${mismatch ? "卸点不一致" : "路线一致"}</span></div>
      <table class="route-table">
        <thead><tr><th>节点</th><th>计划路线</th><th></th><th>实际记录</th></tr></thead>
        <tbody>${trip.plannedRoute.map((point, index) => {
          const same = point === actualRoute[index];
          return `<tr class="${same ? "" : "mismatch"}"><td>${roleOf(index, trip.plannedRoute.length)}</td><td><span class="route-node">${point}</span></td><td class="route-mark">${same ? "✓" : "≠"}</td><td><span class="route-node ${same ? "" : "diff"}">${actualRoute[index]}</span></td></tr>`;
        }).join("")}</tbody>
      </table>
    </section>
  `;
}

function renderTimeline(trip) {
  const tareAnomaly = Math.abs(tareDeviation(trip)) > 1;
  const steps = [
    { label: "重车承重", time: trip.times.gross, detail: trip.grossStation, anomaly: false },
    { label: "卸货", time: trip.times.unload, detail: trip.unloadRecord, anomaly: routeMismatch(trip) },
    { label: "空车回皮", time: trip.times.tare, detail: trip.tareStation, anomaly: tareAnomaly },
  ];
  return `
    <section class="block">
      <div class="panel-head"><h3>同一趟运输</h3><span class="panel-sub">${trip.occurredAt.slice(0, 10)}</span></div>
      <ol class="timeline">${steps.map((step) => `<li class="${step.anomaly ? "anomaly" : ""}"><b class="num">${step.time}</b><strong>${step.label}${step.anomaly ? " · 异常" : ""}</strong><span>${step.detail}</span></li>`).join("")}</ol>
    </section>
  `;
}

function renderWeights(trip) {
  const delta = tareDeviation(trip);
  const tareAnomaly = Math.abs(delta) > 1;
  return `
    <section class="block">
      <div class="panel-head"><h3>称重情况</h3><span class="panel-sub">示例数据 · 吨</span></div>
      <div class="weight-equation">
        <div><span>毛重</span><strong class="num">${formatWeight(trip.grossWeight)}</strong></div><b>−</b>
        <div class="${tareAnomaly ? "anomaly" : ""}"><span>皮重${tareAnomaly ? " · 异常" : ""}</span><strong class="num">${formatWeight(trip.tareWeight)}</strong></div><b>=</b>
        <div class="net"><span>净重</span><strong class="num">${formatWeight(getNetWeight(trip))}</strong></div>
      </div>
      ${tareAnomaly ? `<div class="note warn">历史皮重均值 ${formatWeight(trip.tareMean)} 吨，本趟偏差 ${delta > 0 ? "+" : "−"}${formatWeight(Math.abs(delta))} 吨，超过演示阈值 ±1.00 吨，待现场确认。</div>` : ""}
    </section>
  `;
}

function renderEvidence(trip) {
  return `
    <section class="block">
      <div class="panel-head"><div><h3>车辆与装载影像</h3><span class="panel-sub">示例影像 · 未关联现场摄像头</span></div><button class="button" data-open-monitor="${trip.id}">${icon("camera")}监控画面</button></div>
      <div class="evidence-grid">
        <button class="evidence-photo" data-photo="./public/images/weighbridge-example.jpg" aria-label="放大查看示例重车过磅影像"><img src="./public/images/weighbridge-example.jpg" alt="完整示例车辆在地磅上称重" /><span>重车过磅 · ${trip.times.gross}</span></button>
        <button class="evidence-photo" data-photo="./public/images/ore-truck-example.jpg" aria-label="放大查看示例装载影像"><img src="./public/images/ore-truck-example.jpg" alt="完整示例矿石运输车辆及装载情况" /><span>装载影像 · ${trip.material}</span></button>
      </div>
    </section>
  `;
}

function renderAiAdvice(trip) {
  const assessment = aiAssessment(trip);
  const confidence = confidenceInfo(trip);
  const status = getStatus(trip);
  const basis = assessment.kind === "anomaly" && trip.issue === "皮重波动异常" ? ["路线记录", "称重记录", "近 30 天均值"] : ["路线记录", "车辆影像", "称重记录"];
  return `
    <section class="ai-advice ${assessment.kind}">
      <div class="panel-head"><div><span class="ai-mark">AI</span><h3>稽核建议</h3><span class="tag ${assessment.kind === "anomaly" ? "violet" : "cyan"}">${assessment.finding}</span><span class="tag ${confidence.low ? "warn" : "muted"}">${confidence.text}</span></div><span class="ai-human">人工结论 ${statusPill(status)}</span></div>
      <strong class="ai-recommendation">${assessment.heading}</strong>
      <p>${assessment.reason}${confidence.low ? " 置信度偏低，以人工核对为准。" : ""}</p>
      <div class="tags"><span class="ai-basis">判定依据</span>${basis.map((item) => `<span class="tag muted">${item}</span>`).join("")}</div>
    </section>
  `;
}

function renderWorkflowForm(trip, type) {
  const fields = type === "needsInfo"
    ? `<label>退回原因<textarea name="reason" required></textarea></label><label>待补充信息<textarea name="requiredInfo" required></textarea></label>`
    : `<label>异常确认说明<textarea name="reason" required></textarea></label>`;
  const title = type === "needsInfo" ? "退回复核" : "确认存在异常";
  const submit = type === "needsInfo" ? "提交补充要求" : "确认并创建处置记录";
  return `<form class="block form" data-workflow-form="${type}" data-trip="${trip.id}"><h3>${title}</h3>${fields}<div class="actions"><button class="button primary" type="submit">${submit}</button><button class="button" type="button" data-cancel-workflow>取消</button></div></form>`;
}

function renderFollowUpPanel(trip) {
  const item = getFollowUp(trip);
  if (item.type === "supplement") {
    return `
      <section class="block form">
        <div class="panel-head"><h3>补充核验</h3><span class="tag warn">${item.progress === "awaitingSupplement" ? "待补充" : getStatus(trip) === "verified" ? "已核实通过" : "已重新提交 · 待复核"}</span></div>
        <div class="kv"><div><span>退回原因</span><strong>${escapeHtml(item.reason)}</strong></div><div><span>待补充</span><strong>${escapeHtml(item.requiredInfo)}</strong></div>${item.supplement ? `<div><span>补充记录</span><strong>${escapeHtml(item.supplement)}</strong></div>` : ""}</div>
        ${item.progress === "awaitingSupplement" ? `<form class="form" data-workflow-form="supplement" data-trip="${trip.id}"><label>补充说明<textarea name="supplement" required></textarea></label><div class="actions"><button class="button primary" type="submit">重新提交复核</button></div></form>` : ""}
      </section>
    `;
  }
  if (item.type !== "anomaly") return "";
  const progress = { toHandle: ["待处置", "danger"], processing: ["处理中", "warn"], completed: ["已完成", "ok"] }[item.progress];
  return `
    <section class="block form">
      <div class="panel-head"><h3>异常处置</h3><span class="tag ${progress[1]}">${progress[0]}</span></div>
      <div class="kv"><div><span>异常说明</span><strong>${escapeHtml(item.reason)}</strong></div>${item.handling ? `<div><span>处置记录</span><strong>${escapeHtml(item.handling)}</strong></div>` : ""}</div>
      ${item.progress === "toHandle" ? `<div class="actions"><button class="button" data-case-action="start" data-trip="${trip.id}">开始处置</button></div>` : ""}
      ${item.progress === "processing" && !item.handling ? `<form class="form" data-workflow-form="handling" data-trip="${trip.id}"><label>处置记录<textarea name="handling" required></textarea></label><div class="actions"><button class="button primary" type="submit">保存处置记录</button></div></form>` : ""}
      ${item.progress === "processing" && item.handling ? `<div class="actions"><button class="button primary" data-case-action="complete" data-trip="${trip.id}">标记处置完成</button></div>` : ""}
      ${item.progress === "completed" ? (getStatus(trip) === "confirmedAnomaly" ? `<div class="actions"><button class="button" data-case-action="re-review" data-trip="${trip.id}">重新提交人工复核</button></div>` : `<span class="panel-sub">${getStatus(trip) === "verified" ? "已人工核实通过 · 可纳入结算" : "处置已完成 · 待人工复核，未计入结算"}</span>`) : ""}
    </section>
  `;
}

function renderAiFeedbackBar(trip) {
  if (aiAssessment(trip).kind !== "anomaly") return "";
  const feedback = aiFeedback[trip.id];
  if (feedback) return `<div class="note muted"><span>人工反馈：${feedback.vote === "accurate" ? "AI 判定准确" : "AI 判定有误"}${feedback.reason ? ` · ${escapeHtml(feedback.reason)}` : ""}</span></div>`;
  if (feedbackOpenTripId === trip.id) {
    const reasons = trip.issue === "皮重波动异常" ? ["属正常装载差异", "计量设备误差", "历史均值数据不足"] : ["两卸点实为同一卸区", "计划已临时变更未同步", "定位或记录误差"];
    return `<section class="block form"><h3>本次 AI 判定不准确，主要原因是</h3><div class="actions">${reasons.map((reason) => `<button class="button" data-feedback-reason="${reason}" data-trip="${trip.id}">${reason}</button>`).join("")}</div><form class="form" data-feedback-form data-trip="${trip.id}"><label>其他（选填）<textarea name="reason"></textarea></label><div class="actions"><button class="button primary" type="submit">提交反馈</button><button class="button" type="button" data-cancel-feedback>取消</button></div></form></section>`;
  }
  return `<div class="feedback-bar"><span>本次 AI 判定是否准确？</span><div class="actions"><button class="button" data-feedback-vote="accurate" data-trip="${trip.id}">准确</button><button class="button" data-feedback-vote="inaccurate" data-trip="${trip.id}">不准确</button></div></div>`;
}

function renderReviewActions(trip) {
  const status = getStatus(trip);
  const followUp = getFollowUp(trip);
  if (status === "confirmedAnomaly") return `${renderFollowUpPanel(trip)}${renderAiFeedbackBar(trip)}`;
  if (status === "verified") {
    return `${renderAiFeedbackBar(trip)}${renderFollowUpPanel(trip)}<div class="review-bar"><span>人工复核结果 ${statusPill(status)}</span><button class="button" data-open-settlement>查看结算预览 ›</button></div>`;
  }
  if (followUp.type === "supplement" && followUp.progress === "awaitingSupplement") return renderFollowUpPanel(trip);
  if (workflowForm?.tripId === trip.id) return `${renderFollowUpPanel(trip)}${renderWorkflowForm(trip, workflowForm.type)}`;
  return `
    ${renderFollowUpPanel(trip)}
    <div class="review-bar" aria-label="人工复核操作">
      <span>人工复核 · AI 只给建议，结论由人工决定</span>
      <div class="actions"><button class="button warning" data-review="confirmedAnomaly" data-trip="${trip.id}">确认存在异常</button><button class="button" data-review="needsInfo" data-trip="${trip.id}">退回复核</button><button class="button primary" data-review="verified" data-trip="${trip.id}">核实通过</button></div>
    </div>
  `;
}

function renderAuditDetail(trip) {
  if (!trip) return '<section class="panel"><div class="empty-state">没有匹配的运输趟次</div></section>';
  return `
    <section class="panel audit-detail">
      <div class="panel-head"><div><h2>${trip.id}</h2><span class="panel-sub">${trip.plate} · ${trip.material} · ${trip.occurredAt.replace("T", " ")}</span></div><div class="panel-actions">${statusPill(getStatus(trip))}</div></div>
      <div class="audit-sections">
        ${renderAiAdvice(trip)}
        <div class="audit-grid">${renderRoute(trip)}${renderWeights(trip)}</div>
        <div class="audit-grid">${renderTimeline(trip)}${renderEvidence(trip)}</div>
        ${renderReviewActions(trip)}
      </div>
    </section>
  `;
}

function renderAudit() {
  const value = searchValues.audit;
  const matchingTrips = seedTrips.filter((trip) => matchesTrip(trip, value, [
    (item) => item.id,
    (item) => item.plate,
    (item) => item.unloadRecord,
    (item) => item.issue,
  ]));
  const count = (status) => matchingTrips.filter((trip) => getStatus(trip) === status).length;
  const trips = matchingTrips.filter((trip) => auditFilter === "all" || getStatus(trip) === auditFilter).sort((a, b) => {
    const aPending = getStatus(a) === "pending";
    const bPending = getStatus(b) === "pending";
    return Number(bPending) - Number(aPending) || b.occurredAt.localeCompare(a.occurredAt);
  });
  const selected = trips.find((trip) => trip.id === selectedTripId) || trips[0];
  if (selected) selectedTripId = selected.id;
  const filters = [["all", "全部", matchingTrips.length], ["pending", "待复核", count("pending")], ["verified", "核实通过", count("verified")], ["confirmedAnomaly", "确认异常", count("confirmedAnomaly")]];
  return `
    <div class="page">
      ${renderPageHeader("运输稽核", "逐趟核对路线、称重与影像；AI 只给建议，结论由人工决定", renderSearch("audit", "搜索车牌、趟次或异常"))}
      <div class="audit-layout">
        <section class="panel audit-list-panel">
          <div class="panel-head"><div><h2>运输趟次</h2><span class="panel-sub">待复核优先 · 时间降序</span></div></div>
          <div class="seg audit-filters">${filters.map(([id, label, n]) => `<button class="${auditFilter === id ? "selected" : ""}" data-audit-filter="${id}">${label} <b>${n}</b></button>`).join("")}</div>
          <div class="list">${trips.length ? trips.map(renderAuditRow).join("") : '<div class="empty-state">没有匹配记录</div>'}</div>
        </section>
        ${renderAuditDetail(selected)}
      </div>
    </div>
  `;
}

function renderTareChart(plate, currentTare) {
  const { checks, referenceWeight } = vehicleTareChecks[plate];
  const points = [...checks.map((check) => ({ label: check.date.slice(5), weight: check.weight, current: false })), { label: "本趟回皮", weight: currentTare, current: true }];
  const values = points.map((point) => point.weight);
  const min = Math.min(...values, referenceWeight) - 1;
  const max = Math.max(...values, referenceWeight) + 1;
  const top = (weight) => `${(1 - (weight - min) / (max - min)) * 100}%`;
  return `
    <div class="tare-chart" role="img" aria-label="历史皮重检查与本次回皮示例">
      <div class="tare-plot">
        <span class="tare-band" style="top:${top(referenceWeight + 1)};bottom:calc(100% - ${top(referenceWeight - 1)})"></span>
        <span class="tare-mean" style="top:${top(referenceWeight)}"><em>均值 ${formatWeight(referenceWeight)}</em></span>
        ${points.map((point, index) => `<span class="tare-dot ${point.current ? "current" : Math.abs(point.weight - referenceWeight) > 1 ? "abnormal" : ""}" style="left:${(index + .5) / points.length * 100}%;top:${top(point.weight)}"><b class="num">${formatWeight(point.weight)}</b></span>`).join("")}
      </div>
      <div class="tare-axis">${points.map((point) => `<span>${point.label}</span>`).join("")}</div>
      <small class="panel-sub">阴影带为均值 ±1.00 吨（演示阈值）</small>
    </div>
  `;
}

function renderConfirmedExceptions(trips) {
  const exceptions = trips.filter((trip) => getFollowUp(trip).type === "anomaly").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (!exceptions.length) return "";
  return `
    <section class="block">
      <div class="panel-head"><h3>已确认异常</h3><span class="panel-sub">${exceptions.length} 趟</span></div>
      <div class="list">${exceptions.map((trip) => {
        const item = getFollowUp(trip);
        return `<button class="list-row" data-open-trip="${trip.id}"><span class="row-main"><strong>${trip.id} · ${escapeHtml(item.reason)}</strong><small>处置记录：${escapeHtml(item.handling || "尚未填写")}</small></span><span class="tags">${statusPill(getStatus(trip))}<span class="tag muted">${followUpLabel(trip)}</span></span></button>`;
      }).join("")}</div>
    </section>
  `;
}

function renderVehicleProfile(plate) {
  if (!plate) return '<section class="panel"><div class="empty-state">没有匹配车辆</div></section>';
  const trips = seedTrips.filter((trip) => trip.plate === plate);
  const latest = [...trips].sort((a, b) => b.times.gross.localeCompare(a.times.gross))[0];
  const { checks, referenceWeight: mean } = vehicleTareChecks[plate];
  const currentTare = latest.tareWeight;
  const deviation = Number((currentTare - mean).toFixed(2));
  const outOfRange = Math.abs(deviation) > 1;
  const abnormalChecks = checks.filter((check) => Math.abs(check.weight - mean) > 1).length;
  const verifiedNet = trips.filter((trip) => getStatus(trip) === "verified").reduce((sum, trip) => sum + getNetWeight(trip), 0);
  return `
    <section class="panel vehicle-profile">
      <div class="panel-head"><div><h2>${plate}</h2><span class="panel-sub">关联示例趟次 ${trips.length} 趟</span></div>${outOfRange ? '<span class="tag warn">皮重波动待复核</span>' : '<span class="tag ok">皮重正常</span>'}</div>
      <div class="vehicle-sections">
        <div class="stat-grid">
          <div class="stat"><span>历史皮重均值</span><strong>${formatWeight(mean)}<small>吨</small></strong></div>
          <div class="stat"><span>本次回皮</span><strong>${formatWeight(currentTare)}<small>吨</small></strong></div>
          <div class="stat ${outOfRange ? "warn" : ""}"><span>与均值偏差</span><strong>${deviation > 0 ? "+" : "−"}${formatWeight(Math.abs(deviation))}<small>吨</small></strong></div>
          <div class="stat blue"><span>核实通过净重</span><strong>${formatWeight(verifiedNet)}<small>吨</small></strong></div>
        </div>
        ${outOfRange
          ? `<div class="note warn"><strong>皮重波动待复核</strong><span>近 6 次独立检查有 ${abnormalChecks} 次偏离均值超过 ±1.00 吨；本趟回皮 ${formatWeight(currentTare)} 吨，较均值低 ${formatWeight(Math.abs(deviation))} 吨。阈值为演示值，待现场确认。</span></div>`
          : `<div class="note ok"><strong>皮重与均值接近</strong><span>近 6 次独立检查中 ${abnormalChecks} 次超过演示阈值；本趟读数未超过。</span></div>`}
        ${renderConfirmedExceptions(trips)}
        <div class="vehicle-grid">
          <section class="block"><div class="panel-head"><h3>皮重历史检查</h3><span class="panel-sub">示例记录 · 吨</span></div>${renderTareChart(plate, currentTare)}</section>
          <section class="block"><div class="panel-head"><h3>运营重量记录</h3><span class="panel-sub">点击查看趟次</span></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>趟次</th><th class="num">毛重</th><th class="num">皮重</th><th class="num">净重</th><th>状态</th></tr></thead><tbody>${trips.map((trip) => `<tr class="clickable" data-open-trip="${trip.id}" tabindex="0"><td><strong>${trip.id}</strong><small>${trip.times.gross} · ${trip.material}</small></td><td class="num">${formatWeight(trip.grossWeight)}</td><td class="num">${formatWeight(trip.tareWeight)}</td><td class="num">${formatWeight(getNetWeight(trip))}</td><td>${statusPill(getStatus(trip))}</td></tr>`).join("")}</tbody></table></div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderVehicles() {
  const value = searchValues.vehicles.trim().toLocaleLowerCase();
  const matches = plates.filter((plate) => !value || plate.toLocaleLowerCase().includes(value));
  const plate = matches.includes(selectedVehiclePlate) ? selectedVehiclePlate : matches[0];
  if (plate) selectedVehiclePlate = plate;
  return `
    <div class="page">
      ${renderContextBack(vehicleReturnView, viewLabels[vehicleReturnView] || "运营驾驶舱")}
      ${renderPageHeader("车辆档案", "皮重历史、运营重量与异常处置", renderSearch("vehicles", "输入车牌号"))}
      <div class="vehicle-layout">
        <section class="panel">
          <div class="panel-head"><div><h2>运输车辆</h2><span class="panel-sub">${matches.length} 辆</span></div></div>
          <div class="list">${matches.length ? matches.map((item) => {
            const own = seedTrips.filter((trip) => trip.plate === item);
            const flagged = own.some((trip) => trip.issue && getStatus(trip) === "pending");
            return `<button class="list-row ${item === plate ? "selected" : ""}" data-select-vehicle="${item}"><span class="row-main"><strong>${item}</strong><small>${own.length} 趟示例记录 · 核实 ${own.filter((trip) => getStatus(trip) === "verified").length} 趟</small></span>${flagged ? '<span class="tag warn">有线索</span>' : '<i class="dot ok"></i>'}</button>`;
          }).join("") : '<div class="empty-state">没有匹配车辆</div>'}</div>
        </section>
        ${renderVehicleProfile(plate)}
      </div>
    </div>
  `;
}

function renderSettlementDetail(trip) {
  if (!trip) return '<section class="panel"><div class="empty-state">没有匹配的核实通过记录</div></section>';
  return `
    <section class="panel">
      <div class="panel-head"><div><h2>趟次明细</h2><span class="panel-sub">${trip.id} · ${trip.plate}</span></div>${statusPill(getStatus(trip))}</div>
      <div class="block settlement-math"><span>同一趟 毛重 − 皮重 = 净重</span><strong class="num">${formatWeight(trip.grossWeight)} − ${formatWeight(trip.tareWeight)} = ${formatWeight(getNetWeight(trip))}<small>吨</small></strong></div>
      <div class="kv settlement-kv"><div><span>承重地磅</span><strong>${trip.grossStation}</strong></div><div><span>回皮地磅</span><strong>${trip.tareStation}</strong></div><div><span>卸货点</span><strong>${trip.unloadRecord}</strong></div></div>
      <button class="text-button" data-open-trip="${trip.id}">查看稽核详情 ›</button>
    </section>
  `;
}

function renderSettlement() {
  const value = searchValues.settlement;
  const match = (trip) => matchesTrip(trip, value, [(item) => item.id, (item) => item.plate]);
  const filtered = getVerifiedTrips().filter(match);
  const netTotal = filtered.reduce((sum, trip) => sum + getNetWeight(trip), 0);
  const excluded = seedTrips.filter((trip) => getStatus(trip) !== "verified").filter(match);
  const pendingCount = excluded.filter((trip) => getStatus(trip) === "pending").length;
  const selected = filtered.find((trip) => trip.id === selectedTripId) || filtered[0];
  if (selected) selectedTripId = selected.id;
  return `
    <div class="page">
      ${renderContextBack(detailReturnView, viewLabels[detailReturnView] || "运输稽核")}
      ${renderPageHeader("结算预览", "只有人工核实通过的趟次计入结算净重", renderSearch("settlement", "车牌或趟次编号"))}
      <div class="stat-grid">
        <div class="stat ok"><span>${value ? "检索结果 · " : ""}核实通过</span><strong>${filtered.length}<small>趟</small></strong></div>
        <div class="stat blue"><span>${value ? "检索结果 · " : ""}核实通过净重</span><strong>${formatWeight(netTotal)}<small>吨</small></strong></div>
        <div class="stat warn"><span>${value ? "检索结果 · " : ""}未纳入结算</span><strong>${excluded.length}<small>趟</small></strong><small>${pendingCount} 待复核 · ${excluded.length - pendingCount} 确认异常</small></div>
      </div>
      <div class="settlement-layout">
        <section class="panel">
          <div class="panel-head"><div><h2>纳入结算的趟次</h2><span class="panel-sub">点击行查看明细</span></div></div>
          ${filtered.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>趟次编号</th><th>车牌号</th><th class="num">毛重（吨）</th><th class="num">皮重（吨）</th><th class="num">净重（吨）</th></tr></thead><tbody>${filtered.map((trip) => `<tr class="clickable ${selectedTripId === trip.id ? "selected" : ""}" data-settlement-trip="${trip.id}" tabindex="0"><td><strong>${trip.id}</strong></td><td>${trip.plate}</td><td class="num">${formatWeight(trip.grossWeight)}</td><td class="num">${formatWeight(trip.tareWeight)}</td><td class="num settlement-net">${formatWeight(getNetWeight(trip))}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="4">合计 ${filtered.length} 趟</td><td class="num settlement-net">${formatWeight(netTotal)}</td></tr></tfoot></table></div>` : '<div class="empty-state">没有匹配的核实通过记录</div>'}
          ${excluded.length ? `<div class="panel-head excluded-head"><div><h3>未纳入结算</h3><span class="panel-sub">待复核或确认异常的趟次不计入</span></div></div><div class="list">${excluded.map((trip) => `<button class="list-row" data-open-trip="${trip.id}"><span class="row-main"><strong>${trip.id} · ${trip.plate}</strong><small>${trip.issue || "待人工复核"} · 净重 ${formatWeight(getNetWeight(trip))} 吨</small></span>${statusPill(getStatus(trip))}</button>`).join("")}</div>` : ""}
        </section>
        ${renderSettlementDetail(selected)}
      </div>
    </div>
  `;
}

function getPeriodRows() {
  if (analyticsPeriod === "day") return operationsData.dailyMetrics.filter((row) => row.date === analyticsDate);
  const count = analyticsPeriod === "week" ? 7 : operationsData.dailyMetrics.length;
  return operationsData.dailyMetrics.slice(-count);
}

function renderPeriodTabs() {
  return `<div class="seg" role="group" aria-label="统计周期">${[["day", "日"], ["week", "周"], ["month", "月"]].map(([id, label]) => `<button class="${analyticsPeriod === id ? "selected" : ""}" data-analytics-period="${id}" aria-pressed="${analyticsPeriod === id}">${label}</button>`).join("")}</div>`;
}

const analyticsSeries = [
  { key: "minedTons", label: "采矿量", cls: "mined" },
  { key: "verifiedTransportTons", label: "核实运输净重", cls: "transport" },
  { key: "receivedUnloadTons", label: "卸点接收量", cls: "unload" },
];

function renderTrendChart(rows) {
  const values = rows.flatMap((row) => analyticsSeries.map((item) => row[item.key]));
  // 纵轴取数据上下界并留白，三条线的起伏才看得清
  const max = Math.ceil(Math.max(...values, 1) * 1.04 / 10) * 10;
  const min = Math.floor(Math.min(...values, max) * .92 / 10) * 10;
  const chartRows = rows.length > 20 ? rows.filter((_, index) => index % 2 === 0 || index === rows.length - 1) : rows;
  const x = (index) => chartRows.length < 2 ? 500 : 48 + index * 904 / (chartRows.length - 1);
  const y = (value) => 206 - (value - min) / (max - min || 1) * 174;
  const tick = (ratio) => Math.round(min + (max - min) * ratio);
  return `<div class="trend-chart"><div class="chart-legend">${analyticsSeries.map((item) => `<span class="${item.cls}"><i></i>${item.label}</span>`).join("")}<small>吨 · 点击日期查看来源</small></div><svg viewBox="0 0 1000 240" role="img" aria-label="采矿量、运输净重和卸货接收量趋势"><path class="chart-gridline" d="M48 32H952M48 90H952M48 148H952M48 206H952"/><g class="chart-axis"><text x="8" y="36">${tick(1)}</text><text x="8" y="94">${tick(.67)}</text><text x="8" y="152">${tick(.33)}</text><text x="8" y="210">${tick(0)}</text></g>${analyticsSeries.map((item) => `<polyline class="chart-series ${item.cls}" points="${chartRows.map((row, index) => `${x(index)},${y(row[item.key])}`).join(" ")}"/>${chartRows.map((row, index) => `<circle class="chart-point ${item.cls}" cx="${x(index)}" cy="${y(row[item.key])}" r="3.5"/>`).join("")}`).join("")}${chartRows.map((row, index) => `<g class="chart-hit ${row.date === analyticsDate ? "selected" : ""}" data-analytics-date="${row.date}" tabindex="0" role="button" aria-label="查看 ${row.date} 来源"><rect x="${x(index) - 16}" y="20" width="32" height="220" rx="4"/><text x="${x(index)}" y="234">${row.date.slice(5)}</text></g>`).join("")}</svg></div>`;
}

function renderAnalyticsKpi(label, total, rows, key, cls) {
  const average = rows.length ? Math.round(total / rows.length) : 0;
  const max = Math.max(...rows.map((row) => row[key]), 1);
  return `<div class="stat analytics-kpi ${cls}"><span>${label}</span><strong>${total.toLocaleString()}<small>吨</small></strong><small>日均 ${average.toLocaleString()} 吨 · ${rows.length} 天</small><div class="kpi-spark" aria-hidden="true">${rows.map((row) => `<i style="height:${Math.max(8, row[key] / max * 100)}%"></i>`).join("")}</div></div>`;
}

function renderAnalyticsBreakdown(rows, field, metric, title, cls) {
  const totals = Object.entries(rows.reduce((acc, row) => {
    acc[row[field]] = (acc[row[field]] || 0) + row[metric];
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...totals.map(([, value]) => value), 1);
  return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><span class="panel-sub">${rows.length} 天 · 示例汇总</span></div></div><div class="bar-list ${cls}">${totals.map(([label, value]) => `<div><span>${label}</span><i><b style="width:${value / max * 100}%"></b></i><strong class="num">${value.toLocaleString()} 吨</strong></div>`).join("")}</div></section>`;
}

function renderAnalytics() {
  const rows = getPeriodRows();
  const totals = rows.reduce((acc, row) => ({ mined: acc.mined + row.minedTons, transport: acc.transport + row.verifiedTransportTons, unload: acc.unload + row.receivedUnloadTons }), { mined: 0, transport: 0, unload: 0 });
  const query = searchValues.analytics;
  const displayRows = rows.filter((row) => matchesTrip(row, query, [(item) => item.date, (item) => item.miningArea, (item) => item.unloadPoint, (item) => item.minedSource, (item) => item.transportSource, (item) => item.unloadSource]));
  const chosen = rows.find((row) => row.date === analyticsDate) || rows.at(-1);
  const vehicleRows = operationsData.vehiclePeriods.filter((vehicle) => vehicle.periodKey === (analyticsPeriod === "month" ? "month" : "week") && matchesTrip(vehicle, query, [(item) => item.plate, (item) => item.sourceRecordId]));
  const vehicleMax = Math.max(...vehicleRows.map((vehicle) => vehicle.verifiedTons), 1);
  const range = `${rows[0]?.date || "—"} 至 ${rows.at(-1)?.date || "—"}`;
  const sourceMetrics = chosen ? [
    { cls: "mined", label: "采矿量", value: chosen.minedTons, id: chosen.sourceIds.mining, source: "采装计量样例", define: "采区在统计周期内的采出量" },
    { cls: "transport", label: "核实运输净重", value: chosen.verifiedTransportTons, id: chosen.sourceIds.transport, source: "人工核实趟次", define: "仅统计人工核实通过的趟次净重" },
    { cls: "unload", label: "卸点接收量", value: chosen.receivedUnloadTons, id: chosen.sourceIds.unload, source: "卸点接收磅单", define: "卸点/堆场接收计量" },
  ] : [];
  return `
    <div class="page">
      ${renderPageHeader("生产与运力分析", `示例矿区 · ${range} · ${operationsData.scopeLabel}`, `${renderSearch("analytics", "搜索日期、采区、车辆或卸货点")}${renderPeriodTabs()}`)}
      <div class="stat-grid analytics-kpis">${renderAnalyticsKpi("采矿量", totals.mined, rows, "minedTons", "mined")}${renderAnalyticsKpi("核实运输净重", totals.transport, rows, "verifiedTransportTons", "transport")}${renderAnalyticsKpi("卸点接收量", totals.unload, rows, "receivedUnloadTons", "unload")}</div>
      <div class="analytics-layout">
        <div class="analytics-main">
          <section class="panel"><div class="panel-head"><div><h2>产运关键指标趋势</h2><span class="panel-sub">${range}</span></div><button class="text-button" data-view="ai">生成分析报告 ›</button></div>${renderTrendChart(rows)}</section>
          <div class="analytics-pair">${renderAnalyticsBreakdown(rows, "miningArea", "minedTons", "采区采矿量分布", "mined")}${renderAnalyticsBreakdown(rows, "unloadPoint", "receivedUnloadTons", "卸点接收量分布", "unload")}</div>
          <section class="panel"><div class="panel-head"><div><h2>生产与运输明细</h2><span class="panel-sub">${displayRows.length} 个日期 · 三类数据来源独立</span></div></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>采区</th><th class="num">采矿量</th><th class="num">运输净重</th><th>卸货点</th><th class="num">接收量</th><th>来源</th></tr></thead><tbody>${displayRows.map((row) => `<tr class="${row.date === analyticsDate ? "selected" : ""}"><td><button class="text-button" data-analytics-date="${row.date}">${row.date}</button></td><td>${row.miningArea}</td><td class="num">${row.minedTons}</td><td class="num">${row.verifiedTransportTons}</td><td>${row.unloadPoint}</td><td class="num">${row.receivedUnloadTons}</td><td><button class="text-button" data-source-record="${row.sourceIds.mining}">示例汇总 ›</button></td></tr>`).join("") || '<tr><td colspan="7">没有匹配记录</td></tr>'}</tbody></table></div>
          </section>
          <section class="panel"><div class="panel-head"><div><h2>车辆周期运力</h2><span class="panel-sub">${vehicleRows[0]?.periodLabel || "扩展示例"} · 无额定载荷，不推算利用率</span></div></div>
            <div class="table-wrap"><table class="data-table"><thead><tr><th>车辆</th><th class="num">有效趟次</th><th>核实吨位</th><th class="num">均载重</th><th class="num">周转</th><th></th></tr></thead><tbody>${vehicleRows.map((vehicle) => `<tr><td><button class="text-button" data-open-vehicle="${vehicle.plate}">${vehicle.plate}</button></td><td class="num">${vehicle.trips}</td><td><span class="capacity-bar"><i><b style="width:${vehicle.verifiedTons / vehicleMax * 100}%"></b></i><span class="num">${vehicle.verifiedTons.toFixed(1)} 吨</span></span></td><td class="num">${vehicle.averagePayload.toFixed(2)} 吨</td><td class="num">${vehicle.turnaroundMinutes} 分</td><td><button class="text-button" data-source-record="${vehicle.sourceRecordId}">来源</button></td></tr>`).join("")}</tbody></table></div>
          </section>
        </div>
        <aside class="panel source-panel">
          <div class="panel-head"><div><h2>来源明细</h2><span class="panel-sub">${chosen ? `${chosen.date} · ${chosen.miningArea}` : "—"}</span></div></div>
          <div class="source-metrics">${sourceMetrics.map((item) => `<div class="source-metric ${item.cls}"><div><i></i><span>${item.label}</span><strong class="num">${item.value} 吨</strong></div><small>来源：${item.source} · ${item.id}</small><small>定义：${item.define}</small><button class="text-button" data-source-record="${item.id}">查看来源 ›</button></div>`).join("")}</div>
          ${selectedSourceId ? renderSourceRecord(selectedSourceId) : ""}
          <div class="note muted"><span>汇总样例来源不等同原始磅单；三类指标分别取自不同业务记录，不用差值判断损耗。</span></div>
        </aside>
      </div>
    </div>
  `;
}

function renderSourceButtons(ids) {
  return ids.map((id) => `<button class="tag blue source-link" data-open-source-trip="${id}">${id} ›</button>`).join("");
}

function renderMetricSourceButtons(ids = []) {
  return `${ids.slice(0, 3).map((id) => `<button class="tag blue source-link" data-source-record="${id}">${id} ›</button>`).join("")}${ids.length > 3 ? `<span class="panel-sub">另有 ${ids.length - 3} 条日汇总</span>` : ""}`;
}

function renderSourceRecord(id) {
  const record = operationsData.sourceRecords.find((item) => item.id === id);
  if (!record) return "";
  return `<div class="note"><strong>${record.id}</strong><span>${record.date} · ${record.metric} ${record.value.toLocaleString()} ${record.unit}</span><span>${record.source} · ${record.scope}</span></div>`;
}

function renderChatTrend(rows, key) {
  const max = Math.max(...rows.map((row) => row[key]), 1);
  return `<div class="mini-bars" role="img" aria-label="28天采矿量示例趋势">${rows.map((row) => `<i title="${row.date} · ${row[key]} 吨" style="height:${Math.max(8, row[key] / max * 100)}%"></i>`).join("")}</div><div class="mini-bars-range"><span>${rows[0]?.date || "—"}</span><span>${rows.length} 天 · 吨</span><span>${rows.at(-1)?.date || "—"}</span></div>`;
}

function matchChatIntent(question) {
  const query = question.toLocaleLowerCase();
  if (query.includes("生成") && query.includes("报告")) return "report";
  if (/晋B[·.]?24680|车辆|运力/.test(query) && /周|月|周期|运力/.test(query)) return query.includes("月") ? "vehicle-month-capacity" : "vehicle-capacity";
  if (/今天|今日/.test(query) && /运输|趟次|卸货/.test(query)) return "daily-operation";
  if (/采矿|采区|采出/.test(query)) return "production-trend";
  if (/卸点|卸货|接收量/.test(query)) return "unload-trend";
  if (/异常|稽核/.test(query)) return "anomaly-review";
  return null;
}

function startChatQuery(root, question, requestedIntent = null) {
  clearTimeout(chatStreamTimer);
  clearInterval(chatStreamTimer);
  chatQueryId += 1;
  const queryId = chatQueryId;
  chatQuestion = question.trim();
  chatDraft = "";
  selectedChat = requestedIntent || matchChatIntent(chatQuestion);
  const matched = operationsData.chatExamples.find((example) => example.intent === selectedChat);
  chatAnswer = matched
    ? { ...matched, question: chatQuestion }
    : { question: chatQuestion, answer: "当前演示支持运输日汇总、车辆周/月运力、采矿趋势、卸点接收量、稽核异常和明确提出的报告生成。可选择上方示例问题查看对应结果。", period: "未识别到支持的查询范围", metric: "未生成统计结果", sources: [], resultType: "unsupported" };
  chatStreamText = "";
  chatState = "thinking";
  render(root);
  chatStreamTimer = setTimeout(() => {
    if (queryId !== chatQueryId) return;
    chatState = "streaming";
    render(root);
    let offset = 0;
    chatStreamTimer = setInterval(() => {
      if (queryId !== chatQueryId) {
        clearInterval(chatStreamTimer);
        return;
      }
      offset = Math.min(chatAnswer.answer.length, offset + 10);
      chatStreamText = chatAnswer.answer.slice(0, offset);
      const target = root.querySelector("[data-answer-copy]");
      if (target) target.textContent = chatStreamText;
      if (offset >= chatAnswer.answer.length) {
        clearInterval(chatStreamTimer);
        chatState = "complete";
        render(root);
      }
    }, 32);
  }, 480);
}


function renderAnswerStats(items) {
  return `<div class="stat-grid answer-stats">${items.map(([label, value, tone = ""]) => `<div class="stat ${tone}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
}

// 逐步思考过程：展示 AI 从理解问题到输出结论的推理链路
function renderThinkingSteps(item) {
  if (!item || chatState !== "complete") return "";
  const steps = {
    "operation-summary": ["理解问题：聚焦今日运输趟次、核实净重与卸货接收量", "匹配数据口径：运输趟次台账、人工复核状态、卸点磅单", "汇总指标：按趟次统计核实通过 / 待复核，汇总当日卸货接收量", "生成结论：输出核心数据，并提示待复核趟次暂不计入结算"],
    "vehicle-capacity": ["理解问题：查询指定车辆周 / 月运力指标", "匹配数据口径：车辆周期运力汇总（有效趟次、核实净重、载重、周转）", "汇总指标：计算有效趟数、核实净重、平均载重与平均周转", "生成结论：输出运力指标，并说明因缺少额定载荷无法计算利用率"],
    "production-trend": ["理解问题：本月各采区采矿量变化趋势", "匹配数据口径：采装计量日汇总（28 天扩展示例）", "汇总指标：按采区分组求和，生成逐日趋势序列", "生成结论：给出周期采矿量、采区分布与趋势走向"],
    "unload-trend": ["理解问题：各卸点每日接收量", "匹配数据口径：卸点接收磅单日汇总（与运输净重口径不同）", "汇总指标：按卸点分组汇总、输出逐日明细", "生成结论：列出接收量与趋势，并提示不可用差值判断损耗"],
    "anomaly-list": ["理解问题：当前 AI 发现的异常线索", "匹配数据口径：路线与卸货记录对照、车辆皮重历史", "汇总指标：按趟次归集待复核线索与置信度", "生成结论：列出线索，并强调需人工复核、不等于违规结论"],
    "report-preview": ["理解问题：生成本月生产、运力与卸货趋势报告", "匹配数据口径：采装计量、核实运输净重、卸点接收量、车辆运力", "汇总指标：28 天趋势、四车运力对比、每日指标明细", "生成结论：产出报告预览，支持导出 / 打印"],
    "unsupported": ["理解问题：未识别到支持的查询范围", "匹配数据口径：当前演示支持运营、运力、趋势、异常、报告", "汇总指标：无", "生成结论：提示选择示例问题或调整问法"],
  };
  const list = steps[item.resultType] || steps["unsupported"];
  return `<details class="thinking-steps" open><summary>思考过程</summary><ol>${list.map((step) => `<li>${step}</li>`).join("")}</ol></details>`;
}

function renderChatAnswer(item) {
  if (!item) return "";
  const streaming = chatState === "streaming";
  const complete = chatState === "complete";
  let detail = "";
  let action = "";
  if (complete && item.resultType === "operation-summary") {
    const verified = getVerifiedTrips();
    const day = operationsData.dailyMetrics.find((row) => row.date === "2026-04-01");
    detail = `${renderAnswerStats([["运输趟次", `${seedTrips.length}<small>趟</small>`], ["核实通过", `${verified.length}<small>趟 · ${formatWeight(verified.reduce((sum, trip) => sum + getNetWeight(trip), 0))} 吨</small>`, "ok"], ["待复核", `${getUnresolvedTrips().length}<small>趟</small>`, "warn"], ["卸货接收量", `${day?.receivedUnloadTons ?? "—"}<small>吨</small>`]])}
      <div class="block mined"><div class="block-title">近 7 日核实运输净重趋势</div>${renderChatTrend(operationsData.dailyMetrics.slice(-7), "verifiedTransportTons")}</div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>趟次 / 车辆</th><th class="num">净重</th><th>人工状态</th></tr></thead><tbody>${seedTrips.map((trip) => `<tr class="clickable" data-open-trip="${trip.id}" tabindex="0"><td>${trip.id} · ${trip.plate}</td><td class="num">${formatWeight(getNetWeight(trip))} 吨</td><td>${statusPill(getStatus(trip))}</td></tr>`).join("")}</tbody></table></div>`;
    action = '<button class="button" data-view="audit">打开运输稽核</button>';
  } else if (complete && item.resultType === "vehicle-capacity") {
    const vehicle = operationsData.vehiclePeriods.find((record) => record.sourceRecordId === item.sourceRecordIds[0]);
    detail = `${renderAnswerStats([["有效趟次", `${vehicle.trips}<small>趟</small>`], ["核实净重", `${vehicle.verifiedTons.toFixed(1)}<small>吨</small>`, "blue"], ["均载重", `${vehicle.averagePayload.toFixed(2)}<small>吨</small>`], ["平均周转", `${vehicle.turnaroundMinutes}<small>分</small>`]])}
      <div class="bar-list mined">${operationsData.vehiclePeriods.filter((row) => row.periodKey === vehicle.periodKey).slice(0, 4).map((row) => { const max = Math.max(...operationsData.vehiclePeriods.filter((r) => r.periodKey === vehicle.periodKey).map((r) => r.verifiedTons), 1); return `<div class="${row.plate === vehicle.plate ? "is-self" : ""}"><span>${row.plate}</span><i><b style="width:${row.verifiedTons / max * 100}%"></b></i><strong class="num">${row.verifiedTons.toFixed(0)} 吨</strong></div>`; }).join("")}</div>
      <div class="note muted"><span>缺少额定载荷与可运营时长，暂不计算利用率。</span></div>`;
    action = `<button class="button" data-open-vehicle="${item.plate}">查看 ${item.plate} 档案</button>`;
  } else if (complete && item.resultType === "production-trend") {
    const rows = operationsData.dailyMetrics;
    const areas = [...new Set(rows.map((row) => row.miningArea))].map((area) => [area, rows.filter((row) => row.miningArea === area).reduce((sum, row) => sum + row.minedTons, 0)]);
    detail = `${renderAnswerStats([["周期采矿量", `${rows.reduce((sum, row) => sum + row.minedTons, 0).toLocaleString()}<small>吨</small>`, "cyan"], ["统计日期", `${rows.length}<small>天</small>`], ["采区数", `${areas.length}<small>个</small>`]])}<div class="block mined">${renderChatTrend(rows, "minedTons")}</div><div class="bar-list mined">${areas.map(([area, total]) => `<div><span>${area}</span><i><b style="width:${total / Math.max(...areas.map((entry) => entry[1])) * 100}%"></b></i><strong class="num">${total.toLocaleString()} 吨</strong></div>`).join("")}</div>`;
    action = '<button class="button" data-view="analytics">查看生产与运力分析</button>';
  } else if (complete && item.resultType === "unload-trend") {
    const rows = operationsData.dailyMetrics;
    const groups = [...new Set(rows.map((row) => row.unloadPoint))].map((point) => [point, rows.filter((row) => row.unloadPoint === point).reduce((sum, row) => sum + row.receivedUnloadTons, 0)]);
    detail = `${renderAnswerStats([["周期接收量", `${rows.reduce((sum, row) => sum + row.receivedUnloadTons, 0).toLocaleString()}<small>吨</small>`, "warn"], ["卸货点", `${groups.length}<small>个</small>`], ["日明细", `${rows.length}<small>天</small>`]])}<div class="bar-list unload">${groups.map(([point, total]) => `<div><span>${point}</span><i><b style="width:${total / Math.max(...groups.map((entry) => entry[1])) * 100}%"></b></i><strong class="num">${total.toLocaleString()} 吨</strong></div>`).join("")}</div>
      <div class="table-wrap scroll-y answer-table"><table class="data-table"><thead><tr><th>日期</th><th>卸货点</th><th class="num">接收量</th><th>来源</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.date}</td><td>${row.unloadPoint}</td><td class="num">${row.receivedUnloadTons} 吨</td><td><button class="text-button" data-source-record="${row.sourceIds.unload}">查看</button></td></tr>`).join("")}</tbody></table></div>
      <div class="note muted"><span>按卸点接收磅单单独统计；不以运输净重替代接收量。</span></div>`;
    action = '<button class="button" data-view="analytics">查看卸货趋势</button>';
  } else if (complete && item.resultType === "anomaly-list") {
    const anomalies = getOpenAnomalies();
    detail = `<div class="note warn"><span>${anomalies.length} 条待复核线索 · AI 提示不等于违规结论</span></div><div class="list">${anomalies.map((trip) => `<button class="list-row" data-open-trip="${trip.id}"><span class="row-main"><strong>${escapeHtml(trip.issue)} · ${trip.id}</strong><small>${trip.plate} · ${confidenceInfo(trip).short} · ${trip.occurredAt.replace("T", " ")}</small><small>${escapeHtml(eventText(trip))}</small></span><span class="text-button">查看 ›</span></button>`).join("") || '<div class="empty-state">当前没有待复核异常线索</div>'}</div>`;
    action = '<button class="button" data-view="audit">进入运输稽核</button>';
  } else if (complete && item.resultType === "report-preview") {
    detail = `<div class="block report-teaser"><strong>本月运营报告</strong><span>28 天趋势 · 四车运力对比 · 每日指标与来源</span><small>范围：${item.period} · 示例数据</small></div>`;
    action = '<button class="button primary" data-generate-report>生成报告</button>';
  }
  return `
    <article class="chat-answer">
      <header class="answer-head"><span class="ai-mark">AI</span><div><strong>分析结果</strong><small>${item.period} · 示例数据 · 演示响应</small></div>${complete ? '<div class="actions"><button class="text-button" data-copy-answer>复制</button><button class="text-button" data-regenerate>重新生成</button></div>' : ""}</header>
      ${renderThinkingSteps(item)}
      <p class="answer-text" data-answer-copy>${escapeHtml(streaming ? chatStreamText : item.answer)}${streaming ? '<i class="stream-caret" aria-hidden="true"></i>' : ""}</p>
      ${detail}
      ${complete ? `
        <div class="kv answer-scope"><div><span>指标口径</span><strong>${escapeHtml(item.metric)}</strong></div><div><span>数据来源</span><strong>${item.sources.map(escapeHtml).join("；") || "未查询平台数据"}</strong></div></div>
        ${item.sourceTripIds?.length || item.sourceRecordIds?.length ? `<div class="tags">${item.sourceTripIds?.length ? renderSourceButtons(item.sourceTripIds) : ""}${item.sourceRecordIds?.length ? renderMetricSourceButtons(item.sourceRecordIds) : ""}</div>` : ""}
        ${selectedSourceId ? renderSourceRecord(selectedSourceId) : ""}
        ${action ? `<div class="actions">${action}</div>` : ""}` : ""}
    </article>
  `;
}

function renderFilePreview() {
  if (!pendingUpload) return "";
  return `<section class="block file-preview"><div class="panel-head"><div><h3>解析预览</h3><span class="panel-sub">${escapeHtml(pendingUpload.name)} · ${pendingUpload.type}</span></div><button class="text-button" data-cancel-upload>取消</button></div><small class="panel-sub">来源位置：${escapeHtml(pendingUpload.sourceRef)}</small>${pendingUpload.rows ? `<div class="table-wrap"><table class="data-table"><tbody>${pendingUpload.rows.map(({ lineNo, cells }) => `<tr><td class="num">${lineNo}</td>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<pre class="file-excerpt">${escapeHtml(pendingUpload.excerpt || "文件内容为空")}</pre>`}<div class="note muted"><span>文件来源独立保存，不加入平台运营统计</span></div><button class="button primary" data-confirm-upload>确认整理为文件报告</button></section>`;
}

function renderAiWorkbench() {
  const busy = chatState === "streaming" || chatState === "thinking";
  return `
    <div class="page ai-page">
      ${renderPageHeader("AI工作台", "查运营数据、追溯来源、生成报告；回答基于示例数据", `<button class="button ${aiDockView === "reports" || aiDockView === "report" ? "primary" : ""}" data-open-ai-dock="reports">历史报告 <b>${reports.length}</b></button><button class="button ${aiDockView === "files" ? "primary" : ""}" data-open-ai-dock="files">文件解析 <b>${fileReports.length + (pendingUpload ? 1 : 0)}</b></button>`)}
      <div class="ai-layout ${aiDockView === "hidden" ? "" : "with-dock"}">
        <section class="panel chat-panel">
          <div class="chat-conversation scroll-y">
            ${chatQuestion ? `<div class="user-question">${escapeHtml(chatQuestion)}</div>` : `<div class="chat-empty"><span class="ai-mark">AI</span><strong>矿山运营问答</strong><span>${chatDraft ? "问题已填入，点击查询开始分析。" : "选择下方问题，或直接输入矿山运营问题。"}</span></div>`}
            ${chatState === "thinking" ? '<div class="ai-thinking"><span class="ai-mark">AI</span><div><strong>正在分析问题</strong><small>识别矿区、时间范围与数据口径</small></div><i><b></b><b></b><b></b></i></div>' : renderChatAnswer(chatAnswer)}
          </div>
          <div class="chat-prompts">${operationsData.chatExamples.map((example) => `<button class="prompt-chip ${selectedChat === example.intent ? "selected" : ""}" data-chat-example="${example.intent}">${example.question}</button>`).join("")}</div>
          <form class="chat-composer" data-chat-form><button class="icon-button" type="button" data-ai-tab="files" aria-label="上传文件">＋</button><input name="question" data-chat-composer-input value="${escapeHtml(chatDraft)}" placeholder="询问矿山运营数据…" aria-label="输入矿山运营问题"/>${busy ? '<button class="button" type="button" data-stop-chat>■ 停止</button>' : '<button class="button primary" type="submit">查询</button>'}</form>
        </section>
        ${renderAiSidePanel()}
      </div>
    </div>
  `;
}

function renderAiSidePanel() {
  const close = (label) => `<button class="icon-button" data-close-ai-dock aria-label="关闭${label}">×</button>`;
  if (aiDockView === "report" && reportPreview) return `<aside class="panel ai-dock"><div class="panel-head"><button class="back-link" data-close-report>‹ 历史报告</button>${close("报告")}</div><div class="dock-title"><span class="panel-sub">HTML 报告 · 示例数据</span><h2>${escapeHtml(reportPreview.title)}</h2><div class="actions"><button class="button" data-export-word>下载 Word</button><button class="button" data-print-report>打印 / 保存 PDF</button></div></div><article class="report-html-preview scroll-y">${reportBodyHtml(reportPreview)}</article></aside>`;
  if (aiDockView === "reports") return `<aside class="panel ai-dock"><div class="panel-head"><div><h2>历史报告</h2><span class="panel-sub">${reports.length} 份</span></div>${close("历史报告")}</div>${reports.length ? `<div class="list">${reports.map((report, index) => `<button class="list-row" data-view-report="${index}"><span class="row-main"><strong>${escapeHtml(report.title)}</strong><small>${report.createdAt} · ${report.origin}</small></span><span class="text-button">打开 ›</span></button>`).join("")}</div>` : '<div class="empty-state">提交报告问题后，可在这里查看生成记录</div>'}</aside>`;
  if (aiDockView === "files") return `<aside class="panel ai-dock"><div class="panel-head"><div><h2>文件与整理结果</h2><span class="panel-sub">${fileReports.length + (pendingUpload ? 1 : 0)} 项</span></div>${close("文件解析")}</div><label class="upload-drop"><input type="file" data-file-upload accept=".csv,.txt,.md,text/csv,text/plain,text/markdown"/><strong>＋ 上传文件</strong><span>支持 CSV / TXT / MD，解析后先预览再确认</span></label>${renderFilePreview()}${fileReports.length ? `<div class="list">${fileReports.map((report, index) => `<button class="list-row" data-view-file-report="${index}"><span class="row-main"><strong>${escapeHtml(report.name)}</strong><small>文件来源 · 已确认</small></span><span class="text-button">打开 ›</span></button>`).join("")}</div>` : '<div class="empty-state">尚无文件整理结果</div>'}</aside>`;
  return "";
}

function renderLightbox() {
  return `<div class="lightbox" data-lightbox hidden role="dialog" aria-modal="true" aria-label="示例车辆影像"><button class="lightbox-close" data-close-photo aria-label="关闭影像">×</button><img data-lightbox-image alt="完整示例车辆影像" /></div>${renderMonitorModal()}`;
}

function renderMonitorModal() {
  if (!monitorModalOpen) return '<div class="monitor-modal" data-monitor-modal hidden></div>';
  const trip = sampleTrips.get(selectedTripId);
  if (!trip) return "";
  const replay = monitorReplay || { date: trip.occurredAt.slice(0, 10), start: trip.times.gross, end: trip.times.tare, searched: false, matched: false };
  const tripStart = timeToMinutes(trip.times.gross);
  const tripEnd = timeToMinutes(trip.times.tare);
  const clipStart = Math.max(0, Math.min(1, (timeToMinutes(replay.start) - tripStart) / (tripEnd - tripStart)));
  const clipEnd = Math.max(0, Math.min(1, (timeToMinutes(replay.end) - tripStart) / (tripEnd - tripStart)));
  const live = monitorMode === "live";
  const noClip = !live && replay.searched && !replay.matched;
  return `
    <div class="monitor-modal" data-monitor-modal role="dialog" aria-modal="true" aria-labelledby="camera-title">
      <button class="modal-backdrop" data-close-monitor aria-label="关闭监控"></button>
      <section class="panel monitor-dialog">
        <div class="panel-head"><div><h2 id="camera-title">运输监控</h2><span class="panel-sub">${trip.id} · ${trip.plate}</span></div><div class="panel-actions"><div class="seg"><button class="${live ? "selected" : ""}" data-monitor-mode="live">实时演示</button><button class="${live ? "" : "selected"}" data-monitor-mode="replay">历史回放</button></div><button class="icon-button" data-close-monitor aria-label="关闭">×</button></div></div>
        <div class="camera-meta"><i class="dot ${live ? "danger" : "blue"}"></i><strong>${live ? "承重点摄像头" : "卸货点摄像头"}</strong><span>${escapeHtml(live ? trip.grossStation : trip.unloadRecord)}</span><span class="tag warn">演示视频 · 未连接现场摄像头</span></div>
        ${live ? "" : `<form class="camera-replay-form form" data-camera-query><label>日期<input type="date" name="date" value="${replay.date}" required /></label><label>开始<input type="time" name="start" value="${replay.start}" required /></label><label>结束<input type="time" name="end" value="${replay.end}" required /></label><button class="button primary" type="submit">查询回放</button></form>`}
        ${noClip ? `<div class="empty-state">所选时段没有这趟运输的演示录像。可选时段需覆盖 ${trip.times.gross}–${trip.times.tare}。</div>` : `<div class="camera-video-wrap"><video src="./public/videos/cctv-demo.mp4" data-clip-start="${clipStart}" data-clip-end="${clipEnd}" ${live || !replay.searched ? "autoplay loop" : "controls"} muted playsinline></video><span class="camera-badge"><i></i>${live ? "LIVE · 模拟画面" : "回放 · 模拟片段"}</span><span class="camera-time">${trip.occurredAt.slice(0, 10)}　${!live && replay.searched ? `${replay.start}—${replay.end}` : `${trip.times.gross}—${trip.times.tare}`}</span></div>
          ${live ? `<div class="camera-foot"><span>画面循环播放，用于体验查看入口与操作</span><span>采样时间 ${trip.times.gross}</span></div>` : `<div class="camera-foot"><span>本趟事件</span><div class="actions"><button class="button" type="button" data-camera-event="gross">重车承重 ${trip.times.gross}</button><button class="button" type="button" data-camera-event="unload">卸货 ${trip.times.unload}</button><button class="button" type="button" data-camera-event="tare">空车回皮 ${trip.times.tare}</button></div></div>`}`}
      </section>
    </div>
  `;
}

function reportBodyHtml(report) {
  if (!report.item) {
    const fileData = report.rows?.length
      ? `<div class="report-table-wrap"><table><thead><tr>${report.rows[0].cells.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${report.rows.slice(1).map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<pre>${escapeHtml(report.excerpt || "文件内容为空")}</pre>`;
    return `<div class="report-document"><div class="report-brand">矿山运营平台 <span>文件整理</span></div><h1>文件整理报告</h1><div class="report-meta">${escapeHtml(report.name)} · ${escapeHtml(report.type)} · 用户上传</div><section><h2>内容整理</h2>${fileData}</section><section><h2>来源与范围</h2><p>来源文件：${escapeHtml(report.name)}</p><p>位置：${escapeHtml(report.sourceRef || "文件内容")}</p><p>该文件报告与平台运营统计分开保存。</p></section></div>`;
  }
  const item = report.item;
  const snapshot = report.snapshot || buildReportSnapshot(item);
  const totals = snapshot.totals;
  const dailyChart = renderReportDailyChart(snapshot.dailyRows);
  const vehicleChart = renderReportVehicleChart(snapshot.vehicleRows);
  return `<div class="report-document"><div class="report-brand">矿山运营平台 <span>AI运营报告 · 示例</span></div><h1>${escapeHtml(report.title)}</h1><div class="report-meta">${escapeHtml(item.period)}　·　生成于 ${escapeHtml(report.createdAt || "当前会话")}　·　示例数据</div><section><h2>结论摘要</h2><p>${escapeHtml(item.answer)}</p></section><section><h2>本期关键指标</h2><div class="report-kpis"><div><span>采矿量</span><strong>${totals.mined.toLocaleString()}<small>吨</small></strong></div><div><span>核实运输净重</span><strong>${totals.transport.toLocaleString()}<small>吨</small></strong></div><div><span>卸点接收量</span><strong>${totals.unload.toLocaleString()}<small>吨</small></strong></div></div></section><section><h2>每日产运与接收趋势</h2><p>采矿量、核实运输净重和卸点接收量来自不同业务记录，分别观察，不用差值判断损耗。</p>${dailyChart}</section><section><h2>车辆月度运力</h2><p>按月展示各车人工核实运输净重和有效趟次；无额定载荷与可运营时长，不推算利用率。</p>${vehicleChart}</section><section><h2>逐日指标明细</h2><div class="report-table-wrap"><table><thead><tr><th>日期 / 来源记录</th><th>采矿量（吨）</th><th>核实运输净重（吨）</th><th>卸点接收量（吨）</th></tr></thead><tbody>${snapshot.dailyRows.map((row) => `<tr><td>${escapeHtml(row.date)}<small>${Object.values(row.sourceIds).map(escapeHtml).join(" · ")}</small></td><td>${row.minedTons}</td><td>${row.verifiedTransportTons}</td><td>${row.receivedUnloadTons}</td></tr>`).join("")}</tbody></table></div></section><section><h2>指标口径与来源</h2><ul><li>采矿量：采装计量示例数据。</li><li>核实运输净重：仅计人工核实通过的趟次。</li><li>卸点接收量：卸点接收磅单示例数据。</li><li>车辆运力：有效趟数、核实净重、平均载重与周转时长。</li></ul><ul>${item.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}</ul><p>本报告为模拟数据分析，不代表矿区现场事实；没有目标产量和成本口径，不提供完成率、节约额或损失额。</p></section></div>`;
}

function buildReportSnapshot(item) {
  const dailyRows = operationsData.dailyMetrics.map((row) => ({ ...row }));
  const vehicleRows = operationsData.vehiclePeriods.filter((row) => row.periodKey === "month").map((row) => ({ ...row }));
  return {
    period: item.period,
    dailyRows,
    vehicleRows,
    totals: dailyRows.reduce((sum, row) => ({ mined: sum.mined + row.minedTons, transport: sum.transport + row.verifiedTransportTons, unload: sum.unload + row.receivedUnloadTons }), { mined: 0, transport: 0, unload: 0 }),
  };
}

function renderReportDailyChart(rows) {
  const series = [{ key: "minedTons", name: "采矿量", color: "#0FB5C6" }, { key: "verifiedTransportTons", name: "核实运输净重", color: "#1E6FFF" }, { key: "receivedUnloadTons", name: "卸点接收量", color: "#F59E0B" }];
  const max = Math.max(...rows.flatMap((row) => series.map((entry) => row[entry.key])));
  const x = (index) => 58 + index * 510 / Math.max(1, rows.length - 1);
  const y = (value) => 162 - value / max * 126;
  const labels = rows.filter((_, index) => index % 4 === 0 || index === rows.length - 1);
  return `<div class="report-chart"><div class="report-chart-legend">${series.map((entry) => `<span><i style="background:${entry.color}"></i>${entry.name}</span>`).join("")}<small>吨 · 28 天示例</small></div><svg viewBox="0 0 600 210" role="img" aria-label="28天采矿量、核实运输净重和卸点接收量趋势图"><path d="M58 36H568M58 78H568M58 120H568M58 162H568" style="stroke:var(--chart-grid,#e5ebf0)" fill="none"/><g style="fill:var(--chart-label,#8295AB)" font-size="10"><text x="7" y="39">${Math.round(max)}</text><text x="7" y="81">${Math.round(max * .67)}</text><text x="7" y="123">${Math.round(max * .33)}</text><text x="36" y="165">0</text></g>${series.map((entry) => `<polyline points="${rows.map((row, index) => `${x(index)},${y(row[entry.key])}`).join(" ")}" fill="none" stroke="${entry.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}${labels.map((row) => { const index = rows.indexOf(row); return `<text x="${x(index)}" y="190" text-anchor="middle" style="fill:var(--chart-label,#6B7E95)" font-size="10">${row.date.slice(5)}</text>`; }).join("")}</svg></div>`;
}

function renderReportVehicleChart(rows) {
  const max = Math.max(...rows.map((row) => row.verifiedTons));
  return `<div class="report-vehicle-chart">${rows.map((row) => `<div class="report-vehicle-bar"><span>${escapeHtml(row.plate)}</span><div><i style="width:${row.verifiedTons / max * 100}%"></i></div><strong>${row.verifiedTons.toLocaleString()} 吨</strong><small>${row.trips} 趟</small></div>`).join("")}<small>月度人工核实运输净重 · 吨</small></div>`;
}

function renderToast() {
  return notice ? `<div class="toast" role="status">${notice}</div>` : "";
}

const guidedSteps = [
  { title: "运营驾驶舱", view: "workbench", stage: "discovery", note: "先查看车辆、运输状态与 AI 线索，再进入具体趟次核查。" },
  { title: "核对疑点", view: "audit", stage: "evidence", note: "先核对计划卸点、实际记录与影像；疑点不等于异常定论。" },
  { title: "人工复核", view: "audit", stage: "decision", note: "在详情中作出人工结论，也可以直接下一步查看待复核如何影响结算。" },
  { title: "查看结算", view: "settlement", stage: "settlement", note: "本趟只有核实通过才计入；下方可能展示另一趟核实通过记录的明细。" },
  { title: "运营分析", view: "analytics", note: "生产、运输、接收采用独立示例汇总口径，不以差值判断损耗。" },
  { title: "问数与报告", view: "ai", note: "选择或输入本月报告问题，点击查询体验示例分析和报告。" },
];

function startGuidedDemo(root) {
  stopReplay();
  customerExperience ||= createCustomerExperience();
  customerExperience.originalGuideContext ||= { analyticsPeriod, chatDraft, auditFilter };
  customerExperience.guided = true;
  showGuidedStep(root, 0);
}

function showGuidedStep(root, index) {
  const step = guidedSteps[index];
  if (!customerExperience?.guided || !step) return;
  customerExperience.guideStep = index;
  workflowForm = null;
  monitorModalOpen = false;
  reportPreview = null;
  selectedTripId = "T-0401-007";
  selectedVehiclePlate = sampleTrips.get(selectedTripId).plate;
  auditFilter = "all";
  searchValues.audit = "";
  searchValues.settlement = "";
  activeView = step.view;
  detailReturnView = "audit";
  if (step.view === "analytics") analyticsPeriod = "month";
  if (step.view === "ai") chatDraft = operationsData.chatExamples.find((item) => item.intent === "report").question;
  markCustomerVisited(step.stage);
  notice = "";
  render(root);
  const heading = root.querySelector?.("h1");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

function resetGuidedDemo(root) {
  if (!customerExperience?.guided) return;
  const clean = createCustomerExperience();
  customerExperience.reviewStatuses = clean.reviewStatuses;
  customerExperience.followUpCases = clean.followUpCases;
  customerExperience.visited = {};
  customerExperience.assessments = {};
  showGuidedStep(root, 0);
}

function renderGuidedJourney() {
  const index = activeView === "audit" && customerExperience.guideStep === 2 ? 2 : guidedSteps.findIndex((step) => step.view === activeView);
  const trip = sampleTrips.get("T-0401-007");
  const included = getStatus(trip) === "verified";
  return `<section class="guided-journey" aria-label="视频后的演示步骤">
    <div class="guided-journey-head"><strong>跟随视频，体验一趟运输</strong><span class="guided-journey-context">${trip.id} · ${trip.plate} · ${statusLabels[getStatus(trip)]} · ${included ? "已计入结算" : "未计入结算"}</span><div class="guided-journey-actions"><button data-open-guide>重看视频</button><button data-reset-guide>重置体验</button><button data-exit-customer>退出体验</button></div></div>
    <nav class="guided-journey-steps" aria-label="演示步骤">${guidedSteps.map((step, i) => `<button data-guide-step="${i}" ${i === index ? 'aria-current="step"' : ""}>${i + 1}. ${step.title}</button>`).join("")}</nav>
    <p class="guided-journey-note"><span>${guidedSteps[index]?.note || "正在自由浏览，可通过步骤按钮继续导览。"} 本地示例，非现场验收。</span>${index < guidedSteps.length - 1 ? `<button data-guide-step="${index + 1}">下一步：${guidedSteps[index + 1].title} ›</button>` : '<button data-return-customer>查看完整体验路径 ›</button>'}</p>
  </section>`;
}

function renderGlobalBar() {
  const range = getPeriodRows();
  const context = activeView === "analytics" ? `${range[0]?.date || "—"} ~ ${range.at(-1)?.date || "—"}` : "2026-04-01 ~ 2026-04-28";
  const pending = getOpenAnomalies().length;
  return `<header class="app-topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 28"><path d="M2 23 13 7l7 9 5-7 13 14H2Z"/></svg></span><span>矿山运营管理平台</span></div><div class="global-context"><span class="scope-chip"><span class="global-site-dot"></span>示例矿区 · 长青矿山</span><span class="scope-chip"><span class="scope-icon">${icon("calendar")}</span>${context}</span></div><div class="topbar-actions"><button class="theme-switch" data-toggle-theme aria-label="切换为${theme === "dark" ? "亮色" : "暗色"}主题">${icon(theme === "dark" ? "sun" : "moon")}<span>${theme === "dark" ? "亮色" : "暗色"}</span></button><button class="round-button" data-open-pending aria-label="待复核线索 ${pending} 条">${icon("bell")}${pending ? `<span class="round-badge">${pending}</span>` : ""}</button><button class="customer-quick-link" data-open-guide>▷ 演示导览</button><button class="customer-quick-link" data-enter-customer>客户体验</button><span class="operator-avatar">张</span><span class="operator-name">张工</span></div></header>`;
}

function createCustomerExperience() {
  return {
    reviewStatuses: Object.fromEntries(seedTrips.map((trip) => [trip.id, trip.reviewStatus])),
    followUpCases: Object.fromEntries(seedTrips.map((trip) => [trip.id, { type: "", progress: "", reason: "", requiredInfo: "", supplement: "", handling: "" }])),
    visited: {},
    assessments: {},
    originalSelectedTripId: selectedTripId,
    originalSelectedVehiclePlate: selectedVehiclePlate,
    originalSearchValues: { ...searchValues },
  };
}

function markCustomerVisited(stage) {
  if (customerExperience && stage) customerExperience.visited[stage] = true;
}

function enterCustomerExperience(root) {
  stopReplay();
  customerExperience ||= createCustomerExperience();
  workflowForm = null;
  notice = "";
  activeView = "customer";
  render(root);
}

function exitCustomerExperience(root) {
  const originalTripId = customerExperience?.originalSelectedTripId;
  const originalVehiclePlate = customerExperience?.originalSelectedVehiclePlate;
  const originalSearch = customerExperience?.originalSearchValues;
  if (customerExperience?.originalGuideContext) {
    ({ analyticsPeriod, chatDraft, auditFilter } = customerExperience.originalGuideContext);
  }
  customerExperience = null;
  workflowForm = null;
  if (originalTripId) selectedTripId = originalTripId;
  if (originalVehiclePlate) selectedVehiclePlate = originalVehiclePlate;
  if (originalSearch) Object.assign(searchValues, originalSearch);
  activeView = "workbench";
  notice = "已退出客户体验，正式演示状态未改变";
  render(root);
}

function render(root, focusSearch = null) {
  if (activeView === "customer") {
    root.innerHTML = `<div class="customer-mode-shell">${renderCustomerExperience()}${renderToast()}</div>`;
    return;
  }
  const pages = {
    workbench: renderCockpit,
    audit: renderAudit,
    vehicles: renderVehicles,
    settlement: renderSettlement,
    analytics: renderAnalytics,
    ai: renderAiWorkbench,
  };
  root.innerHTML = `
    <div class="app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}">
      ${renderGlobalBar()}
      ${renderNav()}
      <main class="main-content main-${activeView}" data-page="${activeView}">
        ${customerExperience?.guided ? renderGuidedJourney() : customerExperience ? '<div class="customer-mode-banner"><span>客户能力验收体验 · 本地模拟数据</span><span><button class="text-button" data-return-customer>返回验收路径</button><button class="text-button" data-exit-customer>退出体验</button></span></div>' : ""}
        ${pages[activeView]()}
      </main>
      ${renderToast()}
      ${renderLightbox()}
    </div>
  `;
  mountCockpit(root);
  if (monitorModalOpen && monitorMode === "replay" && monitorReplay?.matched) requestAnimationFrame(() => {
    const video = root.querySelector(".camera-video-wrap video");
    if (!video) return;
    const start = Number(video.dataset.clipStart);
    const end = Number(video.dataset.clipEnd);
    const seekStart = () => {
      video.currentTime = start * video.duration;
      video.play();
    };
    if (video.readyState >= 1) seekStart();
    else video.addEventListener("loadedmetadata", seekStart, { once: true });
    video.ontimeupdate = () => {
      if (video.currentTime >= end * video.duration) video.pause();
    };
  });
  if (focusSearch) {
    const input = root.querySelector(`[data-search-for="${focusSearch.view}"]`);
    input?.focus();
    input?.setSelectionRange(focusSearch.caret, focusSearch.caret);
  }
}

function openAuditTrip(root, tripId) {
  if (activeView === "vehicles") {
    detailReturnView = "vehicles";
  } else if (activeView !== "audit" && activeView !== "settlement") {
    detailReturnView = activeView;
    vehicleReturnView = activeView;
  }
  selectedTripId = tripId;
  markCustomerVisited("evidence");
  activeView = "audit";
  searchValues.audit = "";
  notice = "";
  render(root);
}

function selectView(root, view) {
  contextEntry = false;
  if (view !== "audit" && view !== "vehicles" && view !== "settlement") {
    detailReturnView = view;
    vehicleReturnView = view;
  }
  if (view !== "workbench") stopReplay();
  activeView = view;
  if (view !== "ai") aiDockView = "hidden";
  markCustomerVisited({ workbench: "discovery", audit: "evidence", vehicles: "archive", settlement: "settlement" }[view]);
  notice = "";
  if (view === "audit" && !sampleTrips.has(selectedTripId)) selectedTripId = seedTrips[0].id;
  if (view === "settlement" && !getVerifiedTrips().some((trip) => trip.id === selectedTripId)) {
    selectedTripId = getVerifiedTrips()[0]?.id ?? null;
  }
  render(root);
}

function handleReview(root, tripId, action) {
  markCustomerVisited("decision");
  selectedTripId = tripId;
  if (action === "needsInfo" || action === "confirmedAnomaly") {
    workflowForm = { tripId, type: action };
    render(root);
    return;
  }
  getReviewStatuses()[tripId] = "verified";
  notice = "人工核实通过，已计入净重预览";
  render(root);
}

function handleWorkflowSubmit(root, event) {
  if (event.target.matches("[data-feedback-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    const tripId = event.target.dataset.trip;
    const reason = String(values.reason || "").trim() || "其他";
    aiFeedback[tripId] = { vote: "inaccurate", reason };
    feedbackOpenTripId = null;
    notice = "反馈已记录，AI 判定将参考人工结论优化（演示）";
    render(root);
    return;
  }
  if (event.target.matches("[data-chat-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    const question = String(values.question || "").trim();
    if (question) startChatQuery(root, question);
    return;
  }
  if (event.target.matches("[data-camera-query]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    const trip = sampleTrips.get(selectedTripId);
    const start = timeToMinutes(values.start);
    const end = timeToMinutes(values.end);
    const matched = Boolean(trip && values.date === trip.occurredAt.slice(0, 10) && start >= timeToMinutes(trip.times.gross) && end <= timeToMinutes(trip.times.tare) && start < end);
    monitorReplay = { ...values, searched: true, matched };
    render(root);
    return;
  }
  const form = event.target.closest("[data-workflow-form]");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  const tripId = form.dataset.trip;
  const type = form.dataset.workflowForm;
  markCustomerVisited("decision");
  const current = getFollowUpCases()[tripId];
  if (type === "needsInfo") {
    getReviewStatuses()[tripId] = "pending";
    getFollowUpCases()[tripId] = { ...current, type: "supplement", progress: "awaitingSupplement", reason: values.reason, requiredInfo: values.requiredInfo, supplement: "", handling: "" };
    notice = "已记录补充要求，趟次仍待复核";
  } else if (type === "confirmedAnomaly") {
    getReviewStatuses()[tripId] = "confirmedAnomaly";
    getFollowUpCases()[tripId] = { ...current, type: "anomaly", progress: "toHandle", reason: values.reason, handling: "" };
    notice = "已确认异常，进入待处置；未计入结算";
  } else if (type === "supplement") {
    getFollowUpCases()[tripId] = { ...current, progress: "resubmitted", supplement: values.supplement };
    notice = "补充信息已提交，等待人工复核";
  } else if (type === "handling") {
    getFollowUpCases()[tripId] = { ...current, handling: values.handling };
    notice = "处置记录已保存";
  }
  workflowForm = null;
  selectedTripId = tripId;
  render(root);
}

function handleCaseAction(root, tripId, action) {
  markCustomerVisited("decision");
  const item = getFollowUpCases()[tripId];
  selectedTripId = tripId;
  if (action === "start") {
    getFollowUpCases()[tripId] = { ...item, progress: "processing" };
    notice = "异常处置已开始";
  } else if (action === "complete") {
    getFollowUpCases()[tripId] = { ...item, progress: "completed" };
    notice = "处置已完成；仍需人工重新核实才可进入结算";
  } else if (action === "re-review") {
    getReviewStatuses()[tripId] = "pending";
    notice = "已重新提交人工稽核";
  }
  render(root);
}

function downloadContent(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportDocument(report) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:Arial,'Microsoft YaHei',sans-serif;color:#0D1B2E;line-height:1.7;margin:32px}h1{font-size:24px;margin:20px 0 8px}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #E2E9F2;padding-bottom:6px}.report-brand{color:#0B7A89;font-weight:bold}.report-brand span{float:right;color:#5D7189;font-weight:normal}.report-meta{color:#5D7189;border-bottom:1px solid #E2E9F2;padding-bottom:14px}.report-document{max-width:900px;margin:0 auto}li,p{font-size:12px}.report-kpis{display:flex;gap:10px}.report-kpis>div{flex:1;padding:10px;border:1px solid #E2E9F2}.report-kpis span,.report-kpis strong{display:block}.report-kpis span{color:#5D7189;font-size:11px}.report-kpis strong{font-size:18px}.report-kpis small{font-size:11px}.report-chart svg{width:100%}.report-chart-legend{display:flex;gap:12px;font-size:10px}.report-chart-legend span{display:inline-flex;align-items:center;gap:4px}.report-chart-legend i{display:inline-block;width:8px;height:8px;border-radius:50%}.report-vehicle-chart{display:grid;gap:8px}.report-vehicle-bar{display:grid;grid-template-columns:90px 1fr 80px 44px;gap:8px;align-items:center}.report-vehicle-bar>div{height:8px;background:#eaf0f4}.report-vehicle-bar i{display:block;height:100%;background:#0FB5C6}.report-table-wrap{overflow:visible}.report-document table{width:100%;border-collapse:collapse;font-size:10px}.report-document td,.report-document th{border:1px solid #E2E9F2;padding:5px;text-align:left}.report-document td small{display:block;color:#5D7189;font-size:8px}@media print{body{margin:14mm}}</style></head><body>${reportBodyHtml(report)}</body></html>`;
}

function printReport(report) {
  const preview = window.open("", "_blank", "width=960,height=720");
  if (!preview) {
    notice = "浏览器拦截了打印窗口，请允许弹出窗口后重试";
    return;
  }
  preview.document.open();
  preview.document.write(reportDocument(report));
  preview.document.close();
  preview.focus();
  setTimeout(() => preview.print(), 250);
}

function copyTextViaExec(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
  textarea.remove();
  return ok;
}

function handleClick(root, event) {
  const videoEntry = event.target.closest("[data-open-guide]");
  if (videoEntry) {
    window.openDemoGuide(videoEntry, () => startGuidedDemo(root));
    return;
  }
  const guideStep = event.target.closest("[data-guide-step]");
  if (guideStep) {
    showGuidedStep(root, Number(guideStep.dataset.guideStep));
    return;
  }
  if (event.target.closest("[data-reset-guide]")) {
    resetGuidedDemo(root);
    return;
  }
  if (activeView === "workbench" && handleCockpitClick(root, event)) return;
  if (event.target.closest("[data-toggle-theme]")) {
    theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("mine-theme", theme);
    } catch {
      // 无痕模式等场景存不下，只影响下次打开时的默认主题
    }
    applyTheme();
    render(root);
    return;
  }
  if (event.target.closest("[data-toggle-sidebar]")) {
    sidebarCollapsed = !sidebarCollapsed;
    render(root);
    return;
  }
  if (event.target.closest("[data-open-pending]")) {
    auditFilter = "pending";
    selectView(root, "audit");
    return;
  }
  if (event.target.closest("[data-enter-customer]")) {
    enterCustomerExperience(root);
    return;
  }
  if (event.target.closest("[data-exit-customer]")) {
    exitCustomerExperience(root);
    return;
  }
  if (event.target.closest("[data-return-customer]")) {
    activeView = "customer";
    notice = "";
    render(root);
    return;
  }
  const customerRating = event.target.closest("[data-customer-rating]");
  if (customerRating) {
    customerExperience.assessments[customerRating.dataset.customerRating] = customerRating.dataset.ratingValue;
    render(root);
    return;
  }
  const customerView = event.target.closest("[data-customer-view]");
  if (customerView) {
    markCustomerVisited(customerView.dataset.customerStage);
    if (customerView.dataset.customerTrip) selectedTripId = customerView.dataset.customerTrip;
    if (customerView.dataset.customerPlate) selectedVehiclePlate = customerView.dataset.customerPlate;
    selectView(root, customerView.dataset.customerView);
    return;
  }
  const customerTrip = event.target.closest("[data-customer-trip]");
  if (customerTrip) {
    markCustomerVisited(customerTrip.dataset.customerStage);
    selectedTripId = customerTrip.dataset.customerTrip;
    openAuditTrip(root, selectedTripId);
    return;
  }
  const period = event.target.closest("[data-analytics-period]");
  if (period) {
    analyticsPeriod = period.dataset.analyticsPeriod;
    const rows = getPeriodRows();
    analyticsDate = rows.at(-1)?.date || analyticsDate;
    render(root);
    return;
  }
  const auditFilterButton = event.target.closest("[data-audit-filter]");
  if (auditFilterButton) {
    auditFilter = auditFilterButton.dataset.auditFilter;
    render(root);
    return;
  }
  const aiTab = event.target.closest("[data-ai-tab]");
  if (aiTab) {
    aiDockView = "files";
    render(root);
    if (aiTab.dataset.aiTab === "files") root.querySelector("[data-file-upload]")?.click();
    return;
  }
  const openAiDock = event.target.closest("[data-open-ai-dock]");
  if (openAiDock) {
    aiDockView = openAiDock.dataset.openAiDock;
    render(root);
    return;
  }
  const sourceTrip = event.target.closest("[data-open-source-trip]");
  if (sourceTrip) {
    openAuditTrip(root, sourceTrip.dataset.openSourceTrip);
    return;
  }
  const sourceRecord = event.target.closest("[data-source-record]");
  if (sourceRecord) {
    selectedSourceId = sourceRecord.dataset.sourceRecord;
    render(root);
    return;
  }
  const chartDate = event.target.closest("[data-analytics-date]");
  if (chartDate) {
    analyticsDate = chartDate.dataset.analyticsDate;
    render(root);
    return;
  }
  const prompt = event.target.closest("[data-chat-example]");
  if (prompt) {
    const item = operationsData.chatExamples.find((example) => example.intent === prompt.dataset.chatExample);
    if (!item) return;
    chatDraft = item.question;
    selectedChat = item.intent;
    render(root);
    root.querySelector("[data-chat-composer-input]")?.focus();
    return;
  }
  if (event.target.closest("[data-generate-report]")) {
    const item = chatAnswer?.resultType === "report-preview" ? chatAnswer : null;
    if (item) {
      const report = { title: "本月生产、运力与卸货趋势报告", createdAt: new Date().toLocaleString("zh-CN", { hour12: false }), origin: "平台示例数据", item: { ...item }, snapshot: buildReportSnapshot(item) };
      reports.unshift(report);
      reportPreview = report;
      aiDockView = "report";
      notice = "HTML 报告已生成";
    }
    render(root);
    return;
  }
  const openReport = event.target.closest("[data-view-report]");
  if (openReport) {
    reportPreview = reports[Number(openReport.dataset.viewReport)] || null;
    aiDockView = reportPreview ? "report" : "reports";
    render(root);
    return;
  }
  const openFileReport = event.target.closest("[data-view-file-report]");
  if (openFileReport) {
    const report = fileReports[Number(openFileReport.dataset.viewFileReport)];
    reportPreview = report ? { ...report, title: `${report.name} · 文件整理报告` } : null;
    aiDockView = reportPreview ? "report" : "files";
    render(root);
    return;
  }
  if (event.target.closest("[data-export-word]")) {
    if (reportPreview) downloadContent(`${reportPreview.title}.doc`, reportDocument(reportPreview), "application/msword;charset=utf-8");
    return;
  }
  if (event.target.closest("[data-print-report]")) {
    if (reportPreview) printReport(reportPreview);
    return;
  }
  if (event.target.closest("[data-close-report]")) {
    aiDockView = "reports";
    render(root);
    return;
  }
  if (event.target.closest("[data-close-ai-dock]")) {
    aiDockView = "hidden";
    render(root);
    return;
  }
  if (event.target.closest("[data-open-monitor]")) {
    selectedTripId = event.target.closest("[data-open-monitor]").dataset.openMonitor;
    monitorModalOpen = true;
    monitorMode = "live";
    monitorReplay = null;
    render(root);
    return;
  }
  const monitorModeButton = event.target.closest("[data-monitor-mode]");
  if (monitorModeButton) {
    monitorMode = monitorModeButton.dataset.monitorMode;
    if (monitorMode === "replay" && !monitorReplay) {
      const trip = sampleTrips.get(selectedTripId);
      monitorReplay = { date: trip.occurredAt.slice(0, 10), start: trip.times.gross, end: trip.times.tare, searched: false, matched: false };
    }
    render(root);
    return;
  }
  if (event.target.closest("[data-close-monitor]")) {
    monitorModalOpen = false;
    render(root);
    return;
  }
  const cameraEvent = event.target.closest("[data-camera-event]");
  if (cameraEvent) {
    const video = root.querySelector(".camera-video-wrap video");
    const trip = sampleTrips.get(selectedTripId);
    const eventTime = trip.times[cameraEvent.dataset.cameraEvent];
    video.currentTime = ((timeToMinutes(eventTime) - timeToMinutes(trip.times.gross)) / (timeToMinutes(trip.times.tare) - timeToMinutes(trip.times.gross))) * video.duration;
    video.play();
    return;
  }
  if (event.target.closest("[data-confirm-upload]")) {
    if (pendingUpload) {
      fileReports.unshift({ ...pendingUpload, content: buildFileReport(pendingUpload) });
      notice = "文件来源报告已整理，未并入平台统计";
      pendingUpload = null;
    }
    render(root);
    return;
  }
  if (event.target.closest("[data-cancel-upload]")) {
    pendingUpload = null;
    render(root);
    return;
  }
  const back = event.target.closest("[data-back-context]");
  if (back) {
    activeView = back.dataset.backContext;
    render(root);
    return;
  }
  const openVehicle = event.target.closest("[data-open-vehicle]");
  if (openVehicle) {
    contextEntry = true;
    vehicleReturnView = activeView === "vehicles" ? vehicleReturnView : activeView;
    selectedVehiclePlate = openVehicle.dataset.openVehicle;
    activeView = "vehicles";
    render(root);
    return;
  }
  if (event.target.closest("[data-open-settlement]")) {
    contextEntry = true;
    detailReturnView = "audit";
    activeView = "settlement";
    render(root);
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    selectView(root, viewButton.dataset.view);
    return;
  }
  const openTrip = event.target.closest("[data-open-trip]");
  if (openTrip) {
    openAuditTrip(root, openTrip.dataset.openTrip);
    return;
  }
  const selectTrip = event.target.closest("[data-select-trip]");
  if (selectTrip) {
    selectedTripId = selectTrip.dataset.selectTrip;
    notice = "";
    render(root);
    return;
  }
  const review = event.target.closest("[data-review]");
  if (review) {
    handleReview(root, review.dataset.trip, review.dataset.review);
    return;
  }
  if (event.target.closest("[data-stop-chat]")) {
    chatQueryId += 1;
    clearTimeout(chatStreamTimer);
    clearInterval(chatStreamTimer);
    chatStreamText = chatAnswer.answer;
    chatState = "complete";
    notice = "已停止生成，显示完整结果";
    render(root);
    return;
  }
  if (event.target.closest("[data-copy-answer]")) {
    const text = chatAnswer?.answer || "";
    const finish = (copied) => {
      notice = copied ? "已复制回答文本" : "复制失败，请手动选择文本";
      render(root);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => finish(copyTextViaExec(text)));
    } else {
      finish(copyTextViaExec(text));
    }
    return;
  }
  if (event.target.closest("[data-regenerate]")) {
    startChatQuery(root, chatQuestion, selectedChat);
    return;
  }
  const feedbackVote = event.target.closest("[data-feedback-vote]");
  if (feedbackVote) {
    const { trip: tripId, feedbackVote: vote } = feedbackVote.dataset;
    if (vote === "accurate") {
      aiFeedback[tripId] = { vote: "accurate", reason: "" };
      notice = "反馈已记录（演示）";
    } else {
      feedbackOpenTripId = tripId;
    }
    render(root);
    return;
  }
  const feedbackReason = event.target.closest("[data-feedback-reason]");
  if (feedbackReason) {
    aiFeedback[feedbackReason.dataset.trip] = { vote: "inaccurate", reason: feedbackReason.dataset.feedbackReason };
    feedbackOpenTripId = null;
    notice = "反馈已记录，AI 判定将参考人工结论优化（演示）";
    render(root);
    return;
  }
  if (event.target.closest("[data-cancel-feedback]")) {
    feedbackOpenTripId = null;
    render(root);
    return;
  }
  if (event.target.closest("[data-cancel-workflow]")) {
    workflowForm = null;
    render(root);
    return;
  }
  const caseAction = event.target.closest("[data-case-action]");
  if (caseAction) {
    handleCaseAction(root, caseAction.dataset.trip, caseAction.dataset.caseAction);
    return;
  }
  const vehicle = event.target.closest("[data-select-vehicle]");
  if (vehicle) {
    selectedVehiclePlate = vehicle.dataset.selectVehicle;
    render(root);
    return;
  }
  const settlementTrip = event.target.closest("[data-settlement-trip]");
  if (settlementTrip) {
    selectedTripId = settlementTrip.dataset.settlementTrip;
    render(root);
    return;
  }
  const photo = event.target.closest("[data-photo]");
  if (photo) {
    const lightbox = root.querySelector("[data-lightbox]");
    const image = root.querySelector("[data-lightbox-image]");
    image.src = photo.dataset.photo;
    lightbox.hidden = false;
    root.querySelector("[data-close-photo]")?.focus();
    return;
  }
  if (event.target.closest("[data-close-photo]") || event.target.matches("[data-lightbox]")) {
    const lightbox = root.querySelector("[data-lightbox]");
    lightbox.hidden = true;
    root.querySelector("[data-photo]")?.focus();
  }
}

function renderApp(root) {
  root.addEventListener("click", (event) => handleClick(root, event));
  root.addEventListener("submit", (event) => handleWorkflowSubmit(root, event));
  root.addEventListener("change", async (event) => {
    const camera = event.target.closest("[data-cockpit-camera]");
    if (camera) {
      cockpitCamera = camera.value;
      root.querySelector("[data-cockpit-caption]").textContent = `${cockpitCamera} · 模拟画面（接入后按趟次联动）`;
      return;
    }
    const input = event.target.closest("[data-file-upload]");
    const file = input?.files?.[0];
    if (!file) return;
    const extension = `.${file.name.split(".").at(-1).toLocaleLowerCase()}`;
    if (!operationsData.supportedFileTypes.includes(extension)) {
      notice = "当前支持 CSV、TXT、MD 文件";
      render(root);
      return;
    }
    const text = await file.text();
    let lines = text.split(/\r?\n/).map((line, index) => ({ lineNo: index + 1, line })).filter((item) => item.line.trim());
    let rows = null;
    if (extension === ".csv") {
      try {
        rows = parseCsvFile(text).slice(0, 7).map((row) => ({ lineNo: row.lineNo, cells: row.cells.slice(0, 6) }));
        lines = rows.map(({ lineNo, cells }) => ({ lineNo, line: cells.join(" · ") }));
      } catch (error) {
        notice = error.message;
        render(root);
        return;
      }
    }
    const previewLines = lines.slice(0, 12);
    pendingUpload = { name: file.name, type: extension.toUpperCase().slice(1), excerpt: extension === ".csv" ? "CSV表格预览见下方" : previewLines.map((item) => `${item.lineNo}: ${item.line}`).join("\n").slice(0, 1200), sourceRef: extension === ".csv" ? `第${rows[0]?.lineNo ?? 1}–${rows.at(-1)?.lineNo ?? 1}行（含表头）` : `第${previewLines[0]?.lineNo ?? 1}–${previewLines.at(-1)?.lineNo ?? 1}行`, rows };
    aiContentTab = "files";
    render(root);
  });
  root.addEventListener("input", (event) => {
    const chatInput = event.target.closest("[data-chat-composer-input]");
    if (chatInput) {
      chatDraft = chatInput.value;
      return;
    }
    const input = event.target.closest("[data-search-for]");
    if (!input) return;
    const view = input.dataset.searchFor;
    const caret = input.selectionStart ?? input.value.length;
    searchValues[view] = input.value;
    render(root, { view, caret });
  });
  root.addEventListener("keydown", (event) => {
    const chartDate = event.target.closest("[data-analytics-date]");
    if (chartDate && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      analyticsDate = chartDate.dataset.analyticsDate;
      render(root);
      return;
    }
    if (event.key === "Escape") {
      const lightbox = root.querySelector("[data-lightbox]");
      if (lightbox && !lightbox.hidden) {
        lightbox.hidden = true;
        root.querySelector("[data-photo]")?.focus();
      }
    }
    const tripRow = event.target.closest("tr[data-open-trip]");
    if (tripRow && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openAuditTrip(root, tripRow.dataset.openTrip);
      return;
    }
    const row = event.target.closest("[data-settlement-trip]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectedTripId = row.dataset.settlementTrip;
      render(root);
    }
  });
  render(root);
}

applyTheme();
renderApp(document.querySelector("#app"));
