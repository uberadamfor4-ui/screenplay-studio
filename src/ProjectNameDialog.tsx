import { useRef, useState } from 'react'
import { FilePlus, Pencil, X } from 'lucide-react'
import type { UiLocale } from './i18n'
import { workflowText } from './workflowText'

export function ProjectNameDialog(props: { kind: 'new' | 'rename'; name: string; locale: UiLocale; onClose: () => void; onSubmit: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState(props.name)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const text = (zh: string, en: string, tw: string) => workflowText(props.locale, zh, en, tw)
  return <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-name-heading">
    <section className="preferences-dialog project-name-dialog">
      <form onSubmit={async event => {
        event.preventDefault()
        if (busyRef.current || !name.trim()) return
        busyRef.current = true
        setBusy(true); setError('')
        try { if (await props.onSubmit(name.trim())) props.onClose() }
        catch (failure) { setError(failure instanceof Error ? failure.message : text('操作失败，原稿未切换。', 'The operation failed. Your current script is unchanged.', '操作失敗，原稿未切換。')) }
        finally { busyRef.current = false; setBusy(false) }
      }}>
        <header><h2 id="project-name-heading">{props.kind === 'new' ? <FilePlus size={18} /> : <Pencil size={18} />}{props.kind === 'new' ? text('新建剧本', 'New Script', '新增劇本') : text('修改剧本名称', 'Rename Script', '修改劇本名稱')}</h2><button type="button" className="icon-button" aria-label={text('关闭', 'Close', '關閉')} disabled={busy} onClick={props.onClose}><X size={16} /></button></header>
        <label className="field"><span>{text('剧本名称', 'Script name', '劇本名稱')}</span><input autoFocus maxLength={1000} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
        {error && <p role="alert" className="project-name-error">{error}</p>}
        <div className="project-name-actions">
          <button type="button" disabled={busy} onClick={props.onClose}>{text('取消', 'Cancel', '取消')}</button>
          <button type="submit" disabled={busy || !name.trim()}>{busy ? text('处理中…', 'Working...', '處理中…') : props.kind === 'new' ? text('创建并选择保存位置', 'Create and Choose Location', '建立並選擇儲存位置') : text('确定', 'Apply', '確定')}</button>
        </div>
      </form>
    </section>
  </div>
}
