const { getNetWeight, seedTrips, vehicleTareChecks } = window;

const navItems = [
  { id: "workbench", label: "工作台", icon: "workbench" },
  { id: "audit", label: "运输稽核", icon: "audit" },
  { id: "vehicles", label: "车辆档案", icon: "vehicles" },
  { id: "settlement", label: "结算预览", icon: "settlement" },
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
const searchValues = { workbench: "", audit: "", vehicles: "", settlement: "" };
const eventQueue = [];

let activeView = "workbench";
let selectedTripId = "T-0401-007";
let selectedVehiclePlate = "蒙A·67890";
let eventCursor = 0;
let simulationRunning = false;
let simulationTimer = null;
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
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
}

function renderNav() {
  return `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">秤</span><span>矿山运输稽核</span></div>
      <nav aria-label="主导航">
        ${navItems.map((item) => `
          <button class="nav-item ${activeView === item.id ? "active" : ""}" data-view="${item.id}" ${activeView === item.id ? 'aria-current="page"' : ""}>
            ${icon(item.icon)}<span>${item.label}</span>
            ${item.id === "audit" ? `<span class="nav-count">${getUnresolvedTrips().length}</span>` : ""}
          </button>
        `).join("")}
      </nav>
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

function renderWorkbench() {
  const pending = getUnresolvedTrips();
  const open = getOpenAnomalies();
  const searchedTrips = seedTrips.filter((trip) => matchesTrip(trip, searchValues.workbench, [
    (item) => item.id,
    (item) => item.plate,
  ]));
  const vehiclesCount = new Set(seedTrips.map((trip) => trip.plate)).size;
  const dynamicEvents = eventQueue.map((id) => sampleTrips.get(id)).filter(Boolean);
  const events = dynamicEvents.length
    ? dynamicEvents.map((trip) => ({ trip, label: "模拟动态" }))
    : [
        ...open.map((trip) => ({ trip, label: "AI发现异常" })),
        ...getOpenFollowUps().map((trip) => ({ trip, label: "待处置异常" })),
      ];

  return `
    ${renderPageHeader("运营工作台")}
    ${renderCustomerEntry()}
    <div class="module-toolbar">${renderSearch("workbench", "车牌或趟次编号")}</div>
    <section class="metrics" aria-label="运营统计">
      ${renderMetric("运输趟次", seedTrips.length, "趟")}
      ${renderMetric("关联车辆", vehiclesCount, "辆")}
      ${renderMetric("待处理（含退回复核）", pending.length, "趟")}
      ${renderMetric("核实通过净重", formatWeight(getVerifiedNetTotal()), "吨")}
    </section>
    ${searchValues.workbench.trim() ? `
      <section class="search-results-panel"><div class="section-heading"><h2>检索结果</h2><span>${searchedTrips.length} 趟</span></div>${searchedTrips.length ? searchedTrips.map(renderWorkbenchRow).join("") : '<div class="empty-state">没有匹配记录</div>'}</section>
    ` : `
      <div class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-heading"><div><h2>待处理趟次</h2><span>${pending.length} 趟</span></div><button class="text-button" data-view="audit">进入稽核</button></div>
          <div class="work-rows">${pending.length ? pending.map(renderWorkbenchRow).join("") : '<div class="empty-state">当前没有待处理趟次</div>'}</div>
        </section>
        <section class="workbench-panel event-panel">
          <div class="panel-heading"><div><h2>AI异常动态</h2><span class="event-counts">待复核 ${open.length} · 待处置 ${getOpenFollowUps().length}</span></div>${customerExperience ? '<span class="customer-copy-label">体验数据</span>' : `<button class="button ${simulationRunning ? "secondary" : "primary"}" data-simulate>${simulationRunning ? "暂停模拟" : "开始模拟"}</button>`}</div>
      <div class="event-rows">${events.length ? events.slice(0, 4).map(({ trip, label }) => renderEvent(trip, label)).join("") : '<div class="empty-state">暂无待处理异常</div>'}</div>
          ${simulationRunning ? '<div class="simulation-note">模拟事件将关联现有示例趟次</div>' : ""}
        </section>
      </div>
    `}
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
  return `
    <section class="route-section">
      <div class="route-column"><span class="eyebrow">计划路线 <span class="example-label">示例</span></span><div class="route-points">${trip.plannedRoute.map((point, index) => `<span class="${mismatch && index === trip.plannedRoute.length - 1 ? "anomaly-point" : ""}">${point}</span>`).join('<i aria-hidden="true"></i>')}</div></div>
      <div class="route-result ${mismatch ? "has-mismatch" : "match"}"><span class="eyebrow">卸货记录 <span class="example-label">示例</span></span><strong class="${mismatch ? "anomaly-value" : ""}">${trip.unloadRecord}</strong><span class="${mismatch ? "anomaly-caption" : ""}">${mismatch ? "与计划不一致" : "与计划一致"}</span></div>
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
    <section class="section-block">
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
    <section class="section-block">
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
    </section>
  `;
}

function renderAudit() {
  const value = searchValues.audit;
  const trips = seedTrips.filter((trip) => matchesTrip(trip, value, [
    (item) => item.id,
    (item) => item.plate,
    (item) => item.unloadRecord,
    (item) => item.issue,
  ])).sort((a, b) => {
    const aPending = getStatus(a) === "pending";
    const bPending = getStatus(b) === "pending";
    return Number(bPending) - Number(aPending) || b.occurredAt.localeCompare(a.occurredAt);
  });
  const selected = trips.find((trip) => trip.id === selectedTripId) || trips[0];
  if (selected) selectedTripId = selected.id;
  return `
    ${renderPageHeader("运输稽核")}
    <div class="module-toolbar">${renderSearch("audit", "车牌、趟次编号或卸货点")}</div>
    <div class="audit-layout">
      <section class="audit-list-panel"><div class="panel-heading"><div><h2>运输趟次</h2><span>${trips.length} 趟</span></div></div><div class="audit-list">${trips.length ? trips.map(renderAuditRow).join("") : '<div class="empty-state">没有匹配记录</div>'}</div></section>
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

function renderLightbox() {
  return `<div class="lightbox" data-lightbox hidden role="dialog" aria-modal="true" aria-label="示例车辆影像"><button class="lightbox-close" data-close-photo aria-label="关闭影像">×</button><img data-lightbox-image alt="完整示例车辆影像" /></div>`;
}

function renderToast() {
  return notice ? `<div class="toast" role="status">${notice}</div>` : "";
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
  };
  root.innerHTML = `
    <div class="app-shell">
      ${renderNav()}
      <main class="main-content" data-page="${activeView}">
        ${customerExperience ? '<div class="customer-mode-banner"><span>客户能力验收体验 · 本地模拟数据</span><span><button class="text-button" data-return-customer>返回验收路径</button><button class="text-button" data-exit-customer>退出体验</button></span></div>' : ""}
        ${pages[activeView]()}
      </main>
      ${renderToast()}
      ${renderLightbox()}
    </div>
  `;
  if (focusSearch) {
    const input = root.querySelector(`[data-search-for="${focusSearch.view}"]`);
    input?.focus();
    input?.setSelectionRange(focusSearch.caret, focusSearch.caret);
  }
}

function openAuditTrip(root, tripId) {
  selectedTripId = tripId;
  markCustomerVisited("evidence");
  activeView = "audit";
  searchValues.audit = "";
  notice = "";
  render(root);
}

function selectView(root, view) {
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
  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-search-for]");
    if (!input) return;
    const view = input.dataset.searchFor;
    const caret = input.selectionStart ?? input.value.length;
    searchValues[view] = input.value;
    render(root, { view, caret });
  });
  root.addEventListener("keydown", (event) => {
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
