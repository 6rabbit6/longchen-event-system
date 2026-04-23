# GitHub Pages 部署说明

这个目录是龙辰赛事系统的 GitHub Pages 静态部署版本。三个子系统保留为独立子目录：

- `event-platform/`：赛事平台入口
- `registration-system/`：单赛事报名系统
- `event-admin/`：赛事后台管理

## 1. 创建 GitHub 仓库

1. 在 GitHub 新建一个仓库，例如 `longchen-event-system`。
2. 把这个部署目录内的全部文件上传到仓库根目录。
3. 不要只上传三个子目录，根目录的 `index.html`、`.nojekyll` 和本说明文件也要一起上传。

## 2. 设置 GitHub Pages

在 GitHub 仓库页面中：

1. 进入 `Settings`。
2. 进入 `Pages`。
3. `Source` 选择 `Deploy from a branch`。
4. `Branch` 选择 `main`。
5. `Folder` 选择 `/ (root)`。
6. 保存后等待 GitHub Pages 构建完成。

GitHub Pages 支持从分支根目录 `/` 或 `/docs` 目录发布。本部署目录按仓库根目录发布设计。

## 3. 部署后访问路径

假设 Pages 地址为：

```text
https://<username>.github.io/<repo-name>/
```

则三个系统路径为：

```text
https://<username>.github.io/<repo-name>/event-platform/
https://<username>.github.io/<repo-name>/registration-system/
https://<username>.github.io/<repo-name>/event-admin/
```

仓库根入口：

```text
https://<username>.github.io/<repo-name>/
```

## 4. 路径说明

发布版本中的跨系统链接已经改为无空格目录：

- 平台跳报名：`../registration-system/index.html`
- 报名返回平台：`../event-platform/index.html`
- 报名跳后台：`../event-admin/index.html`
- 后台打开报名：`../registration-system/index.html`

这些路径适合 GitHub Pages 的子目录访问方式，不依赖本地桌面路径。

## 5. 自定义域名

如果后续要配置自定义域名，可以在 GitHub 仓库的 `Settings -> Pages -> Custom domain` 中配置，并按 GitHub 提示设置 DNS。

## 6. 注意事项

- Supabase URL、anon key、Edge Function 名称仍保留在各子项目的配置文件中。
- 后台登录需要 Supabase Auth 管理员账号和白名单配置。
- 如果仓库名变化，不需要修改相对路径；如果改成子域名或自定义域名，也通常不需要改路径。
