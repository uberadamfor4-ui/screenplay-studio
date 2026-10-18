# 版本与平台支持

本软件由1037 Film 郭之然独立开发完成。

源码桌面版：0.7.5。安卓写作版：0.1.8。当前公开版本与源码版本一致。

公开下载：桌面版 0.7.5；安卓写作版 0.1.8。

## 当前源码构建的安装包名称

- Windows x64：Screenplay-Studio-0.7.5-Setup.exe
- Mac Apple Silicon：Screenplay-Studio-0.7.5-arm64.dmg / .zip
- Intel Mac：Screenplay-Studio-0.7.5-x64.dmg / .zip
- Android：Screenplay-Studio-Android-0.1.8.apk

## 支持与验收边界

Windows、macOS 和 Android 必须分别通过各自平台的检查。npm run release:gate 生成桌面源码回归报告，不代替安装包验收；Windows 原位升级、Mac 两种架构包的签名和启动、Android 两个系统版本的原生输入及进程回收测试继续由原生工作流执行。缺失或失败的检查不能标记为通过。

Mac 未经 Apple 公证，系统仍可能拒绝打开；不关闭安全保护作为默认安装办法。Android 为 Android 10+ 公开测试版，不含完整桌面制片工作台。

## 数据与隐私

自动恢复不等于已保存原文件，也不等于独立备份。重要稿件另存 SSProj；恢复后保留原稿。诊断包由用户主动导出，不含剧本、文件名和路径，不会自动上传。不包含账号、API、云同步或局域网功能。

本文件由 scripts/check-release-consistency.cjs 根据版本清单生成。
