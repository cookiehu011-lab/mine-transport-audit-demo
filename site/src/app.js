const { getNetWeight, seedTrips, vehicleTareChecks } = window;
const operationsData = window.operationsDemoData;
const parseCsvFile = window.parseDemoCsv;
const buildFileReport = window.buildDemoFileReport;

const navItems = [
  { id: "workbench", label: "运营监控", icon: "workbench" },
  { id: "audit", label: "运输稽核", icon: "audit" },
  { id: "analytics", label: "生产与运力分析", icon: "analytics" },
  { id: "ai", label: "AI工作台", icon: "ai" },
];

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
const searchValues = { workbench: "", audit: "", vehicles: "", settlement: "", analytics: "" };
const eventQueue = [];
let selectedMapPlate = operationsData.map.vehicles[0].plate;
let analyticsPeriod = "week";
let analyticsDate = operationsData.dailyMetrics.at(-1).date;
let selectedChat = "production-trend";
let aiContentTab = "reports";
let auditFilter = "all";
let chatQuestion = "";
let chatAnswer = null;
let reports = [];
let pendingUpload = null;
let fileReports = [];
let selectedSourceId = null;
let vehicleReturnView = "workbench";
let detailReturnView = "workbench";
let replayPlaying = false;
let replayActive = false;
let replayCursor = 0;
let replayProgress = 0;
let replayTimer = null;

let activeView = "workbench";
let selectedTripId = "T-0401-007";
let selectedVehiclePlate = "蒙A·67890";
let eventCursor = 0;
let simulationRunning = false;
let simulationTimer = null;
let mineMap = null;
let mineMapElement = null;
let mineMapVehicles = new Map();
let mineMapRoutes = new Map();
let notice = "";
let workflowForm = null;

const formatWeight = (value) => Number(value).toFixed(2);
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
  workbench: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  audit: '<path d="M5 4.75h10l3 3v11.5H5z"/><path d="M14.75 4.75v3.5h3.5M8 12h7M8 15.5h5"/>',
  vehicles: '<path d="M3 7h12l3 5v6H3z"/><path d="M18 12h3v5h-3M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
  settlement: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  analytics: '<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-6"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="11" r="1"/><circle cx="15" cy="13" r="1"/>',
  ai: '<path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M5.6 18.4l2.1-2.1M12 18v3M18.4 18.4l-2.1-2.1M18 12h3M18.4 5.6l-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
}

function renderNav() {
  const currentView = activeView === "vehicles" ? vehicleReturnView : activeView === "settlement" ? detailReturnView : activeView;
  return `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 28"><path d="M2 23 13 7l7 9 5-7 13 14H2Z"/></svg></span><span>矿山运营平台</span></div>
      <nav aria-label="主导航">
        ${navItems.map((item) => `
          <button class="nav-item ${currentView === item.id ? "active" : ""}" data-view="${item.id}" ${currentView === item.id ? 'aria-current="page"' : ""}>
            ${icon(item.icon)}<span>${item.label}</span>
            ${item.id === "audit" ? `<span class="nav-count">${getUnresolvedTrips().length}</span>` : ""}
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-user"><span>张</span><div><strong>张工</strong><small>矿区运营负责人</small></div><b>⌄</b></div>
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
  return `<span class="status ${status}">${statusLabels[status]}</span>`;
}

function matchesTrip(trip, value, fields) {
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field(trip) ?? "").toLocaleLowerCase().includes(needle));
}

function renderPageHeader(title) {
  return `<header class="page-header"><h1>${title}</h1><span class="sample-tag">示例数据</span></header>`;
}

function renderContextBack(view, label) {
  return `<div class="context-back"><button class="text-button" data-back-context="${view}">‹ 返回${label}</button><span>当前对象 · 示例记录</span></div>`;
}

const viewLabels = { workbench: "运营监控", audit: "运输稽核", analytics: "生产与运力分析", ai: "AI工作台", vehicles: "车辆档案", settlement: "结算预览" };

function renderMetric(label, value, unit = "") {
  return `<div class="metric"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>`;
}

function renderCustomerEntry() {
  return `
    <section class="customer-entry">
      <div><strong>客户能力验收体验</strong><span>从异常发现走到人工处置、车辆档案与结算</span></div>
      <button class="button primary" data-enter-customer>${customerExperience ? "继续体验" : "开始验收体验"}</button>
    </section>
  `;
}

function renderCustomerExperience() {
  const steps = [
    { id: "discovery", title: "发现异常", detail: "工作台集中展示待核查趟次和 AI 异常线索。", action: "进入工作台", view: "workbench", evidence: "T-0401-007 · 卸货点不一致" },
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
      <header class="customer-header"><div><span class="customer-mark">矿</span><span>客户能力验收体验</span></div><button class="text-button" data-exit-customer>退出体验</button></header>
      <section class="customer-persona"><span class="eyebrow">矿山运营 / 计量结算负责人</span><h1>一趟运输，从异常发现到结算</h1><p>按同一趟示例记录，体验 AI 提示、证据核对、人工处置和跨模块联动。</p><div class="customer-demo-boundary"><span>本地示例数据</span><span>AI规则模拟</span><span>体验操作退出后重置</span></div></section>
      <section class="customer-journey"><div class="section-heading"><h2>能力验收路径</h2><span>已体验 ${visitedCount} / ${steps.length} · 已评价 ${reviewedCount} / ${steps.length}</span></div>
        ${steps.map((step, index) => `<article class="journey-step ${customerExperience.visited[step.id] ? "visited" : ""}"><div class="journey-step-number">0${index + 1}</div><div class="journey-step-body"><div class="journey-step-head"><strong>${step.title}</strong><span>${step.evidence}</span></div><p>${step.detail}</p><div class="journey-step-actions"><button class="button secondary" data-customer-view="${step.view}" data-customer-stage="${step.id}" ${step.tripId ? `data-customer-trip="${step.tripId}"` : ""} ${step.plate ? `data-customer-plate="${step.plate}"` : ""}>${step.action}</button><div class="journey-rating" aria-label="客户自评 ${step.title}">${["符合", "需调整", "不符合"].map((value) => `<button class="rating-option ${customerExperience.assessments[step.id] === value ? "selected" : ""}" data-customer-rating="${step.id}" data-rating-value="${value}" aria-pressed="${customerExperience.assessments[step.id] === value}">${value}</button>`).join("")}</div></div></div><span class="journey-visited">${customerExperience.visited[step.id] ? "已体验" : "待体验"}</span></article>`).join("")}
      </section>
      <div class="customer-free-browse"><span>也可自由查看其他示例</span><button class="text-button" data-customer-view="audit" data-customer-stage="evidence" data-customer-trip="T-0401-003">皮重异常 ›</button><button class="text-button" data-customer-trip="T-0401-002">AI建议通过 ›</button></div>
      <p class="customer-boundary">此处确认的是 Demo 展示的能力，不等于正式系统现场验收。影像、数据及 AI 结论均为示例；真实部署范围按项目约定。</p>
    </main>
  `;
}

function renderWorkbenchRow(trip) {
  return `
    <button class="work-row" data-open-trip="${trip.id}">
      <span><strong>${trip.id}</strong><small>${trip.plate} · ${trip.material}</small></span>
      <span class="work-row-issue">${trip.issue ? `<span class="ai-finding anomaly">AI发现异常</span>${trip.issue}` : "待人工确认"}</span>
      ${statusPill(getStatus(trip))}
      <span class="row-arrow" aria-hidden="true">›</span>
    </button>
  `;
}

function mapVehiclePosition(vehicle) {
  if (!replayActive) return { x: vehicle.x, y: vehicle.y };
  const index = operationsData.map.vehicles.indexOf(vehicle);
  const route = operationsData.map.routes.find((item) => item.tripId === vehicle.tripId);
  const points = (route?.points || "").split(" ").map((pair) => pair.split(",").map(Number));
  if (points.length < 2) return { x: vehicle.x, y: vehicle.y };
  const scaled = ((replayProgress + index * 0.19) % 1) * (points.length - 1);
  const segment = Math.floor(scaled);
  const fraction = scaled - segment;
  const start = points[segment];
  const end = points[Math.min(segment + 1, points.length - 1)];
  return { x: start[0] + (end[0] - start[0]) * fraction, y: start[1] + (end[1] - start[1]) * fraction };
}

function mapCoordinate(point) {
  const [centerLat, centerLng] = operationsData.map.center;
  return [centerLat + (50 - point.y) * 0.00055, centerLng + (point.x - 50) * 0.0007];
}

function truckMapIcon(selected) {
  const color = selected ? "#0bb7c6" : "#22384c";
  return L.divIcon({
    className: "map-truck-marker",
    html: `<span class="map-truck-symbol ${selected ? "selected" : ""}"><svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 4h18v13H2zM20 8h6l4 5v4h-10z" fill="${color}"/><path d="M21 9h4l3 4h-7z" fill="#d9f8fa"/><circle cx="8" cy="19" r="3"/><circle cx="24" cy="19" r="3"/></svg></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function mountMineMap(root) {
  const placeholder = root.querySelector("#mine-map-canvas");
  if (!placeholder) return;
  if (mineMapElement && mineMap) {
    placeholder.replaceWith(mineMapElement);
    mineMap.invalidateSize({ pan: false });
    syncMineMap();
    return;
  }
  if (!mineMapElement) mineMapElement = placeholder;
  if (!window.L) {
    placeholder.innerHTML = '<div class="map-load-error">地图组件暂不可用</div>';
    return;
  }
  mineMap = L.map(placeholder, { zoomControl: false, preferCanvas: true }).setView(operationsData.map.center, operationsData.map.zoom);
  L.control.zoom({ position: "topright" }).addTo(mineMap);
  const mapStatus = document.createElement("div");
  mapStatus.className = "map-load-error";
  mapStatus.hidden = true;
  placeholder.append(mapStatus);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).on("tileerror", () => {
    mapStatus.textContent = "底图暂不可用 · 示意路线和车辆仍为模拟数据";
    mapStatus.hidden = false;
  }).on("tileload", () => {
    mapStatus.hidden = true;
  }).addTo(mineMap);
  operationsData.map.routes.forEach((route) => {
    const points = route.points.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return mapCoordinate({ x, y });
    });
    mineMapRoutes.set(route.tripId, L.polyline(points, { color: "#93a6b5", weight: 5, opacity: 0.72 }).addTo(mineMap));
  });
  operationsData.map.nodes.forEach((node) => {
    const marker = L.marker(mapCoordinate(node), {
      icon: L.divIcon({ className: "map-site-marker", html: `<span class="map-site-dot ${node.type === "卸货点" ? "unload" : node.type === "承重点" ? "scale" : "pit"}"></span><strong>${node.label}</strong>`, iconSize: [120, 28], iconAnchor: [9, 10] }),
      interactive: false,
    }).addTo(mineMap);
  });
  operationsData.map.vehicles.forEach((vehicle) => {
    const marker = L.marker(mapCoordinate(vehicle), { icon: truckMapIcon(false), zIndexOffset: 400, title: vehicle.plate }).addTo(mineMap);
    marker.bindTooltip(vehicle.plate, { direction: "top", offset: [0, -12], className: "map-truck-label" });
    marker.on("click", () => {
      selectedMapPlate = vehicle.plate;
      render(root);
    });
    mineMapVehicles.set(vehicle.plate, marker);
  });
  syncMineMap();
}

function syncMineMap() {
  if (!mineMap) return;
  const selected = operationsData.map.vehicles.find((vehicle) => vehicle.plate === selectedMapPlate);
  operationsData.map.routes.forEach((route) => {
    mineMapRoutes.get(route.tripId)?.setStyle(selected?.tripId === route.tripId ? { color: "#0bb7c6", weight: 6, opacity: 0.96 } : { color: "#617487", weight: 4, opacity: 0.72 });
  });
  operationsData.map.vehicles.forEach((vehicle) => {
    const position = mapVehiclePosition(vehicle);
    const marker = mineMapVehicles.get(vehicle.plate);
    marker?.setLatLng(mapCoordinate(position));
    marker?.setIcon(truckMapIcon(selectedMapPlate === vehicle.plate));
  });
}

function renderMineMap() {
  return `
    <section class="mine-map" aria-label="矿区模拟路线图">
      <div id="mine-map-canvas" class="mine-map-canvas" role="application" aria-label="交互式矿山地图，车辆和路线均为模拟数据"></div>
      <div class="map-layer-label">示例矿区 · 模拟坐标</div>
      <div class="map-legend"><span><i class="pit-dot"></i>采区</span><span><i class="scale-dot"></i>承重点</span><span><i class="unload-dot"></i>卸货点</span><span><i class="truck-dot"></i>车辆</span></div>
      <div class="map-scale">${operationsData.map.locationLabel} · 示意路线 · 非现场 GPS</div>
    </section>
  `;
}

function renderMonitorVehicle(vehicle) {
  return `<button class="monitor-vehicle ${selectedMapPlate === vehicle.plate ? "selected" : ""}" data-map-vehicle="${vehicle.plate}"><span class="monitor-vehicle-icon">${icon("vehicles")}</span><span><strong>${vehicle.plate}</strong><small>${vehicle.tripId} · ${vehicle.status}</small></span><span class="vehicle-last-seen">${vehicle.lastLocated.slice(11)}</span></button>`;
}

function renderWorkbench() {
  const open = getOpenAnomalies();
  const selected = operationsData.map.vehicles.find((vehicle) => vehicle.plate === selectedMapPlate) || operationsData.map.vehicles[0];
  const trips = seedTrips.filter((trip) => matchesTrip(trip, searchValues.workbench, [(item) => item.id, (item) => item.plate]));
  return `
    <div class="monitor-page"><div class="monitor-layout"><div class="monitor-map-column">${renderMineMap()}</div>
      <aside class="monitor-rail"><div class="rail-heading"><div><span>选中车辆</span><strong>${selected.plate}</strong></div>${statusPill(getStatus(sampleTrips.get(selected.tripId)))}</div><div class="vehicle-rail-data"><div><span>当前趟次</span><button class="text-button" data-open-trip="${selected.tripId}">${selected.tripId} ›</button></div><div><span>运行状态</span><strong>${selected.status}</strong></div><div><span>计划路径</span><strong>${selected.route.join(" → ")}</strong></div><div><span>最后位置</span><strong>${selected.lastLocated}</strong></div></div><button class="button secondary rail-action" data-open-vehicle="${selected.plate}">查看车辆档案</button>
        <div class="rail-divider"></div><div class="section-heading"><h3>AI异常线索</h3><span>${open.length} 项</span></div>${open.length ? open.map((trip) => `<button class="monitor-alert" data-open-trip="${trip.id}"><span class="alert-mark">!</span><span><strong>${trip.issue}</strong><small>${trip.id} · ${trip.plate}</small><em>${escapeHtml(eventText(trip))}</em></span><b>查看 ›</b></button>`).join("") : '<div class="empty-state">当前没有待复核线索</div>'}
      </aside></div>
    <div class="monitor-search">${renderSearch("workbench", "搜索车牌或趟次")}${searchValues.workbench.trim() ? `<div class="search-results-panel">${trips.map(renderWorkbenchRow).join("") || '<div class="empty-state">没有匹配记录</div>'}</div>` : ""}</div>
    </div>
  `;
}

function eventText(trip) {
  const caseReason = getFollowUp(trip)?.reason;
  if (getStatus(trip) === "confirmedAnomaly" && caseReason) return caseReason;
  if (trip.issue === "皮重波动异常") {
    const difference = Number((trip.tareWeight - trip.tareMean).toFixed(2));
    return `回皮 ${formatWeight(trip.tareWeight)} 吨，较历史均值 ${formatWeight(trip.tareMean)} 吨低 ${formatWeight(Math.abs(difference))} 吨。`;
  }
  return `计划卸货点与卸货记录不一致：${trip.plannedRoute.at(-1)} / ${trip.unloadRecord}。`;
}

function renderEvent(trip, label = "示例异常") {
  return `
    <button class="event-row" data-open-trip="${trip.id}">
      <span class="event-dot"></span>
      <span class="event-content"><span class="event-meta">${label} · ${trip.times.unload}</span><strong>${trip.id} <small>${trip.plate}</small></strong><span>${escapeHtml(eventText(trip))}</span></span>
      <span class="event-open">查看</span>
    </button>
  `;
}

function renderAuditRow(trip) {
  const status = getStatus(trip);
  const assessment = aiAssessment(trip);
  const followUp = getFollowUp(trip);
  const followUpLabel = followUp.type === "supplement"
    ? followUp.progress === "awaitingSupplement" ? "待补充" : "待复核"
    : followUp.type === "anomaly" ? (followUp.progress === "completed" ? "处置已完成" : followUp.progress === "processing" ? "处理中" : "待处置") : "";
  return `
    <button class="audit-row ${assessment.kind === "anomaly" ? "has-ai-anomaly" : ""} ${selectedTripId === trip.id ? "selected" : ""}" data-select-trip="${trip.id}" aria-pressed="${selectedTripId === trip.id}">
      <span class="audit-row-top"><strong>${trip.id}</strong><span class="audit-row-tags"><span class="ai-finding ${assessment.kind}">${assessment.finding}</span>${followUpLabel ? `<span class="follow-up-chip">${followUpLabel}</span>` : ""}${statusPill(status)}</span></span>
      <span class="audit-row-mid"><strong>${trip.plate}</strong><small>${trip.material}</small></span>
      <span class="audit-row-bottom"><span>${trip.issue || "路线与重量记录已关联"}</span><small>${trip.occurredAt.replace("T", " ")}</small></span>
    </button>
  `;
}

function routeMismatch(trip) {
  return trip.plannedRoute.at(-1) !== trip.unloadRecord;
}

function tareDeviation(trip) {
  return Number((trip.tareWeight - trip.tareMean).toFixed(2));
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
  const renderPoints = (points, anomaly) => points.map((point, index) => `<span class="${anomaly && index === points.length - 1 ? "anomaly-point" : ""}">${point}</span>`).join('<i aria-hidden="true"></i>');
  return `
    <section class="route-section ${mismatch ? "has-mismatch" : "match"}">
      <div class="route-column"><span class="eyebrow">计划路线 <span class="example-label">示例</span></span><div class="route-points">${renderPoints(trip.plannedRoute, mismatch)}</div></div>
      <div class="route-column actual-route"><span class="eyebrow">实际记录 <span class="example-label">示例</span></span><div class="route-points">${renderPoints(actualRoute, mismatch)}</div></div>
      <div class="route-result ${mismatch ? "has-mismatch" : "match"}"><span class="eyebrow">${mismatch ? "路线不一致" : "路线一致"}</span><strong class="${mismatch ? "anomaly-value" : ""}">${trip.unloadRecord}</strong><span class="${mismatch ? "anomaly-caption" : ""}">${mismatch ? "计划卸点与卸货记录不同" : "卸货记录与计划相符"}</span></div>
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
    <section class="section-block timeline-section">
      <div class="section-heading"><h3>同一趟运输</h3><span>${trip.id}</span></div>
      <div class="timeline">
        ${steps.map((step) => `<div class="timeline-step ${step.anomaly ? "has-anomaly" : ""}"><i></i><strong>${step.label}${step.anomaly ? " · 异常" : ""}</strong><span>${step.time}<br><b class="${step.anomaly ? "anomaly-detail" : ""}">${step.detail}</b></span></div>`).join("")}
      </div>
    </section>
  `;
}

function renderWeights(trip) {
  const delta = tareDeviation(trip);
  const tareAnomaly = Math.abs(delta) > 1;
  return `
    <section class="section-block weight-section">
      <div class="section-heading"><h3>称重情况</h3><span>示例数据 · 吨</span></div>
      ${tareAnomaly ? `<div class="tare-note">历史皮重均值 ${formatWeight(trip.tareMean)} 吨，本趟偏差 ${delta > 0 ? "+" : "−"}${formatWeight(Math.abs(delta))} 吨；演示阈值 ±1.00 吨 <span class="example-label">待现场确认</span></div>` : ""}
      <div class="weight-equation">
        <div><span>毛重</span><strong>${formatWeight(trip.grossWeight)}</strong><small>重车承重</small></div><b aria-hidden="true">−</b>
        <div class="${tareAnomaly ? "tare-anomaly-value" : ""}"><span>皮重${tareAnomaly ? " · 异常" : ""}</span><strong>${formatWeight(trip.tareWeight)}</strong><small>空车回皮</small></div><b aria-hidden="true">=</b>
        <div class="net-weight"><span>净重</span><strong>${formatWeight(getNetWeight(trip))}</strong><small>本趟计算</small></div>
      </div>
    </section>
  `;
}

function renderEvidence(trip) {
  return `
    <section class="section-block evidence-section">
      <div class="section-heading"><h3>车辆与装载影像</h3><span class="example-label">示例影像 · 未关联本趟现场摄像头 · 点击放大</span></div>
      <div class="evidence-grid">
        <button class="evidence-photo" data-photo="./public/images/weighbridge-example.jpg" aria-label="放大查看示例重车过磅影像"><img src="./public/images/weighbridge-example.jpg" alt="完整示例车辆在地磅上称重" /><span>重车过磅 · ${trip.times.gross}</span></button>
        <button class="evidence-photo" data-photo="./public/images/ore-truck-example.jpg" aria-label="放大查看示例装载影像"><img src="./public/images/ore-truck-example.jpg" alt="完整示例矿石运输车辆及装载情况" /><span>装载影像 · ${trip.material}</span></button>
      </div>
    </section>
  `;
}

function renderAiAdvice(trip) {
  const assessment = aiAssessment(trip);
  const status = getStatus(trip);
  const passResult = assessment.kind === "pass"
    ? `<div class="ai-review-sequence"><span>AI建议通过</span><b>→</b><span>${status === "verified" ? "人工核实通过" : "待人工核实"}</span></div>`
    : "";
  return `
    <section class="ai-advice ${assessment.kind}">
      <div class="ai-advice-head"><div><span class="ai-mark">AI</span><h3>稽核建议</h3><span class="example-label">示例</span></div><span class="ai-review-state"><small>人工结论</small>${statusPill(status)}</span></div>
      <span class="ai-finding ${assessment.kind}">${assessment.finding}</span>
      <strong class="ai-recommendation">${assessment.heading}</strong>
      <p>${assessment.reason}</p>
      ${passResult}
      <div class="evidence-links"><span>路线记录</span><span>车辆影像</span><span>称重记录</span></div>
    </section>
  `;
}

function renderWorkflowForm(trip, type) {
  const fields = type === "needsInfo"
    ? `<label>退回原因<textarea name="reason" required></textarea></label><label>待补充信息<textarea name="requiredInfo" required></textarea></label>`
    : `<label>异常确认说明<textarea name="reason" required></textarea></label>`;
  const title = type === "needsInfo" ? "退回复核" : "确认存在异常";
  const submit = type === "needsInfo" ? "提交补充要求" : "确认并创建处置记录";
  return `<form class="workflow-form" data-workflow-form="${type}" data-trip="${trip.id}"><h3>${title}</h3>${fields}<div><button class="button primary" type="submit">${submit}</button><button class="button secondary" type="button" data-cancel-workflow>取消</button></div></form>`;
}

function renderFollowUpPanel(trip) {
  const item = getFollowUp(trip);
  if (item.type === "supplement") {
    return `
      <section class="follow-up-panel supplement-case">
        <div class="follow-up-heading"><strong>补充核验</strong><span>${item.progress === "awaitingSupplement" ? "待补充" : getStatus(trip) === "verified" ? "已核实通过" : "已重新提交 · 待复核"}</span></div>
        <p>退回原因：${escapeHtml(item.reason)}</p><p>待补充：${escapeHtml(item.requiredInfo)}</p>
        ${item.progress === "awaitingSupplement" ? `<form class="workflow-form compact" data-workflow-form="supplement" data-trip="${trip.id}"><label>补充说明<textarea name="supplement" required></textarea></label><button class="button primary" type="submit">重新提交复核</button></form>` : `<p class="follow-up-note">补充记录：${escapeHtml(item.supplement)}</p>`}
      </section>
    `;
  }
  if (item.type !== "anomaly") return "";
  return `
    <section class="follow-up-panel anomaly-case">
      <div class="follow-up-heading"><strong>异常处置</strong><span>${item.progress === "toHandle" ? "待处置" : item.progress === "processing" ? "处理中" : "已完成"}</span></div>
      <p>异常说明：${escapeHtml(item.reason)}</p>
      ${item.progress === "toHandle" ? `<button class="button secondary" data-case-action="start" data-trip="${trip.id}">开始处置</button>` : ""}
      ${item.progress === "processing" && !item.handling ? `<form class="workflow-form compact" data-workflow-form="handling" data-trip="${trip.id}"><label>处置记录<textarea name="handling" required></textarea></label><button class="button primary" type="submit">保存处置记录</button></form>` : ""}
      ${item.progress === "processing" && item.handling ? `<p class="follow-up-note">处置记录：${escapeHtml(item.handling)}</p><button class="button primary" data-case-action="complete" data-trip="${trip.id}">标记处置完成</button>` : ""}
      ${item.progress === "completed" ? `<p class="follow-up-note">处置记录：${escapeHtml(item.handling)}</p>${getStatus(trip) === "confirmedAnomaly" ? `<button class="button secondary" data-case-action="re-review" data-trip="${trip.id}">重新提交人工复核</button>` : `<small>${getStatus(trip) === "verified" ? "已人工核实通过 · 可纳入结算" : "处置已完成 · 待人工复核，未计入结算"}</small>`}` : ""}
    </section>
  `;
}

function renderReviewActions(trip) {
  const status = getStatus(trip);
  const followUp = getFollowUp(trip);
  if (status === "confirmedAnomaly") return renderFollowUpPanel(trip);
  if (status === "verified") {
    return `<div class="review-result"><span class="status ${status}">${statusLabels[status]}</span><span>人工复核结果 · 示例</span></div>${renderFollowUpPanel(trip)}`;
  }
  const supplementAwaiting = followUp.type === "supplement" && followUp.progress === "awaitingSupplement";
  const activeForm = workflowForm?.tripId === trip.id ? renderWorkflowForm(trip, workflowForm.type) : "";
  if (supplementAwaiting) return renderFollowUpPanel(trip);
  if (activeForm) return `${renderFollowUpPanel(trip)}${activeForm}`;
  return `
    ${renderFollowUpPanel(trip)}
    ${activeForm}
    <section class="review-actions" aria-label="人工复核操作">
      <button class="button primary" data-review="verified" data-trip="${trip.id}">核实通过</button>
      <button class="button secondary" data-review="needsInfo" data-trip="${trip.id}">退回复核</button>
      <button class="button warning" data-review="confirmedAnomaly" data-trip="${trip.id}">确认存在异常</button>
    </section>
  `;
}

function renderAuditDetail(trip) {
  if (!trip) return '<section class="detail-panel detail-empty">没有匹配的运输趟次</section>';
  const status = getStatus(trip);
  return `
    <section class="detail-panel">
      <div class="detail-header"><div><h2>趟次详情</h2><p>${trip.id} <span class="divider">/</span> ${trip.plate} <span class="divider">/</span> ${trip.material}</p></div>${statusPill(status)}</div>
      ${renderRoute(trip)}
      ${renderTimeline(trip)}
      ${renderWeights(trip)}
      ${renderAiAdvice(trip)}
      ${renderEvidence(trip)}
      ${renderReviewActions(trip)}
      ${status === "verified" ? '<button class="text-button audit-settlement-link" data-open-settlement>查看结算预览 ›</button>' : ""}
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
  const pendingTrips = matchingTrips.filter((trip) => getStatus(trip) === "pending");
  const verifiedTrips = matchingTrips.filter((trip) => getStatus(trip) === "verified");
  const trips = matchingTrips.filter((trip) => auditFilter === "all" || getStatus(trip) === auditFilter).sort((a, b) => {
    const aPending = getStatus(a) === "pending";
    const bPending = getStatus(b) === "pending";
    return Number(bPending) - Number(aPending) || b.occurredAt.localeCompare(a.occurredAt);
  });
  const selected = trips.find((trip) => trip.id === selectedTripId) || trips[0];
  if (selected) selectedTripId = selected.id;
  return `
    ${renderPageHeader("运输稽核")}
    <div class="audit-layout">
      <section class="audit-list-panel"><div class="audit-filters"><button class="audit-filter ${auditFilter === "all" ? "selected" : ""}" data-audit-filter="all">全部 <b>${matchingTrips.length}</b></button><button class="audit-filter ${auditFilter === "pending" ? "selected" : ""}" data-audit-filter="pending">待复核 <b>${pendingTrips.length}</b></button><button class="audit-filter ${auditFilter === "verified" ? "selected" : ""}" data-audit-filter="verified">核实通过 <b>${verifiedTrips.length}</b></button></div><div class="audit-list">${trips.length ? trips.map(renderAuditRow).join("") : '<div class="empty-state">没有匹配记录</div>'}</div></section>
      ${renderAuditDetail(selected)}
    </div>
  `;
}

function renderTareChart(plate, currentTare) {
  const { checks, referenceWeight } = vehicleTareChecks[plate];
  const values = [...checks.map((check) => check.weight), currentTare];
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const range = Math.max(max - min, 0.1);
  return `
    <div class="tare-history" role="img" aria-label="历史皮重检查与本次回皮示例">
      <div class="tare-mean-line"><span>参考均值 ${formatWeight(referenceWeight)} 吨</span></div>
      <div class="tare-points">${checks.map((check) => `<div class="tare-point ${Math.abs(check.weight - referenceWeight) > 1 ? "abnormal" : ""}"><i style="--point-height:${24 + ((check.weight - min) / range) * 40}px"></i><span>${formatWeight(check.weight)}</span><small>${check.date.slice(5)}</small></div>`).join("")}
        <div class="tare-point current"><i style="--point-height:${24 + ((currentTare - min) / range) * 40}px"></i><span>${formatWeight(currentTare)}</span><small>本趟回皮</small></div>
      </div>
    </div>
  `;
}

function renderVehicleTrip(trip) {
  return `
    <button class="vehicle-trip-row" data-open-trip="${trip.id}">
      <span><strong>${trip.id}</strong><small>${trip.times.gross} · ${trip.material}</small></span>
      <span>${formatWeight(trip.grossWeight)}<small>毛重</small></span>
      <span>${formatWeight(trip.tareWeight)}<small>皮重</small></span>
      <span>${formatWeight(getNetWeight(trip))}<small>净重</small></span>
      ${statusPill(getStatus(trip))}
    </button>
  `;
}

function renderConfirmedExceptions(trips) {
  const exceptions = trips
    .filter((trip) => getFollowUp(trip).type === "anomaly")
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (!exceptions.length) return "";
  const progressLabels = { toHandle: "待处置", processing: "处理中", completed: "已完成" };
  return `
    <section class="vehicle-exceptions">
      <div class="section-heading"><h3>已确认异常</h3><span>${exceptions.length} 趟</span></div>
      <div class="vehicle-exception-list">${exceptions.map((trip) => {
        const item = getFollowUp(trip);
        return `<button class="vehicle-exception-row" data-open-trip="${trip.id}"><span class="vehicle-exception-top"><strong>${trip.id}</strong><span class="status confirmedAnomaly">确认存在异常</span><span class="follow-up-chip">${progressLabels[item.progress]}</span></span><span>${escapeHtml(item.reason)}</span><small>处置记录：${escapeHtml(item.handling || "尚未填写")}</small></button>`;
      }).join("")}</div>
    </section>
  `;
}

function renderVehicleProfile(plate) {
  if (!plate) return '<section class="vehicle-profile detail-empty">没有匹配车辆</section>';
  const trips = seedTrips.filter((trip) => trip.plate === plate);
  const latest = [...trips].sort((a, b) => b.times.gross.localeCompare(a.times.gross))[0];
  const { checks, referenceWeight: mean } = vehicleTareChecks[plate];
  const currentTare = latest.tareWeight;
  const deviation = Number((currentTare - mean).toFixed(2));
  const outOfRange = Math.abs(deviation) > 1;
  const abnormalChecks = checks.filter((check) => Math.abs(check.weight - mean) > 1).length;
  const verifiedNet = trips.filter((trip) => getStatus(trip) === "verified").reduce((sum, trip) => sum + getNetWeight(trip), 0);

  return `
    <section class="vehicle-profile">
      <div class="detail-header"><div><h2>${plate}</h2><p>关联示例趟次 ${trips.length} 趟 · 核实通过净重 ${formatWeight(verifiedNet)} 吨</p></div><span class="example-label">车辆档案 · 示例</span></div>
      <div class="vehicle-metrics">
        <div><span>历史皮重均值</span><strong>${formatWeight(mean)} <small>吨</small></strong></div>
        <div><span>本次回皮</span><strong>${formatWeight(currentTare)} <small>吨</small></strong></div>
        <div class="${outOfRange ? "deviation-alert" : ""}"><span>与均值偏差</span><strong>${deviation > 0 ? "+" : "−"}${formatWeight(Math.abs(deviation))} <small>吨</small></strong></div>
      </div>
      ${outOfRange ? `<div class="tare-explanation"><strong>皮重波动待复核</strong><span>近 6 次独立检查有 ${abnormalChecks} 次偏离参考均值超过 ±1.00 吨；本趟回皮 ${formatWeight(currentTare)} 吨，较参考均值 ${formatWeight(mean)} 吨低 ${formatWeight(Math.abs(deviation))} 吨。</span><small>异常记录呈增多趋势 · 阈值为演示值，待现场确认</small></div>` : `<div class="tare-explanation normal"><strong>皮重与参考均值接近</strong><span>近 6 次独立检查中 ${abnormalChecks} 次超过演示阈值；本趟读数未超过。</span></div>`}
      ${renderConfirmedExceptions(trips)}
      <section class="section-block"><div class="section-heading"><h3>皮重历史检查</h3><span>示例记录 · 吨</span></div>${renderTareChart(plate, currentTare)}</section>
      <section class="section-block"><div class="section-heading"><h3>运营重量记录</h3><span>毛重 / 皮重 / 净重 · 示例</span></div><div class="vehicle-trip-head"><span>运输趟次</span><span>毛重</span><span>皮重</span><span>净重</span><span>状态</span></div><div class="vehicle-trip-list">${trips.map(renderVehicleTrip).join("")}</div></section>
    </section>
  `;
}

function renderVehicles() {
  const value = searchValues.vehicles.trim().toLocaleLowerCase();
  const matches = plates.filter((plate) => !value || plate.toLocaleLowerCase().includes(value));
  const plate = matches.includes(selectedVehiclePlate) ? selectedVehiclePlate : matches[0];
  if (plate) selectedVehiclePlate = plate;
  return `
    ${renderPageHeader("车辆档案")}
    ${renderContextBack(vehicleReturnView, viewLabels[vehicleReturnView] || "运营监控")}
    <div class="module-toolbar">${renderSearch("vehicles", "输入车牌号")}</div>
    <div class="vehicle-layout">
      <section class="vehicle-list-panel"><div class="panel-heading"><div><h2>运输车辆</h2><span>${matches.length} 辆</span></div></div><div class="vehicle-list">${matches.length ? matches.map((item) => `<button class="vehicle-row ${item === plate ? "selected" : ""}" data-select-vehicle="${item}"><strong>${item}</strong><span>${seedTrips.filter((trip) => trip.plate === item).length} 趟示例记录</span></button>`).join("") : '<div class="empty-state">没有匹配车辆</div>'}</div></section>
      ${renderVehicleProfile(plate)}
    </div>
  `;
}

function renderSettlementRow(trip) {
  return `
    <button class="settlement-row ${selectedTripId === trip.id ? "selected" : ""}" data-settlement-trip="${trip.id}">
      <span>${trip.id}</span><span>${trip.plate}</span><span>${formatWeight(trip.grossWeight)}</span><span>${formatWeight(trip.tareWeight)}</span><strong>${formatWeight(getNetWeight(trip))}</strong>
    </button>
  `;
}

function renderSettlementDetail(trip) {
  if (!trip) return '<aside class="settlement-detail detail-empty">没有匹配的核实通过记录</aside>';
  return `
    <aside class="settlement-detail"><div class="detail-header"><div><h2>趟次明细</h2><p>${trip.id} <span class="divider">/</span> ${trip.plate}</p></div>${statusPill(getStatus(trip))}</div>
      <div class="settlement-math"><span>同一趟毛重 − 皮重 = 净重 <em>示例</em></span><strong>${formatWeight(trip.grossWeight)} − ${formatWeight(trip.tareWeight)} = ${formatWeight(getNetWeight(trip))} 吨</strong></div>
      <div class="settlement-records"><span>承重 · ${trip.grossStation}</span><span>回皮 · ${trip.tareStation}</span></div>
    </aside>
  `;
}

function renderSettlement() {
  const verified = getVerifiedTrips();
  const value = searchValues.settlement;
  const filtered = verified.filter((trip) => matchesTrip(trip, value, [(item) => item.id, (item) => item.plate]));
  const netTotal = filtered.reduce((sum, trip) => sum + getNetWeight(trip), 0);
  const excluded = seedTrips.filter((trip) => getStatus(trip) !== "verified");
  const filteredExcluded = excluded.filter((trip) => matchesTrip(trip, value, [(item) => item.id, (item) => item.plate]));
  const pendingCount = filteredExcluded.filter((trip) => getStatus(trip) === "pending").length;
  const confirmedAnomalyCount = filteredExcluded.filter((trip) => getStatus(trip) === "confirmedAnomaly").length;
  const excludedCount = filteredExcluded.length;
  const selected = filtered.find((trip) => trip.id === selectedTripId) || filtered[0];
  if (selected) selectedTripId = selected.id;
  return `
    ${renderPageHeader("结算预览")}
    ${renderContextBack(detailReturnView, navItems.find((item) => item.id === detailReturnView)?.label || "运输稽核")}
    <div class="module-toolbar">${renderSearch("settlement", "车牌或趟次编号")}</div>
    <div class="settlement-summary">
      <div><span>${value ? "检索结果核实通过" : "核实通过"}</span><strong>${filtered.length} <small>趟</small></strong></div>
      <div><span>${value ? "检索结果净重" : "核实通过净重"} <em>示例</em></span><strong>${formatWeight(netTotal)} <small>吨</small></strong></div>
      <div class="excluded"><span>${value ? "检索结果未纳入" : "未纳入结算"}</span><strong>${excludedCount} <small>趟</small></strong><em>${pendingCount} 待复核 · ${confirmedAnomalyCount} 确认异常</em></div>
    </div>
    <div class="settlement-layout">
      <section class="settlement-main">
        <div class="settlement-table-wrap">
          <div class="settlement-table settlement-table-head"><span>趟次编号</span><span>车牌号</span><span>毛重（吨）</span><span>皮重（吨）</span><span>净重（吨）</span></div>
          <div class="settlement-table-body">${filtered.length ? filtered.map(renderSettlementRow).join("") : '<div class="empty-state">没有匹配的核实通过记录</div>'}</div>
        </div>
      </section>
      ${renderSettlementDetail(selected)}
    </div>
  `;
}

function getPeriodRows() {
  if (analyticsPeriod === "day") return operationsData.dailyMetrics.filter((row) => row.date === analyticsDate);
  const count = analyticsPeriod === "week" ? 7 : operationsData.dailyMetrics.length;
  return operationsData.dailyMetrics.slice(-count);
}

function renderPeriodTabs() {
  return `<div class="period-tabs" role="group" aria-label="统计周期">${[["day", "日"], ["week", "周"], ["month", "月"]].map(([id, label]) => `<button class="period-tab ${analyticsPeriod === id ? "selected" : ""}" data-analytics-period="${id}" aria-pressed="${analyticsPeriod === id}">${label}</button>`).join("")}</div>`;
}

function renderTrendChart(rows) {
  const series = [
    { key: "minedTons", label: "采矿量", cls: "mined" },
    { key: "verifiedTransportTons", label: "核实运输净重", cls: "transport" },
    { key: "receivedUnloadTons", label: "卸货接收量", cls: "unload" },
  ];
  const max = Math.max(...rows.flatMap((row) => series.map((item) => row[item.key])), 1);
  const chartRows = rows.length > 20 ? rows.filter((_, index) => index % 2 === 0 || index === rows.length - 1) : rows;
  const x = (index) => chartRows.length < 2 ? 500 : 48 + index * 904 / (chartRows.length - 1);
  const y = (value) => 206 - value / max * 174;
  return `<div class="trend-chart"><div class="trend-legend">${series.map((item) => `<span class="${item.cls}"><i></i>${item.label}</span>`).join("")}<span class="chart-unit">吨 · 示例</span></div><svg viewBox="0 0 1000 240" role="img" aria-label="采矿量、运输净重和卸货接收量趋势"><path class="chart-gridline" d="M48 32H952M48 90H952M48 148H952M48 206H952"/><text x="8" y="36">${Math.round(max)}</text><text x="8" y="94">${Math.round(max * .67)}</text><text x="8" y="152">${Math.round(max * .33)}</text><text x="8" y="210">0</text>${series.map((item) => `<polyline class="chart-series ${item.cls}" points="${chartRows.map((row, index) => `${x(index)},${y(row[item.key])}`).join(" ")}"/>${chartRows.map((row, index) => `<circle class="chart-point ${item.cls}" cx="${x(index)}" cy="${y(row[item.key])}" r="3.5"/>`).join("")}`).join("")}${chartRows.map((row, index) => `<g class="chart-hit" data-analytics-date="${row.date}" tabindex="0" role="button" aria-label="查看 ${row.date} 来源"><circle cx="${x(index)}" cy="224" r="12"/><text x="${x(index)}" y="237">${row.date.slice(5)}</text></g>`).join("")}</svg></div>`;
}

function renderAnalytics() {
  const rows = getPeriodRows();
  const totals = rows.reduce((acc, row) => ({ mined: acc.mined + row.minedTons, transport: acc.transport + row.verifiedTransportTons, unload: acc.unload + row.receivedUnloadTons }), { mined: 0, transport: 0, unload: 0 });
  const query = searchValues.analytics;
  const displayRows = rows.filter((row) => matchesTrip(row, query, [(item) => item.date, (item) => item.miningArea, (item) => item.unloadPoint, (item) => item.minedSource, (item) => item.transportSource, (item) => item.unloadSource]));
  const chosen = rows.find((row) => row.date === analyticsDate) || rows.at(-1);
  const vehiclePeriodKey = analyticsPeriod === "month" ? "month" : "week";
  const vehicleRows = operationsData.vehiclePeriods.filter((vehicle) => vehicle.periodKey === vehiclePeriodKey && matchesTrip(vehicle, query, [(item) => item.plate, (item) => item.sourceRecordId]));
  return `
    ${renderPageHeader("生产与运力分析")}
    <div class="analysis-controls"><div><strong>示例矿区</strong><span>${rows[0]?.date || "—"} 至 ${rows.at(-1)?.date || "—"}</span><small>${operationsData.scopeLabel}</small></div><div class="analysis-actions">${renderSearch("analytics", "搜索日期、采区、车辆或卸货点")}${renderPeriodTabs()}</div></div>
    <div class="analytics-body"><main class="analysis-main">
      <section class="analysis-panel"><div class="panel-heading"><div><h2>产运关键指标趋势</h2><span>${rows[0]?.date || "—"} 至 ${rows.at(-1)?.date || "—"} · ${analyticsPeriod === "day" ? "日" : analyticsPeriod === "week" ? "周" : "月"} · 示例</span></div><button class="text-button" data-view="ai">生成分析报告 ›</button></div>${renderTrendChart(rows)}</section>
      <section class="analysis-panel"><div class="panel-heading"><div><h2>生产与运输明细</h2><span>${displayRows.length} 个日期 · 数据来源独立</span></div></div><div class="metric-table-wrap"><table class="metric-table"><thead><tr><th>日期</th><th>采区</th><th>采矿量</th><th>运输净重</th><th>卸货点</th><th>接收量</th><th>来源</th></tr></thead><tbody>${displayRows.map((row) => `<tr class="${row.date === analyticsDate ? "selected" : ""}"><td><button class="table-date-button" data-analytics-date="${row.date}">${row.date}</button></td><td>${row.miningArea}</td><td>${row.minedTons} 吨</td><td>${row.verifiedTransportTons} 吨</td><td>${row.unloadPoint}</td><td>${row.receivedUnloadTons} 吨</td><td><button class="text-button" data-source-record="${row.sourceIds.mining}">示例汇总 ›</button></td></tr>`).join("")}</tbody></table></div></section>
      <section class="analysis-panel vehicle-capacity-panel"><div class="panel-heading"><div><h2>车辆周期运力</h2><span>${vehicleRows[0]?.periodLabel || "扩展示例"} · 无利用率推算</span></div></div><div class="capacity-table-head"><span>车辆</span><span>有效趟次</span><span>核实吨位</span><span>均载重</span><span>周转</span></div>${vehicleRows.map((vehicle) => `<div class="capacity-item"><button class="capacity-row" data-open-vehicle="${vehicle.plate}"><strong>${vehicle.plate}</strong><span>${vehicle.trips}</span><span>${vehicle.verifiedTons.toFixed(1)} 吨</span><span>${vehicle.averagePayload.toFixed(2)} 吨</span><span>${vehicle.turnaroundMinutes} 分</span></button><button class="capacity-source" data-source-record="${vehicle.sourceRecordId}">来源</button></div>`).join("")}</section>
    </main><aside class="source-detail"><div class="source-date"><strong>${chosen?.date || "—"}（${chosen?.miningArea || "示例范围"}）</strong></div><div class="source-metric mining"><i></i><strong>采矿量</strong><b>${chosen?.minedTons ?? "—"} 吨</b><small>来源：采装计量样例 · ${chosen?.sourceIds.mining || "—"}</small><small>定义：采区在统计周期内的采出量</small></div><div class="source-metric transport"><i></i><strong>核实运输净重</strong><b>${chosen?.verifiedTransportTons ?? "—"} 吨</b><small>来源：人工核实趟次 · ${chosen?.sourceIds.transport || "—"}</small><small>定义：仅统计人工核实通过的趟次净重</small></div><div class="source-metric unload"><i></i><strong>卸货接收量</strong><b>${chosen?.receivedUnloadTons ?? "—"} 吨</b><small>来源：卸点接收磅单 · ${chosen?.sourceIds.unload || "—"}</small><small>定义：卸点/堆场接收计量</small></div><section class="source-related"><strong>当日关联运输明细（示例）</strong><span>汇总样例来源不等同原始磅单</span>${selectedSourceId ? renderSourceRecord(selectedSourceId) : ""}<button class="text-button" data-source-record="${chosen?.sourceIds.mining}">查看采矿来源 ›</button><button class="text-button" data-source-record="${chosen?.sourceIds.transport}">查看运输来源 ›</button><button class="text-button" data-source-record="${chosen?.sourceIds.unload}">查看卸货来源 ›</button></section></aside></div>
  `;
}

function renderSourceButtons(ids) {
  return ids.map((id) => `<button class="source-link" data-open-source-trip="${id}">${id} ›</button>`).join("");
}

function renderMetricSourceButtons(ids = []) {
  return `${ids.slice(0, 3).map((id) => `<button class="source-link" data-source-record="${id}">${id} · 示例汇总 ›</button>`).join("")}${ids.length > 3 ? `<span class="source-count">另有 ${ids.length - 3} 条日汇总</span>` : ""}`;
}

function renderSourceRecord(id) {
  const record = operationsData.sourceRecords.find((item) => item.id === id);
  if (!record) return "";
  return `<aside class="source-record-detail"><div><span>示例汇总来源</span><strong>${record.id}</strong></div><p>${record.date} · ${record.metric} ${record.value.toLocaleString()} ${record.unit}</p><small>${record.source} · ${record.scope}</small></aside>`;
}

function renderChatTrend(rows, key) {
  const max = Math.max(...rows.map((row) => row[key]), 1);
  return `<div class="chat-trend" role="img" aria-label="28天采矿量示例趋势">${rows.map((row) => `<span title="${row.date} · ${row[key]} 吨" style="--bar-height:${Math.max(8, row[key] / max * 100)}%"><i></i></span>`).join("")}</div><div class="chat-trend-range"><span>${rows[0]?.date || "—"}</span><strong>${rows.length} 天 · 吨</strong><span>${rows.at(-1)?.date || "—"}</span></div>`;
}

function renderChatAnswer(item) {
  if (!item) return "";
  let detail = "";
  let action = "";
  if (item.resultType === "operation-summary") {
    const verified = getVerifiedTrips();
    const pending = getUnresolvedTrips();
    const total = verified.reduce((sum, trip) => sum + getNetWeight(trip), 0);
    const day = operationsData.dailyMetrics.find((row) => row.date === "2026-04-01");
    detail = `<div class="answer-metrics"><div><span>运输趟次</span><strong>${seedTrips.length} 趟</strong></div><div><span>核实通过</span><strong>${verified.length} 趟 · ${formatWeight(total)} 吨</strong></div><div><span>待复核</span><strong>${pending.length} 趟</strong></div><div><span>卸货接收量</span><strong>${day?.receivedUnloadTons ?? "—"} 吨</strong></div></div><div class="answer-table"><div><span>趟次 / 车辆</span><span>净重</span><span>人工状态</span></div>${seedTrips.map((trip) => `<button data-open-trip="${trip.id}"><span>${trip.id} · ${trip.plate}</span><span>${formatWeight(getNetWeight(trip))} 吨</span><span>${statusPill(getStatus(trip))}</span></button>`).join("")}</div>`;
    action = '<button class="button secondary" data-view="audit">打开运输稽核</button>';
  } else if (item.resultType === "vehicle-capacity") {
    const vehicle = operationsData.vehiclePeriods.find((record) => record.sourceRecordId === item.sourceRecordIds[0]);
    detail = `<div class="answer-metrics"><div><span>有效趟次</span><strong>${vehicle.trips} 趟</strong></div><div><span>核实净重</span><strong>${vehicle.verifiedTons.toFixed(1)} 吨</strong></div><div><span>均载重</span><strong>${vehicle.averagePayload.toFixed(2)} 吨</strong></div><div><span>平均周转</span><strong>${vehicle.turnaroundMinutes} 分</strong></div></div><div class="answer-note">缺少额定载荷与可运营时长，暂不计算利用率。</div>`;
    action = `<button class="button secondary" data-open-vehicle="${item.plate}">查看 ${item.plate} 档案</button>`;
  } else if (item.resultType === "production-trend") {
    const rows = operationsData.dailyMetrics;
    const total = rows.reduce((sum, row) => sum + row.minedTons, 0);
    const areas = [...new Set(rows.map((row) => row.miningArea))].map((area) => ({ area, total: rows.filter((row) => row.miningArea === area).reduce((sum, row) => sum + row.minedTons, 0) }));
    detail = `<div class="answer-metrics"><div><span>周期采矿量</span><strong>${total.toLocaleString()} 吨</strong></div><div><span>统计日期</span><strong>${rows.length} 天</strong></div><div><span>采区数</span><strong>${areas.length} 个</strong></div></div>${renderChatTrend(rows, "minedTons")}<div class="answer-breakdown">${areas.map((area) => `<span><i></i>${area.area}<strong>${area.total.toLocaleString()} 吨</strong></span>`).join("")}</div>`;
    action = '<button class="button secondary" data-view="analytics">查看生产与运力分析</button>';
  } else if (item.resultType === "unload-trend") {
    const rows = operationsData.dailyMetrics;
    const total = rows.reduce((sum, row) => sum + row.receivedUnloadTons, 0);
    const groups = [...new Set(rows.map((row) => row.unloadPoint))].map((point) => ({ point, total: rows.filter((row) => row.unloadPoint === point).reduce((sum, row) => sum + row.receivedUnloadTons, 0) }));
    detail = `<div class="answer-metrics"><div><span>周期接收量</span><strong>${total.toLocaleString()} 吨</strong></div><div><span>卸货点</span><strong>${groups.length} 个</strong></div><div><span>日明细</span><strong>${rows.length} 天</strong></div></div><div class="answer-breakdown">${groups.map((group) => `<span><i></i>${group.point}<strong>${group.total.toLocaleString()} 吨</strong></span>`).join("")}</div><div class="answer-table daily-unload-table"><div><span>日期</span><span>卸货点</span><span>接收量</span><span>来源</span></div>${rows.map((row) => `<div><span>${row.date}</span><span>${row.unloadPoint}</span><strong>${row.receivedUnloadTons} 吨</strong><button class="text-button" data-source-record="${row.sourceIds.unload}">查看</button></div>`).join("")}</div><div class="answer-note">按卸点接收磅单单独统计；不以运输净重替代接收量。</div>`;
    action = '<button class="button secondary" data-view="analytics">查看卸货趋势</button>';
  } else if (item.resultType === "anomaly-list") {
    const anomalies = getOpenAnomalies();
    detail = `<div class="answer-note anomaly-note">${anomalies.length} 条待复核线索 · AI提示不等于违规结论</div><div class="answer-anomalies">${anomalies.map((trip) => `<button data-open-trip="${trip.id}"><span><strong>${escapeHtml(trip.issue)}</strong><small>${trip.id} · ${trip.plate} · ${trip.occurredAt.replace("T", " ")}</small></span><span>${escapeHtml(eventText(trip))}</span><b>查看 ›</b></button>`).join("") || '<div class="empty-state">当前没有待复核异常线索</div>'}</div>`;
    action = '<button class="button secondary" data-view="audit">进入运输稽核</button>';
  } else if (item.resultType === "report-preview") {
    detail = `<div class="report-preview"><strong>报告内容</strong><ul><li>车辆有效趟次、核实净重、均载重与周转时长</li><li>卸点接收趋势与独立数据口径</li><li>汇总来源和关联记录</li></ul><small>范围：${item.period} · 示例数据</small></div>`;
    action = '<button class="button primary" data-generate-report>生成报告</button>';
  }
  return `<article class="chat-answer answer-${item.resultType}"><div class="answer-heading"><span class="ai-avatar">AI</span><div><strong>${escapeHtml(item.question)}</strong><small>${item.period} · 示例数据</small></div></div><p>${escapeHtml(item.answer)}</p>${detail}<div class="answer-scope"><div><span>指标口径</span><strong>${item.metric}</strong></div></div><div class="answer-sources"><span>数据来源</span>${item.sources.map((source) => `<small>${source}</small>`).join("")}</div>${item.sourceTripIds?.length ? `<div class="source-links">${renderSourceButtons(item.sourceTripIds)}</div>` : ""}${item.sourceRecordIds?.length ? `<div class="source-links">${renderMetricSourceButtons(item.sourceRecordIds)}</div>` : ""}${selectedSourceId ? renderSourceRecord(selectedSourceId) : ""}${action ? `<div class="answer-actions">${action}</div>` : ""}</article>`;
}

function renderFilePreview() {
  if (!pendingUpload) return "";
  return `<section class="file-preview"><div class="panel-heading"><div><h2>解析预览</h2><span>${escapeHtml(pendingUpload.name)} · ${pendingUpload.type}</span></div><button class="text-button" data-cancel-upload>取消</button></div><small class="file-source-ref">来源位置：${escapeHtml(pendingUpload.sourceRef)}</small><p>${escapeHtml(pendingUpload.excerpt || "文件内容为空")}</p>${pendingUpload.rows ? `<div class="file-table">${pendingUpload.rows.map(({ lineNo, cells }) => `<div><span class="file-row-number">${lineNo}</span>${cells.map((cell) => `<span>${escapeHtml(cell)}</span>`).join("")}</div>`).join("")}</div>` : ""}<div class="file-boundary">文件来源独立保存，不加入平台运营统计</div><button class="button primary" data-confirm-upload>确认整理为文件报告</button></section>`;
}

function renderAiWorkbench() {
  const item = selectedChat ? operationsData.chatExamples.find((example) => example.intent === selectedChat) : null;
  return `
    ${renderPageHeader("AI工作台")}
    <div class="ai-workspace"><section class="chat-column"><div class="chat-heading"><div><h2>矿山运营问答</h2><span>查运营数据、追溯来源、生成报告</span></div><span class="ai-status"><i></i>示例数据</span></div>
      <div class="chat-prompts">${operationsData.chatExamples.map((example) => `<button class="prompt-button ${selectedChat === example.intent ? "selected" : ""}" data-chat-example="${example.intent}">${example.question}<span>↗</span></button>`).join("")}</div>
      <div class="chat-conversation">${chatQuestion ? `<div class="user-question">${escapeHtml(chatQuestion)}</div>` : `<div class="user-question">${escapeHtml(item?.question || "查询矿山运营情况")}</div>`}${renderChatAnswer(item)}${chatQuestion && !item ? `<div class="chat-answer"><p>当前演示支持运输汇总、车辆运力、采矿趋势、卸货接收和异常查询。请选择一个示例问题查看来源化结果。</p></div>` : ""}</div>
      <form class="chat-composer" data-chat-form><input name="question" value="${escapeHtml(chatQuestion)}" placeholder="询问矿山运营数据…" aria-label="输入矿山运营问题"/><button class="composer-file" type="button" data-ai-tab="files" aria-label="上传文件">＋</button><button class="button primary" type="submit">查询</button></form>
    </section><aside class="file-column"><div class="file-column-heading"><h2>报告与文件</h2><span>结果可追溯</span></div><div class="ai-content-tabs"><button class="ai-content-tab ${aiContentTab === "reports" ? "selected" : ""}" data-ai-tab="reports">报告 <b>${reports.length}</b></button><button class="ai-content-tab ${aiContentTab === "files" ? "selected" : ""}" data-ai-tab="files">文件解析 <b>${fileReports.length + (pendingUpload ? 1 : 0)}</b></button></div>
      ${aiContentTab === "reports" ? `<div class="report-list">${reports.length ? reports.map((report, index) => `<div class="report-row"><span><strong>${escapeHtml(report.title)}</strong><small>${report.createdAt} · ${report.origin}</small></span><button class="text-button" data-download-report="${index}">下载 .md</button></div>`).join("") : '<div class="ai-dock-empty">报告将在这里归档</div>'}</div>` : `<label class="upload-button"><input type="file" data-file-upload accept=".csv,.txt,.md,text/csv,text/plain,text/markdown"/><span>＋ 上传 CSV / TXT / MD</span></label>${renderFilePreview()}<div class="uploaded-list">${fileReports.length ? fileReports.map((report, index) => `<div class="uploaded-row"><strong>${escapeHtml(report.name)}</strong><small>文件来源 · 已确认</small><button class="text-button" data-download-file-report="${index}">下载报告</button></div>`).join("") : '<div class="file-empty">支持 CSV、TXT、MD</div>'}</div>`}</aside></div>
  `;
}

function renderLightbox() {
  return `<div class="lightbox" data-lightbox hidden role="dialog" aria-modal="true" aria-label="示例车辆影像"><button class="lightbox-close" data-close-photo aria-label="关闭影像">×</button><img data-lightbox-image alt="完整示例车辆影像" /></div>`;
}

function renderToast() {
  return notice ? `<div class="toast" role="status">${notice}</div>` : "";
}

function renderGlobalBar() {
  if (activeView === "workbench") {
    return `<header class="app-topbar monitor-topbar"><div class="monitor-context"><span class="global-site-dot"></span><strong>示例矿区</strong><button class="topbar-select">长青矿山⌄</button><button class="topbar-select">▣ 2026-04-01⌄</button></div><div class="monitor-playback"><button class="icon-button" data-replay-step="-1" aria-label="上一步">‹</button><button class="button primary" data-replay-toggle>${replayPlaying ? "Ⅱ 暂停回放" : "▷ 模拟回放"}</button><input aria-label="回放进度" type="range" min="0" max="100" value="${replayProgress * 100}" data-replay-seek/><span>13:05—14:52</span><button class="icon-button" data-replay-step="1" aria-label="下一步">›</button><span class="replay-speed">1×</span></div><div class="topbar-actions"><button class="icon-button" aria-label="通知">♧</button><button class="customer-quick-link" data-enter-customer>客户体验</button><span class="operator-avatar">张</span><span class="operator-name">调度员⌄</span></div></header>`;
  }
  const range = getPeriodRows();
  const context = activeView === "analytics" ? `${range[0]?.date || "—"} ~ ${range.at(-1)?.date || "—"}` : "2026-04-01 ~ 2026-04-28";
  return `<header class="app-topbar"><div class="global-context"><span class="global-site-dot"></span><strong>示例矿区</strong><button class="topbar-select">长青矿山⌄</button><button class="topbar-select">▣ ${context}⌄</button>${activeView === "audit" ? renderSearch("audit", "搜索车牌、运单号或关键字") : ""}</div><div class="topbar-actions"><button class="icon-button" aria-label="通知">♧</button><button class="customer-quick-link" data-enter-customer>客户体验</button><span class="operator-avatar">张</span><span class="operator-name">张工⌄</span></div></header>`;
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
  if (simulationRunning) {
    clearInterval(simulationTimer);
    simulationRunning = false;
    simulationTimer = null;
  }
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
    workbench: renderWorkbench,
    audit: renderAudit,
    vehicles: renderVehicles,
    settlement: renderSettlement,
    analytics: renderAnalytics,
    ai: renderAiWorkbench,
  };
  root.innerHTML = `
    <div class="app-shell">
      ${renderNav()}
      <main class="main-content main-${activeView}" data-page="${activeView}">
        ${renderGlobalBar()}
        ${customerExperience ? '<div class="customer-mode-banner"><span>客户能力验收体验 · 本地模拟数据</span><span><button class="text-button" data-return-customer>返回验收路径</button><button class="text-button" data-exit-customer>退出体验</button></span></div>' : ""}
        ${pages[activeView]()}
      </main>
      ${renderToast()}
      ${renderLightbox()}
    </div>
  `;
  if (activeView === "workbench") requestAnimationFrame(() => mountMineMap(root));
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
  if (view !== "audit" && view !== "vehicles" && view !== "settlement") {
    detailReturnView = view;
    vehicleReturnView = view;
  }
  if (view !== "workbench" && replayPlaying) {
    replayPlaying = false;
    clearInterval(replayTimer);
    replayTimer = null;
  }
  activeView = view;
  markCustomerVisited({ workbench: "discovery", audit: "evidence", vehicles: "archive", settlement: "settlement" }[view]);
  notice = "";
  if (view === "audit" && !sampleTrips.has(selectedTripId)) selectedTripId = seedTrips[0].id;
  if (view === "settlement" && !getVerifiedTrips().some((trip) => trip.id === selectedTripId)) {
    selectedTripId = getVerifiedTrips()[0]?.id ?? null;
  }
  render(root);
}

function startSimulation(root) {
  if (simulationRunning) {
    simulationRunning = false;
    clearInterval(simulationTimer);
    simulationTimer = null;
    notice = "已暂停模拟动态";
    render(root);
    return;
  }
  simulationRunning = true;
  notice = "已开始模拟AI异常动态";
  pushSimulatedEvent();
  simulationTimer = setInterval(() => {
    if (!simulationRunning) return;
    pushSimulatedEvent();
    if (activeView === "workbench") render(root);
  }, 8000);
  render(root);
}

function pushSimulatedEvent() {
  const open = getOpenAnomalies();
  if (!open.length) return;
  const trip = open[eventCursor % open.length];
  eventCursor += 1;
  eventQueue.unshift(trip.id);
  if (eventQueue.length > 4) eventQueue.pop();
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
  if (event.target.matches("[data-chat-form]")) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    chatQuestion = String(values.question || "").trim();
    const query = chatQuestion.toLocaleLowerCase();
    const intent = query.includes("报告") ? "report"
      : (query.includes("车") || query.includes("运力") || query.includes("周转")) ? (query.includes("月") ? "vehicle-month-capacity" : "vehicle-capacity")
      : query.includes("采矿") || query.includes("采区") || query.includes("采出") ? "production-trend"
        : query.includes("卸") || query.includes("接收") ? "unload-trend"
          : query.includes("异常") || query.includes("稽核") ? "anomaly-review"
            : query.includes("今天") || query.includes("运输") || query.includes("趟") ? "daily-operation" : null;
    selectedChat = intent;
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

function downloadText(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function handleClick(root, event) {
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
  const mapVehicle = event.target.closest("[data-map-vehicle]");
  if (mapVehicle) {
    selectedMapPlate = mapVehicle.dataset.mapVehicle;
    render(root);
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
    aiContentTab = aiTab.dataset.aiTab;
    render(root);
    if (aiTab.dataset.aiTab === "files") root.querySelector("[data-file-upload]")?.click();
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
    selectedChat = item?.intent || null;
    chatQuestion = item?.question || "";
    render(root);
    return;
  }
  if (event.target.closest("[data-generate-report]")) {
    const item = operationsData.chatExamples.find((example) => example.intent === selectedChat);
    if (item) {
      reports.unshift({ title: `${item.period} ${item.metric}报告`, createdAt: new Date().toLocaleString("zh-CN", { hour12: false }), origin: "平台示例数据", content: `# ${item.metric}报告\n\n范围：${item.period}\n\n口径：${item.metric}\n\n${item.answer}\n\n来源：${item.sources.join("；")}\n\n汇总来源：${(item.sourceRecordIds || []).join("、") || "无"}\n\n关联趟次：${(item.sourceTripIds || []).join("、") || "无"}` });
      notice = "报告已生成，可下载 Markdown 文件";
    }
    render(root);
    return;
  }
  const downloadReport = event.target.closest("[data-download-report]");
  if (downloadReport) {
    const report = reports[Number(downloadReport.dataset.downloadReport)];
    if (report) downloadText(`${report.title}.md`, report.content);
    return;
  }
  const downloadFile = event.target.closest("[data-download-file-report]");
  if (downloadFile) {
    const report = fileReports[Number(downloadFile.dataset.downloadFileReport)];
    if (report) downloadText(`${report.name}-整理报告.md`, report.content);
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
    vehicleReturnView = activeView === "vehicles" ? vehicleReturnView : activeView;
    selectedVehiclePlate = openVehicle.dataset.openVehicle;
    activeView = "vehicles";
    render(root);
    return;
  }
  if (event.target.closest("[data-replay-toggle]")) {
    replayPlaying = !replayPlaying;
    replayActive = true;
    clearInterval(replayTimer);
    replayTimer = replayPlaying ? setInterval(() => {
      if (activeView !== "workbench") {
        replayPlaying = false;
        clearInterval(replayTimer);
        replayTimer = null;
        return;
      }
      replayProgress = (replayProgress + 0.025) % 1;
      render(root);
    }, 500) : null;
    notice = replayPlaying ? "已开始模拟路线回放" : "模拟回放已暂停";
    render(root);
    return;
  }
  if (event.target.closest("[data-open-settlement]")) {
    detailReturnView = "audit";
    activeView = "settlement";
    render(root);
    return;
  }
  const replayStep = event.target.closest("[data-replay-step]");
  if (replayStep) {
    const vehicles = operationsData.map.vehicles;
    replayActive = true;
    replayProgress = (replayProgress + Number(replayStep.dataset.replayStep) * 0.08 + 1) % 1;
    replayCursor = (replayCursor + Number(replayStep.dataset.replayStep) + vehicles.length) % vehicles.length;
    selectedMapPlate = vehicles[replayCursor].plate;
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
  if (event.target.closest("[data-simulate]")) {
    startSimulation(root);
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
    const replaySeek = event.target.closest("[data-replay-seek]");
    if (replaySeek) {
      replayActive = true;
      replayPlaying = false;
      clearInterval(replayTimer);
      replayTimer = null;
      replayProgress = Number(replaySeek.value) / 100;
      render(root);
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
    const input = event.target.closest("[data-search-for]");
    if (!input) return;
    const view = input.dataset.searchFor;
    const caret = input.selectionStart ?? input.value.length;
    searchValues[view] = input.value;
    render(root, { view, caret });
  });
  root.addEventListener("keydown", (event) => {
    const mapVehicle = event.target.closest("[data-map-vehicle]");
    if (mapVehicle && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectedMapPlate = mapVehicle.dataset.mapVehicle;
      render(root);
      return;
    }
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
    const row = event.target.closest("[data-settlement-trip]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectedTripId = row.dataset.settlementTrip;
      render(root);
    }
  });
  render(root);
}

renderApp(document.querySelector("#app"));
