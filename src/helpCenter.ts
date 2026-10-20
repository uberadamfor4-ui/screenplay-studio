export type HelpText = [string, string, string]
export const helpTopics: { id: string; title: HelpText; steps: HelpText[] }[] = [
  { id: 'input', title: ['不能输入或焦点异常', 'Typing or focus', '不能輸入或焦點異常'], steps: [
    ['先导出 SSProj 备份，不要立即强制退出。', 'Export an SSProj backup before force-quitting.', '先匯出 SSProj 備份，不要立即強制結束。'],
    ['关闭 PDF、打印和其他弹窗，再点正文；安卓锁定稿只读。', 'Close PDF, print and other dialogs, then select text. Locked drafts are read-only on Android.', '關閉 PDF、列印和其他彈窗，再點正文；安卓鎖定稿唯讀。'],
    ['在练习副本换系统输入法测试短句与撤销，记录是否只在特定输入法或省略号附近发生。', 'In a practice copy try a system keyboard, type and undo. Record keyboard and ellipsis dependencies.', '在練習副本換系統輸入法測試短句與復原，記錄是否只在特定輸入法或省略號附近發生。'],
  ] },
  { id: 'save', title: ['保存失败或恢复冲突', 'Save or recovery conflict', '儲存失敗或復原衝突'], steps: [
    ['桌面版 0.7.7 修复双击文件只启动窗口却未读取该稿的问题。从 SSProj 打开后普通保存写回原位置；FDX 导入和恢复副本首次保存仍需选择新位置。', 'Desktop 0.7.7 reads the file requested by a double-click. Saving an opened SSProj writes back to its path; imported FDX and recovered copies need a new SSProj destination.', '桌面版 0.7.7 修復雙擊檔案只啟動視窗卻未讀取該稿的問題。從 SSProj 開啟後一般儲存寫回原位置；FDX 匯入和復原副本首次儲存仍須選擇新位置。'],
    ['保持软件打开，查看保存与恢复；恢复副本成功不等于原稿已保存。', 'Keep the app open. A recovery copy is not a confirmed project save.', '保持軟體開啟，查看儲存與復原；復原副本成功不等於原稿已儲存。'],
    ['释放空间、检查写入权限，再用新文件名导出独立 SSProj。', 'Free space, check write access, then export an independent SSProj with a new name.', '釋放空間、檢查寫入權限，再用新檔名匯出獨立 SSProj。'],
    ['冲突时双方都保留。两个存储均失败时，强杀或断电仍可能丢失内存文字。', 'Keep both copies on conflict. If both stores fail, process death may lose in-memory edits.', '衝突時雙方都保留。兩個儲存均失敗時，強制結束或斷電仍可能遺失記憶體文字。'],
  ] },
  { id: 'pdf', title: ['PDF 字体、加粗或分页异常', 'PDF font, bold or pagination', 'PDF 字型、粗體或分頁異常'], steps: [
    ['确认打开的是新导出的 PDF，不是旧文件或仅预览。', 'Open the new PDF, not an older file or preview alone.', '確認開啟的是新匯出的 PDF，不是舊檔案或僅預覽。'],
    ['用同一导出方案、纸张和字体比较；不同语言不能按相同字数比较页数。', 'Compare identical profiles, paper and fonts. Character count does not determine page count across languages.', '使用相同匯出方案、紙張和字型比較；不同語言不能按相同字數比較頁數。'],
    ['在副本加粗一段，核对可见字形和复制文字；安卓等打印缩略页生成后再保存。', 'Bold a paragraph in a copy and inspect appearance and copied text. Android: wait for print thumbnails before saving.', '在副本將一段加粗，核對可見字形和複製文字；安卓等列印縮圖產生後再儲存。'],
  ] },
  { id: 'install', title: ['安装或启动失败', 'Installation or startup', '安裝或啟動失敗'], steps: [
    ['确认系统和芯片，选择对应安装包；升级前备份，不先卸载或清数据。', 'Check OS and chip and choose the matching installer. Back up; do not uninstall or clear data first.', '確認系統和晶片，選擇對應安裝包；升級前備份，不先解除安裝或清除資料。'],
    ['Mac 未经 Apple 公证，系统可能拒绝；已损坏与无法验证开发者并非同一提示，不关闭系统保护。', 'Mac builds are unnotarized and may be rejected. Damaged and unidentified-developer messages differ. Do not disable system protection.', 'Mac 未經 Apple 公證，系統可能拒絕；已損壞與無法驗證開發者並非同一提示，不關閉系統保護。'],
    ['保留完整报错、安装包名称和系统版本，不删除原项目来试错。', 'Record the full error, installer name and OS version. Do not delete projects while troubleshooting.', '保留完整錯誤、安裝包名稱和系統版本，不刪除原專案來試錯。'],
  ] },
  { id: 'import', title: ['导入识别不正确', 'Import recognition', '匯入辨識不正確'], steps: [
    ['在确认工作台核对角色、对白、括注和场景头。', 'In Import review inspect character, dialogue, parenthetical and scene types.', '在確認工作臺核對角色、對白、括註和場景標題。'],
    ['Fountain 标记仅在 Fountain 文件中解释；复杂 Word 表格、文本框和 PDF 分栏需人工核对。', 'Fountain markers apply only to Fountain. Complex Word tables, text boxes and PDF columns need manual review.', 'Fountain 標記僅在 Fountain 檔案中解讀；複雜 Word 表格、文字方塊和 PDF 分欄需人工核對。'],
    ['取消会保留当前稿。反馈时制作无敏感剧情的最小示例，不直接发送整部剧本。', 'Cancel retains the draft. Report a minimal non-sensitive example, not a whole screenplay.', '取消會保留目前稿。回報時製作無敏感劇情的最小範例，不直接傳送整部劇本。'],
  ] },
  { id: 'handoff', title: ['桌面与手机交接差异', 'Desktop/mobile handoff', '桌面與手機交接差異'], steps: [
    ['保留双方文件，用离线交接检查，不直接覆盖。', 'Keep both files and use Offline handoff review, without overwriting originals.', '保留雙方檔案，使用離線交接檢查，不直接覆蓋。'],
    ['检查来源版本、字体和附件；SSProj 不包含媒体，附件请用桌面项目包并核对缺失报告。', 'Check versions, fonts and media. SSProj does not bundle media; use the desktop portable package and inspect missing-file reports.', '檢查來源版本、字型和附件；SSProj 不包含媒體，附件請使用桌面專案包並核對缺失報告。'],
    ['所选正文合并为新副本，不合并来稿部门资料。锁定稿回桌面处理。', 'Merge selected text into a new copy, not incoming department data. Handle locked drafts on desktop.', '所選正文合併為新副本，不合併來稿部門資料。鎖定稿回桌面處理。'],
  ] },
  { id: 'submission', title: ['投稿包或匿名信息', 'Submission or anonymity', '投稿包或匿名資訊'], steps: [
    ['填写已勾选的材料；匿名模式不包含作者陈述。', 'Complete selected materials. Anonymous mode excludes author statements.', '填寫已勾選的材料；匿名模式不包含作者陳述。'],
    ['桌面 ZIP 可含 PDF；安卓包含 TXT、FDX 和文字材料，PDF 另行导出。', 'Desktop ZIP may include PDF. Android includes TXT, FDX and text materials; export PDF separately.', '桌面 ZIP 可含 PDF；安卓包含 TXT、FDX 和文字材料，PDF 另行匯出。'],
    ['解压逐份核对署名、页眉页脚、联系方式和 PDF 属性；自动清理不能识别所有身份线索。', 'Extract and inspect identity, headers, contacts and PDF properties. Automatic cleanup cannot detect every identifier.', '解壓逐份核對署名、頁首頁尾、聯絡方式和 PDF 屬性；自動清理不能辨識所有身分線索。'],
  ] },
]

export function buildFeedbackTemplate(version: string, platform: string, category: string, description = '', steps = '', locale = 'zh-CN') {
  const safeVersion = /^\d+\.\d+\.\d+$/.test(version) ? version : 'unknown'
  const safePlatform = ['windows', 'mac', 'android', 'browser'].includes(platform) ? platform : 'unknown'
  const index = locale === 'en-US' ? 1 : locale === 'zh-TW' ? 2 : 0
  const title = helpTopics.find(t => t.id === category)?.title[index] || ['其他问题', 'Other issue', '其他問題'][index]
  const rows = [
    ['剧本工坊 BUG 反馈', 'Screenplay Studio bug feedback', '劇本工坊 BUG 回報'],
    [`软件版本：${safeVersion}`, `App version: ${safeVersion}`, `軟體版本：${safeVersion}`],
    [`系统平台：${safePlatform}`, `Platform: ${safePlatform}`, `系統平台：${safePlatform}`],
    [`问题类型：${title}`, `Category: ${title}`, `問題類型：${title}`],
    [`问题现象：${description.slice(0, 2000)}`, `Description: ${description.slice(0, 2000)}`, `問題現象：${description.slice(0, 2000)}`],
    [`复现步骤：${steps.slice(0, 4000)}`, `Steps: ${steps.slice(0, 4000)}`, `重現步驟：${steps.slice(0, 4000)}`],
    ['期望结果：\n实际结果：\n输入法/系统版本：\n是否每次发生：', 'Expected result:\nActual result:\nKeyboard / OS version:\nFrequency:', '預期結果：\n實際結果：\n輸入法/系統版本：\n是否每次發生：'],
    ['附件：可选脱敏截图、最小示例、主动导出的诊断包。不要发送完整剧本、密钥或本机完整路径。', 'Optional: redacted screenshots, minimal example, manually exported diagnostics. Do not send whole scripts, keys or full local paths.', '附件：可選去識別化截圖、最小範例、主動匯出的診斷包。不要傳送完整劇本、金鑰或本機完整路徑。'],
  ]
  return rows.map(row => row[index]).join('\n') + '\n'
}
