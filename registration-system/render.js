function renderDetailPage() {
  const currentEvent = getCurrentEventConfig();
  const settings = getCurrentRegistrationSettings();
  const status = calculateRegistrationEventStatus(currentEvent, settings);
  const statusLabel = getLandingStatusLabel(status);
  const statusClass = getLandingStatusClass(status);
  screen.innerHTML = `
    <article class="detail-page">
      <section class="event-hero">
        ${renderBannerImage(currentEvent.bannerImage)}
        <div class="event-hero-overlay"></div>
        <div class="event-hero-content">
          <span class="event-hero-tag">赛事报名</span>
          <h2>${escapeHtml(currentEvent.name)}</h2>
          <p>${escapeHtml(statusLabel)}｜${escapeHtml(formatDate(currentEvent.registrationStartDate))} - ${escapeHtml(formatDate(currentEvent.registrationEndDate))}</p>
        </div>
        <div class="banner-track" aria-hidden="true"><span></span><span></span><span></span></div>
      </section>

      <section class="event-summary-card">
        <div class="event-summary-head">
          <span class="event-status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
          <strong>${escapeHtml(getShortEventTag(currentEvent))}</strong>
        </div>
        <h2>${escapeHtml(currentEvent.name)}</h2>
        <div class="event-summary-meta">
          <span>比赛时间：${escapeHtml(formatDate(currentEvent.competitionStartDate))} - ${escapeHtml(formatDate(currentEvent.competitionEndDate))}</span>
          <span>比赛地点：${escapeHtml(currentEvent.location || "待公布")}</span>
        </div>
      </section>

      <section class="landing-card registration-window-card">
        <div>
          <span class="card-eyebrow">报名时间</span>
          <strong>${escapeHtml(formatDate(currentEvent.registrationStartDate))} - ${escapeHtml(formatDate(currentEvent.registrationEndDate))}</strong>
          <p>${escapeHtml(getRegistrationWindowHint(status))}</p>
        </div>
        <i aria-hidden="true">●</i>
      </section>

      <section class="landing-card landing-query-card">
        <button type="button" data-action="lookup">
          <span>报名结果查询</span>
          <strong>查看支付与审核状态</strong>
        </button>
      </section>

      <section class="landing-card resource-card">
        <div class="landing-card-title">
          <span>赛事资料</span>
          <p>竞赛规程、参赛声明等重要信息</p>
        </div>
        ${renderResourceEntries(currentEvent)}
      </section>

    </article>
  `;
}

function renderEventUnavailablePage() {
  screen.innerHTML = `
    <article class="detail-page">
      <section class="form-section">
        <div class="empty-state">
          <h2>${escapeHtml(uiState.eventLoadStatus === "loading" ? "正在加载赛事" : "赛事暂不可用")}</h2>
          <p>${escapeHtml(uiState.eventLoadStatus === "loading" ? "正在读取赛事信息，请稍候..." : uiState.eventLoadError || "未找到该赛事或赛事已下架。")}</p>
        </div>
      </section>
    </article>
  `;
}

function renderFormPage() {
  syncDerivedDraftFields();
  const settings = getCurrentRegistrationSettings();
  const groups = getAvailableGroups(formDraft);
  const events = getAvailableEvents(formDraft);
  const canPickGroup = Boolean(formDraft.gender && formDraft.birthYear);
  const errors = uiState.validationErrors;

  screen.innerHTML = `
    <form class="form-page" id="registrationForm" novalidate>
      <section class="form-section">
        ${radioRow("证件类型", "certificateType", settings.certificateTypes, formDraft.certificateType)}
        ${inputRow("证件号码", "certificateNumber", "输入证件号码", formDraft.certificateNumber)}
        ${inputRow("姓名", "name", "选手姓名全称，必填", formDraft.name)}
        ${radioRow("性别", "gender", [{ value: "male", label: "男" }, { value: "female", label: "女" }], formDraft.gender)}
        ${dateRow("出生日期", "birthDate", formDraft.birthDate)}
        ${renderOrganizationSelectRow()}
        <div class="form-row picker-form-row ${errors.groupId ? "has-error" : ""}">
          <span class="row-label">参赛组别</span>
          <button class="picker-row-button ${formDraft.groupName ? "" : "is-placeholder"}" type="button" data-action="open-wheel-picker" data-picker-type="group" ${canPickGroup ? "" : "disabled"}>
            ${escapeHtml(formDraft.groupName || (canPickGroup ? "请单选 参赛组别" : "请先选择性别和出生日期"))}
          </button>
          <span class="row-arrow">›</span>
          ${fieldError("groupId")}
        </div>
        ${eventCheckboxRows(events)}
        ${inputRow("手机号", "phone", "请输入选手手机号", formDraft.phone, "tel")}
        ${insuranceRow()}
      </section>
    </form>
  `;
}

function renderConfirmPage() {
  syncDerivedDraftFields();
  screen.innerHTML = `
    <article class="confirm-page">
      <section class="form-section">
        ${readonlyRow("证件号码", formDraft.certificateNumber)}
        ${readonlyRow("姓名", formDraft.name)}
        ${readonlyRow("性别", genderLabel(formDraft.gender))}
        ${readonlyRow("出生日期", formDraft.birthDate)}
        ${readonlyRow("代表单位", formDraft.organization)}
        ${readonlyRow("参赛组别", formDraft.groupName || "未选择")}
        ${readonlyRow("参赛项目", formDraft.eventNames.join("、") || "未选择")}
        ${readonlyRow("手机号", formDraft.phone)}
        ${readonlyInsuranceRow()}
        ${readonlyRow("总费用", formatCurrency(formDraft.totalAmount))}
        ${readonlyRow("应缴费用", formatCurrency(formDraft.totalAmount))}
      </section>
    </article>
  `;
}

function renderPaymentPage() {
  ensurePendingOrder();
  const currentEvent = getCurrentEventConfig();
  const remoteSaveFailed = order.paymentStatus === "paid" && uiState.remoteSaveStatus === "failed";
  const remoteSaveSaving = uiState.remoteSaveStatus === "saving";
  screen.innerHTML = `
    <article class="payment-page">
      <section class="pay-panel">
        <div class="pay-poster" aria-hidden="true"></div>
        <h2>${escapeHtml(currentEvent.name)}</h2>
        <div class="pay-divider"></div>
        ${paymentRow("订单号", order.orderNo || "待生成")}
        ${paymentRow("报名编号", order.registrationNo || "待生成")}
        <div class="payment-amount">
          <span>支付金额</span>
          <strong>${formatCurrency(order.amount || 0)}</strong>
        </div>
      </section>
      <p class="hint-line">${
        remoteSaveFailed
          ? `${escapeHtml(uiState.remoteSaveErrorMessage || "报名支付成功，但远程保存失败，请点击重试保存。")}`
          : remoteSaveSaving
            ? "正在保存报名记录，请稍候..."
            : "当前为模拟微信支付，不会产生真实扣款。"
      }</p>
    </article>
  `;
}

function renderSuccessPage() {
  const record = registrationRecord || formDraft;
  screen.innerHTML = `
    <article class="success-page">
      <section class="success-card">
        <div class="success-icon">✓</div>
        <h2>报名成功</h2>
        <p>支付成功，当前状态：待审核</p>
        <div class="status-tags">
          <span>报名成功</span>
          <span>支付成功</span>
          <span>待审核</span>
        </div>
      </section>

      <section class="form-section">
        ${readonlyRow("报名编号", record.registrationNo || "暂无")}
        ${readonlyRow("订单号", order.orderNo || "暂无")}
        ${readonlyRow("支付金额", formatCurrency(order.amount || record.totalAmount || 0))}
        ${readonlyRow("报名状态", statusLabel(record.status))}
        ${readonlyRow("支付状态", paymentStatusLabel(order.paymentStatus))}
      </section>
    </article>
  `;
}

function renderLookupPage() {
  screen.innerHTML = `
    <article class="lookup-page">
      <section class="lookup-card">
        <label for="lookupQuery">报名查询</label>
        <div class="lookup-box">
          <input id="lookupQuery" name="lookupQuery" type="search" value="${escapeHtml(uiState.lookupQuery)}" placeholder="手机号 / 证件号 / 报名编号" />
        </div>
        <p>仅查询已支付并进入审核流程的报名记录。</p>
      </section>

      <section class="lookup-results">
        ${renderLookupResults()}
      </section>
    </article>
  `;
}

function renderLookupResults() {
  if (!uiState.lookupSearched) {
    return `<div class="empty-state">请输入信息后查询报名结果</div>`;
  }

  if (!uiState.lookupResults.length) {
    return `<div class="empty-state">未查询到已支付的报名记录</div>`;
  }

  return uiState.lookupResults
    .map((entry) => renderLookupResultCard(entry))
    .join("");
}

function renderLookupResultCard(entry) {
  const record = entry?.record || {};
  const recordOrder = entry?.order || {};
  const status = normalizeReviewStatus(record.status);

  return `
    <div class="result-card">
      <div class="lookup-result-head">
        <h3>${escapeHtml(record.name || "报名人")}</h3>
        <span class="lookup-status ${getReviewStatusClass(status)}">${escapeHtml(getReviewStatusLabel(status))}</span>
      </div>
      ${plainRow("报名编号", record.registrationNo)}
      ${plainRow("订单号", recordOrder.orderNo)}
      ${plainRow("支付状态", paymentStatusLabel(recordOrder.paymentStatus))}
      ${plainRow("审核状态", getReviewStatusLabel(status))}
      ${plainRow("参赛组别", record.groupName)}
      ${plainRow("参赛项目", normalizeArray(record.eventNames).join("、"))}
      ${renderLookupRejectReasonRow(record, status)}
    </div>
  `;
}

function renderLookupRejectReasonRow(record, status) {
  if (status !== "rejected") return "";
  return `
    <div class="lookup-reject-reason">
      <span>驳回原因：</span>
      <strong>${escapeHtml(getRejectReasonText(record))}</strong>
    </div>
  `;
}

function radioRow(label, name, options, value) {
  return `
    <div class="form-row ${fieldErrorClass(name)}">
      <span class="row-label">${label}</span>
      <div class="radio-group">
        ${options
          .map(
            (option) => `
              <label class="radio-option">
                <input type="radio" name="${name}" value="${option.value}" data-draft-field ${value === option.value ? "checked" : ""} />
                <span>${escapeHtml(option.label)}</span>
              </label>
            `,
          )
          .join("")}
      </div>
      ${fieldError(name)}
    </div>
  `;
}

function inputRow(label, name, placeholder, value, type = "text") {
  return `
    <div class="form-row ${fieldErrorClass(name)}">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" data-draft-field />
      ${fieldError(name)}
    </div>
  `;
}

function renderOrganizationSelectRow() {
  const organizations = getEnabledOrganizations();
  const selectedId = formDraft.organizationId || "";
  const legacyOrganization = safeText(formDraft.organization).trim();
  const hasLegacyUnmatched = legacyOrganization && !organizations.some((item) => item.id === selectedId || item.name === legacyOrganization);

  return `
    <div class="form-row picker-form-row ${fieldErrorClass("organization")}">
      <span class="row-label">代表单位</span>
      <button class="picker-row-button ${formDraft.organization ? "" : "is-placeholder"}" type="button" data-action="open-wheel-picker" data-picker-type="organization" ${organizations.length ? "" : "disabled"}>
        ${escapeHtml(formDraft.organization || (organizations.length ? "请选择代表单位" : "暂无可选代表单位"))}
      </button>
      <span class="row-arrow">›</span>
      ${hasLegacyUnmatched ? `<small class="field-note">原代表单位未在当前配置中，请重新选择。</small>` : ""}
      ${fieldError("organization")}
    </div>
  `;
}

function dateRow(label, name, value) {
  return `
    <div class="form-row date-form-row ${fieldErrorClass(name)}">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="date" value="${escapeHtml(value)}" data-draft-field />
      <span class="row-arrow">›</span>
      ${fieldError(name)}
    </div>
  `;
}

function eventCheckboxRows(events) {
  const disabledHint = !formDraft.groupId ? "请先选择参赛组别" : "当前组别暂无可选项目";
  return `
    <div class="form-row project-row ${fieldErrorClass("eventIds")}">
      <span class="row-label">参赛项目</span>
      <div class="checkbox-grid">
        ${
          events.length
            ? events
                .map(
                  (item) => `
                    <label class="checkbox-option">
                      <input type="checkbox" name="eventIds" value="${item.id}" ${formDraft.eventIds.includes(item.id) ? "checked" : ""} />
                      <span>${escapeHtml(item.name)}</span>
                    </label>
                  `,
                )
                .join("")
            : `<em>${disabledHint}</em>`
        }
      </div>
      ${renderProjectSelectionSummary()}
      ${fieldError("eventIds")}
    </div>
  `;
}

function renderProjectSelectionSummary() {
  const settings = getCurrentRegistrationSettings();
  const pricingRule = getPricingRule(settings);
  const selectedCount = formDraft.eventIds.length;
  const remainingCount = Math.max(0, pricingRule.minEventsPerPerson - selectedCount);
  const amount = formDraft.totalAmount;

  return `
    <div class="project-summary">
      <span>已选 ${selectedCount} 项</span>
      <span>最少 ${pricingRule.minEventsPerPerson} 项</span>
      <span>最多 ${pricingRule.maxEventsPerPerson} 项</span>
      <strong>当前费用 ${formatCurrency(amount)}</strong>
      ${remainingCount > 0 ? `<em>至少还需选择 ${remainingCount} 项</em>` : `<em>已满足最低报名项目数</em>`}
    </div>
  `;
}

function insuranceRow() {
  const file = formDraft.insuranceFile;
  const preview = file?.previewUrl
    ? `<img src="${file.previewUrl}" alt="已上传保险单预览" />`
    : `<span class="camera-icon">⌖</span>`;

  return `
    <div class="form-row upload-row ${fieldErrorClass("insuranceFile")}">
      <span class="row-label">上传险单</span>
      <div class="upload-wrap">
        <label class="upload-box" for="insuranceInput">
          ${preview}
          <input id="insuranceInput" class="file-input" type="file" accept="image/*,.pdf" />
        </label>
        <p>${file ? escapeHtml(file.name) : "上传包含滑冰运动的人身意外保险单"}</p>
      </div>
      ${fieldError("insuranceFile")}
    </div>
  `;
}

function readonlyInsuranceRow() {
  const file = formDraft.insuranceFile;
  const content = file?.previewUrl
    ? `<img class="readonly-image" src="${file.previewUrl}" alt="保险单预览" />`
    : escapeHtml(file?.name || "已上传");
  return readonlyRow("上传险单", content, true);
}

function readonlyRow(label, value, isHtml = false) {
  return `
    <div class="readonly-row">
      <span>${escapeHtml(label)}</span>
      <strong>${isHtml ? value : escapeHtml(value || "暂无")}</strong>
    </div>
  `;
}

function infoLine(icon, text) {
  return `<div class="info-line"><span>${icon}</span><strong>${escapeHtml(text)}</strong></div>`;
}

function plainRow(label, value) {
  return `<div class="plain-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "暂无")}</strong></div>`;
}

function renderResourceEntries(currentEvent) {
  const resources = [
    createResourceEntry({
      title: "竞赛规程",
      description: "查看组别、项目、报名规则",
      icon: "◇",
      articleUrl: currentEvent.regulationArticleUrl || currentEvent.regulationFile?.articleUrl,
      file: currentEvent.regulationFile,
    }),
    createResourceEntry({
      title: "参赛声明",
      description: "查看参赛承诺与健康声明",
      icon: "i",
      articleUrl: currentEvent.commitmentArticleUrl || currentEvent.commitmentFile?.articleUrl,
      file: currentEvent.commitmentFile,
    }),
  ].filter(Boolean);

  if (!resources.length) {
    return `<div class="resource-empty">暂无赛事资料</div>`;
  }

  return resources.map((item) => fileRow(item)).join("");
}

function createResourceEntry({ title, description, icon, articleUrl, file }) {
  const fileUrl = safeText(file?.url);
  const fileName = safeText(file?.name);
  const url = safeText(articleUrl) || fileUrl;
  if (!url || url === "#") {
    return {
      title,
      description: fileName || description,
      icon,
      url: "",
      mode: "empty",
      actionText: "未配置",
    };
  }
  const isArticle = Boolean(safeText(articleUrl));
  return {
    title,
    description: isArticle ? "公众号文章 / 在线说明" : fileName || description,
    icon,
    url,
    mode: isArticle ? "article" : "file",
    actionText: isArticle ? "打开" : "查看",
  };
}

function fileRow(resourceOrName, url = "") {
  const resource =
    typeof resourceOrName === "object"
      ? resourceOrName
      : createResourceEntry({
          title: safeText(resourceOrName || "赛事资料"),
          description: "查看赛事资料",
          icon: "◇",
          file: { name: resourceOrName, url },
        });

  return `
    <button class="resource-row ${resource.url ? "" : "is-disabled"}" type="button" data-action="open-file" data-file-url="${escapeHtml(resource.url || "")}" data-file-name="${escapeHtml(resource.title || "")}" ${resource.url ? "" : "aria-disabled=\"true\""}>
      <span class="resource-icon">${escapeHtml(resource.icon || "›")}</span>
      <span class="resource-copy">
        <strong>${escapeHtml(resource.title || "赛事资料")}</strong>
        <small>${escapeHtml(resource.description || "查看详情")}</small>
      </span>
      <em>${escapeHtml(resource.actionText || "查看")}</em>
    </button>
  `;
}

function getLandingStatusLabel(status) {
  const labels = {
    [REGISTRATION_EVENT_STATUS.REGISTRATION_OPEN]: "报名进行中",
    [REGISTRATION_EVENT_STATUS.REGISTRATION_UPCOMING]: "即将开始",
    [REGISTRATION_EVENT_STATUS.REGISTRATION_CLOSED]: "报名已截止",
    [REGISTRATION_EVENT_STATUS.EVENT_ENDED]: "赛事已结束",
  };
  return labels[status] || "赛事报名";
}

function getLandingStatusClass(status) {
  const classes = {
    [REGISTRATION_EVENT_STATUS.REGISTRATION_OPEN]: "is-open",
    [REGISTRATION_EVENT_STATUS.REGISTRATION_UPCOMING]: "is-upcoming",
    [REGISTRATION_EVENT_STATUS.REGISTRATION_CLOSED]: "is-closed",
    [REGISTRATION_EVENT_STATUS.EVENT_ENDED]: "is-ended",
  };
  return classes[status] || "is-open";
}

function getRegistrationWindowHint(status) {
  if (status === REGISTRATION_EVENT_STATUS.REGISTRATION_UPCOMING) return "报名尚未开始，请关注开放时间";
  if (status === REGISTRATION_EVENT_STATUS.REGISTRATION_CLOSED || status === REGISTRATION_EVENT_STATUS.EVENT_ENDED) return "报名通道已关闭";
  return "报名通道已开放，请在截止前完成报名";
}

function getShortEventTag(currentEvent) {
  const name = safeText(currentEvent.name);
  if (name.includes("短道")) return "短道速滑";
  if (name.includes("跑")) return "路跑赛事";
  return "体育赛事";
}

function renderBannerImage(bannerImage) {
  const banner = sanitizeBannerImage(bannerImage);
  if (banner.mode === "none" || !banner.url) return "";
  const fitClass = getBannerFitClass(banner.fitMode, "event-banner-image");

  return `<img class="${fitClass}" src="${escapeHtml(banner.url)}" alt="${escapeHtml(banner.name || "活动 banner")}" onerror="this.remove()" />`;
}

function paymentRow(label, value) {
  return `<div class="payment-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function fieldError(field) {
  const message = uiState.validationErrors[field] || formDraft.errors[field] || "";
  return `<small class="field-error ${message ? "" : "is-empty"}" data-error-for="${escapeHtml(field)}">${escapeHtml(message)}</small>`;
}

function fieldErrorClass(field) {
  return uiState.validationErrors[field] || formDraft.errors[field] ? "has-error" : "";
}

function hasDraftContent() {
  return Boolean(
    formDraft.certificateNumber ||
      formDraft.name ||
      formDraft.gender ||
      formDraft.birthDate ||
      formDraft.phone ||
      formDraft.organizationId ||
      formDraft.organization ||
      formDraft.groupId ||
      formDraft.eventIds.length ||
      formDraft.insuranceFile,
  );
}

function getCurrentStep() {
  if (uiState.currentPage === "payment") return 2;
  if (uiState.currentPage === "success") return 3;
  if (uiState.currentPage === "form" || uiState.currentPage === "confirm") return 1;
  return 0;
}
