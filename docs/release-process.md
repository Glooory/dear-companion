# Release Process

挚伴 第一版发布 Windows x64、macOS Intel 和 macOS Apple Silicon 三种未签名、未公证安装包。生产应用保持完全离线，不包含更新器、遥测、远程资源或运行时图像生成。

## 版本与标签

1. 将 `package.json` 中的版本更新为准备发布的 `X.Y.Z`。
2. 完成本地允许范围内的核心单测、lint、typecheck、生产构建和非视觉启动冒烟检查。
3. 提交版本变更后创建完全匹配的 `vX.Y.Z` 标签。例如首个版本使用 `package.json` 的 `0.1.0` 与标签 `v0.1.0`。
4. 推送提交与标签。标签工作流先验证精确匹配，再分别在 `windows-latest`、`macos-15-intel` 与 Apple Silicon `macos-15` 原生 runner 上构建。

不要从脏工作树创建标签，不要复用指向不同提交的既有版本标签。

完整的首次发布顺序为：更新 `package.json` 版本 → 完成本地自动检查 → 提交 → 创建并推送匹配的 `vX.Y.Z` 标签 → 等待三个原生构建作业 → 用户人工验证三个产物 → 核对校验值、安装指引和说明 → 手动公开草稿。首个版本示例是 `0.1.0` / `v0.1.0`。

## 草稿发布

标签工作流只创建或更新草稿 GitHub Release。维护者必须在公开前：

- 确认 Windows x64、macOS Intel 与 macOS Apple Silicon 三个产物均存在；
- 核对 `SHA256SUMS.txt`、安装指引、版本说明和实际文件名；
- 在真实目标系统完成 [发布验收清单](release-checklist.md)；
- 记录所有偏差，确认私人图片、音频、设置、日志或凭据未进入产物；
- 最后在 GitHub 中手动发布草稿。

构建成功或非视觉启动冒烟通过，不代表图标、托盘、安装体验、开机启动、性能或系统安全提示已经验证。

发布工作流使用 GitHub 官方 `checkout`、`setup-node`、`upload-artifact` 和 `download-artifact` actions。只有最终草稿发布作业拥有 `contents: write`；验证和构建作业保持只读。相同标签重跑时仅允许更新仍为草稿的 Release，并用 `--clobber` 替换同名附件。

## 未签名状态与未来凭据

当前 `electron-builder` 配置明确禁用 macOS identity，且工作流在没有签名环境变量时生成预期的未签名产物。仓库不得保存证书、密码或 Apple 凭据。

未来启用签名和公证前必须单独评审设计与工作流。预留的 GitHub Actions secret 名称为：

- `CSC_LINK` 与 `CSC_KEY_PASSWORD`：Windows 或 macOS 证书材料；
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 与 `APPLE_TEAM_ID`：Apple 公证凭据。

这些 secret 当前不应配置到发布作业，也不得因缺失而触发交互式签名提示。

## 本地打包命令

```bash
npm run icons:generate
npm run package:dir
npm run dist
```

本地只能构建当前宿主平台适合的产物。不要把本地 unpacked 应用、`release/` 目录、日志或用户数据提交到仓库。
