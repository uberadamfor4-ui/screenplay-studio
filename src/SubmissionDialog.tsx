import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { WorkflowDialog } from './WorkflowDialogs'
import { workflowText } from './workflowText'
import { defaultSubmissionOptions, emptySubmission, prepareSubmission, type SubmissionOptions } from './submissionPack'
import type { ScriptProject } from './types'
import type { UiLocale } from './i18n'
import { t } from './i18n'
import { exportFailureStatus } from './exportErrors'

export function SubmissionDialog({ project, locale, mobile = false, onChange, onClose, onExport }: { project: ScriptProject; locale: UiLocale; mobile?: boolean; onChange: (next: ScriptProject) => void; onClose: () => void; onExport: (prepared: ReturnType<typeof prepareSubmission>) => Promise<boolean> }) {
  const L = (cn: string, en: string, tw: string) => workflowText(locale, cn, en, tw)
  const [options, setOptions] = useState(defaultSubmissionOptions), [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [message, setMessage] = useState(''), gate = useRef(false)
  const fields = { ...emptySubmission, ...project.submission }
  const composing = useRef(false), live = useRef({ project, options, ack })
  live.current = { project, options, ack }
  const labels = { logline: L('一句话故事', 'Logline', '一句話故事'), synopsis: L('故事梗概', 'Synopsis', '故事梗概'), characters: L('人物介绍', 'Characters', '人物介紹'), statement: L('作者陈述', 'Author statement', '作者陳述') }
  function toggle(key: keyof SubmissionOptions, value: boolean) { setOptions(old => ({ ...old, [key]: value })); setAck(false); setMessage('') }
  async function submit() {
    if (gate.current || !ack || composing.current) return
    gate.current = true; setBusy(true); setMessage('')
    try { await new Promise<void>(resolve => { const timer = setTimeout(resolve, 150); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve() })) }); if (!live.current.ack || composing.current) return; const prepared = prepareSubmission(live.current.project, live.current.options); const ok = await onExport(prepared); setMessage(ok ? L('交付包已保存，请解压逐份核对后投稿。', 'Package saved. Extract and inspect every file before submission.', '交付包已儲存，請解壓逐份核對後投稿。') : L('已取消或未完成，当前稿保持不变。', 'Canceled or not completed. Current draft preserved.', '已取消或未完成，目前稿保持不變。')) }
    catch (error) { setMessage(exportFailureStatus(error) === 'exportCoverOverflow' ? t(locale, 'exportCoverOverflow') : L('未生成交付包。请填写已勾选的材料，并检查空间和权限。', 'Package not created. Complete selected materials and check storage and permissions.', '未產生交付包。請填寫已勾選的材料，並檢查空間和權限。')) }
    finally { gate.current = false; setBusy(false) }
  }
  return <WorkflowDialog title={L('投稿交付包', 'Submission package', '投稿交付包')} locale={locale} busy={busy} onClose={onClose} footer={<><span role="status">{message}</span><button disabled={busy || !ack} onClick={() => void submit()}><Download size={17} />{L('生成 ZIP 交付包', 'Create ZIP package', '產生 ZIP 交付包')}</button></>}>
    <div className="workflow-controls"><label><input type="checkbox" disabled={busy} checked={options.anonymous} onChange={e => toggle('anonymous', e.target.checked)} />{L('匿名投稿', 'Anonymous submission', '匿名投稿')}</label><label><input type="checkbox" disabled={busy} checked={options.script} onChange={e => toggle('script', e.target.checked)} />{mobile ? L('剧本 TXT + FDX（PDF 另行导出）', 'Script TXT + FDX (export PDF separately)', '劇本 TXT + FDX（PDF 另行匯出）') : L('剧本 PDF', 'Script PDF', '劇本 PDF')}</label></div>
    <div className="workflow-fields">{(['logline', 'synopsis', 'characters', 'statement'] as const).map(key => <label key={key}><span><input type="checkbox" disabled={busy || options.anonymous && key === 'statement'} checked={options[key] && !(options.anonymous && key === 'statement')} onChange={e => toggle(key, e.target.checked)} /> {labels[key]}</span><textarea onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} disabled={busy || mobile && Boolean(project.productionLock?.enabled) || options.anonymous && key === 'statement'} maxLength={key === 'logline' ? 2000 : 20000} aria-label={labels[key]} value={fields[key]} onChange={e => { onChange({ ...project, submission: { ...fields, [key]: e.target.value } }); setAck(false) }} /></label>)}</div>
    <label className="workflow-check"><input type="checkbox" disabled={busy} checked={ack} onChange={e => setAck(e.target.checked)} />{L('已人工核对内容、署名和匿名要求；交付包不是项目备份', 'I checked content, identity and submission rules; this package is not a project backup', '已人工核對內容、署名和匿名要求；交付包不是專案備份')}</label>
  </WorkflowDialog>
}
