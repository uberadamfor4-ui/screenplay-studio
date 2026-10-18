export type RecoveryHealth = { project?: object; state: 'idle' | 'writing' | 'saved' | 'failed'; savedAt?: string }
export type ProtectionState = 'file' | 'recovery' | 'writing' | 'failed' | 'pending'

export function protectionState(project: object, fileSaved: boolean, recovery: RecoveryHealth): ProtectionState {
  if (fileSaved) return 'file'
  if (recovery.project !== project) return 'pending'
  return recovery.state === 'saved' ? 'recovery' : recovery.state === 'writing' ? 'writing' : recovery.state === 'failed' ? 'failed' : 'pending'
}

export function compareRecoveryElements(current: readonly { id: string; type: string; text: string }[], previous: readonly { id: string; type: string; text: string }[]) {
  const before = new Map(previous.map(element => [element.id, element]))
  const after = new Map(current.map(element => [element.id, element]))
  return {
    added: current.filter(element => !before.has(element.id)).length,
    removed: previous.filter(element => !after.has(element.id)).length,
    changed: current.filter(element => { const old = before.get(element.id); return old && (old.type !== element.type || old.text !== element.text) }).length,
  }
}

export const protectionLabels = {
  'zh-CN': { title: '保存与恢复', file: '原项目文件已保存', recovery: '恢复副本已保存 · 原文件待保存', writing: '正在写入恢复副本', failed: '保存未确认 · 请立即备份', pending: '当前修改尚未保存', backup: '另存独立备份', diagnostics: '导出问题诊断包', history: '查看恢复时间线', close: '关闭', primary: '原项目文件', latest: '最近恢复副本', unknown: '尚未确认', diagnosticNote: '诊断包仅含版本、系统类别、保存状态和错误代号；不包含剧本、文件名、路径或个人信息。不会自动上传。', exportDone: '诊断包已导出', exportCanceled: '已取消', exportFailed: '导出失败，请检查空间与权限', backupDone: '独立备份已保存', backupFailed: '备份未确认，请重试', backupNote: '备份是当前稿件的独立 SSProj 副本，不改变原项目的保存位置。' },
  'en-US': { title: 'Save & recovery', file: 'Project file saved', recovery: 'Recovery copy saved · project file pending', writing: 'Writing recovery copy', failed: 'Save unconfirmed · back up now', pending: 'Changes not yet saved', backup: 'Save independent backup', diagnostics: 'Export diagnostic report', history: 'Recovery timeline', close: 'Close', primary: 'Project file', latest: 'Latest recovery copy', unknown: 'Not confirmed', diagnosticNote: 'The report includes versions, platform category, save states and error codes only. No script, names, paths or personal details. Nothing uploads automatically.', exportDone: 'Report exported', exportCanceled: 'Canceled', exportFailed: 'Export failed. Check space and permissions.', backupDone: 'Independent backup saved', backupFailed: 'Backup unconfirmed. Try again.', backupNote: 'A backup is an independent SSProj copy. It does not change the active project location.' },
  'zh-TW': { title: '儲存與復原', file: '原專案檔案已儲存', recovery: '復原副本已儲存 · 原檔待儲存', writing: '正在寫入復原副本', failed: '儲存未確認 · 請立即備份', pending: '目前修改尚未儲存', backup: '另存獨立備份', diagnostics: '匯出問題診斷包', history: '查看復原時間線', close: '關閉', primary: '原專案檔案', latest: '最近復原副本', unknown: '尚未確認', diagnosticNote: '診斷包僅含版本、系統類別、儲存狀態及錯誤代號；不包含劇本、檔名、路徑或個人資料。不會自動上傳。', exportDone: '診斷包已匯出', exportCanceled: '已取消', exportFailed: '匯出失敗，請檢查空間與權限', backupDone: '獨立備份已儲存', backupFailed: '備份未確認，請重試', backupNote: '備份是目前稿件的獨立 SSProj 副本，不改變原專案的儲存位置。' },
} as const
