const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..')
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))
const app=read('package.json'),mobile=read('mobile/package.json'),catalog=read('release-catalog.json')
assert.equal(read('package-lock.json').version,app.version)
assert.equal(read('package-lock.json').packages[''].version,app.version)
assert.equal(read('mobile/package-lock.json').version,mobile.version)
assert.equal(read('mobile/package-lock.json').packages[''].version,mobile.version)
assert.ok(fs.readFileSync(path.join(root,'src/sample.ts'),'utf8').includes(`appVersion: '${app.version}'`))
assert.ok(fs.readFileSync(path.join(root,'mobile/android/app/build.gradle'),'utf8').includes(`versionName "${mobile.version}"`))
assert.ok(fs.readFileSync(path.join(root,'mobile/android/app/src/androidTest/java/studio/screenplay/writer/mobile/MobileAcceptanceTest.java'),'utf8').includes(`assertEquals("${mobile.version}",`))
for(const item of catalog.downloads){
 assert.ok(Number.isSafeInteger(item.bytes)&&item.bytes>0)
 assert.ok(item.file.includes(item.platform==='android'?catalog.release.android.version:catalog.release.version))
}
if(process.argv.includes('--publish')){
 assert.equal(catalog.release.version,app.version,'Desktop published catalog must match verified package')
 assert.equal(catalog.release.android.version,mobile.version,'Android published catalog must match verified APK')
}
const candidate=catalog.release.version!==app.version||catalog.release.android.version!==mobile.version
const document=`# 版本与平台支持\n\n本软件由1037 Film 郭之然独立开发完成。\n\n源码桌面版：${app.version}。安卓写作版：${mobile.version}。${candidate?'当前为开发候选，不能将源码构建等同于已公开的安装包。':'当前公开版本与源码版本一致。'}\n\n公开下载：桌面版 ${catalog.release.version}；安卓写作版 ${catalog.release.android.version}。\n\n## 当前源码构建的安装包名称\n\n- Windows x64：Screenplay-Studio-${app.version}-Setup.exe\n- Mac Apple Silicon：Screenplay-Studio-${app.version}-arm64.dmg / .zip\n- Intel Mac：Screenplay-Studio-${app.version}-x64.dmg / .zip\n- Android：Screenplay-Studio-Android-${mobile.version}.apk\n\n## 支持与验收边界\n\nWindows、macOS 和 Android 必须分别通过各自平台的检查。npm run release:gate 生成桌面源码回归报告，不代替安装包验收；Windows 原位升级、Mac 两种架构包的签名和启动、Android 两个系统版本的原生输入及进程回收测试继续由原生工作流执行。缺失或失败的检查不能标记为通过。\n\nMac 未经 Apple 公证，系统仍可能拒绝打开；不关闭安全保护作为默认安装办法。Android 为 Android 10+ 公开测试版，不含完整桌面制片工作台。\n\n## 数据与隐私\n\n自动恢复不等于已保存原文件，也不等于独立备份。重要稿件另存 SSProj；恢复后保留原稿。诊断包由用户主动导出，不含剧本、文件名和路径，不会自动上传。不包含账号、API、云同步或局域网功能。\n\n本文件由 scripts/check-release-consistency.cjs 根据版本清单生成。\n`
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'CURRENT_RELEASE.md'),document)
else assert.equal(fs.readFileSync(path.join(root,'CURRENT_RELEASE.md'),'utf8'),document,'Run npm run release:docs after changing release metadata')
console.log(JSON.stringify({passed:true,source:{desktop:app.version,android:mobile.version},published:{desktop:catalog.release.version,android:catalog.release.android.version},candidate}))
