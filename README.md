# Dear Companion

Dear Companion 是一款私密、离线的桌面照片伙伴。你可以把自己准备好的透明人物或宠物图片导入应用，分配为平时陪伴、有点困了、睡觉、陪伴工作和可选短动作，并通过桌面伙伴获得轻量互动与定时休息提醒。

项目使用 Electron、React、TypeScript 和 Vite 构建，面向 Windows 10/11 x64，以及运行 macOS 13 或更高版本的 Intel 与 Apple Silicon Mac。

> 当前状态：第一版代码实现及本地自动化验证已经完成，跨平台界面、安装包和操作系统集成仍等待人工验收。当前安装包未进行 Windows 代码签名或 Apple Developer ID 签名与公证。

## 主要功能

- 导入用户已处理好透明背景的 PNG 或 WebP 图片。
- 自动分析透明边界并统一可见高度和脚底基线，缩放、偏移等调整只保存为非破坏性元数据。
- 为多个宠物配置平时陪伴、有点困了、睡觉和陪伴工作照片；可选状态或短动作缺少素材时安全回退到当前生活照片。
- 选择安静、自然或活泼的陪伴节奏，并可整体关闭非必要互动气泡。
- 创建多个本地工作时段（包括跨午夜时段），也可通过宠物右键菜单临时选择生活状态或进入/退出工作。
- 单击会根据当前生活状态回应；睡觉时连续点击三次可逐步叫醒。
- 可为每张照片设置独立的椭圆头部区域，在区域附近往返移动鼠标触发摸头；悬停、拖动和快速拖动反馈继续保留。
- 生活照片与专属动作照片通过内置泡泡、星光或云朵遮挡转场切换。
- 创建多个本地时间提醒，可按星期重复、启停、编辑、删除，并支持延后 5、10 或 15 分钟。
- 休息期间显示绝对结束时间倒计时；鼠标移动超过容差时触发短暂哭闹，但不会暂停、重置或延长休息。
- 提醒音和哭闹音可独立开启，支持内置声音及本地 MP3、WAV、OGG 文件，默认全部关闭。
- 支持托盘控制、宠物位置恢复、渲染崩溃后的单次重建和安全模式。
- 打包应用可由用户选择是否开机启动，默认关闭。

首次安装不会自动创建提醒，也不会自动开启声音或开机启动。

## 隐私与安全

Dear Companion 的生产版本完全离线：

- 图片、音频、宠物配置、提醒和设置只保存在本机 Electron `userData` 目录。
- 不包含账号、云服务、遥测、更新检查、远程脚本或依赖网络的素材。
- 不保存或记录导入文件的原始路径和内容；应用使用随机生成的内部名称保存本地副本。
- 摸头候选期间的全局鼠标轨迹只短暂存在于内存中，不持久化、不写入日志，也不会通过 preload 暴露通用鼠标监听能力。
- 原始导入副本保持不变，裁切、缩放、偏移和对齐均通过元数据完成。
- Renderer 不直接访问 Node.js、Electron、文件系统或 shell，只能调用 preload 暴露的窄类型 API。
- 生产环境阻止远程 HTTP、HTTPS、WebSocket 请求和非预期权限请求。

图片单文件上限为 20 MiB、尺寸上限为 8192 × 8192，每个宠物包上限为 250 MiB。音频单文件上限为 20 MiB，最多播放前 30 秒。

## 本地开发

### 环境要求

- Node.js 24
- pnpm 10.33.0

仓库通过 `packageManager` 固定 pnpm 版本。安装依赖并启动开发环境：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

运行项目允许的自动化检查：

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

运行非视觉 Electron 启动冒烟：

```bash
DEAR_COMPANION_BUILD_SMOKE=1 pnpm exec electron out/main/index.js
```

自动化测试仅覆盖必要的核心状态、计算、迁移、恢复和输入验证。UI、React 组件、快照、Playwright 与 E2E 测试不属于本仓库的测试范围；界面和操作系统行为由用户人工验收。

## 构建与打包

构建当前平台的未打包应用或安装包：

```bash
pnpm package:dir
pnpm dist
```

这两个命令都不会发布 Release。产物写入 `release/`，且不应提交到仓库。

GitHub Actions 的 tag 发布流程会分别构建：

- Windows x64 NSIS 安装程序
- macOS Intel DMG
- macOS Apple Silicon DMG

流程要求 tag 与 `package.json` 版本完全一致，生成 SHA-256 校验文件，并创建或更新 GitHub Draft Release。维护者完成人工验收前不应公开 Release。

未签名安装方式及安全注意事项见 [未签名安装说明](docs/installing-unsigned.md)，完整发布步骤见 [发布流程](docs/release-process.md)。请不要为了安装本应用而关闭系统安全机制。

## 项目结构

```text
src/main/       Electron 主进程：生命周期、窗口、托盘、生活状态、提醒、休息、素材、设置与安全策略
src/preload/    窄类型 IPC 桥接层
src/renderer/   React 设置窗口与桌面宠物窗口
src/shared/     主进程与 Renderer 共用的契约及纯逻辑
resources/      运行时托盘资源
build/          electron-builder 图标与构建资源
scripts/        图标生成和发布 tag 校验脚本
docs/           开发、安装、发布和人工验收文档
```

## 相关文档

- [产品设计规格](docs/superpowers/specs/2026-07-31-dear-companion-design.md)
- [开发说明与人工检查边界](docs/development.md)
- [候选版本人工验收清单](docs/release-checklist.md)
- [发布流程](docs/release-process.md)
- [未签名安装说明](docs/installing-unsigned.md)

## 第一版不包含

第一版不提供 Linux 支持、云服务、账号、遥测、自动更新、图片自动抠图、运行时 AI 图片生成、动画时间线编辑器或宠物包市场。休息模式也不会锁定电脑或阻止用户输入。

## 许可证

当前项目在 `package.json` 中标记为 `UNLICENSED`，未授予公开复制、修改或分发许可。
