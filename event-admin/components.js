function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return value || "未设置";
}

function renderNav() {
  if (!adminState.session) return "";
  return navItems
    .map((item) => `<button class="${adminState.page === item.id ? "is-active" : ""}" type="button" data-action="go-page" data-page="${item.id}">${h(item.label)}</button>`)
    .join("");
}

function renderLoginPage() {
  return `
    <section class="login-card">
      <h2>管理员登录</h2>
      <label>管理员邮箱<input name="email" type="email" value="${h(adminState.login.email)}" placeholder="请输入管理员邮箱" /></label>
      <label>登录密码<input name="password" type="password" value="${h(adminState.login.password)}" placeholder="请输入登录密码" /></label>
      ${adminState.login.error ? `<p class="error-text">${h(adminState.login.error)}</p>` : ""}
      <button class="primary-button" type="button" data-action="login">登录</button>
    </section>
  `;
}

function renderEventsPage() {
  return `
    <section class="toolbar">
      <div>
        <h2>赛事列表</h2>
        <p>管理赛事发布、报名配置、组别项目和平台展示。</p>
      </div>
      <button class="primary-button" type="button" data-action="new-event">新建赛事</button>
    </section>
    <section class="card-list">
      ${
        adminState.events
          .filter((eventItem) => !eventItem.registrationConfig?.platform?.deletedAt)
          .map(renderEventCard)
          .join("") || `<div class="empty-card">暂无赛事</div>`
      }
    </section>
  `;
}

function renderEventCard(eventItem) {
  const platform = eventItem.registrationConfig?.platform || {};
  const lifecycleStatus = calculateEventLifecycleStatus(eventItem);
  const registrationLink = `${getAdminConfig().registrationBaseUrl}?eventId=${encodeURIComponent(eventItem.id)}`;
  return `
    <article class="event-admin-card">
      <div>
        <span class="pill">${platform.isPublished === false ? "已下架" : "已发布"}</span>
        ${platform.visibleOnPlatform === false ? `<span class="pill muted">不展示</span>` : `<span class="pill green">平台展示</span>`}
        ${platform.isHot ? `<span class="pill red">热门</span>` : ""}
        <span class="pill muted">${h(lifecycleStatus)}</span>
        <h3>${h(eventItem.name || eventItem.id)}</h3>
        <p>${h(eventItem.location || "地点未设置")} · ${h(formatDate(eventItem.registrationStartDate))} - ${h(formatDate(eventItem.registrationEndDate))}</p>
        <small>${h(eventItem.id)}</small>
      </div>
      <div class="card-actions">
        <button type="button" data-action="edit-event" data-event-id="${h(eventItem.id)}">编辑</button>
        <button type="button" data-action="copy-link" data-link="${h(registrationLink)}">报名链接</button>
        <button type="button" data-action="toggle-publish" data-event-id="${h(eventItem.id)}">${platform.isPublished === false ? "发布" : "下架"}</button>
        <button class="danger-button" type="button" data-action="soft-delete-event" data-event-id="${h(eventItem.id)}">软删除</button>
      </div>
    </article>
  `;
}

function renderEventEditor() {
  const draft = adminState.editingEvent;
  if (!draft) return "";
  const config = draft.registrationConfig || createDefaultRegistrationConfig();
  const platform = config.platform || {};
  const eventIdLocked = Boolean(draft.eventIdLocked);
  return `
    <section class="editor-card">
      <div class="toolbar">
        <h2>${draft.originalId ? "编辑赛事" : "新建赛事"}</h2>
        <button type="button" data-action="close-editor">关闭</button>
      </div>
      ${adminState.saveError ? `<p class="error-text">${h(adminState.saveError)}</p>` : ""}
      <div class="form-grid">
        ${inputField("赛事名称", "name", draft.name)}
        ${inputField("eventId（唯一）", "id", draft.id, eventIdLocked ? "readonly" : "")}
        ${inputField("报名开始时间", "registrationStartDate", draft.registrationStartDate, "", "date")}
        ${inputField("报名截止时间", "registrationEndDate", draft.registrationEndDate, "", "date")}
        ${inputField("比赛开始时间", "competitionStartDate", draft.competitionStartDate, "", "date")}
        ${inputField("比赛结束时间", "competitionEndDate", draft.competitionEndDate, "", "date")}
        ${inputField("比赛地点", "location", draft.location)}
        ${inputField("封面图 URL", "bannerImage.url", draft.bannerImage?.url)}
        ${inputField("分享标题", "shareCard.title", draft.shareCard?.title)}
        ${inputField("分享描述", "shareCard.description", draft.shareCard?.description)}
        ${inputField("分享图片 URL", "shareCard.imageUrl", draft.shareCard?.imageUrl)}
      </div>
      ${eventIdLocked ? `<p class="warning-text">该赛事已有报名记录，禁止修改 eventId，避免历史数据错乱。</p>` : ""}
      <label class="full-field">赛事简介<textarea data-field="description" rows="4">${h(draft.description)}</textarea>${fieldError("description")}</label>
      <section class="switch-grid">
        ${checkboxField("开启报名", "registrationEnabled", platform.registrationEnabled !== false)}
        ${checkboxField("发布赛事", "isPublished", platform.isPublished !== false)}
        ${checkboxField("平台展示", "visibleOnPlatform", platform.visibleOnPlatform !== false)}
        ${checkboxField("热门赛事", "isHot", Boolean(platform.isHot))}
        ${checkboxField("需要保险", "insuranceRequired", Boolean(config.insuranceRequired), "config")}
      </section>
      <div class="form-grid">
        ${inputField("标签", "platform.tag", platform.tag || "赛事活动")}
        ${inputField("排序权重", "platform.sortOrder", platform.sortOrder || 0, "", "number")}
        ${inputField("最多可报项目数", "maxEventsPerPerson", config.maxEventsPerPerson || 2, "", "number", "config")}
      </div>
      ${renderOrganizationsEditor(config.organizations || [])}
      ${renderGroupsEditor(config.groups || [])}
      <button class="primary-button" type="button" data-action="save-event">保存赛事</button>
    </section>
  `;
}

function inputField(label, field, value, extra = "", type = "text", scope = "event") {
  return `<label>${h(label)}<input type="${type}" value="${h(value || "")}" data-scope="${scope}" data-field="${h(field)}" ${extra} />${fieldError(field)}</label>`;
}

function checkboxField(label, field, checked, scope = "platform") {
  return `<label class="check-field"><input type="checkbox" data-scope="${scope}" data-field="${h(field)}" ${checked ? "checked" : ""} /> ${h(label)}</label>`;
}

function renderOrganizationsEditor(organizations) {
  return `
    <section class="nested-card">
      <div class="toolbar"><h3>代表单位</h3><button type="button" data-action="add-organization">新增单位</button></div>
      ${organizations.map((item, index) => `<div class="inline-row"><label>单位名称<input data-org-index="${index}" data-org-field="name" value="${h(item.name)}" placeholder="单位名称" />${fieldError(`organizations.${index}.name`)}</label><button type="button" data-action="remove-organization" data-index="${index}">删除</button></div>`).join("") || `<p class="muted-text">暂无单位</p>`}
    </section>
  `;
}

function renderGroupsEditor(groups) {
  return `
    <section class="nested-card">
      <div class="toolbar"><h3>组别与项目</h3><button type="button" data-action="add-group">新增组别</button></div>
      ${groups.map(renderGroupEditor).join("") || `<p class="muted-text">暂无组别</p>`}
    </section>
  `;
}

function renderGroupEditor(group, groupIndex) {
  return `
    <article class="group-editor">
      <div class="inline-row">
        <label>组别名称<input data-group-index="${groupIndex}" data-group-field="name" value="${h(group.name)}" placeholder="组别名称" />${fieldError(`groups.${groupIndex}.name`)}</label>
        <label>性别限制<select data-group-index="${groupIndex}" data-group-field="genderLimit">
          <option value="all" ${group.genderLimit === "all" ? "selected" : ""}>不限</option>
          <option value="male" ${group.genderLimit === "male" ? "selected" : ""}>男</option>
          <option value="female" ${group.genderLimit === "female" ? "selected" : ""}>女</option>
        </select></label>
      </div>
      <div class="inline-row">
        <label>最小出生年<input type="number" data-group-index="${groupIndex}" data-group-field="minBirthYear" value="${h(group.minBirthYear)}" placeholder="最小出生年" />${fieldError(`groups.${groupIndex}.minBirthYear`)}</label>
        <label>最大出生年<input type="number" data-group-index="${groupIndex}" data-group-field="maxBirthYear" value="${h(group.maxBirthYear)}" placeholder="最大出生年" />${fieldError(`groups.${groupIndex}.maxBirthYear`)}</label>
        <button type="button" data-action="remove-group" data-index="${groupIndex}">删除组别</button>
      </div>
      <div class="toolbar"><strong>项目</strong><button type="button" data-action="add-group-event" data-group-index="${groupIndex}">新增项目</button></div>
      ${(group.events || []).map((eventItem, eventIndex) => renderGroupEventEditor(eventItem, groupIndex, eventIndex)).join("")}
    </article>
  `;
}

function renderGroupEventEditor(eventItem, groupIndex, eventIndex) {
  return `<div class="inline-row"><label>项目名称<input data-group-index="${groupIndex}" data-event-index="${eventIndex}" data-event-field="name" value="${h(eventItem.name)}" placeholder="项目名称" />${fieldError(`groups.${groupIndex}.events.${eventIndex}.name`)}</label><label>项目 ID<input data-group-index="${groupIndex}" data-event-index="${eventIndex}" data-event-field="id" value="${h(eventItem.id)}" placeholder="项目 ID" />${fieldError(`groups.${groupIndex}.events.${eventIndex}.id`)}</label><label>报名费<input type="number" data-group-index="${groupIndex}" data-event-index="${eventIndex}" data-event-field="fee" value="${h(eventItem.fee)}" placeholder="报名费" />${fieldError(`groups.${groupIndex}.events.${eventIndex}.fee`)}</label><button type="button" data-action="remove-group-event" data-group-index="${groupIndex}" data-event-index="${eventIndex}">删除</button></div>`;
}

function fieldError(field) {
  const message = adminState.formErrors?.[field];
  return message ? `<span class="field-error">${h(message)}</span>` : "";
}

function renderRegistrationsPage() {
  const filtered = getFilteredRegistrations();
  const eventOptions = [`<option value="all">全部赛事</option>`].concat(adminState.events.map((eventItem) => `<option value="${h(eventItem.id)}" ${adminState.selectedEventId === eventItem.id ? "selected" : ""}>${h(eventItem.name || eventItem.id)}</option>`));
  return `
    <section class="toolbar">
      <div><h2>报名审核</h2><p>支持按赛事、状态和关键词筛选，复用现有报名审核能力。</p></div>
      <div class="toolbar-actions">
        <button type="button" data-action="bulk-approve">批量通过（${adminState.selectedBulkNos.length}）</button>
        <button type="button" data-action="export-json">导出 JSON</button>
        <button type="button" data-action="export-csv">导出 Excel</button>
      </div>
    </section>
    <section class="filter-bar">
      <select name="selectedEventId">${eventOptions.join("")}</select>
      <select name="registrationStatusFilter">
        <option value="all">全部状态</option>
        <option value="pending_review" ${adminState.registrationStatusFilter === "pending_review" ? "selected" : ""}>待审核</option>
        <option value="approved" ${adminState.registrationStatusFilter === "approved" ? "selected" : ""}>已通过</option>
        <option value="rejected" ${adminState.registrationStatusFilter === "rejected" ? "selected" : ""}>已驳回</option>
      </select>
      <input name="registrationSearch" value="${h(adminState.registrationSearch)}" placeholder="搜索姓名 / 手机号 / 报名编号" />
    </section>
    <section class="card-list">${filtered.map(renderRegistrationCard).join("") || `<div class="empty-card">暂无报名记录</div>`}</section>
  `;
}

function renderRegistrationCard(item) {
  const canReview = item.status === "pending_review" && item.paymentStatus === "paid";
  return `
    <article class="registration-card">
      <div class="registration-head">
        ${canReview ? `<input type="checkbox" name="bulkRegistration" value="${h(item.registrationNo)}" ${adminState.selectedBulkNos.includes(item.registrationNo) ? "checked" : ""} />` : ""}
        <div><h3>${h(item.name || "未命名")}</h3><p>${h(item.registrationNo)} · ${h(item.organization)}</p></div>
      </div>
      <p>${h(item.groupName)}｜${h(item.eventNames.join("、"))}</p>
      <p>${h(paymentLabels[item.paymentStatus] || item.paymentStatus)}｜${h(reviewLabels[item.status] || item.status)}｜￥${item.totalAmount}</p>
      ${item.rejectReason ? `<p class="error-text">驳回原因：${h(item.rejectReason)}</p>` : ""}
      ${canReview ? `<div class="card-actions"><button type="button" data-action="approve-registration" data-no="${h(item.registrationNo)}">通过</button><button type="button" data-action="reject-registration" data-no="${h(item.registrationNo)}">驳回</button></div>` : ""}
    </article>
  `;
}
