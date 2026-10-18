import { useState } from 'react'
import { BookOpen, Download, Save, ShieldCheck, X } from 'lucide-react'
import { protectionLabels, type ProtectionState, type RecoveryHealth } from './saveProtection'
import type { UiLocale } from './i18n'

export function SaveProtectionDialog({ locale, state, recovery, primary, onClose, onHistory, onBackup, onDiagnostics }: {
  locale: UiLocale; state: ProtectionState; recovery: RecoveryHealth; primary: 'saved' | 'dirty' | 'saving' | 'failed'
  onClose: () => void; onHistory: () => void
  onBackup: () => Promise<'ok' | 'canceled' | 'failed'>; onDiagnostics: () => Promise<'ok' | 'canceled' | 'failed'>
}) {
  const text = protectionLabels[locale], [busy, setBusy] = useState(false), [result, setResult] = useState('')
  const pick = (cn: string, en: string, tw: string) => locale === 'en-US' ? en : locale === 'zh-TW' ? tw : cn
  async function run(kind: 'backup' | 'diagnostics') {
    if (busy) return
    setBusy(true); setResult('')
    try {
      const value = await (kind === 'backup' ? onBackup() : onDiagnostics())
      setResult(value === 'canceled' ? text.exportCanceled : value === 'failed' ? kind === 'backup' ? text.backupFailed : text.exportFailed : kind === 'backup' ? text.backupDone : text.exportDone)
    } catch { setResult(text.exportFailed) } finally { setBusy(false) }
  }
  return <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="save-protection-title">
    <section className="protection-dialog">
      <header><h2 id="save-protection-title"><ShieldCheck size={20} />{text.title}</h2><button className="icon-button" type="button" title={text.close} aria-label={text.close} disabled={busy} onClick={onClose}><X size={18} /></button></header>
      <p className={`protection-summary protection-${state}`} role="status">{text[state]}</p>
      <dl><div><dt>{text.primary}</dt><dd>{primary === 'saved' ? text.file : primary === 'saving' ? pick('正在保存原文件', 'Saving project file', '正在儲存原檔') : primary === 'failed' ? pick('原文件保存失败', 'Project save failed', '原檔儲存失敗') : pick('尚有修改未写入原文件', 'Changes not written to project file', '尚有修改未寫入原檔')}</dd></div>
        <div><dt>{text.latest}</dt><dd>{recovery.savedAt ? new Date(recovery.savedAt).toLocaleString(locale) : text.unknown}</dd></div></dl>
      <div className="protection-actions"><button type="button" disabled={busy} onClick={() => void run('backup')}><Save size={18} />{text.backup}</button><button type="button" disabled={busy} onClick={onHistory}><BookOpen size={18} />{text.history}</button></div>
      <p>{text.backupNote}</p><hr /><p>{text.diagnosticNote}</p>
      <button type="button" disabled={busy} onClick={() => void run('diagnostics')}><Download size={18} />{text.diagnostics}</button>
      <p role="status" className="protection-result">{result}</p>
    </section>
  </div>
}
