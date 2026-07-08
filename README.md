# Screenplay Studio / 剧本工坊

Windows 桌面剧本写作软件。项目使用 Electron、React、TypeScript 和 Vite，界面以简体中文为默认体验，同时支持英文、繁体中文等剧本文本工作流。

> 当前版本：0.2.1  
> 许可证：MIT  
> 设计边界：参考专业剧本写作工具的通用工作流，但不复制 Final Draft 的私有界面、代码、素材、商标或受保护表达。

## 已实现

- 应用图标：SVG 源文件、PNG 多尺寸位图、Windows `.ico`，并已接入窗口图标、网页 favicon、安装包和快捷方式图标。
- 写作 UI：保留专注写作布局，顶部命令栏、元素格式栏、居中 Letter 纸张和底部状态栏。
- 辅助面板：完整面板入口已移除，侧栏和检查器不再作为用户入口暴露。
- 界面语言：可见界面固定为简体中文。
- 桌面菜单：Windows 原生菜单栏已中文化，文件菜单可直接执行新建、打开、保存、导入/导出。
- 语言设置：界面语言与剧本语言分离；界面支持简中、英文、繁中，剧本文本支持简中、英文、繁中、日文、韩文。
- 用户偏好：可设置默认剧本语言、场景术语、内外景、时间、转场、格式、字体和字号，并可应用到当前项目。
- 命令面板：`Ctrl+K` 可快速执行新建、保存、导入、导出、体检、术语转换和场序编号。
- 智能写作：输入场景头或转场时自动识别元素；`Enter` 进入下一类剧本元素，`Tab` 切换元素类型。
- 辅助功能：统一修正错别字/用词、全文替换、角色统计、场序编号、剧本体检、结构地图、术语转换、制作报告和修订快照。
- 导入文档：支持 DOCX、TXT、PDF、Fountain、Markdown、SRT，并识别为好莱坞剧本格式。
- 剧本格式：好莱坞标准、东亚影视、舞台剧、广播剧/播客；好莱坞模板按 Letter 纸、左 1.5 英寸、右/上下 1 英寸和约 54 行/页的专业行距校准。
- 剧本元素：场景、动作、角色、括注、对白、转场、镜头、段落、备注。
- 场景术语：INT./EXT. 可按偏好生成简体中文“内景/外景”、英文“INT./EXT.”或繁体中文“內景/外景”。
- 转场预设：CUT TO / 切至、DISSOLVE TO / 叠化至、FADE IN / 淡入等多语言写法；好莱坞转场元素在主写作区、预览、PDF、PNG 中统一靠右。
- 本地项目文件：保存和打开 `.ssproj`。
- FDX：导入和导出 `.fdx` XML 剧本文件。
- 导出：PDF，以及逐页纯图片 PNG。
- 字体：启动时读取 Windows 系统字体，同时内置常见中英文字体候选。
- 结构提示：三幕式、商业片节拍、英雄旅程、起承转合、一小时剧集。

## 安装

从发布页下载安装包，或本地运行：

```powershell
npm.cmd install
npm.cmd run dist
```

生成的安装包位于：

- `D:\Codex\ScreenplayStudio\release\Screenplay-Studio-0.2.1-Setup.exe`

## 运行

```powershell
cd D:\Codex\ScreenplayStudio
npm.cmd install
npm.cmd run dev
```

开发模式会同时启动 Vite 和 Electron 桌面窗口。

## 检查

```powershell
npm.cmd run lint
npm.cmd run build
```

## 打包

```powershell
npm.cmd run dist
```

常用命令：

- `npm.cmd run lint`：代码检查。
- `npm.cmd run build`：TypeScript 与前端构建。
- `npm.cmd run pack`：生成 Windows 可运行目录。
- `npm.cmd run dist`：生成 Windows 安装包。

安装包会创建桌面快捷方式和开始菜单快捷方式，快捷方式使用 `assets\brand\app-icon.ico`。

## 文件格式

- `.ssproj`：剧本工坊本地项目文件。
- `.fdx`：Final Draft XML 基础读写兼容。
- `.pdf`：标准剧本 PDF 导出。
- `.png`：逐页纯图片导出。
- `.docx` / `.txt` / `.pdf` / `.fountain` / `.md` / `.srt`：可导入并识别为好莱坞格式。

## 开源说明

欢迎基于 MIT 协议使用、修改和分发。本项目不包含需要 API Key 或在线账号的 AI 功能，目标是让普通用户在 Windows 本机离线完成专业剧本写作。

## 后续建议

- 增加真实分页编辑和页内光标定位。
- 加入角色库、地点库和修订颜色。
- 扩展 FDX 样式、标题页和注释兼容。
