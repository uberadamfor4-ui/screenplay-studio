import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, ClipboardList, Download, Eye, FileArchive, Link2, ListTodo, Pause, Play, Plus, Replace, Scissors, ShieldCheck, Tags, Trash2, Upload, Users, X } from 'lucide-react'
import type { UiLocale } from './i18n'
import type { Cutting, EntityAlias, PortableResult, ScriptProject, WritingToolsData } from './types'
import { getElementLabel } from './formats'
import { parseReplacementPairs, type ReplacementPair } from './textReplacement'
import { serializeProjectForSave } from './projectSerialization'
import { safeFileName } from './fileNames'
import {
  anonymousProject, applyReplacementPreview, createAliasResolver, continuityWarnings, defaultPrivacyOptions, detectPlaceholders,
  entityKey, makeReviewExchange, mergeReviewExchange, parseReviewExchange, previewReviewMerge, privacyFindings, rehearsalLines,
  replacementPreview, restoreCuttingProject, sceneRange, storyLinkWarnings, toolId, toolLimits, validateAliases, WritingToolError,
} from './writingTools'
import type { PrivacyOptions, ReplacementChange, ReviewExchange } from './writingTools'
import './WritingToolsDialog.css'

export type WritingToolTab = 'replace' | 'aliases' | 'tasks' | 'cuttings' | 'continuity' | 'links' | 'rehearsal' | 'review' | 'portable' | 'privacy'
function BoundedText(props: { text: string; locale: UiLocale; style?: CSSProperties }) {
  const [expanded, setExpanded] = useState(false)
  return <><pre style={props.style}>{expanded ? props.text : props.text.slice(0, 4000)}</pre>{!expanded && props.text.length > 4000 && <button onClick={() => setExpanded(true)}><Eye size={14} />{props.locale === 'en-US' ? 'Show full text' : props.locale === 'zh-TW' ? '展開全文' : '展开全文'} ({props.text.length})</button>}</>
}
function CuttingDetails(props: { cutting: Cutting; locale: UiLocale; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(25)
  const x = props.cutting
  return <details className="writing-cutting" onToggle={event => setOpen(event.currentTarget.open)}><summary>{x.title || (props.locale === 'en-US' ? 'Untitled' : props.locale === 'zh-TW' ? '未命名' : '未命名')} ({x.elements.length})</summary>{open && <><small>{x.sourceHeading} · {x.createdAt.slice(0, 10)}</small>{x.elements.slice(0, count).map(el => <BoundedText key={el.id} locale={props.locale} text={el.text} style={{ fontWeight: el.textStyle?.bold ? 700 : 400, fontStyle: el.textStyle?.italic ? 'italic' : 'normal', textDecoration: el.textStyle?.underline ? 'underline' : 'none', fontFamily: el.textStyle?.fontFamily }} />)}{x.elements.length > count && <button onClick={() => setCount(value => value + 25)}><Plus size={16} />{props.locale === 'en-US' ? 'Show more' : props.locale === 'zh-TW' ? '顯示更多' : '显示更多'} ({count} / {x.elements.length})</button>}{props.children}</>}</details>
}
type Props = {
  locale: UiLocale
  project: ScriptProject
  selectedId: string
  selectedIds: Set<string>
  filePath?: string
  initialTab: WritingToolTab
  initialRules?: string
  initialPairs?: ReplacementPair[]
  onChange: (next: ScriptProject) => void
  onClose: () => void
  onJump: (id: string) => void
  onImportPortable: () => Promise<void>
  onExportPrivate: (project: ScriptProject) => Promise<boolean>
}

export function WritingToolsDialog(props: Props) {
  const { project, locale } = props
  const data = project.writingTools!
  const L = (cn: string, en: string, tw: string) => locale === 'en-US' ? en : locale === 'zh-TW' ? tw : cn
  const tabs: Array<{ id: WritingToolTab; label: string; icon: ReactNode }> = [
    { id: 'replace', label: L('批量预览', 'Batch Preview', '批次預覽'), icon: <Replace /> },
    { id: 'aliases', label: L('别名管理', 'Aliases', '別名管理'), icon: <Tags /> },
    { id: 'tasks', label: L('改写待办', 'Rewrite Tasks', '改寫待辦'), icon: <ListTodo /> },
    { id: 'cuttings', label: L('废稿抽屉', 'Cuttings', '廢稿抽屜'), icon: <Scissors /> },
    { id: 'continuity', label: L('连续性台账', 'Continuity Ledger', '連續性臺帳'), icon: <ClipboardList /> },
    { id: 'links', label: L('伏笔回收', 'Setup & Payoff', '伏筆回收'), icon: <Link2 /> },
    { id: 'rehearsal', label: L('围读排练', 'Read-through', '圍讀排練'), icon: <Play /> },
    { id: 'review', label: L('批注往返', 'Review Exchange', '批註往返'), icon: <Users /> },
    { id: 'portable', label: L('项目打包', 'Portable Project', '專案打包'), icon: <FileArchive /> },
    { id: 'privacy', label: L('匿名导出', 'Anonymous Export', '匿名匯出'), icon: <ShieldCheck /> },
  ]
  const [tab, setTab] = useState(props.initialTab)
  const [visibleCount, setVisibleCount] = useState(25)
  useEffect(() => setVisibleCount(25), [tab])
  const shown = <T,>(items: T[]) => items.slice(0, visibleCount)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const live = useRef({ project, active: true })
  live.current.project = project
  useEffect(() => { const state = live.current; state.active = true; return () => { state.active = false; window.speechSynthesis?.cancel() } }, [])
  const errorText = (error: unknown) => {
    const code = error instanceof WritingToolError ? error.message : ''
    const messages: Record<string, string> = {
      invalidData: L('数据无效或超过安全上限。', 'Invalid data or safety limit exceeded.', '資料無效或超過安全上限。'),
      invalidAlias: L('请填写规范名称和至少一个别名。', 'Enter a canonical name and at least one alias.', '請填寫規範名稱和至少一個別名。'),
      aliasConflict: L('名称与已有别名重叠，请消除歧义。', 'Overlapping aliases. Resolve the ambiguity first.', '名稱與已有別名重疊，請消除歧義。'),
      stalePreview: L('原文已变化，请重新预览。', 'The source changed. Refresh the preview.', '原文已變化，請重新預覽。'),
      differentProject: L('批注文件属于另一个项目，已停止合并。', 'The review belongs to another project. Merge stopped.', '批註檔案屬於另一個專案，已停止合併。'),
      tooManyElements: L('恢复后段落数量超出上限。', 'Too many paragraphs after restoration.', '還原後段落數量超出上限。'),
      missingAnchor: L('原段落或场景已删除。', 'The original paragraph or scene was deleted.', '原段落或場景已刪除。'),
    }
    return messages[code] ?? L('操作未完成。请检查文件、空间和数据大小后重试。', 'Operation failed. Check the file, disk space and data size.', '操作未完成。請檢查檔案、空間和資料大小後重試。')
  }
  function act(action: () => void) {
    try { action(); setMessage(L('已完成。', 'Done.', '已完成。')) } catch (error) { setMessage(errorText(error)) }
  }
  async function run(action: (snapshot: ScriptProject) => Promise<string | undefined>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setMessage('')
    const snapshot = project
    try {
      const result = await action(snapshot)
      if (live.current.active && result) setMessage(result)
    } catch (error) { if (live.current.active) setMessage(errorText(error)) }
    finally { busyRef.current = false; if (live.current.active) setBusy(false) }
  }
  function commit(next: ScriptProject) { serializeProjectForSave(next); props.onChange(next) }
  function patch(patch: Partial<WritingToolsData>) {
    const next = { ...data, ...patch }
    if ([next.aliases, next.tasks, next.continuity, next.storyLinks, next.reviewImports].some(x => x.length > toolLimits.records) || next.cuttings.length > toolLimits.cuttings) throw new WritingToolError('invalidData')
    commit({ ...project, writingTools: next })
  }
  const saveText = async (text: string, extension: string, title: string) => {
    if (!window.screenplay) throw new Error('desktop')
    const result = await window.screenplay.saveTextFile({ content: text, suggestedName: `${safeFileName(project.title)}-${title}.${extension}`, filters: [{ name: title, extensions: [extension] }] })
    return result.canceled ? undefined : L('文件已保存。', 'File saved.', '檔案已儲存。')
  }
  const [rules, setRules] = useState(props.initialRules ?? '')
  const [replacementMode, setReplacementMode] = useState(props.initialPairs ? 'single' : 'rules')
  const [singleFrom, setSingleFrom] = useState(props.initialPairs?.[0]?.from ?? '')
  const [singleTo, setSingleTo] = useState(props.initialPairs?.[0]?.to ?? '')
  const [scope, setScope] = useState('all')
  const [changes, setChanges] = useState<ReplacementChange[]>([])
  const [accepted, setAccepted] = useState(new Set<string>())
  function preview() {
    const ids = scope === 'selected' ? props.selectedIds : scope === 'scene' ? new Set(sceneRange(project.elements, props.selectedId).map(x => x.id)) : scope === 'dialogue' ? new Set(project.elements.filter(x => x.type === 'dialogue').map(x => x.id)) : undefined
    const pairs = replacementMode === 'single' ? singleFrom ? [{ from: singleFrom, to: singleTo }] : [] : parseReplacementPairs(rules)
    if (!pairs.length) throw new WritingToolError('invalidData')
    const next = replacementPreview(project.elements, pairs, ids)
    setChanges(next); setAccepted(new Set(next.map(x => x.id)))
  }
  const [aliasKind, setAliasKind] = useState<EntityAlias['kind']>('character')
  const [canonical, setCanonical] = useState('')
  const [aliasText, setAliasText] = useState('')
  const [editingAlias, setEditingAlias] = useState('')
  const roleCounts = useMemo(() => {
    const resolve = createAliasResolver(data.aliases)
    const counts = new Map<string, { name: string; count: number }>()
    project.elements.filter(x => x.type === 'character').forEach(x => {
      const name = resolve(x.text.replace(/\s*[（(].*$/u, '').trim(), 'character')
      const key = entityKey(name)
      if (name) counts.set(key, { name: counts.get(key)?.name ?? name, count: (counts.get(key)?.count ?? 0) + 1 })
    })
    return [...counts.values()].map(x => [x.name, x.count] as const)
  }, [project.elements, data.aliases])
  const [taskText, setTaskText] = useState('')
  const [anchor, setAnchor] = useState(props.selectedId)
  const elementsById = useMemo(() => new Map(project.elements.map(x => [x.id, x])), [project.elements])
  const placeholders = useMemo(() => detectPlaceholders(project.elements), [project.elements])
  const scenes = useMemo(() => project.elements.filter(x => x.type === 'scene'), [project.elements])
  const [cuttingTitle, setCuttingTitle] = useState('')
  const [cuttingScope, setCuttingScope] = useState('selected')
  const [moveToDrawer, setMoveToDrawer] = useState(false)
  const [sceneId, setSceneId] = useState(sceneRange(project.elements, props.selectedId).find(x => x.type === 'scene')?.id ?? scenes[0]?.id ?? '')
  const [day, setDay] = useState(1)
  const [time, setTime] = useState('')
  const [entity, setEntity] = useState('')
  const [attribute, setAttribute] = useState('')
  const [state, setState] = useState('')
  const [intentional, setIntentional] = useState(false)
  const warnings = useMemo(() => continuityWarnings(project.elements, data.continuity), [project.elements, data.continuity])
  const [linkTitle, setLinkTitle] = useState('')
  const [setupId, setSetupId] = useState(props.selectedId)
  const [payoffId, setPayoffId] = useState('')
  const [editingLink, setEditingLink] = useState('')
  const linkWarnings = useMemo(() => storyLinkWarnings(project), [project])
  const [exchange, setExchange] = useState<ReviewExchange>()
  const [reviewSelection, setReviewSelection] = useState(new Set<string>())
  const reviewPreview = useMemo(() => exchange ? previewReviewMerge(project, exchange) : [], [project, exchange])
  const [packageResult, setPackageResult] = useState<PortableResult>()
  const [privacy, setPrivacy] = useState<PrivacyOptions>({ ...defaultPrivacyOptions })
  const findings = useMemo(() => privacyFindings(project), [project])
  const todoCount = data.tasks.filter(x => !x.done).length + placeholders.filter(x => !data.tasks.some(t => t.elementId === x.id)).length
  const [exportConfirmed, setExportConfirmed] = useState(false)
  const lines = useMemo(() => rehearsalLines(project.elements, data.aliases), [project.elements, data.aliases])
  const [myRole, setMyRole] = useState('')
  const [lineIndex, setLineIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const clockStart = useRef(0)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceName, setVoiceName] = useState('')
  const line = lines[lineIndex]
  const ownLine = Boolean(line && myRole && entityKey(line.speaker) === entityKey(myRole))
  const listCount = { replace: changes.length, aliases: data.aliases.length, tasks: Math.max(data.tasks.length, placeholders.length), cuttings: data.cuttings.length, continuity: data.continuity.length, links: data.storyLinks.length, rehearsal: 0, review: reviewPreview.length, portable: 0, privacy: findings.length }[tab]
  useEffect(() => {
    const synthesis = window.speechSynthesis
    if (!synthesis) return
    const update = () => setVoices(synthesis.getVoices().filter(x => x.localService))
    update(); synthesis.addEventListener('voiceschanged', update)
    return () => synthesis.removeEventListener('voiceschanged', update)
  }, [])
  useEffect(() => {
    if (!running) return
    clockStart.current = performance.now() - elapsed
    const timer = window.setInterval(() => setElapsed(performance.now() - clockStart.current), 250)
    return () => window.clearInterval(timer)
    // The elapsed value is sampled only when the clock starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  useEffect(() => {
    const synthesis = window.speechSynthesis
    if (!synthesis) return
    synthesis.cancel()
    const voice = voices.find(x => x.voiceURI === voiceName && x.localService)
    if (tab !== 'rehearsal' || !running || !voice || !line || ownLine) return
    const utterance = new SpeechSynthesisUtterance(line.element.text)
    utterance.voice = voice; utterance.lang = voice.lang
    synthesis.speak(utterance)
    return () => synthesis.cancel()
  }, [tab, running, voiceName, voices, line, ownLine])
  useEffect(() => { if (tab !== 'rehearsal') setRunning(false) }, [tab])
  function step(delta: number) { setLineIndex(i => Math.max(0, Math.min(lines.length - 1, i + delta))); setRevealed(false) }
  const chooseAnchor = (value: string, onChange: (value: string) => void, optional = false, onlyScenes = false) => <select value={value} onChange={e => onChange(e.target.value)}>
    {optional && <option value="">{L('尚未回收', 'Not linked', '尚未回收')}</option>}
    {!optional && !elementsById.has(value) && <option value="">{L('请选择', 'Choose', '請選擇')}</option>}
    {(onlyScenes ? scenes : project.elements).map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.text.slice(0, 65) || getElementLabel(x.type, locale)}</option>)}
  </select>
  const remove = (name: 'aliases' | 'tasks' | 'cuttings' | 'continuity' | 'storyLinks', id: string) => act(() => patch({ [name]: data[name].filter(x => x.id !== id) }))
  const icon = (label: string, child: ReactNode, onClick: () => void, disabled = false) => <button type="button" className="writing-icon" title={label} aria-label={label} onClick={onClick} disabled={disabled || busy}>{child}</button>
  const jump = (id: string) => { if (elementsById.has(id)) props.onJump(id) }
  const statusLabel = (status: string) => ({ new: L('新增', 'New', '新增'), duplicate: L('已合并', 'Already merged', '已合併'), conflict: L('冲突：勾选后作为新批注保留', 'Conflict: import selected as a new note', '衝突：勾選後作為新批註保留'), missingAnchor: L('原段落已删除', 'Paragraph deleted', '原段落已刪除'), staleAnchor: L('原文已变：请核对上下文', 'Source changed: check context', '原文已變：請核對上下文'), stateConflict: L('状态变化缺少记录', 'Unrecorded state change', '狀態變化缺少記錄'), ambiguousTime: L('同日时间不明，状态不一致', 'Ambiguous time, inconsistent state', '同日時間不明，狀態不一致'), missingPayoff: L('待回收', 'Payoff pending', '待回收'), payoffBeforeSetup: L('回收位于铺垫之前', 'Payoff precedes setup', '回收位於鋪墊之前') }[status] ?? status)

  return <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-label={L('写作辅助工具', 'Writing Tools', '寫作輔助工具')}>
    <section className="writing-tools-dialog">
      <header><h2><ClipboardList size={18} />{L('写作辅助工具', 'Writing Tools', '寫作輔助工具')}</h2>{icon(L('关闭', 'Close', '關閉'), <X size={18} />, props.onClose, busy)}</header>
      <div className="writing-tools-layout">
        <nav aria-label={L('工具', 'Tools', '工具')} role="tablist" aria-orientation="vertical" onKeyDown={event => {
          const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
          if (!delta && event.key !== 'Home' && event.key !== 'End' || busy) return
          event.preventDefault()
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.findIndex(x => x.id === tab) + delta + tabs.length) % tabs.length
          setTab(tabs[index].id); setMessage(''); document.getElementById(`writing-tab-${tabs[index].id}`)?.focus()
        }}>{tabs.map(x => <button key={x.id} type="button" role="tab" tabIndex={tab === x.id ? 0 : -1} id={`writing-tab-${x.id}`} aria-selected={tab === x.id} aria-controls="writing-tool-panel" disabled={busy} onClick={() => { setTab(x.id); setMessage('') }}>{x.icon}<span>{x.label}</span>{x.id === 'tasks' && todoCount > 0 && <small>{todoCount}</small>}</button>)}</nav>
        <div id="writing-tool-panel" role="tabpanel" aria-labelledby={`writing-tab-${tab}`} className="writing-tool-panel" onKeyDown={event => {
          if (tab !== 'rehearsal' || /INPUT|SELECT|TEXTAREA|BUTTON/u.test((event.target as HTMLElement).tagName)) return
          if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
          if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
        }}>
          <h3>{tabs.find(x => x.id === tab)?.label}</h3>
          {tab === 'replace' && <>
            <div className="writing-actions" role="group" aria-label={L('替换模式', 'Replacement mode', '替換模式')}><button aria-pressed={replacementMode === 'single'} onClick={() => { setReplacementMode('single'); setChanges([]) }}>{L('单组替换', 'Single pair', '單組替換')}</button><button aria-pressed={replacementMode === 'rules'} onClick={() => { setReplacementMode('rules'); setChanges([]) }}>{L('多组规则', 'Multiple pairs', '多組規則')}</button></div>
            {replacementMode === 'rules' ? <label>{L('替换规则（每行 旧词=新词）', 'Replacement pairs (old=new, one per line)', '替換規則（每行 舊詞=新詞）')}<textarea rows={4} maxLength={100000} value={rules} onChange={e => { setRules(e.target.value); setChanges([]) }} /></label> : <div className="writing-form-row"><label>{L('查找', 'Find', '尋找')}<input maxLength={10000} value={singleFrom} onChange={e => { setSingleFrom(e.target.value); setChanges([]) }} /></label><label>{L('替换为', 'Replace with', '替換為')}<input maxLength={10000} value={singleTo} onChange={e => { setSingleTo(e.target.value); setChanges([]) }} /></label></div>}
            <div className="writing-form-row"><label>{L('范围', 'Scope', '範圍')}<select value={scope} onChange={e => { setScope(e.target.value); setChanges([]) }}><option value="all">{L('全剧本', 'Whole script', '全劇本')}</option><option value="scene">{L('当前场景', 'Current scene', '目前場景')}</option><option value="selected">{L('选中段落', 'Selected paragraphs', '選取段落')}</option><option value="dialogue">{L('仅对白', 'Dialogue only', '僅對白')}</option></select></label><button type="button" onClick={() => act(preview)}><Eye size={16} />{L('预览修改', 'Preview', '預覽修改')}</button></div>
            <div className="writing-actions"><label className="writing-check"><input type="checkbox" checked={changes.length > 0 && accepted.size === changes.length} onChange={e => setAccepted(e.target.checked ? new Set(changes.map(x => x.id)) : new Set())} />{L('全选', 'Select all', '全選')} ({changes.length})</label><button disabled={!changes.length || !accepted.size} onClick={() => act(() => { commit({ ...project, elements: applyReplacementPreview(project.elements, changes, accepted) }); setChanges([]); setAccepted(new Set()) })}><Check size={16} />{L('应用选中的修改', 'Apply selected', '套用選取的修改')} ({accepted.size})</button></div>
            {shown(changes).map(x => <div className="writing-list-row" key={x.id}><input aria-label={L('采用此修改', 'Accept change', '採用此修改')} type="checkbox" checked={accepted.has(x.id)} onChange={e => setAccepted(current => { const next = new Set(current); if (e.target.checked) next.add(x.id); else next.delete(x.id); return next })} /><div className="writing-diff"><div><small>{L('修改前', 'Before', '修改前')}</small><BoundedText text={x.before.text} locale={locale} /></div><div><small>{L('修改后', 'After', '修改後')}</small><BoundedText text={x.after.text} locale={locale} /></div></div></div>)}
          </>}
          {tab === 'aliases' && <>
            <div className="writing-form-row"><label>{L('类型', 'Type', '類型')}<select value={aliasKind} onChange={e => setAliasKind(e.target.value as EntityAlias['kind'])}><option value="character">{L('角色', 'Character', '角色')}</option><option value="location">{L('地点', 'Location', '地點')}</option></select></label><label>{L('规范名称', 'Canonical name', '規範名稱')}<input value={canonical} maxLength={1000} onChange={e => setCanonical(e.target.value)} /></label></div>
            <label>{L('别名（每行一个）', 'Aliases (one per line)', '別名（每行一個）')}<textarea value={aliasText} maxLength={10000} rows={3} onChange={e => setAliasText(e.target.value)} /></label>
            <div className="writing-actions"><button onClick={() => act(() => { const next = [...data.aliases.filter(x => x.id !== editingAlias), { id: editingAlias || toolId(), kind: aliasKind, canonical: canonical.trim(), aliases: aliasText.split('\n').map(x => x.trim()).filter(Boolean) }]; validateAliases(next); patch({ aliases: next }); setCanonical(''); setAliasText(''); setEditingAlias('') })}><Plus size={16} />{L('保存别名', 'Save aliases', '儲存別名')}</button></div>
            {shown(data.aliases).map(x => <div className="writing-list-row" key={x.id}><div className="writing-grow"><strong>{x.canonical}</strong><p>{x.aliases.join(' / ')}</p></div><button onClick={() => { setEditingAlias(x.id); setCanonical(x.canonical); setAliasText(x.aliases.join('\n')); setAliasKind(x.kind) }}>{L('编辑', 'Edit', '編輯')}</button>{icon(L('删除', 'Delete', '刪除'), <Trash2 size={16} />, () => remove('aliases', x.id))}</div>)}
            <h4>{L('归并后的角色统计', 'Canonical character counts', '歸併後的角色統計')} ({roleCounts.length})</h4><div className="writing-counts">{roleCounts.map(([name, count]) => <span key={name}>{name}<b>{count}</b></span>)}</div>
          </>}
          {tab === 'tasks' && <>
            <label>{L('关联段落', 'Paragraph', '關聯段落')}{chooseAnchor(anchor, setAnchor)}</label><label>{L('待办事项', 'Task', '待辦事項')}<input maxLength={10000} value={taskText} onChange={e => setTaskText(e.target.value)} /></label><button disabled={!taskText.trim() || !elementsById.has(anchor)} onClick={() => act(() => { patch({ tasks: [...data.tasks, { id: toolId(), elementId: anchor, text: taskText.trim(), done: false }] }); setTaskText('') })}><Plus size={16} />{L('加入待办', 'Add task', '加入待辦')}</button>
            {shown(data.tasks).map(x => <div className="writing-list-row" key={x.id}><input aria-label={L('已完成', 'Done', '已完成')} type="checkbox" checked={x.done} onChange={e => act(() => patch({ tasks: data.tasks.map(t => t.id === x.id ? { ...t, done: e.target.checked } : t) }))} /><div className="writing-grow"><p className={x.done ? 'writing-done' : ''}>{x.text}</p><small>{elementsById.get(x.elementId)?.text.slice(0, 90) ?? statusLabel('missingAnchor')}</small></div>{icon(L('定位', 'Go to source', '定位'), <ArrowRight size={16} />, () => jump(x.elementId), !elementsById.has(x.elementId))}{icon(L('删除', 'Delete', '刪除'), <Trash2 size={16} />, () => remove('tasks', x.id))}</div>)}
            <h4>{L('正文占位标记', 'Placeholders in script', '正文佔位標記')} ({placeholders.length})</h4>{shown(placeholders).map(x => <div className="writing-list-row" key={x.id}><p className="writing-grow">{x.text}</p>{icon(L('定位', 'Go to source', '定位'), <ArrowRight size={16} />, () => jump(x.id))}</div>)}
            <button onClick={() => void run(() => saveText([...data.tasks.map(x => `${x.done ? '[x]' : '[ ]'} ${x.text}\n${elementsById.get(x.elementId)?.text ?? statusLabel('missingAnchor')}`), ...placeholders.map(x => `[ ] ${x.text}`)].join('\n\n'), 'txt', L('改写待办', 'Rewrite Tasks', '改寫待辦')))} disabled={busy}><Download size={16} />{L('导出待办清单', 'Export tasks', '匯出待辦清單')}</button>
          </>}
          {tab === 'cuttings' && <>
            <label>{L('废稿名称', 'Cutting title', '廢稿名稱')}<input maxLength={1000} value={cuttingTitle} onChange={e => setCuttingTitle(e.target.value)} /></label><div className="writing-form-row"><label>{L('收纳范围', 'Capture', '收納範圍')}<select value={cuttingScope} onChange={e => setCuttingScope(e.target.value)}><option value="selected">{L('选中段落 / 当前段落', 'Selected / current paragraph', '選取段落 / 目前段落')}</option><option value="scene">{L('当前整场', 'Current scene', '目前整場')}</option></select></label><label className="writing-check"><input type="checkbox" checked={moveToDrawer} onChange={e => setMoveToDrawer(e.target.checked)} />{L('同时移出正文', 'Also remove from script', '同時移出正文')}</label></div>
            <button onClick={() => act(() => {
              const source = cuttingScope === 'scene' ? sceneRange(project.elements, props.selectedId) : project.elements.filter(x => props.selectedIds.size ? props.selectedIds.has(x.id) : x.id === props.selectedId)
              if (!source.length || data.cuttings.length >= toolLimits.cuttings) throw new WritingToolError('invalidData')
              const ids = new Set(source.map(x => x.id)); const remaining = project.elements.filter(x => !ids.has(x.id))
              commit({ ...project, elements: moveToDrawer ? remaining.length ? remaining : [{ id: toolId(), type: 'action', text: '' }] : project.elements, reviewNotes: moveToDrawer ? project.reviewNotes?.filter(x => !ids.has(x.elementId)) : project.reviewNotes, writingTools: { ...data, cuttings: [...data.cuttings, { id: toolId(), title: cuttingTitle.trim() || source[0].text.slice(0, 70), sourceId: source[0].id, sourceHeading: sceneRange(project.elements, source[0].id)[0]?.text.slice(0, 2000) ?? '', createdAt: new Date().toISOString(), elements: structuredClone(source), reviewNotes: structuredClone(project.reviewNotes?.filter(x => ids.has(x.elementId)) ?? []) }] } }); setCuttingTitle('')
            })}><Scissors size={16} />{L('收纳废稿', 'Save cutting', '收納廢稿')}</button>
            <label>{L('恢复位置：插入在此段落之后', 'Restore after this paragraph', '還原位置：插入在此段落之後')}{chooseAnchor(anchor, setAnchor)}</label>
            {shown(data.cuttings).map(x => <CuttingDetails key={x.id} cutting={x} locale={locale}><div className="writing-actions"><button onClick={() => act(() => commit(restoreCuttingProject(project, x, anchor)))}><Plus size={16} />{L('插入副本', 'Insert copy', '插入副本')}</button>{icon(L('删除废稿', 'Delete cutting', '刪除廢稿'), <Trash2 size={16} />, () => remove('cuttings', x.id))}</div></CuttingDetails>)}
          </>}
          {tab === 'continuity' && <>
            <label>{L('场景', 'Scene', '場景')}{chooseAnchor(sceneId, setSceneId, false, true)}</label><div className="writing-form-row"><label>{L('故事第几天', 'Story day', '故事第幾天')}<input type="number" min={0} max={100000} value={day} onChange={e => setDay(Number(e.target.value))} /></label><label>{L('故事时间', 'Story time', '故事時間')}<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label></div>
            <div className="writing-form-row"><label>{L('人物 / 物品', 'Person / object', '人物 / 物品')}<input maxLength={1000} value={entity} onChange={e => setEntity(e.target.value)} /></label><label>{L('属性', 'Attribute', '屬性')}<input maxLength={1000} value={attribute} onChange={e => setAttribute(e.target.value)} /></label></div><label>{L('状态', 'State', '狀態')}<input maxLength={10000} value={state} onChange={e => setState(e.target.value)} /></label><label className="writing-check"><input type="checkbox" checked={intentional} onChange={e => setIntentional(e.target.checked)} />{L('此处有明确的状态变化', 'Intentional state change here', '此處有明確的狀態變化')}</label>
            <button disabled={!sceneId || !entity.trim() || !attribute.trim() || !state.trim()} onClick={() => act(() => { if (!Number.isInteger(day) || day < 0 || day > 100000) throw new WritingToolError('invalidData'); patch({ continuity: [...data.continuity, { id: toolId(), sceneId, day, time, entity: entity.trim(), attribute: attribute.trim(), state: state.trim(), change: intentional }] }) })}><Plus size={16} />{L('记录状态', 'Record state', '記錄狀態')}</button>
            {shown(data.continuity).map(x => <div className="writing-list-row" key={x.id}><div className="writing-grow"><strong>{x.entity} · {x.attribute}: {x.state}</strong><p>{L('第', 'Day ', '第')}{x.day} {x.time} · {elementsById.get(x.sceneId)?.text ?? statusLabel('missingAnchor')}</p>{warnings.filter(w => w.id === x.id).map(w => <small className="writing-warning" key={w.code}>{statusLabel(w.code)}{w.previous && `: ${w.previous.state} → ${x.state}`}</small>)}</div>{icon(L('定位', 'Go to source', '定位'), <ArrowRight size={16} />, () => jump(x.sceneId), !elementsById.has(x.sceneId))}{icon(L('删除', 'Delete', '刪除'), <Trash2 size={16} />, () => remove('continuity', x.id))}</div>)}
            <button disabled={busy} onClick={() => void run(() => saveText(data.continuity.map(x => `${x.day}\t${x.time}\t${elementsById.get(x.sceneId)?.text ?? statusLabel('missingAnchor')}\t${x.entity}\t${x.attribute}\t${x.state}\t${x.change ? '✓' : ''}`).join('\n'), 'txt', L('连续性台账', 'Continuity Ledger', '連續性臺帳')))}><Download size={16} />{L('导出台账', 'Export ledger', '匯出臺帳')}</button>
          </>}
          {tab === 'links' && <>
            <label>{L('伏笔名称', 'Setup title', '伏筆名稱')}<input maxLength={1000} value={linkTitle} onChange={e => setLinkTitle(e.target.value)} /></label><label>{L('铺垫段落', 'Setup paragraph', '鋪墊段落')}{chooseAnchor(setupId, setSetupId)}</label><label>{L('回收段落', 'Payoff paragraph', '回收段落')}{chooseAnchor(payoffId, setPayoffId, true)}</label><button disabled={!linkTitle.trim() || !elementsById.has(setupId)} onClick={() => act(() => { patch({ storyLinks: [...data.storyLinks.filter(x => x.id !== editingLink), { id: editingLink || toolId(), title: linkTitle.trim(), setupId, payoffId, status: data.storyLinks.find(x => x.id === editingLink)?.status ?? 'open' }] }); setLinkTitle(''); setEditingLink('') })}><Link2 size={16} />{L('保存关联', 'Save link', '儲存關聯')}</button>
            {shown(data.storyLinks).map(x => <div className="writing-link" key={x.id}><div className="writing-list-row"><strong className="writing-grow">{x.title}</strong><label className="writing-check"><input type="checkbox" checked={x.status === 'resolved'} onChange={e => act(() => patch({ storyLinks: data.storyLinks.map(v => v.id === x.id ? { ...v, status: e.target.checked ? 'resolved' : 'open' } : v) }))} />{L('已确认', 'Confirmed', '已確認')}</label>{icon(L('删除', 'Delete', '刪除'), <Trash2 size={16} />, () => remove('storyLinks', x.id))}</div><div className="writing-form-row"><button disabled={!elementsById.has(x.setupId)} onClick={() => jump(x.setupId)}>{L('铺垫', 'Setup', '鋪墊')}: {elementsById.get(x.setupId)?.text.slice(0, 70) ?? statusLabel('missingAnchor')}</button><button disabled={!elementsById.has(x.payoffId)} onClick={() => jump(x.payoffId)}>{L('回收', 'Payoff', '回收')}: {elementsById.get(x.payoffId)?.text.slice(0, 70) ?? statusLabel('missingPayoff')}</button></div><button onClick={() => { setEditingLink(x.id); setLinkTitle(x.title); setSetupId(x.setupId); setPayoffId(x.payoffId); document.querySelector('.writing-tool-panel')?.scrollTo({ top: 0 }); }}>{L('编辑关联', 'Edit link', '編輯關聯')}</button>{linkWarnings.filter(w => w.id === x.id).map(w => <small className="writing-warning" key={w.code}>{statusLabel(w.code)}</small>)}</div>)}
          </>}
          {tab === 'rehearsal' && <>
            <div className="writing-form-row"><label>{L('我的角色', 'My role', '我的角色')}<select value={myRole} onChange={e => { setMyRole(e.target.value); setRevealed(false) }}><option value="">{L('围读全部角色', 'Read all roles', '圍讀全部角色')}</option>{roleCounts.map(([name]) => <option key={name}>{name}</option>)}</select></label><label>{L('其他角色的本机语音', 'Local voice for other roles', '其他角色的本機語音')}<select value={voiceName} onChange={e => setVoiceName(e.target.value)}><option value="">{L('关闭语音', 'Voice off', '關閉語音')}</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label></div>
            <div className="writing-rehearsal" tabIndex={0}><small>{line?.scene}</small><h4>{line?.speaker ?? L('暂无对白', 'No dialogue', '暫無對白')}</h4>{line && <pre>{ownLine && !revealed ? '……' : line.element.text}</pre>}{line && ownLine && !revealed && <button onClick={() => setRevealed(true)}><Eye size={16} />{L('显示台词', 'Reveal line', '顯示臺詞')}</button>}</div>
            <div className="writing-actions">{icon(L('上一句', 'Previous line', '上一句'), <ArrowLeft size={18} />, () => step(-1), lineIndex <= 0)}<span>{lines.length ? lineIndex + 1 : 0} / {lines.length}</span>{icon(L('下一句', 'Next line', '下一句'), <ArrowRight size={18} />, () => step(1), lineIndex >= lines.length - 1)}<button disabled={!lines.length} onClick={() => setRunning(v => !v)}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? L('暂停', 'Pause', '暫停') : L('开始计时', 'Start timer', '開始計時')}</button><output>{Math.floor(elapsed / 60000).toString().padStart(2, '0')}:{Math.floor(elapsed / 1000 % 60).toString().padStart(2, '0')}</output><button onClick={() => { setRunning(false); setElapsed(0); setLineIndex(0); setRevealed(false) }}>{L('重置', 'Reset', '重設')}</button></div>
          </>}
          {tab === 'review' && <>
            <div className="writing-actions"><button disabled={busy} onClick={() => void run(snapshot => saveText(JSON.stringify(makeReviewExchange(snapshot), null, 2), 'ssreview', L('批注', 'Review', '批註')))}><Download size={16} />{L('导出批注文件', 'Export review file', '匯出批註檔案')}</button><button disabled={busy} onClick={() => void run(async snapshot => { if (!window.screenplay) throw new Error('desktop'); const result = await window.screenplay.openTextFile([{ name: L('离线批注', 'Offline review', '離線批註'), extensions: ['ssreview'] }]); if (result.canceled || !result.content) return; if (!live.current.active || live.current.project !== snapshot) throw new WritingToolError('stalePreview'); const imported = parseReviewExchange(result.content); const preview = previewReviewMerge(snapshot, imported); setExchange(imported); setReviewSelection(new Set(preview.filter(x => x.status === 'new').map(x => x.note.id))); return undefined })}><Upload size={16} />{L('导入并核对', 'Import and compare', '匯入並核對')}</button></div>
            {shown(reviewPreview).map(x => <div className="writing-list-row" key={x.note.id}><input aria-label={L('合并此批注', 'Merge this note', '合併此批註')} type="checkbox" disabled={x.status === 'duplicate' || x.status === 'missingAnchor'} checked={reviewSelection.has(x.note.id)} onChange={e => setReviewSelection(current => { const next = new Set(current); if (e.target.checked) next.add(x.note.id); else next.delete(x.note.id); return next })} /><div className="writing-grow"><strong>{x.note.author} · {statusLabel(x.status)}</strong><p>{x.note.text}</p><details><summary>{L('原文与当前上下文', 'Source and current context', '原文與目前上下文')}</summary><BoundedText text={x.anchorText} locale={locale} /><hr /><BoundedText text={elementsById.get(x.note.elementId)?.text ?? statusLabel('missingAnchor')} locale={locale} /></details></div></div>)}
            <button disabled={busy || !exchange || !reviewSelection.size} onClick={() => act(() => { commit(mergeReviewExchange(project, exchange!, reviewSelection)); setReviewSelection(new Set()) })}><Check size={16} />{L('合并选中的批注', 'Merge selected notes', '合併選取的批註')} ({reviewSelection.size})</button>
          </>}
          {tab === 'portable' && <>
            <div className="writing-actions"><button disabled={busy} onClick={() => void run(async snapshot => { if (!window.screenplay) throw new Error('desktop'); const result = await window.screenplay.exportPortableProject({ project: serializeProjectForSave(snapshot), sourcePath: props.filePath, suggestedName: `${safeFileName(snapshot.title)}.sspack` }); if (!live.current.active) return; if (!result.canceled) { setPackageResult(result); return L('项目包已保存。', 'Project package saved.', '專案包已儲存。') } })}><FileArchive size={16} />{L('打包项目与附件', 'Package project and assets', '打包專案與附件')}</button><button disabled={busy} onClick={() => void run(async () => { await props.onImportPortable(); return undefined })}><Upload size={16} />{L('打开项目包', 'Open project package', '打開專案包')}</button></div>
            {packageResult && <div><h4>{L('已打包附件', 'Packaged assets', '已打包附件')}: {packageResult.assetCount ?? 0}</h4>{packageResult.issues?.map((x, i) => <p className="writing-warning" key={i}>{x}</p>)}</div>}
            <h4>{L('字体清单', 'Font inventory', '字型清單')}</h4><ul>{[...new Set([project.fontFamily, ...project.elements.flatMap(x => x.textStyle?.fontFamily ? [x.textStyle.fontFamily] : [])])].map(font => <li key={font}>{font}</li>)}</ul>
          </>}
          {tab === 'privacy' && <>
            {(['identity', 'notes', 'headers', 'paths', 'emails'] as const).map(key => <label className="writing-check" key={key}><input type="checkbox" checked={privacy[key]} onChange={e => { setPrivacy({ ...privacy, [key]: e.target.checked }); setExportConfirmed(false) }} />{{ identity: L('移除作者、联系方式与版权署名', 'Remove author, contact and copyright', '移除作者、聯絡方式與版權署名'), notes: L('不导出批注与备注段落', 'Exclude review notes and note paragraphs', '不匯出批註與備註段落'), headers: L('清空页眉与页脚', 'Clear headers and footers', '清空頁首與頁尾'), paths: L('遮蔽本机路径', 'Redact local paths', '遮蔽本機路徑'), emails: L('遮蔽电子邮箱', 'Redact email addresses', '遮蔽電子郵箱') }[key]}</label>)}
            <h4>{L('正文隐私复核', 'Script privacy check', '正文隱私複核')} ({findings.length})</h4>{shown(findings).map(x => <div className="writing-list-row" key={x.id}><p className="writing-grow">{x.matches.join(' / ')}</p>{icon(L('定位', 'Go to source', '定位'), <ArrowRight size={16} />, () => jump(x.id))}</div>)}
            {todoCount > 0 && <p className="writing-warning">{L('尚有未完成待办或占位标记', 'Unfinished tasks or placeholders', '尚有未完成待辦或佔位標記')}: {todoCount}</p>}
            <label className="writing-check"><input type="checkbox" checked={exportConfirmed} onChange={e => setExportConfirmed(e.target.checked)} />{L('已人工核对正文中的身份信息与未完成内容', 'I checked identities and unfinished content in the script', '已人工核對正文中的身分資訊與未完成內容')}</label>
            <button disabled={busy || !exportConfirmed} onClick={() => void run(async snapshot => await props.onExportPrivate(anonymousProject(snapshot, privacy)) ? L('匿名 PDF 已导出，原稿未修改。', 'Anonymous PDF exported. Original unchanged.', '匿名 PDF 已匯出，原稿未修改。') : undefined)}><Download size={16} />{L('导出匿名 PDF', 'Export anonymous PDF', '匯出匿名 PDF')}</button>
          </>}
          {listCount > visibleCount && <div className="writing-actions"><button onClick={() => setVisibleCount(value => value + 25)}><Plus size={16} />{L('显示更多', 'Show more', '顯示更多')} ({Math.min(visibleCount, listCount)} / {listCount})</button></div>}
        </div>
      </div>
      <footer role="status" aria-live="polite">{busy ? L('正在处理…', 'Working…', '正在處理…') : message || L('本地项目', 'Local project', '本機專案')}</footer>
    </section>
  </div>
}
