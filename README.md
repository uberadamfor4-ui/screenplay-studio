# Screenplay Studio / 剧本工坊

跨平台桌面剧本写作软件。项目使用 Electron、React、TypeScript 和 Vite，界面以简体中文为默认体验，同时支持英文、繁体中文等剧本文本工作流。

> 当前版本：0.2.7
> 许可证：MIT  
> 开发者：本软件由1037 Film 郭之然独立开发完成
> 设计边界：参考专业剧本写作工具的通用工作流，但不复制 Final Draft 的私有界面、代码、素材、商标或受保护表达。

## 已实现

- 应用图标：SVG 源文件、PNG 多尺寸位图、Windows `.ico`，并接入窗口图标、网页 favicon、安装包和快捷方式图标。
- 跨平台打包：Windows NSIS 安装包；macOS DMG/ZIP，可分别构建 Intel x64 与 Apple Silicon arm64。
- 写作 UI：保留专注写作布局，顶部命令栏、元素格式栏、居中 Letter 纸张和底部状态栏。
- 界面语言：可见界面默认简体中文，支持简体中文、英文和繁体中文。
- 桌面菜单：Windows/macOS 原生菜单栏中文化，快捷键使用跨平台的 Command/Ctrl 习惯。
- 用户偏好：可设置默认剧本语言、场景术语、内外景、时间、转场、格式、字体和字号，并可应用到当前项目。
- 辅助功能：统一修正错别字/用词、全文替换、角色统计、场序编号、剧本体检、结构地图、术语转换、制作报告和修订快照。
- 导入文档：支持 DOCX、TXT、PDF、Fountain、Markdown、SRT，并识别为好莱坞剧本格式。
- 剧本格式：好莱坞标准、东亚影视、舞台剧、广播剧/播客；好莱坞模板按 Letter 纸、左 1.5 英寸、右/上下 1 英寸和约 54 行/页的专业行距校准。
- 转场预设：CUT TO / 切至、DISSOLVE TO / 叠化至、FADE IN / 淡入等多语言写法；好莱坞转场元素在主写作区、预览、PDF、PNG 中统一靠右。
- 本地项目文件：保存和打开 `.ssproj`。
- FDX：导入和导出 `.fdx` XML 剧本文件。
- 导出：PDF，以及逐页纯图片 PNG。
- 字体：Windows 读取系统字体；macOS 读取系统字体并内置苹方、宋体、Menlo、Courier 等常用候选。

## 安装依赖

```powershell
cd D:\Codex\ScreenplayStudio
npm.cmd install
```

macOS 上使用：

```bash
npm install
```

## 开发运行

```powershell
npm.cmd run dev
```

开发模式会同时启动 Vite 和 Electron 桌面窗口。

## 检查

```powershell
npm.cmd run lint
npm.cmd run build
```

## Windows 打包

```powershell
npm.cmd run dist:win
```

生成的安装包位于：

- `D:\Codex\ScreenplayStudio\release\Screenplay-Studio-0.2.7-Setup.exe`

## macOS 打包

macOS 安装包需要在 macOS 环境构建：

```bash
npm run dist:mac
```

生成物位于：

- `release/Screenplay-Studio-0.2.7-x64.dmg`
- `release/Screenplay-Studio-0.2.7-x64.zip`
- `release/Screenplay-Studio-0.2.7-arm64.dmg`
- `release/Screenplay-Studio-0.2.7-arm64.zip`

当前仓库也提供 GitHub Actions 工作流，可在 macOS runner 上自动生成上述产物。未配置 Apple Developer 证书时，Mac 包为未签名/未公证版本，首次打开可能需要在 Finder 中右键选择“打开”。

## 常用命令

- `npm.cmd run lint`：代码检查。
- `npm.cmd run build`：TypeScript 与前端构建。
- `npm.cmd run pack`：生成 Windows 可运行目录。
- `npm.cmd run dist:win`：生成 Windows 安装包。
- `npm run pack:mac`：在 macOS 生成 `.app` 可运行目录。
- `npm run dist:mac`：在 macOS 生成 DMG/ZIP。

## 文件格式

- `.ssproj`：剧本工坊本地项目文件。
- `.fdx`：Final Draft XML 基础读写兼容。
- `.pdf`：标准剧本 PDF 导出。
- `.png`：逐页纯图片导出。
- `.docx` / `.txt` / `.pdf` / `.fountain` / `.md` / `.srt`：可导入并识别为好莱坞格式。

## 开源说明

欢迎基于 MIT 协议使用、修改和分发。本项目不包含需要 API Key 或在线账号的 AI 功能，目标是让普通用户在本机离线完成专业剧本写作。
