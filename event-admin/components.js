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

function renderPlatformHomePage() {
  const draft = adminState.homeConfigDraft || adminState.homeConfig || createDefaultPlatformHomeConfig();
  return `
    <section class="toolbar">
      <div>
        <h2>平台首页</h2>
        <p>配置赛事平台首页顶部运营位、公告栏和主推 Banner，不绑定任何单一赛事。</p>
      </div>
      <button class="primary-button" type="button" data-action="save-platform-home">保存平台首页</button>
    </section>
    ${adminState.homeConfigError ? `<p class="error-text">${h(adminState.homeConfigError)}</p>` : ""}
    <section class="editor-card platform-home-editor">
      <section class="nested-card editor-section">
        <div class="section-heading">
          <h3>平台主视觉</h3>
          <p>无启用 Banner 时，首页顶部会显示这里的平台标题与副标题。</p>
        </div>
        <div class="form-grid">
          ${platformHomeInput("平台主标题", "heroTitle", draft.heroTitle)}
          ${platformHomeInput("平台副标题", "heroSubtitle", draft.heroSubtitle)}
        </div>
      </section>
      <section class="nested-card editor-section">
        <div class="section-heading section-heading-row">
          <div>
            <h3>公告栏</h3>
            <p class="muted-text">最多保留 3 条公告；启用后会展示在首页顶部运营位下方。</p>
          </div>
          <button type="button" data-action="add-home-announcement" ${draft.announcements.length >= 3 ? "disabled" : ""}>新增公告</button>
        </div>
        ${draft.announcements.map(renderHomeAnnouncementEditor).join("") || `<p class="muted-text">暂无公告</p>`}
      </section>
      <section class="nested-card editor-section">
        <div class="section-heading section-heading-row">
          <div>
            <h3>首页 Banner</h3>
            <p class="muted-text">最多保留 3 张 Banner；启用后优先作为首页 Hero 展示。</p>
          </div>
          <button type="button" data-action="add-home-banner" ${draft.banners.length >= 3 ? "disabled" : ""}>新增 Banner</button>
        </div>
        ${draft.banners.map((item, index) => renderHomeBannerEditor(item, index, adminState.events)).join("") || `<p class="muted-text">暂无 Banner，将使用默认平台 Hero。</p>`}
      </section>
      <div class="editor-actions">
        <button class="primary-button" type="button" data-action="save-platform-home">保存平台首页</button>
      </div>
    </section>
  `;
}

function platformHomeInput(label, field, value, type = "text") {
  return `<label>${h(label)}<input type="${type}" value="${h(value || "")}" data-home-field="${h(field)}" /></label>`;
}

function renderHomeAnnouncementEditor(item, index) {
  return `
    <article class="platform-config-row">
      <label class="check-field"><input type="checkbox" data-home-announcement-index="${index}" data-home-announcement-field="enabled" ${item.enabled !== false ? "checked" : ""} /> 启用公告</label>
      <div class="form-grid">
        <label>公告文字<input value="${h(item.text)}" data-home-announcement-index="${index}" data-home-announcement-field="text" placeholder="请输入公告内容" /></label>
        <label>链接 URL（可选）<input value="${h(item.linkUrl)}" data-home-announcement-index="${index}" data-home-announcement-field="linkUrl" placeholder="https://..." /></label>
      </div>
      <button type="button" data-action="remove-home-announcement" data-index="${index}">删除公告</button>
    </article>
  `;
}

function renderHomeBannerEditor(item, index, events) {
  return `
    <article class="platform-config-row">
      <div class="section-heading section-heading-row">
        <label class="check-field"><input type="checkbox" data-home-banner-index="${index}" data-home-banner-field="enabled" ${item.enabled !== false ? "checked" : ""} /> 启用 Banner</label>
        <button type="button" data-action="remove-home-banner" data-index="${index}">删除 Banner</button>
      </div>
      <div class="form-grid">
        <label>标题<input value="${h(item.title)}" data-home-banner-index="${index}" data-home-banner-field="title" placeholder="运营标题" /></label>
        <label>副标题<input value="${h(item.subtitle)}" data-home-banner-index="${index}" data-home-banner-field="subtitle" placeholder="运营说明" /></label>
        <label>图片 URL<input value="${h(item.imageUrl)}" data-home-banner-index="${index}" data-home-banner-field="imageUrl" placeholder="https://..." /></label>
        <label>排序<input type="number" value="${h(item.sortOrder)}" data-home-banner-index="${index}" data-home-banner-field="sortOrder" /></label>
        <label>跳转类型
          <select data-home-banner-index="${index}" data-home-banner-field="linkType">
            <option value="none" ${item.linkType === "none" ? "selected" : ""}>无跳转</option>
            <option value="event" ${item.linkType === "event" ? "selected" : ""}>跳转赛事</option>
            <option value="url" ${item.linkType === "url" ? "selected" : ""}>外部链接</option>
          </select>
        </label>
        <label>跳转赛事
          <select data-home-banner-index="${index}" data-home-banner-field="eventId">
            <option value="">请选择赛事</option>
            ${events.map((eventItem) => `<option value="${h(eventItem.id)}" ${item.eventId === eventItem.id ? "selected" : ""}>${h(eventItem.name || eventItem.id)}</option>`).join("")}
          </select>
        </label>
        <label>外部链接 URL<input value="${h(item.linkUrl)}" data-home-banner-index="${index}" data-home-banner-field="linkUrl" placeholder="https://..." /></label>
      </div>
    </article>
  `;
}

function renderEventCard(eventItem) {
  const platform = eventItem.registrationConfig?.platform || {};
  const lifecycleStatus = calculateEventLifecycleStatus(eventItem);
  const registrationLink = `${getAdminConfig().registrationBaseUrl}?eventId=${encodeURIComponent(eventItem.id)}`;
  const isEditing = adminState.editingEvent?.originalId === eventItem.id || (!adminState.editingEvent?.originalId && adminState.editingEvent?.id === eventItem.id);
  return `
    <article class="event-admin-card ${isEditing ? "is-editing" : ""}">
      <div>
        <span class="pill">${platform.isPublished === false ? "已下架" : "已发布"}</span>
        ${platform.visibleOnPlatform === false ? `<span class="pill muted">不展示</span>` : `<span class="pill green">平台展示</span>`}
        ${platform.isHot ? `<span class="pill red">热门</span>` : ""}
        <span class="pill muted">${h(lifecycleStatus)}</span>
        ${isEditing ? `<span class="pill editing-pill">当前编辑中</span>` : ""}
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
  const pricingMode = config.pricingRule?.mode === "tiered" ? "tiered" : "itemized";
  return `
    <section class="editor-card" id="eventEditor">
      <div class="editor-hero">
        <div>
          <span class="editor-kicker">${draft.originalId ? "正在编辑赛事" : "正在新建赛事"}</span>
          <h2>${draft.originalId ? `编辑赛事：${h(draft.name || draft.id)}` : "新建赛事"}</h2>
          <p>${draft.originalId ? `当前 eventId：${h(draft.id)}` : "填写基础信息、报名规则与组别项目后保存赛事。"}</p>
        </div>
        <button type="button" data-action="close-editor">关闭</button>
      </div>
      <div class="editor-notice">已进入编辑状态。修改完成后点击底部“保存赛事”，未保存前不会覆盖线上配置。</div>
      ${adminState.saveError ? `<p class="error-text">${h(adminState.saveError)}</p>` : ""}
      <section class="nested-card editor-section">
        <div class="section-heading">
          <h3>基础信息</h3>
          <p>赛事名称、时间、地点和分享展示信息。</p>
        </div>
        <div class="form-grid">
          ${inputField("赛事名称", "name", draft.name)}
          ${inputField("eventId（唯一）", "id", draft.id, eventIdLocked ? "readonly" : "")}
          ${inputField("报名开始时间", "registrationStartDate", draft.registrationStartDate, "", "date")}
          ${inputField("报名截止时间", "registrationEndDate", draft.registrationEndDate, "", "date")}
          ${inputField("比赛开始时间", "competitionStartDate", draft.competitionStartDate, "", "date")}
          ${inputField("比赛结束时间", "competitionEndDate", draft.competitionEndDate, "", "date")}
          ${inputField("比赛地点", "location", draft.location)}
          ${inputField("封面图 URL", "bannerImage.url", draft.bannerImage?.url)}
          ${selectField("Banner 显示方式", "bannerImage.fitMode", draft.bannerImage?.fitMode || "cover", [
            ["cover", "铺满裁切（cover）"],
            ["contain", "完整显示（contain）"],
          ])}
          ${inputField("分享标题", "shareCard.title", draft.shareCard?.title)}
          ${inputField("分享描述", "shareCard.description", draft.shareCard?.description)}
          ${inputField("分享图片 URL", "shareCard.imageUrl", draft.shareCard?.imageUrl)}
        </div>
      </section>
      ${eventIdLocked ? `<p class="warning-text">该赛事已有报名记录，禁止修改 eventId，避免历史数据错乱。</p>` : ""}
      ${renderEventFilesEditor(draft, config)}
      ${renderWeatherEditor(config)}
      <section class="nested-card editor-section">
        <div class="section-heading">
          <h3>平台展示</h3>
          <p>控制赛事是否开放报名、是否发布到平台。</p>
        </div>
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
        </div>
      </section>
      ${renderPricingRuleEditor(config)}
      ${renderCertificateTypesEditor(config.certificateTypes || [])}
      ${renderOrganizationsEditor(config.organizations || [])}
      ${renderGroupsEditor(config.groups || [], pricingMode, eventIdLocked)}
      <div class="editor-actions">
        <button type="button" data-action="close-editor">关闭</button>
        <button class="primary-button" type="button" data-action="save-event">保存赛事</button>
      </div>
    </section>
  `;
}

function renderWeatherEditor(config) {
  const weather = config.weather || {};
  return `
    <section class="nested-card editor-section">
      <div class="section-heading">
        <h3>天气模块</h3>
        <p>用于小程序赛事详情页天气卡展示；当前为手动配置，不接入智赛通旧接口。</p>
      </div>
      <section class="switch-grid">
        ${checkboxField("显示天气模块", "weather.enabled", weather.enabled !== false, "config")}
      </section>
      <div class="form-grid">
        ${selectField("展示方式", "weather.mode", weather.mode || "manual", [["manual", "手动填写"], ["auto", "自动接口（预留）"]], "config")}
        ${inputField("温度", "weather.temperature", weather.temperature || "", "", "text", "config")}
        ${inputField("天气", "weather.condition", weather.condition || "", "", "text", "config")}
        ${inputField("湿度", "weather.humidity", weather.humidity || "", "", "text", "config")}
        ${inputField("风向风力", "weather.wind", weather.wind || "", "", "text", "config")}
        ${inputField("显示地点", "weather.location", weather.location || "", "", "text", "config")}
      </div>
      <p class="field-help">示例：温度 16，天气 晴，湿度 33%，风向风力 南风3级，显示地点 长武县。</p>
    </section>
  `;
}

function renderEventFilesEditor(draft, config) {
  const files = config.files || {};
  return `
    <section class="nested-card">
      <div class="section-heading">
        <div>
          <h3>赛事资料</h3>
          <p class="muted-text">文章链接优先用于前台跳转；未配置文章链接时继续使用文件链接。</p>
        </div>
      </div>
      <div class="form-grid">
        ${inputField("竞赛规程文件名", "regulationFile.name", draft.regulationFile?.name)}
        ${inputField("竞赛规程文件链接", "regulationFile.url", draft.regulationFile?.url, "", "url")}
        ${inputField("竞赛规程公众号文章链接", "files.regulationArticleUrl", files.regulationArticleUrl || draft.regulationArticleUrl || draft.regulationFile?.articleUrl, "", "url", "config")}
        ${textareaField("竞赛规程正文（小程序内置展示）", "files.regulationContent", files.regulationContent || "", "config")}
        ${inputField("参赛声明文件名", "commitmentFile.name", draft.commitmentFile?.name)}
        ${inputField("参赛声明文件链接", "commitmentFile.url", draft.commitmentFile?.url, "", "url")}
        ${inputField("参赛声明公众号文章链接", "files.commitmentArticleUrl", files.commitmentArticleUrl || draft.commitmentArticleUrl || draft.commitmentFile?.articleUrl, "", "url", "config")}
        ${textareaField("参赛声明正文（小程序内置展示）", "files.commitmentContent", files.commitmentContent || "", "config")}
        ${inputField("照片查询链接", "photoQueryUrl", config.photoQueryUrl || files.photoQueryUrl || config.platform?.photoQueryUrl || "", "", "url", "config")}
      </div>
      <p class="field-help">用于填写喔图照片直播相册/专题链接，例如 https://alltuu.cc/r/b6VjYz/ 或 https://m.alltuu.com/mobile/?mode=release&id=1002713717。</p>
    </section>
  `;
}

function renderPricingRuleEditor(config) {
  const rule = config.pricingRule || {};
  const mode = rule.mode === "tiered" ? "tiered" : "itemized";
  return `
    <section class="nested-card">
      <div class="section-heading">
        <div>
          <h3>价格规则</h3>
          <p class="muted-text">${mode === "tiered" ? "报名费按报名项目数量计算，项目内单项费用不会参与最终价格。" : "报名费按所选项目费用累计。"}</p>
        </div>
      </div>
      <div class="form-grid">
        <label>收费模式
          <select data-scope="config" data-field="pricingRule.mode">
            <option value="itemized" ${mode === "itemized" ? "selected" : ""}>按项目单价</option>
            <option value="tiered" ${mode === "tiered" ? "selected" : ""}>按数量阶梯收费</option>
          </select>
          ${fieldError("pricingRule.mode")}
        </label>
        ${inputField("最少报名项目数", "pricingRule.minEventsPerPerson", rule.minEventsPerPerson || 1, "", "number", "config")}
        ${inputField("最多报名项目数", "pricingRule.maxEventsPerPerson", rule.maxEventsPerPerson || config.maxEventsPerPerson || 2, "", "number", "config")}
        ${
          mode === "tiered"
            ? `
              ${inputField("基础包含项目数", "pricingRule.baseIncludedCount", rule.baseIncludedCount || 2, "", "number", "config")}
              ${inputField("基础价格（元）", "pricingRule.basePrice", rule.basePrice || 0, "", "number", "config")}
              ${inputField("超出每项加价（元）", "pricingRule.extraPricePerItem", rule.extraPricePerItem || 0, "", "number", "config")}
              <p class="info-text full-span">当前为按数量阶梯收费，报名费用由价格规则统一计算，项目报名费不参与计算。</p>
            `
            : `<p class="info-text full-span">按项目费用累计，总费用来自所选项目报名费。</p>`
        }
      </div>
    </section>
  `;
}

function renderCertificateTypesEditor(certificateTypes) {
  return `
    <section class="nested-card">
      <div class="section-heading section-heading-row">
        <div>
          <h3>证件类型</h3>
          <p class="muted-text">普通管理员只需维护显示名称；技术值由系统生成并保留用于前台和 public-api 校验。</p>
        </div>
        <button type="button" data-action="add-certificate-type">新增证件类型</button>
      </div>
      ${
        certificateTypes
          .map(
            (item, index) => `
              <div class="inline-row">
                <label>显示名称<input data-cert-index="${index}" data-cert-field="label" value="${h(item.label)}" placeholder="身份证" />${fieldError(`certificateTypes.${index}.label`)}</label>
                <label class="readonly-field">技术值（系统自动生成）<input value="${h(item.value)}" readonly />${fieldError(`certificateTypes.${index}.value`)}</label>
                <button type="button" data-action="remove-certificate-type" data-index="${index}">删除</button>
              </div>
            `,
          )
          .join("") || `<p class="muted-text">暂无证件类型</p>`
      }
      ${fieldError("certificateTypes")}
    </section>
  `;
}

function inputField(label, field, value, extra = "", type = "text", scope = "event") {
  return `<label>${h(label)}<input type="${type}" value="${h(value || "")}" data-scope="${scope}" data-field="${h(field)}" ${extra} />${fieldError(field)}</label>`;
}

function textareaField(label, field, value, scope = "event") {
  return `<label class="full-span">${h(label)}<textarea rows="6" data-scope="${scope}" data-field="${h(field)}" placeholder="请输入正文内容，支持换行展示。">${h(value || "")}</textarea>${fieldError(field)}</label>`;
}

function selectField(label, field, value, options, scope = "event") {
  return `
    <label>${h(label)}
      <select data-scope="${scope}" data-field="${h(field)}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${h(optionValue)}" ${value === optionValue ? "selected" : ""}>${h(optionLabel)}</option>`).join("")}
      </select>
      ${fieldError(field)}
    </label>
  `;
}

function checkboxField(label, field, checked, scope = "platform") {
  return `<label class="check-field"><input type="checkbox" data-scope="${scope}" data-field="${h(field)}" ${checked ? "checked" : ""} /> ${h(label)}</label>`;
}

function renderOrganizationsEditor(organizations) {
  return `
    <section class="nested-card">
      <div class="section-heading section-heading-row"><h3>代表单位</h3><button type="button" data-action="add-organization">新增单位</button></div>
      ${
        organizations
          .map(
            (item, index) => `
              <div class="inline-row">
                <label>单位名称<input data-org-index="${index}" data-org-field="name" value="${h(item.name)}" placeholder="单位名称" />${fieldError(`organizations.${index}.name`)}</label>
                <label class="check-field"><input type="checkbox" data-org-index="${index}" data-org-field="enabled" ${item.enabled !== false ? "checked" : ""} /> 启用</label>
                <button type="button" data-action="remove-organization" data-index="${index}">删除</button>
              </div>
            `,
          )
          .join("") || `<p class="muted-text">暂无单位</p>`
      }
    </section>
  `;
}

function renderGroupsEditor(groups, pricingMode = "itemized", eventIdLocked = false) {
  return `
    <section class="nested-card">
      <div class="section-heading section-heading-row"><h3>组别与项目</h3><button type="button" data-action="add-group">新增组别</button></div>
      ${pricingMode === "tiered" ? `<p class="info-text">当前为按数量阶梯收费，项目报名费已隐藏且不会参与最终价格；历史 fee 数据会保留，切回按项目单价后可继续编辑。</p>` : `<p class="info-text">当前为按项目费用累计，请在每个项目中填写报名费。</p>`}
      ${groups.map((group, index) => renderGroupEditor(group, index, pricingMode, eventIdLocked)).join("") || `<p class="muted-text">暂无组别</p>`}
    </section>
  `;
}

function renderGroupEditor(group, groupIndex, pricingMode = "itemized", eventIdLocked = false) {
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
      <details class="system-details">
        <summary>系统字段</summary>
        <div class="system-field-list">
          <span>组别 ID</span>
          <code>${h(group.id || `group_${groupIndex + 1}`)}</code>
          <small>系统自动生成，用于报名记录与组别配置关联。</small>
        </div>
      </details>
      <div class="toolbar"><strong>项目</strong><button type="button" data-action="add-group-event" data-group-index="${groupIndex}">新增项目</button></div>
      ${(group.events || []).map((eventItem, eventIndex) => renderGroupEventEditor(eventItem, groupIndex, eventIndex, pricingMode, eventIdLocked)).join("")}
    </article>
  `;
}

function renderGroupEventEditor(eventItem, groupIndex, eventIndex, pricingMode = "itemized", eventIdLocked = false) {
  const itemFee = Math.max(0, Number(eventItem.fee) || 0);
  return `
    <div class="group-event-row">
      <div class="inline-row">
        <label>项目名称<input data-group-index="${groupIndex}" data-event-index="${eventIndex}" data-event-field="name" value="${h(eventItem.name)}" placeholder="项目名称" />${fieldError(`groups.${groupIndex}.events.${eventIndex}.name`)}</label>
        ${
          pricingMode === "itemized"
            ? `<label>报名费<input type="number" data-group-index="${groupIndex}" data-event-index="${eventIndex}" data-event-field="fee" value="${h(eventItem.fee)}" placeholder="报名费" />${fieldError(`groups.${groupIndex}.events.${eventIndex}.fee`)}</label>`
            : `<p class="fee-hidden-note">当前为按数量阶梯收费，项目报名费不参与计算。已保留历史 fee：￥${h(itemFee)}</p>`
        }
        <button type="button" data-action="remove-group-event" data-group-index="${groupIndex}" data-event-index="${eventIndex}">删除</button>
      </div>
      <details class="system-details">
        <summary>系统字段</summary>
        <div class="system-field-list">
          <span>项目 ID</span>
          <code>${h(eventItem.id || `item_${eventIndex + 1}`)}</code>
          <small>${eventIdLocked ? "该赛事已有报名记录，项目 ID 禁止修改。" : "系统自动生成，用于项目选择、费用计算和报名记录关联。"}</small>
        </div>
        ${fieldError(`groups.${groupIndex}.events.${eventIndex}.id`)}
      </details>
    </div>
  `;
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
    ${renderRegistrationStatsSection(getRegistrationStats())}
    <section class="card-list">${filtered.map(renderRegistrationCard).join("") || `<div class="empty-card">暂无报名记录</div>`}</section>
  `;
}

function renderRegistrationStatsSection(stats) {
  return `
    <section class="stats-grid">
      ${renderStatsCard("总报名数", stats.total)}
      ${renderStatsCard("已支付数", stats.paid)}
      ${renderStatsCard("待审核数", stats.pendingReview)}
      ${renderStatsCard("已通过数", stats.approved)}
      ${renderStatsCard("已驳回数", stats.rejected)}
    </section>
    <section class="stats-columns">
      <article class="stats-panel">
        <h3>各组别人数统计</h3>
        ${renderStatsRows(stats.groupCounts, "暂无组别统计")}
      </article>
      <article class="stats-panel">
        <h3>各项目人数统计</h3>
        ${renderStatsRows(stats.eventCounts, "暂无项目统计")}
      </article>
    </section>
  `;
}

function renderStatsCard(label, value) {
  return `
    <article class="stats-card">
      <span>${h(label)}</span>
      <strong>${Number(value || 0)}</strong>
    </article>
  `;
}

function renderStatsRows(counts, emptyText) {
  const rows = Object.entries(counts || {}).sort((a, b) => h(a[0]).localeCompare(h(b[0]), "zh-CN"));
  if (!rows.length) return `<p class="muted-text">${h(emptyText)}</p>`;
  return `
    <div class="stats-list">
      ${rows.map(([name, count]) => `<div><span>${h(name)}</span><strong>${Number(count || 0)}</strong></div>`).join("")}
    </div>
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
