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
let selectedMapPlate = null;
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
let replayActive = false;
let replayProgress = 0;
let replayTimer = null;
let monitorModalOpen = false;
let monitorMode = "live";
let monitorReplay = null;
let reportPreview = null;

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
let aiFeedback = {}; // tripId -> { vote: "accurate" | "inaccurate", reason }
let feedbackOpenTripId = null;
let monitorRailOpen = null; // null=按视口默认（宽屏展开/窄屏收起）；true/false=用户显式切换

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
  workbench: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
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
  const currentView = activeView === "vehicles" ? vehicleReturnView : activeView === "settlement" ? detailReturnView : activeView;
  return `
    <header class="platform-nav-shell">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 28"><path d="M2 23 13 7l7 9 5-7 13 14H2Z"/></svg></span><span>矿山运营平台</span></div>
      <nav aria-label="主导航">
        ${navItems.map((item) => `
          <button class="nav-item ${currentView === item.id ? "active" : ""}" data-view="${item.id}" ${currentView === item.id ? 'aria-current="page"' : ""}>
            ${icon(item.icon)}<span>${item.label}</span>
            ${item.id === "audit" ? `<span class="nav-count">${getUnresolvedTrips().length}</span>` : ""}
          </button>
        `).join("")}
      </nav>
    </header>
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

function smoothMapRoute(points, samples = 8) {
  if (points.length < 3) return points;
  const smooth = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < samples; step += 1) {
      const t = step / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const interpolate = (key) => 0.5 * ((2 * p1[key]) + (-p0[key] + p2[key]) * t + (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * t2 + (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * t3);
      smooth.push({ x: interpolate("x"), y: interpolate("y") });
    }
  }
  smooth.push(points.at(-1));
  return smooth;
}

function routeArrowIcon(selected, angle = 0) {
  return L.divIcon({
    className: `map-route-arrow${selected ? " selected" : ""}`,
    html: `<svg viewBox="0 0 16 16" style="transform:rotate(${angle}deg)" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function truckMapIcon(selected) {
  const color = selected ? "#00D5E0" : "#8295AB";
  return L.divIcon({
    className: "map-truck-marker",
    html: `<span class="map-truck-symbol ${selected ? "selected" : ""}"><svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 4h18v13H2zM20 8h6l4 5v4h-10z" fill="${color}"/><path d="M21 9h4l3 4h-7z" fill="#CFF7FB"/><circle cx="8" cy="19" r="3"/><circle cx="24" cy="19" r="3"/></svg></span>`,
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
    const smooth = smoothMapRoute(route.points.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    })).map(mapCoordinate);
    const halo = L.polyline(smooth, { color: "#e3eaeb", weight: 8, opacity: 0.12, lineCap: "round", lineJoin: "round", smoothFactor: 1.2 }).addTo(mineMap);
    const line = L.polyline(smooth, { color: "#93A3B5", weight: 2.5, opacity: 0.52, lineCap: "round", lineJoin: "round", smoothFactor: 1.2 }).addTo(mineMap);
    const middle = Math.floor(smooth.length / 2);
    const before = smooth[Math.max(0, middle - 2)];
    const after = smooth[Math.min(smooth.length - 1, middle + 2)];
    const angle = Math.atan2(-(after[0] - before[0]), after[1] - before[1]) * 180 / Math.PI;
    const arrow = L.marker(smooth[middle], { interactive: false, icon: routeArrowIcon(false, angle), zIndexOffset: 100 });
    arrow.addTo(mineMap);
    mineMapRoutes.set(route.tripId, { halo, line, arrow, angle });
  });
  operationsData.map.nodes.forEach((node) => {
    const marker = L.marker(mapCoordinate(node), {
      icon: L.divIcon({ className: "map-site-marker", html: `<span class="map-site-dot ${node.type === "卸货点" ? "unload" : node.type === "承重点" ? "scale" : "pit"}"></span><strong>${node.label}</strong>`, iconSize: [120, 28], iconAnchor: [9, 10] }),
      interactive: false,
    }).addTo(mineMap);
  });
  operationsData.map.vehicles.forEach((vehicle) => {
    const marker = L.marker(mapCoordinate(vehicle), { icon: truckMapIcon(false), zIndexOffset: 400, title: vehicle.plate }).addTo(mineMap);
    marker.bindTooltip(vehicle.plate, { permanent: true, direction: "top", offset: [0, -13], className: "map-truck-label" });
    marker.on("click", () => {
      selectedMapPlate = vehicle.plate;
      render(root);
    });
    mineMapVehicles.set(vehicle.plate, marker);
  });
  // 默认视野：完整容纳全部采区/承重/卸货节点、路线与车辆
  const bounds = L.latLngBounds();
  operationsData.map.nodes.forEach((node) => bounds.extend(mapCoordinate(node)));
  operationsData.map.routes.forEach((route) => {
    route.points.split(" ").forEach((pair) => {
      const [x, y] = pair.split(",").map(Number);
      bounds.extend(mapCoordinate({ x, y }));
    });
  });
  operationsData.map.vehicles.forEach((vehicle) => bounds.extend(mapCoordinate(vehicle)));
  if (bounds.isValid()) mineMap.fitBounds(bounds, { padding: [26, 26] });
  syncMineMap();
}

function syncMineMap() {
  if (!mineMap) return;
  const selected = operationsData.map.vehicles.find((vehicle) => vehicle.plate === selectedMapPlate);
  operationsData.map.routes.forEach((route) => {
    const layers = mineMapRoutes.get(route.tripId);
    const active = selected?.tripId === route.tripId;
    layers?.halo.setStyle({ color: active ? "#33D6E4" : "#e3eaeb", weight: active ? 10 : 7, opacity: active ? 0.2 : 0.1 });
    layers?.line.setStyle(active ? { color: "#22C3D2", weight: 3.5, opacity: 0.88 } : { color: "#93A3B5", weight: 2.25, opacity: 0.44 });
    layers?.arrow.setIcon(routeArrowIcon(active, layers.angle));
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
      <div class="map-legend"><span><i class="pit-dot"></i>采区</span><span><i class="scale-dot"></i>承重点</span><span><i class="unload-dot"></i>卸货点</span><span><i class="truck-dot"></i>车辆</span></div>
      <div class="map-scale">${operationsData.map.locationLabel} · 示意路线 · 非现场 GPS</div>
    </section>
  `;
}

function renderMonitorVehicle(vehicle) {
  return `<button class="monitor-vehicle ${selectedMapPlate === vehicle.plate ? "selected" : ""}" data-map-vehicle="${vehicle.plate}"><span class="monitor-vehicle-icon">${icon("vehicles")}</span><span><strong>${vehicle.plate}</strong><small>${vehicle.tripId} · ${vehicle.status}</small></span><span class="vehicle-last-seen">${vehicle.lastLocated.slice(11)}</span></button>`;
}

function railExpanded() {
  if (monitorRailOpen === null) return window.innerWidth > 1280;
  return monitorRailOpen;
}

function renderWorkbench() {
  const open = getOpenAnomalies();
  const selected = operationsData.map.vehicles.find((vehicle) => vehicle.plate === selectedMapPlate);
  const trips = seedTrips.filter((trip) => matchesTrip(trip, searchValues.workbench, [(item) => item.id, (item) => item.plate]));
  return `
    ${renderPageHeader("运营监控")}<div class="monitor-page"><div class="monitor-page-toolbar"><div><span class="simulation-pill">模拟回放</span><span>2026-04-01 · 示例矿区</span></div><div class="monitor-playback"><button class="icon-button" data-replay-step="-1" aria-label="上一步">‹</button><button class="button primary" data-replay-toggle>${replayPlaying ? "Ⅱ 暂停回放" : "▷ 模拟回放"}</button><input aria-label="回放进度" type="range" min="0" max="100" value="${replayProgress * 100}" data-replay-seek/><span>13:05—14:52</span><button class="icon-button" data-replay-step="1" aria-label="下一步">›</button><span class="replay-speed">1×</span></div><div class="monitor-search">${renderSearch("workbench", "搜索车牌或趟次")}${searchValues.workbench.trim() ? `<div class="search-results-panel">${trips.map(renderWorkbenchRow).join("") || '<div class="empty-state">没有匹配记录</div>'}</div>` : ""}</div><button class="rail-toggle" data-toggle-rail aria-expanded="${railExpanded()}">${railExpanded() ? "‹ 收起侧栏" : `异常线索<span class="rail-toggle-count">${open.length}</span>›`}</button></div><div class="monitor-layout${railExpanded() ? "" : " rail-collapsed"}"><div class="monitor-map-column">${renderMineMap()}</div>
      <aside class="monitor-rail${railExpanded() ? " open" : ""}"><section class="rail-block"><div class="rail-heading"><div><span>${selected ? "选中车辆" : "车辆详情"}</span>${selected ? `<strong>${selected.plate}</strong>` : ""}</div>${selected ? '<button class="icon-button" data-clear-map-vehicle aria-label="关闭车辆详情">×</button>' : ""}</div>${selected ? `<div class="vehicle-rail-data"><div><span>当前趟次</span><button class="text-button" data-open-trip="${selected.tripId}">${selected.tripId} ›</button></div><div><span>运行状态</span><strong>${selected.status}</strong></div><div><span>计划路径</span><strong>${selected.route.join(" → ")}</strong></div><div><span>最后位置</span><strong>${selected.lastLocated}</strong></div></div><button class="button secondary rail-action" data-open-vehicle="${selected.plate}">查看车辆档案</button>` : '<div class="vehicle-select-empty compact"><span>点击地图上的车辆，查看趟次与运行状态</span></div>'}</section>
        <section class="rail-block"><div class="section-heading"><h3>AI异常线索</h3><span>${open.length} 项</span></div>${open.length ? open.map((trip) => `<button class="monitor-alert" data-open-trip="${trip.id}"><span class="alert-mark">!</span><span><strong>${trip.issue}</strong><small>${trip.id} · ${trip.plate}</small><em>${escapeHtml(eventText(trip))} · ${confidenceInfo(trip).short}</em></span><b>查看 ›</b></button>`).join("") : '<div class="empty-state">当前没有待复核线索</div>'}</section>
      </aside></div>
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
      <div class="section-heading evidence-heading"><div><h3>车辆与装载影像</h3><span class="example-label">示例影像 · 未关联本趟现场摄像头</span></div><button class="button secondary camera-entry" data-open-monitor="${trip.id}">查看监控画面</button></div>
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
  const passResult = assessment.kind === "pass"
    ? `<div class="ai-review-sequence"><span>AI建议通过</span><b>→</b><span>${status === "verified" ? "人工核实通过" : "待人工核实"}</span></div>`
    : "";
  const basisSources = assessment.kind === "anomaly" && trip.issue === "皮重波动异常"
    ? ["路线记录", "称重记录", "近 30 天均值"]
    : ["路线记录", "车辆影像", "称重记录"];
  return `
    <section class="ai-advice ${assessment.kind}">
      <div class="ai-advice-head"><div><span class="ai-mark">AI</span><h3>稽核建议</h3><span class="example-label">示例</span></div><span class="ai-review-state"><small>人工结论</small>${statusPill(status)}</span></div>
      <span class="ai-finding ${assessment.kind}">${assessment.finding}</span>
      <strong class="ai-recommendation">${assessment.heading}</strong>
      <span class="ai-confidence">${confidence.text}</span>
      <p>${assessment.reason}${confidence.low ? `<em class="ai-confidence-hint">置信度偏低，建议以人工核对为准。</em>` : ""}</p>
      ${passResult}
      <div class="evidence-links"><span class="evidence-label">判定依据</span>${basisSources.map((s) => `<span>${s}</span>`).join("")}</div>
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

function renderAiFeedbackBar(trip) {
  if (aiAssessment(trip).kind !== "anomaly") return "";
  const feedback = aiFeedback[trip.id];
  if (feedback) {
    const verdict = feedback.vote === "accurate" ? "AI 判定准确" : "AI 判定有误";
    return `<div class="ai-feedback submitted"><span class="ai-feedback-label">人工反馈</span><span>${verdict}${feedback.reason ? ` · 理由：${escapeHtml(feedback.reason)}` : ""}</span></div>`;
  }
  if (feedbackOpenTripId === trip.id) {
    const reasons = trip.issue === "皮重波动异常"
      ? ["属正常装载差异", "计量设备误差", "历史均值数据不足"]
      : ["两卸点实为同一卸区", "计划已临时变更未同步", "定位或记录误差"];
    return `<div class="ai-feedback open"><span class="ai-feedback-label">本次 AI 判定不准确，主要原因是</span><div class="ai-feedback-reasons">${reasons.map((reason) => `<button class="button secondary" data-feedback-reason="${reason}" data-trip="${trip.id}">${reason}</button>`).join("")}</div><form class="workflow-form compact" data-feedback-form data-trip="${trip.id}"><label>其他（补充说明，选填）<textarea name="reason"></textarea></label><div><button class="button primary" type="submit">提交反馈</button><button class="button secondary" type="button" data-cancel-feedback>取消</button></div></form></div>`;
  }
  return `<div class="ai-feedback"><span class="ai-feedback-label">本次 AI 判定是否准确？</span><div class="ai-feedback-actions"><button class="button secondary" data-feedback-vote="accurate" data-trip="${trip.id}">准确</button><button class="button secondary" data-feedback-vote="inaccurate" data-trip="${trip.id}">不准确</button></div></div>`;
}

function renderReviewActions(trip) {
  const status = getStatus(trip);
  const followUp = getFollowUp(trip);
  if (status === "confirmedAnomaly") return `${renderFollowUpPanel(trip)}${renderAiFeedbackBar(trip)}`;
  if (status === "verified") {
    // 反馈条置于 sticky 复核结果栏之前，避免被吸底栏遮挡
    return `${renderAiFeedbackBar(trip)}<div class="review-result"><span class="status ${status}">${statusLabels[status]}</span><span>人工复核结果 · 示例</span></div>${renderFollowUpPanel(trip)}`;
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
    <div class="audit-toolbar">${renderSearch("audit", "搜索车牌、趟次或异常关键词")}<span class="audit-sort-note">待复核优先 · 时间降序</span></div>
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

function renderAnalyticsKpi(label, total, rows, key, cls) {
  const average = rows.length ? Math.round(total / rows.length) : 0;
  const max = Math.max(...rows.map((row) => row[key]), 1);
  return `<article class="analytics-kpi ${cls}"><div><span>${label}</span><strong>${total.toLocaleString()}<small>吨</small></strong><small>日均 ${average.toLocaleString()} 吨 · ${rows.length} 天</small></div><div class="kpi-spark" role="img" aria-label="${label}每日示例趋势">${rows.map((row) => `<i style="--bar-height:${Math.max(8, row[key] / max * 100)}%"></i>`).join("")}</div></article>`;
}

function renderAnalyticsBreakdown(rows, field, metric, title, cls) {
  const totals = Object.entries(rows.reduce((acc, row) => {
    const label = row[field];
    acc[label] = (acc[label] || 0) + row[metric];
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...totals.map(([, value]) => value), 1);
  return `<section class="analysis-panel breakdown-card ${cls}"><div class="panel-heading"><div><h2>${title}</h2><span>${rows.length} 天 · 示例汇总</span></div></div><div class="breakdown-list">${totals.map(([label, value]) => `<div class="breakdown-row"><span>${label}</span><div><i style="width:${value / max * 100}%"></i></div><strong>${value.toLocaleString()} 吨</strong></div>`).join("")}</div></section>`;
}

function renderAnalytics() {
  const rows = getPeriodRows();
  const totals = rows.reduce((acc, row) => ({ mined: acc.mined + row.minedTons, transport: acc.transport + row.verifiedTransportTons, unload: acc.unload + row.receivedUnloadTons }), { mined: 0, transport: 0, unload: 0 });
  const query = searchValues.analytics;
  const displayRows = rows.filter((row) => matchesTrip(row, query, [(item) => item.date, (item) => item.miningArea, (item) => item.unloadPoint, (item) => item.minedSource, (item) => item.transportSource, (item) => item.unloadSource]));
  const chosen = rows.find((row) => row.date === analyticsDate) || rows.at(-1);
  const vehiclePeriodKey = analyticsPeriod === "month" ? "month" : "week";
  const vehicleRows = operationsData.vehiclePeriods.filter((vehicle) => vehicle.periodKey === vehiclePeriodKey && matchesTrip(vehicle, query, [(item) => item.plate, (item) => item.sourceRecordId]));
  const vehicleMax = Math.max(...vehicleRows.map((vehicle) => vehicle.verifiedTons), 1);
  return `
    ${renderPageHeader("生产与运力分析")}
    <div class="analysis-controls"><div><strong>示例矿区</strong><span>${rows[0]?.date || "—"} 至 ${rows.at(-1)?.date || "—"}</span><small>${operationsData.scopeLabel}</small></div><div class="analysis-actions">${renderSearch("analytics", "搜索日期、采区、车辆或卸货点")}${renderPeriodTabs()}</div></div>
    <section class="analytics-kpis">${renderAnalyticsKpi("采矿量", totals.mined, rows, "minedTons", "mined")}${renderAnalyticsKpi("核实运输净重", totals.transport, rows, "verifiedTransportTons", "transport")}${renderAnalyticsKpi("卸点接收量", totals.unload, rows, "receivedUnloadTons", "unload")}</section>
    <div class="analytics-body"><main class="analysis-main">
      <section class="analysis-panel"><div class="panel-heading"><div><h2>产运关键指标趋势</h2><span>${rows[0]?.date || "—"} 至 ${rows.at(-1)?.date || "—"} · ${analyticsPeriod === "day" ? "日" : analyticsPeriod === "week" ? "周" : "月"} · 示例</span></div><button class="text-button" data-view="ai">生成分析报告 ›</button></div>${renderTrendChart(rows)}</section>
      <div class="analytics-breakdowns">${renderAnalyticsBreakdown(rows, "miningArea", "minedTons", "采区采矿量分布", "area-breakdown")}${renderAnalyticsBreakdown(rows, "unloadPoint", "receivedUnloadTons", "卸点接收量分布", "unload-breakdown")}</div>
      <section class="analysis-panel"><div class="panel-heading"><div><h2>生产与运输明细</h2><span>${displayRows.length} 个日期 · 数据来源独立</span></div></div><div class="metric-table-wrap"><table class="metric-table"><thead><tr><th>日期</th><th>采区</th><th>采矿量</th><th>运输净重</th><th>卸货点</th><th>接收量</th><th>来源</th></tr></thead><tbody>${displayRows.map((row) => `<tr class="${row.date === analyticsDate ? "selected" : ""}"><td><button class="table-date-button" data-analytics-date="${row.date}">${row.date}</button></td><td>${row.miningArea}</td><td>${row.minedTons} 吨</td><td>${row.verifiedTransportTons} 吨</td><td>${row.unloadPoint}</td><td>${row.receivedUnloadTons} 吨</td><td><button class="text-button" data-source-record="${row.sourceIds.mining}">示例汇总 ›</button></td></tr>`).join("")}</tbody></table></div></section>
      <section class="analysis-panel vehicle-capacity-panel"><div class="panel-heading"><div><h2>车辆周期运力</h2><span>${vehicleRows[0]?.periodLabel || "扩展示例"} · 吨位对比，不推算利用率</span></div></div><div class="capacity-table-head"><span>车辆</span><span>有效趟次</span><span>核实吨位</span><span>均载重</span><span>周转</span></div>${vehicleRows.map((vehicle) => `<div class="capacity-item"><button class="capacity-row" data-open-vehicle="${vehicle.plate}"><strong>${vehicle.plate}</strong><span>${vehicle.trips}</span><span class="capacity-tonnage">${vehicle.verifiedTons.toFixed(1)} 吨<i><b style="width:${vehicle.verifiedTons / vehicleMax * 100}%"></b></i></span><span>${vehicle.averagePayload.toFixed(2)} 吨</span><span>${vehicle.turnaroundMinutes} 分</span></button><button class="capacity-source" data-source-record="${vehicle.sourceRecordId}">来源</button></div>`).join("")}</section>
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

function matchChatIntent(question) {
  const query = question.toLocaleLowerCase();
  if (query.includes("生成") && query.includes("报告")) return "report";
  if (/晋B[·.]?24680|车辆|运力/.test(query) && /周|月|周期|运力/.test(query)) return query.includes("月") ? "vehicle-month-capacity" : "vehicle-capacity";
  if (/采矿|采区|采出/.test(query)) return "production-trend";
  if (/卸点|卸货|接收量/.test(query)) return "unload-trend";
  if (/异常|稽核/.test(query)) return "anomaly-review";
  if (/今天|今日/.test(query) && /运输|趟次|卸货/.test(query)) return "daily-operation";
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

function renderChatAnswer(item) {
  if (!item) return "";
  const streaming = chatState === "streaming";
  let detail = "";
  let action = "";
  if (chatState === "complete" && item.resultType === "operation-summary") {
    const verified = getVerifiedTrips();
    const pending = getUnresolvedTrips();
    const total = verified.reduce((sum, trip) => sum + getNetWeight(trip), 0);
    const day = operationsData.dailyMetrics.find((row) => row.date === "2026-04-01");
    detail = `<div class="answer-metrics"><div><span>运输趟次</span><strong>${seedTrips.length} 趟</strong></div><div><span>核实通过</span><strong>${verified.length} 趟 · ${formatWeight(total)} 吨</strong></div><div><span>待复核</span><strong>${pending.length} 趟</strong></div><div><span>卸货接收量</span><strong>${day?.receivedUnloadTons ?? "—"} 吨</strong></div></div><div class="answer-table"><div><span>趟次 / 车辆</span><span>净重</span><span>人工状态</span></div>${seedTrips.map((trip) => `<button data-open-trip="${trip.id}"><span>${trip.id} · ${trip.plate}</span><span>${formatWeight(getNetWeight(trip))} 吨</span><span>${statusPill(getStatus(trip))}</span></button>`).join("")}</div>`;
    action = '<button class="button secondary" data-view="audit">打开运输稽核</button>';
  } else if (chatState === "complete" && item.resultType === "vehicle-capacity") {
    const vehicle = operationsData.vehiclePeriods.find((record) => record.sourceRecordId === item.sourceRecordIds[0]);
    detail = `<div class="answer-metrics"><div><span>有效趟次</span><strong>${vehicle.trips} 趟</strong></div><div><span>核实净重</span><strong>${vehicle.verifiedTons.toFixed(1)} 吨</strong></div><div><span>均载重</span><strong>${vehicle.averagePayload.toFixed(2)} 吨</strong></div><div><span>平均周转</span><strong>${vehicle.turnaroundMinutes} 分</strong></div></div><div class="answer-note">缺少额定载荷与可运营时长，暂不计算利用率。</div>`;
    action = `<button class="button secondary" data-open-vehicle="${item.plate}">查看 ${item.plate} 档案</button>`;
  } else if (chatState === "complete" && item.resultType === "production-trend") {
    const rows = operationsData.dailyMetrics;
    const total = rows.reduce((sum, row) => sum + row.minedTons, 0);
    const areas = [...new Set(rows.map((row) => row.miningArea))].map((area) => ({ area, total: rows.filter((row) => row.miningArea === area).reduce((sum, row) => sum + row.minedTons, 0) }));
    detail = `<div class="answer-metrics"><div><span>周期采矿量</span><strong>${total.toLocaleString()} 吨</strong></div><div><span>统计日期</span><strong>${rows.length} 天</strong></div><div><span>采区数</span><strong>${areas.length} 个</strong></div></div>${renderChatTrend(rows, "minedTons")}<div class="answer-breakdown">${areas.map((area) => `<span><i></i>${area.area}<strong>${area.total.toLocaleString()} 吨</strong></span>`).join("")}</div>`;
    action = '<button class="button secondary" data-view="analytics">查看生产与运力分析</button>';
  } else if (chatState === "complete" && item.resultType === "unload-trend") {
    const rows = operationsData.dailyMetrics;
    const total = rows.reduce((sum, row) => sum + row.receivedUnloadTons, 0);
    const groups = [...new Set(rows.map((row) => row.unloadPoint))].map((point) => ({ point, total: rows.filter((row) => row.unloadPoint === point).reduce((sum, row) => sum + row.receivedUnloadTons, 0) }));
    detail = `<div class="answer-metrics"><div><span>周期接收量</span><strong>${total.toLocaleString()} 吨</strong></div><div><span>卸货点</span><strong>${groups.length} 个</strong></div><div><span>日明细</span><strong>${rows.length} 天</strong></div></div><div class="answer-breakdown">${groups.map((group) => `<span><i></i>${group.point}<strong>${group.total.toLocaleString()} 吨</strong></span>`).join("")}</div><div class="answer-table daily-unload-table"><div><span>日期</span><span>卸货点</span><span>接收量</span><span>来源</span></div>${rows.map((row) => `<div><span>${row.date}</span><span>${row.unloadPoint}</span><strong>${row.receivedUnloadTons} 吨</strong><button class="text-button" data-source-record="${row.sourceIds.unload}">查看</button></div>`).join("")}</div><div class="answer-note">按卸点接收磅单单独统计；不以运输净重替代接收量。</div>`;
    action = '<button class="button secondary" data-view="analytics">查看卸货趋势</button>';
  } else if (chatState === "complete" && item.resultType === "anomaly-list") {
    const anomalies = getOpenAnomalies();
    detail = `<div class="answer-note anomaly-note">${anomalies.length} 条待复核线索 · AI提示不等于违规结论</div><div class="answer-anomalies">${anomalies.map((trip) => `<button data-open-trip="${trip.id}"><span><strong>${escapeHtml(trip.issue)}</strong><small>${trip.id} · ${trip.plate} · ${confidenceInfo(trip).short} · ${trip.occurredAt.replace("T", " ")}</small></span><span>${escapeHtml(eventText(trip))}</span><b>查看 ›</b></button>`).join("") || '<div class="empty-state">当前没有待复核异常线索</div>'}</div>`;
    action = '<button class="button secondary" data-view="audit">进入运输稽核</button>';
  } else if (chatState === "complete" && item.resultType === "report-preview") {
    detail = `<div class="report-preview"><strong>本月运营报告</strong><span>28 天趋势 · 四车运力对比 · 每日指标与来源</span><small>范围：${item.period} · 示例数据</small></div>`;
    action = '<button class="button primary" data-generate-report>生成报告</button>';
  }
  return `<article class="chat-answer answer-${item.resultType}"><div class="answer-heading"><span class="ai-avatar">AI</span><div><strong>${escapeHtml(item.question)}</strong><small>${item.period} · 示例数据 · 演示响应</small></div>${chatState === "complete" ? '<div class="answer-tools"><button class="text-button" data-copy-answer>复制</button><button class="text-button" data-regenerate>重新生成</button></div>' : ""}</div><p data-answer-copy>${escapeHtml(streaming ? chatStreamText : item.answer)}${streaming ? '<i class="stream-caret" aria-hidden="true"></i>' : ""}</p>${detail}${chatState === "complete" ? `<div class="answer-scope"><div><span>指标口径</span><strong>${escapeHtml(item.metric)}</strong></div></div><div class="answer-sources"><span>数据来源</span>${item.sources.map((source) => `<small>${escapeHtml(source)}</small>`).join("") || "<small>未查询平台数据</small>"}</div>${item.sourceTripIds?.length ? `<div class="source-links">${renderSourceButtons(item.sourceTripIds)}</div>` : ""}${item.sourceRecordIds?.length ? `<div class="source-links">${renderMetricSourceButtons(item.sourceRecordIds)}</div>` : ""}${selectedSourceId ? renderSourceRecord(selectedSourceId) : ""}${action ? `<div class="answer-actions">${action}</div>` : ""}` : ""}</article>`;
}

function renderFilePreview() {
  if (!pendingUpload) return "";
  return `<section class="file-preview"><div class="panel-heading"><div><h2>解析预览</h2><span>${escapeHtml(pendingUpload.name)} · ${pendingUpload.type}</span></div><button class="text-button" data-cancel-upload>取消</button></div><small class="file-source-ref">来源位置：${escapeHtml(pendingUpload.sourceRef)}</small><p>${escapeHtml(pendingUpload.excerpt || "文件内容为空")}</p>${pendingUpload.rows ? `<div class="file-table">${pendingUpload.rows.map(({ lineNo, cells }) => `<div><span class="file-row-number">${lineNo}</span>${cells.map((cell) => `<span>${escapeHtml(cell)}</span>`).join("")}</div>`).join("")}</div>` : ""}<div class="file-boundary">文件来源独立保存，不加入平台运营统计</div><button class="button primary" data-confirm-upload>确认整理为文件报告</button></section>`;
}

function renderAiWorkbench() {
  const item = chatAnswer;
  return `
    ${renderPageHeader("AI工作台")}
    <div class="ai-workspace ${aiDockView === "hidden" ? "" : "has-side-panel"}"><section class="chat-column"><div class="chat-heading"><div><h2>矿山运营问答</h2><span>查运营数据、追溯来源、生成报告</span></div><div class="chat-heading-actions"><button class="button secondary" data-open-ai-dock="reports">历史报告 <b>${reports.length}</b></button><button class="button secondary" data-open-ai-dock="files">文件解析 <b>${fileReports.length + (pendingUpload ? 1 : 0)}</b></button><span class="ai-status"><i></i>示例数据</span></div></div>
      <div class="chat-prompts">${operationsData.chatExamples.map((example) => `<button class="prompt-button ${selectedChat === example.intent ? "selected" : ""}" data-chat-example="${example.intent}">${example.question}<span>↗</span></button>`).join("")}</div>
      <div class="chat-conversation">${chatQuestion ? `<div class="user-question">${escapeHtml(chatQuestion)}</div>` : `<div class="conversation-empty">${chatDraft ? "问题已回填，点击查询开始分析。" : "选择一个问题，或输入矿山运营问题。"}</div>`}${chatState === "thinking" ? '<div class="ai-thinking"><span class="ai-avatar">AI</span><div><strong>正在分析问题</strong><small>识别矿区、时间范围与数据口径</small><i><b></b><b></b><b></b></i></div></div>' : renderChatAnswer(item)}</div>
      <form class="chat-composer" data-chat-form><input name="question" data-chat-composer-input value="${escapeHtml(chatDraft)}" placeholder="询问矿山运营数据…" aria-label="输入矿山运营问题"/><button class="composer-file" type="button" data-ai-tab="files" aria-label="上传文件">＋</button>${chatState === "streaming" || chatState === "thinking" ? '<button class="button primary" type="button" data-stop-chat>■ 停止</button>' : '<button class="button primary" type="submit">查询</button>'}</form>
    </section>${renderAiSidePanel()}</div>
  `;
}

function renderAiSidePanel() {
  if (aiDockView === "hidden") return "";
  if (aiDockView === "report" && reportPreview) return `<aside class="file-column report-side-panel"><header class="report-dock-heading"><button class="text-button" data-close-report>‹ 历史报告</button><button class="icon-button" data-close-ai-dock aria-label="关闭报告">×</button><div><span>HTML 报告 · 示例数据</span><h2>${escapeHtml(reportPreview.title)}</h2></div><div class="report-dock-actions"><button class="button secondary" data-export-word>下载 Word</button><button class="button secondary" data-print-report>打印 / 保存 PDF</button></div></header><article class="report-html-preview">${reportBodyHtml(reportPreview)}</article></aside>`;
  if (aiDockView === "reports") return `<aside class="file-column ai-dock-list"><header class="dock-list-heading"><div><span>报告 · ${reports.length} 份</span><h2>历史报告</h2></div><button class="icon-button" data-close-ai-dock aria-label="关闭历史报告">×</button></header>${reports.length ? `<div class="report-list">${reports.map((report, index) => `<div class="report-row"><span><strong>${escapeHtml(report.title)}</strong><small>${report.createdAt} · ${report.origin}</small></span><button class="text-button" data-view-report="${index}">打开报告 ›</button></div>`).join("")}</div>` : '<div class="ai-dock-empty">提交报告问题后，可在这里查看生成记录</div>'}</aside>`;
  if (aiDockView === "files") return `<aside class="file-column ai-dock-list"><header class="dock-list-heading"><div><span>文件解析 · ${fileReports.length + (pendingUpload ? 1 : 0)} 项</span><h2>文件与整理结果</h2></div><button class="icon-button" data-close-ai-dock aria-label="关闭文件解析">×</button></header><label class="upload-button"><input type="file" data-file-upload accept=".csv,.txt,.md,text/csv,text/plain,text/markdown"/><span>＋ 上传 CSV / TXT / MD</span></label>${renderFilePreview()}<div class="uploaded-list">${fileReports.length ? fileReports.map((report, index) => `<div class="uploaded-row"><strong>${escapeHtml(report.name)}</strong><small>文件来源 · 已确认</small><button class="text-button" data-view-file-report="${index}">打开 ›</button></div>`).join("") : '<div class="file-empty">尚无文件整理结果</div>'}</div></aside>`;
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
  const cameraLabel = monitorMode === "live" ? trip.grossStation : trip.unloadRecord;
  const cameraName = monitorMode === "live" ? "承重点摄像头" : "卸货点摄像头";
  return `<div class="monitor-modal" data-monitor-modal role="dialog" aria-modal="true" aria-labelledby="camera-title"><button class="modal-backdrop" data-close-monitor aria-label="关闭监控"></button><section class="monitor-dialog"><header class="monitor-dialog-head"><div><span class="modal-kicker">${trip.id} · ${trip.plate}</span><h2 id="camera-title">运输监控</h2></div><button class="icon-button" data-close-monitor aria-label="关闭">×</button></header><div class="monitor-tabs"><button class="monitor-tab ${monitorMode === "live" ? "selected" : ""}" data-monitor-mode="live">实时演示</button><button class="monitor-tab ${monitorMode === "replay" ? "selected" : ""}" data-monitor-mode="replay">历史回放</button></div><div class="camera-meta"><span class="camera-led"></span><strong>${cameraName}</strong><span>${escapeHtml(cameraLabel)}</span><small>演示视频 · 未连接现场摄像头</small></div>${monitorMode === "replay" ? `<form class="camera-replay-form" data-camera-query><label>日期<input type="date" name="date" value="${replay.date}" required /></label><label>开始<input type="time" name="start" value="${replay.start}" required /></label><label>结束<input type="time" name="end" value="${replay.end}" required /></label><button class="button primary" type="submit">查询回放</button></form>` : ""}${monitorMode === "replay" && replay.searched && !replay.matched ? `<div class="camera-empty">所选时段没有这趟运输的演示录像。可选时段需覆盖 ${trip.times.gross}–${trip.times.tare}。</div>` : `<div class="camera-video-wrap"><video src="./public/videos/cctv-demo.mp4" data-clip-start="${clipStart}" data-clip-end="${clipEnd}" ${monitorMode === "live" || !replay.searched ? "autoplay loop" : "controls"} muted playsinline></video><div class="camera-watermark">${monitorMode === "live" ? "LIVE · 模拟画面" : "回放 · 模拟片段"}</div><div class="camera-video-time">${trip.occurredAt.slice(0, 10)}　${monitorMode === "replay" && replay.searched ? `${replay.start}—${replay.end}` : `${trip.times.gross}—${trip.times.tare}`}</div></div>${monitorMode === "replay" ? `<div class="camera-events"><span>本趟事件</span><button type="button" data-camera-event="gross">重车承重 ${trip.times.gross}</button><button type="button" data-camera-event="unload">卸货 ${trip.times.unload}</button><button type="button" data-camera-event="tare">空车回皮 ${trip.times.tare}</button></div>` : `<div class="camera-live-note"><span>画面循环播放，用于体验查看入口与操作</span><span>采样时间 ${trip.times.gross}</span></div>`}`}</section></div>`;
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
  return `<div class="report-chart"><div class="report-chart-legend">${series.map((entry) => `<span><i style="background:${entry.color}"></i>${entry.name}</span>`).join("")}<small>吨 · 28 天示例</small></div><svg viewBox="0 0 600 210" role="img" aria-label="28天采矿量、核实运输净重和卸点接收量趋势图"><path d="M58 36H568M58 78H568M58 120H568M58 162H568" stroke="#e5ebf0" fill="none"/><g fill="#8295AB" font-size="10"><text x="7" y="39">${Math.round(max)}</text><text x="7" y="81">${Math.round(max * .67)}</text><text x="7" y="123">${Math.round(max * .33)}</text><text x="36" y="165">0</text></g>${series.map((entry) => `<polyline points="${rows.map((row, index) => `${x(index)},${y(row[entry.key])}`).join(" ")}" fill="none" stroke="${entry.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}${labels.map((row) => { const index = rows.indexOf(row); return `<text x="${x(index)}" y="190" text-anchor="middle" fill="#6B7E95" font-size="10">${row.date.slice(5)}</text>`; }).join("")}</svg></div>`;
}

function renderReportVehicleChart(rows) {
  const max = Math.max(...rows.map((row) => row.verifiedTons));
  return `<div class="report-vehicle-chart">${rows.map((row) => `<div class="report-vehicle-bar"><span>${escapeHtml(row.plate)}</span><div><i style="width:${row.verifiedTons / max * 100}%"></i></div><strong>${row.verifiedTons.toLocaleString()} 吨</strong><small>${row.trips} 趟</small></div>`).join("")}<small>月度人工核实运输净重 · 吨</small></div>`;
}

function renderToast() {
  return notice ? `<div class="toast" role="status">${notice}</div>` : "";
}

function renderGlobalBar() {
  const range = getPeriodRows();
  const context = activeView === "analytics" ? `${range[0]?.date || "—"} ~ ${range.at(-1)?.date || "—"}` : "2026-04-01 ~ 2026-04-28";
  return `<header class="app-topbar"><div class="global-context"><span class="global-site-dot"></span><strong>示例矿区</strong><span class="scope-chip"><span class="scope-icon">${icon("location")}</span>长青矿山</span><span class="scope-chip"><span class="scope-icon">${icon("calendar")}</span>${context}</span></div><div class="topbar-actions"><button class="icon-button" aria-label="通知">♧</button><button class="customer-quick-link" data-enter-customer>客户体验</button><span class="operator-avatar">张</span><span class="operator-name">张工⌄</span></div></header>`;
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
      ${renderGlobalBar()}
      <main class="main-content main-${activeView}" data-page="${activeView}">
        ${customerExperience ? '<div class="customer-mode-banner"><span>客户能力验收体验 · 本地模拟数据</span><span><button class="text-button" data-return-customer>返回验收路径</button><button class="text-button" data-exit-customer>退出体验</button></span></div>' : ""}
        ${pages[activeView]()}
      </main>
      ${renderToast()}
      ${renderLightbox()}
    </div>
  `;
  if (activeView === "workbench") requestAnimationFrame(() => mountMineMap(root));
  // 窄屏导航溢出提示（渐隐右缘；滚动到末尾时移除）
  requestAnimationFrame(() => {
    const topNav = root.querySelector(".platform-nav-shell nav");
    if (!topNav) return;
    const updateNavHint = () => {
      const overflow = topNav.scrollWidth > topNav.clientWidth + 2;
      const atEnd = topNav.scrollLeft + topNav.clientWidth >= topNav.scrollWidth - 2;
      topNav.classList.toggle("is-scrollable", overflow && !atEnd);
    };
    updateNavHint();
    topNav.addEventListener("scroll", updateNavHint, { passive: true });
  });
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
  if (view !== "ai") aiDockView = "hidden";
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
  if (event.target.closest("[data-clear-map-vehicle]")) {
    selectedMapPlate = null;
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
    replayActive = true;
    replayProgress = Math.min(1, Math.max(0, replayProgress + Number(replayStep.dataset.replayStep) * 0.08));
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
  if (event.target.closest("[data-toggle-rail]")) {
    monitorRailOpen = !railExpanded();
    render(root);
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
