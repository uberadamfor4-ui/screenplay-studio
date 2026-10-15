import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronLeft, Download, FilePlus2, FileText, FolderOpen, MoreHorizontal, Plus, Redo2, Search, Settings2, Trash2, Undo2, X } from 'lucide-react'
import { createDefaultProject } from '../../src/sample'
import { createElement, elementOrder, getElementLabel, getFormat, getScreenplayFontStack, scriptFormats } from '../../src/formats'
import { normalizeScriptProject } from '../../src/projectMigration'
import { serializeProjectForSave } from '../../src/projectSerialization'
import { limitElementText } from '../../src/dataLimits'
import { resolveElementTextStyle } from '../../src/textStyles'
import { buildFdx } from '../../src/fdx'
import { buildPrintHtml } from '../../src/printHtml'
import { renderPngPages } from '../../src/pngExport'
import { assignSequentialSceneNumbers } from '../../src/sceneNumbers'
import { safeFileName } from '../../src/fileNames'
import { resolveExportProject } from '../../src/exportProfiles'
import { hollywoodExamples, hollywoodFormatRules } from '../../src/tutorials'
import { beatSheets } from '../../src/structures'
import type { ScriptElement, ScriptElementType, ScriptProject } from '../../src/types'
import { listRecords, loadRecord, newRecord, readSetting, saveRecord, writeSetting, type MobileRecord } from './storage'
import { parseMobileDocument } from './documents'
import { LocalDocuments, nativeAndroid, openDocument, saveDocument } from './native'
import cjkRegular from '../../src/assets/fonts/ScreenplayCJK-Regular.otf?url'
import cjkBold from '../../src/assets/fonts/ScreenplayCJK-Bold.otf?url'
import appIcon from '../../assets/brand/app-icon-512.png'

type Locale = 'zh-CN' | 'en-US' | 'zh-TW'
type Panel = 'library' | 'more' | 'export' | 'settings' | 'learn' | 'search' | 'paragraph' | 'preview' | undefined
const initial = () => { const project = createDefaultProject(); return { ...project, title: '未命名剧本', elements: [createElement('scene')] } }
const nextType: Record<ScriptElementType, ScriptElementType> = { scene: 'action', action: 'action', character: 'dialogue', parenthetical: 'dialogue', dialogue: 'character', transition: 'scene', shot: 'action', section: 'action', note: 'action' }

function Paragraph({ element, selected, requestFocus, project, label, disabled, onFocus, onEdit, onSplit }: { element: ScriptElement; selected: boolean; requestFocus: boolean; project: ScriptProject; label: string; disabled: boolean; onFocus: () => void; onEdit: (value: string) => void; onSplit: (start: number, end: number) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null), composing = useRef(false), compositionToken = useRef(0)
  const layout = getFormat(project.formatId).elements[element.type]
  const style = resolveElementTextStyle(element, layout, project.fontFamily)
  useLayoutEffect(() => { if (requestFocus) ref.current?.focus({ preventScroll: true }) }, [requestFocus])
  useLayoutEffect(() => {
    const input = ref.current
    if (!input) return
    const resize = () => { input.style.height = '0px'; input.style.height = `${input.scrollHeight}px` }
    resize()
    document.fonts.addEventListener('loadingdone', resize)
    let width = input.clientWidth
    const observer = new ResizeObserver(() => {
      if (input.isConnected && input.clientWidth > 0 && input.clientWidth !== width) { width = input.clientWidth; resize() }
    })
    observer.observe(input)
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', resize) }
  }, [element.text, selected, style.fontFamily, style.bold, style.italic, project.language, project.formatId])
  const width = element.type === 'dialogue' ? 0.76 : element.type === 'parenthetical' ? 0.66 : element.type === 'character' ? 0.66 : 1
  const left = element.type === 'transition' ? 0 : element.type === 'character' ? 0.28 : element.type === 'dialogue' ? 0.12 : element.type === 'parenthetical' ? 0.2 : 0
  return <div className={`paragraph ${selected ? 'selected' : ''}`} data-element-id={element.id} data-type={element.type} style={{ paddingLeft: `${left * 100}%`, paddingRight: `${Math.max(0, 1 - width - left) * 100}%` }}>
    <span className="paragraph-label" aria-hidden="true">{selected ? label : element.sceneNumber || '\u00a0'}</span>
    <textarea ref={ref} data-testid="paragraph" aria-label={label} value={element.text} placeholder={label} readOnly={disabled} rows={1} spellCheck={false} autoCapitalize="sentences" onFocus={onFocus}
      style={{ textAlign: layout.align, fontFamily: getScreenplayFontStack(style.fontFamily, getFormat(project.formatId), project.language, Boolean(style.fontFamilyOverride)), fontWeight: style.bold ? 700 : 400, fontStyle: style.italic ? 'italic' : 'normal', textDecoration: style.underline ? 'underline' : 'none' }}
      onChange={event => { onEdit(limitElementText(event.target.value).text); event.target.style.height = '0px'; event.target.style.height = `${event.target.scrollHeight}px` }}
      onCompositionStart={() => { compositionToken.current++; composing.current = true }} onCompositionEnd={event => { onEdit(limitElementText(event.currentTarget.value).text); const token = ++compositionToken.current; requestAnimationFrame(() => { if (compositionToken.current === token) composing.current = false }) }}
      onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); onSplit(event.currentTarget.selectionStart, event.currentTarget.selectionEnd) } }} />
  </div>
}

function IconButton({ title, children, onClick, disabled = false, pressed }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button type="button" className="icon-button" title={title} aria-label={title} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button>
}

export default function MobileApp() {
  const [record, setRecord] = useState<MobileRecord>(() => newRecord(initial()))
  const live = useRef(record), saved = useRef<ScriptProject | undefined>(undefined), busyRef = useRef(false)
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [locale, setLocale] = useState<Locale>('zh-CN')
  const [panel, setPanel] = useState<Panel>(), [selected, setSelected] = useState(record.project.elements[0].id)
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [library, setLibrary] = useState<MobileRecord[]>([])
  const [undo, setUndo] = useState<ScriptProject[]>([]), [redo, setRedo] = useState<ScriptProject[]>([])
  const undoRef = useRef<ScriptProject[]>([]), redoRef = useRef<ScriptProject[]>([]), coalesce = useRef({ id: '', time: 0 })
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState(''), [preview, setPreview] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const virtuoso = useRef<VirtuosoHandle>(null), editor = useRef<HTMLDivElement>(null), pendingFocus = useRef<string | undefined>(undefined)
  const t = (cn: string, en: string, tw: string) => locale === 'en-US' ? en : locale === 'zh-TW' ? tw : cn
  const project = record.project, active = project.elements.find(element => element.id === selected) ?? project.elements[0]
  const install = useCallback((next: MobileRecord) => { live.current = next; setRecord(next) }, [])
  const report = (value: unknown) => setError(value instanceof Error ? value.message : String(value))

  const persist = useCallback(async () => {
    const snapshot = live.current
    if (saved.current === snapshot.project) return
    let result: MobileRecord
    try { result = await saveRecord(snapshot) }
    catch (value) { if (nativeAndroid) await LocalDocuments.saveRecovery({ content: JSON.stringify(snapshot) }).catch(() => undefined); throw value }
    if (live.current.id === snapshot.id && live.current.project === snapshot.project) { saved.current = snapshot.project; live.current = { ...live.current, revision: result.revision }; setStatus('saved') }
    if (nativeAndroid) await LocalDocuments.saveRecovery({ content: JSON.stringify(result) })
  }, [])

  useEffect(() => {
    let alive = true, recoveryContent: string | undefined
    void (async () => {
      if (nativeAndroid) recoveryContent = (await LocalDocuments.loadRecovery().catch(value => { if (alive) report(value); return { content: undefined } })).content
      const preferred = await readSetting<Locale>('locale')
      const id = await readSetting<string>('active')
      let current = id ? await loadRecord(id) : undefined
      if (current?.deletedAt) current = undefined
      if (nativeAndroid) {
        const content = recoveryContent
        if (content) {
          try {
            const raw = JSON.parse(content) as MobileRecord
            if (typeof raw.id === 'string' && typeof raw.updatedAt === 'string' && !raw.deletedAt) {
              const existing = await loadRecord(raw.id)
              if (!existing || !existing.deletedAt && raw.updatedAt > existing.updatedAt) {
                const recovery = { ...raw, project: normalizeScriptProject(raw.project), revision: existing?.revision ?? 0 }
                current = await saveRecord(recovery)
              }
            }
          } catch (value) { if (!(value instanceof SyntaxError)) throw value }
        }
      }
      current ??= await saveRecord(live.current)
      if (!alive) return
      if (preferred && ['zh-CN', 'en-US', 'zh-TW'].includes(preferred)) setLocale(preferred)
      install(current); saved.current = current.project; setSelected(current.project.elements[0].id); setReady(true); setStatus('saved')
    })().catch(value => {
      if (!alive) return
      if (recoveryContent) {
        try { const restored = newRecord(normalizeScriptProject(JSON.parse(recoveryContent).project)); install(restored); setSelected(restored.project.elements[0].id); saved.current = undefined }
        catch { /* Keep the library and recovery file untouched when the recovery payload is invalid. */ }
      }
      report(value); setReady(true)
    })
    return () => { alive = false }
  }, [install])

  useEffect(() => {
    if (!ready || saved.current === project) return
    setStatus('pending')
    const timeout = setTimeout(() => { void persist().catch(report) }, 700)
    return () => clearTimeout(timeout)
  }, [project, ready, persist])
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden' && ready) void persist().catch(report) }
    document.addEventListener('visibilitychange', hidden)
    const resized = () => { document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height ?? window.innerHeight}px`) }
    window.visualViewport?.addEventListener('resize', resized); window.addEventListener('resize', resized); resized()
    return () => { document.removeEventListener('visibilitychange', hidden); window.visualViewport?.removeEventListener('resize', resized); window.removeEventListener('resize', resized) }
  }, [persist, ready])
  useEffect(() => { if (!panel) { setDeleteConfirm(false); setPreview('') } }, [panel])
  useEffect(() => {
    const back = () => { if (busyRef.current) return; if (panel) setPanel(undefined); else void run(async () => { if (nativeAndroid) await LocalDocuments.backgroundApp() }) }
    window.addEventListener('android-back', back)
    return () => window.removeEventListener('android-back', back)
  })
  useEffect(() => {
    if (!panel) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    document.querySelector<HTMLButtonElement>('.sheet-header button')?.focus()
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [panel])
  useEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    const index = project.elements.findIndex(element => element.id === id)
    if (index < 0 || panel || selected !== id) { pendingFocus.current = undefined; return }
    let canceled = false, attempts = 0, stable = 0
    const focusReady = () => {
      if (canceled || pendingFocus.current !== id) return
      const input = editor.current?.querySelector<HTMLTextAreaElement>(`[data-element-id="${id}"] textarea`)
      if (input) {
        if (document.activeElement !== input) { input.focus({ preventScroll: true }); input.setSelectionRange(0, 0) }
        setTimeout(() => {
          if (canceled || pendingFocus.current !== id) return
          stable = input.isConnected && document.activeElement === input && document.fonts.status === 'loaded' ? stable + 1 : 0
          if (stable >= 3) pendingFocus.current = undefined
          else if (++attempts < 15) focusReady()
        }, 100)
      }
      else if (++attempts < 15) { virtuoso.current?.scrollToIndex({ index, align: 'center' }); setTimeout(focusReady, 60) }
    }
    const timer = setTimeout(() => { virtuoso.current?.scrollToIndex({ index, align: 'center' }); setTimeout(focusReady, 60) }, 0)
    return () => { canceled = true; clearTimeout(timer) }
  }, [project.elements, selected, panel])

  function history(next: ScriptProject, textId = '') {
    if (live.current.project.productionLock?.enabled) { report(t('锁页项目在安卓端仅供阅读和导出，请使用桌面版修改。', 'Locked projects are read-only on Android. Edit them on desktop.', '鎖頁專案在安卓端僅供閱讀與匯出，請使用桌面版修改。')); return }
    const now = Date.now(), previous = live.current.project
    if (!textId || coalesce.current.id !== textId || now - coalesce.current.time > 800) undoRef.current = [...undoRef.current.slice(-39), previous]
    coalesce.current = { id: textId, time: now }; redoRef.current = []; setUndo(undoRef.current); setRedo([])
    install({ ...live.current, project: next, updatedAt: new Date().toISOString() }); setStatus('pending')
  }
  function editElement(id: string, patch: Partial<ScriptElement>, typing = false) {
    if (busyRef.current) return
    if (pendingFocus.current === id) pendingFocus.current = undefined
    history({ ...live.current.project, elements: live.current.project.elements.map(element => element.id === id ? { ...element, ...patch } : element) }, typing ? id : '')
  }
  function focus(id: string) {
    pendingFocus.current = id
    setSelected(id)
  }
  function insert(start?: number, end?: number) {
    if (busyRef.current) return
    if (live.current.project.productionLock?.enabled) { report(t('锁页项目在安卓端只读，请在桌面版修改。', 'Locked projects are read-only on Android.', '鎖頁專案在安卓端唯讀，請在桌面版修改。')); return }
    const copy = live.current.project, index = copy.elements.findIndex(element => element.id === selected), source = copy.elements[Math.max(0, index)]
    if (copy.elements.length >= 5000) { report(t('已达到 5000 段落上限，请拆分项目。', 'Split the project before adding more than 5,000 paragraphs.', '已達到 5000 段落上限，請拆分專案。')); return }
    const added = createElement(nextType[source.type], start === undefined ? '' : source.text.slice(end ?? start))
    const elements = [...copy.elements]; if (start !== undefined) elements[Math.max(index, 0)] = { ...source, text: source.text.slice(0, start) }
    elements.splice(Math.max(index, 0) + 1, 0, added); history({ ...copy, elements }); focus(added.id)
  }
  function travelHistory(back: boolean) {
    const from = back ? undoRef : redoRef, to = back ? redoRef : undoRef
    const next = from.current.at(-1); if (!next || busyRef.current) return
    to.current = [...to.current.slice(-39), live.current.project]; from.current = from.current.slice(0, -1); coalesce.current = { id: '', time: 0 }
    setUndo(undoRef.current); setRedo(redoRef.current); install({ ...live.current, project: next, updatedAt: new Date().toISOString() })
    if (!next.elements.some(element => element.id === selected)) setSelected(next.elements[0].id)
  }
  async function run(action: () => Promise<void>, persistFirst = true) {
    if (busyRef.current || !ready) return
    pendingFocus.current = undefined
    busyRef.current = true; setBusy(true); setError('')
    try { if (persistFirst) await persist(); await action() } catch (value) { report(value) }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function activate(next: MobileRecord) {
    const stored = await saveRecord(next)
    install(stored); saved.current = stored.project; setSelected(stored.project.elements[0].id); undoRef.current = []; redoRef.current = []; setUndo([]); setRedo([]); setStatus('saved'); setPanel(undefined)
    if (nativeAndroid) await LocalDocuments.saveRecovery({ content: JSON.stringify(stored) })
  }
  async function importFile() {
    const file = await openDocument(); if (!file) return
    await activate(newRecord(await parseMobileDocument(file.name, file.bytes)))
  }
  async function exportFile(kind: 'ssproj' | 'fdx' | 'txt' | 'pdf' | 'png') {
    const copy = live.current.project, name = safeFileName(copy.title)
    if ((kind === 'pdf' || kind === 'png') && !copy.elements.some(element => element.text.trim())) throw new Error(t('请先输入正文，再导出 PDF 或 PNG。', 'Write some script text before exporting PDF or PNG.', '請先輸入正文，再匯出 PDF 或 PNG。'))
    if (kind === 'pdf') {
      if (!nativeAndroid) { setPreview(await printHtml(copy)); setPanel('preview'); return }
      const result = await LocalDocuments.exportPdf({ name: `${name}.pdf`, html: await printHtml(copy), a4: resolveExportProject(copy).project.pageSize === 'a4' })
      if (!result.canceled) setStatus(result.openedPrintDialog ? 'print' : 'exported')
    } else if (kind === 'png') {
      if (!nativeAndroid) { await renderPngPages(copy, getFormat(copy.formatId), async page => { const response = await fetch(page.dataUrl); await saveDocument(page.name, 'image/png', new Uint8Array(await response.arrayBuffer())) }); return }
      const result = await LocalDocuments.choosePngFolder(); if (result.canceled || !result.token) return
      try { await renderPngPages(copy, getFormat(copy.formatId), async page => { await LocalDocuments.writePngPage({ token: result.token!, name: page.name, data: page.dataUrl.split(',')[1] }) }); setStatus('exported') }
      finally { await LocalDocuments.finishPngFolder({ token: result.token }) }
    } else {
      const content = kind === 'ssproj' ? serializeProjectForSave(copy) : kind === 'fdx' ? buildFdx(copy) : copy.elements.map(element => element.text).join('\n\n')
      const result = await saveDocument(`${name}.${kind}`, kind === 'ssproj' ? 'application/json' : kind === 'fdx' ? 'application/xml' : 'text/plain', new TextEncoder().encode(content))
      if (!result.canceled) setStatus('exported')
    }
  }
  async function printHtml(copy: ScriptProject) {
    const html = await buildPrintHtml(copy, getFormat(copy.formatId))
    return html.replaceAll('{{SCREENPLAY_CJK_REGULAR_FONT_URL}}', new URL(cjkRegular, location.href).href).replaceAll('{{SCREENPLAY_CJK_BOLD_FONT_URL}}', new URL(cjkBold, location.href).href)
  }
  function show(next: Panel) { if (next === 'paragraph' && live.current.project.productionLock?.enabled) { report(t('锁页项目在安卓端只读，请在桌面版修改。', 'Locked projects are read-only on Android.', '鎖頁專案在安卓端唯讀，請在桌面版修改。')); return } if (!busyRef.current) { setPanel(next); setDeleteConfirm(false); if (next === 'library') void listRecords().then(setLibrary).catch(report) } }
  const button = (icon: ReactNode, title: string, action: () => void, disabled = false) => <button key={title} className="command" disabled={disabled || busy} onClick={action}>{icon}<span>{title}</span></button>
  const panelTitle = panel === 'library' ? t('本地剧本', 'Local scripts', '本機劇本') : panel === 'export' ? t('导出', 'Export', '匯出') : panel === 'settings' ? t('偏好与项目', 'Preferences & project', '偏好與專案') : panel === 'learn' ? t('教学中心', 'Learning center', '教學中心') : panel === 'search' ? t('查找与替换', 'Find & replace', '尋找與取代') : panel === 'paragraph' ? t('当前段落', 'Paragraph', '目前段落') : panel === 'preview' ? t('分页预览', 'Page preview', '分頁預覽') : t('功能', 'Tools', '功能')
  const matching = query ? project.elements.filter(element => element.text.includes(query)) : []
  const characters = Array.from(new Set(project.elements.filter(element => element.type === 'character').map(element => element.text.trim()).filter(Boolean)))
  const placeholder = t('内景 / 外景 · 地点 · 时间', 'INT. / EXT. · LOCATION · TIME', '內景 / 外景 · 地點 · 時間')

  return <main className="mobile-app" aria-busy={busy}>
    <header className="topbar"><img src={appIcon} width="32" height="32" alt="" /><div className="document-title"><strong>{project.title}</strong><span role="status">{busy ? t('处理中…', 'Working…', '處理中…') : status === 'saved' ? t('已存至本机', 'Saved on device', '已存至本機') : status === 'print' ? t('系统打印：另存为 PDF', 'System print: Save as PDF', '系統列印：另存為 PDF') : status === 'exported' ? t('已导出', 'Exported', '已匯出') : t('保存中…', 'Saving…', '儲存中…')}</span></div>
      <IconButton title={t('本地剧本', 'Local scripts', '本機劇本')} onClick={() => show('library')} disabled={busy || !ready}><FolderOpen /></IconButton>
      <IconButton title={t('导出 PDF', 'Export PDF', '匯出 PDF')} onClick={() => void run(() => exportFile('pdf'), false)} disabled={busy || !ready}><FileText /></IconButton>
      <IconButton title={t('功能', 'Tools', '功能')} onClick={() => show('more')} disabled={busy || !ready}><MoreHorizontal /></IconButton></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><IconButton title={t('关闭提示', 'Dismiss', '關閉提示')} onClick={() => setError('')}><X /></IconButton></div>}
    <div className="writing-surface" ref={editor} onKeyDown={event => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.nativeEvent.isComposing || event.keyCode === 229) return
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') { event.preventDefault(); travelHistory(key === 'z' && !event.shiftKey) }
      else if (key === 's') { event.preventDefault(); void run(async () => undefined) }
    }}>
      <Virtuoso ref={virtuoso} data={project.elements} computeItemKey={(_, element) => element.id} increaseViewportBy={500} itemContent={(_, element) => <Paragraph element={element} selected={selected === element.id} requestFocus={pendingFocus.current === element.id && selected === element.id} project={project} disabled={!ready || busy || Boolean(project.productionLock?.enabled)} label={element.type === 'scene' && !element.text ? placeholder : getElementLabel(element.type, locale)} onFocus={() => setSelected(element.id)} onEdit={text => editElement(element.id, { text }, true)} onSplit={(start, end) => insert(start, end)} />}
        components={{ Footer: () => <div className="paper-end" /> }} />
    </div>
    <footer className="writing-toolbar"><select aria-label={t('段落类型', 'Paragraph type', '段落類型')} value={active.type} disabled={busy || !ready} onChange={event => editElement(active.id, { type: event.target.value as ScriptElementType })}>{elementOrder.map(type => <option value={type} key={type}>{getElementLabel(type, locale)}</option>)}</select>
      <IconButton title={t('撤销', 'Undo', '復原')} onClick={() => travelHistory(true)} disabled={busy || !undo.length}><Undo2 /></IconButton>
      <IconButton title={t('重做', 'Redo', '重做')} onClick={() => travelHistory(false)} disabled={busy || !redo.length}><Redo2 /></IconButton>
      <IconButton title={t('段落选项', 'Paragraph options', '段落選項')} onClick={() => show('paragraph')} disabled={busy || !ready}><Settings2 /></IconButton>
      <IconButton title={t('下一段', 'Next paragraph', '下一段')} onClick={() => insert()} disabled={busy || !ready}><Plus /></IconButton></footer>

    {panel && <div className="modal-shade" onClick={event => { if (event.target === event.currentTarget && !busy) setPanel(undefined) }}><section className={`sheet ${panel === 'preview' ? 'preview-sheet' : ''}`} role="dialog" aria-modal="true" aria-label={panelTitle} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) setPanel(undefined)
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, iframe')).filter(control => control.offsetParent !== null)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <header className="sheet-header"><h1>{panelTitle}</h1><IconButton title={t('返回写作', 'Back to writing', '返回寫作')} onClick={() => setPanel(undefined)} disabled={busy}><X /></IconButton></header>
      <div className="sheet-content">
        {panel === 'more' && <><div className="command-grid">
          {button(<Download />, t('导出文件', 'Export files', '匯出檔案'), () => show('export'))}
          {button(<BookOpen />, t('教学中心', 'Learning center', '教學中心'), () => show('learn'))}
          {button(<Search />, t('查找与替换', 'Find & replace', '尋找與取代'), () => show('search'))}
          {button(<Settings2 />, t('偏好与项目', 'Preferences & project', '偏好與專案'), () => show('settings'))}
          {button(<FileText />, t('分页预览', 'Page preview', '分頁預覽'), () => void run(async () => { setPreview(await printHtml(live.current.project)); setPanel('preview') }, false))}
        </div><p className="quiet">{t('安卓写作版 0.1.1 · 项目兼容桌面版 0.7.2', 'Android Writing Edition 0.1.1 · Desktop project format 0.7.2', '安卓寫作版 0.1.1 · 專案相容桌面版 0.7.2')}</p><p className="quiet">本软件由1037 Film 郭之然独立开发完成</p></>}
        {panel === 'library' && <><div className="command-grid">{button(<FilePlus2 />, t('新建剧本', 'New script', '新增劇本'), () => void run(() => activate(newRecord(initial()))))}{button(<FolderOpen />, t('导入文件', 'Import file', '匯入檔案'), () => void run(importFile))}</div>
          {library.map(item => <div className="library-row" key={item.id}><button disabled={busy} onClick={() => void run(async () => { const fresh = await loadRecord(item.id); if (!fresh) return; await activate({ ...fresh, deletedAt: undefined }) })}><strong>{item.project.title}</strong><small>{item.deletedAt ? t('回收站 · 点击恢复', 'Trash · tap to restore', '資源回收筒 · 點選還原') : new Date(item.updatedAt).toLocaleString(locale)}</small></button>{!item.deletedAt && <IconButton title={t('移入回收站', 'Move to trash', '移至資源回收筒')} disabled={busy} onClick={() => void run(async () => { const fresh = await loadRecord(item.id); if (!fresh) return; await saveRecord({ ...fresh, deletedAt: new Date().toISOString() }); if (live.current.id === item.id) await activate(newRecord(initial())); setLibrary(await listRecords()); setPanel('library') })}><Trash2 /></IconButton>}</div>)}
          <p className="quiet">{t('本地项目会自动保存；重要稿件请另存 SSProj 备份。卸载应用会删除应用内数据。导入不会覆盖当前项目。', 'Local projects autosave. Export SSProj backups for important drafts. Uninstalling removes app data. Imports create a separate project.', '本機專案會自動儲存；重要稿件請另存 SSProj 備份。解除安裝會刪除應用程式內資料。匯入不會覆蓋目前專案。')}</p></>}
        {panel === 'export' && <div className="command-grid">{(['pdf', 'png', 'ssproj', 'fdx', 'txt'] as const).map(kind => <button className="command" disabled={busy} key={kind} onClick={() => void run(() => exportFile(kind), false)}><Download /><span>{kind.toUpperCase()}</span></button>)}</div>}
        {panel === 'settings' && <div className="form-fields">
          <label>{t('界面语言', 'Interface language', '介面語言')}<select value={locale} onChange={event => { const value = event.target.value as Locale; setLocale(value); void writeSetting('locale', value).catch(report) }}><option value="zh-CN">简体中文</option><option value="en-US">English</option><option value="zh-TW">繁體中文</option></select></label>
          <label>{t('剧本名称', 'Script title', '劇本名稱')}<input value={project.title} maxLength={200} disabled={busy} onChange={event => history({ ...project, title: event.target.value, titlePage: project.titlePage ? { ...project.titlePage, title: event.target.value } : undefined })} /></label>
          <label>{t('作者', 'Author', '作者')}<input value={project.author} maxLength={200} disabled={busy} onChange={event => history({ ...project, author: event.target.value, titlePage: project.titlePage ? { ...project.titlePage, authors: event.target.value } : undefined })} /></label>
          <label>{t('剧本格式', 'Script format', '劇本格式')}<select value={project.formatId} disabled={busy} onChange={event => { const format = getFormat(event.target.value as ScriptProject['formatId']); history({ ...project, formatId: format.id, pageSize: format.page.kind, fontFamily: format.defaultFont, fontSize: format.defaultFontSize, exportSettings: { ...createDefaultProject().exportSettings!, ...project.exportSettings, profileId: 'custom' } }) }}>{scriptFormats.map(format => <option value={format.id} key={format.id}>{format.labels[locale]}</option>)}</select></label>
          <label>{t('剧本语言', 'Script language', '劇本語言')}<select value={project.language} disabled={busy} onChange={event => history({ ...project, language: event.target.value as ScriptProject['language'] })}><option value="zh-CN">简体中文</option><option value="en-US">English</option><option value="zh-TW">繁體中文</option><option value="ja-JP">日本語</option><option value="ko-KR">한국어</option></select></label>
          <label>{t('纸张', 'Paper', '紙張')}<select value={resolveExportProject(project).project.pageSize} disabled={busy} onChange={event => history({ ...project, pageSize: event.target.value as ScriptProject['pageSize'], exportSettings: { ...createDefaultProject().exportSettings!, ...project.exportSettings, profileId: 'custom' } })}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
          <label className="check-row"><input type="checkbox" checked={project.exportSettings?.includeTitlePage ?? false} disabled={busy} onChange={event => history({ ...project, exportSettings: { ...createDefaultProject().exportSettings!, ...project.exportSettings, includeTitlePage: event.target.checked } })} />{t('导出包含标题页', 'Include title page', '匯出包含標題頁')}</label>
          <p className="quiet">{t('手机使用重排编辑；分页预览及导出使用桌面版排版引擎。制片、锁页、双栏对白等高级项目应继续在桌面版编辑，相关数据会保留。', 'The mobile editor reflows text; preview and export use the desktop layout engine. Use the desktop app for production workflows, locked pages and dual dialogue. Their project data is preserved.', '手機使用重排編輯；分頁預覽及匯出使用桌面版排版引擎。製片、鎖頁、雙欄對白等進階專案應繼續在桌面版編輯，相關資料會保留。')}</p>
        </div>}
        {panel === 'paragraph' && <><div className="segmented">{(['bold', 'italic', 'underline'] as const).map((key, index) => <button className={key} aria-pressed={resolveElementTextStyle(active, getFormat(project.formatId).elements[active.type], project.fontFamily)[key]} key={key} disabled={busy} onClick={() => editElement(active.id, { textStyle: { ...active.textStyle, [key]: !resolveElementTextStyle(active, getFormat(project.formatId).elements[active.type], project.fontFamily)[key] } })}>{['B', 'I', 'U'][index]}</button>)}</div>
          <label className="field-label">{t('段落字体', 'Paragraph font', '段落字型')}<select value={active.textStyle?.fontFamily ?? ''} disabled={busy} onChange={event => editElement(active.id, { textStyle: { ...active.textStyle, fontFamily: event.target.value || undefined } })}>{[...new Set(['', active.textStyle?.fontFamily ?? '', 'Courier Prime', 'Screenplay CJK', 'sans-serif', 'serif', 'monospace'])].map(font => <option key={font} value={font}>{font || t('项目默认', 'Project default', '專案預設')}</option>)}</select></label>
          <div className="command-grid">{[-1, 1].map(direction => button(direction < 0 ? <ArrowUp /> : <ArrowDown />, direction < 0 ? t('上移', 'Move up', '上移') : t('下移', 'Move down', '下移'), () => { const elements = [...project.elements], index = elements.findIndex(element => element.id === active.id), next = index + direction; if (next < 0 || next >= elements.length) return; [elements[index], elements[next]] = [elements[next], elements[index]]; history({ ...project, elements }) }, project.elements.findIndex(element => element.id === active.id) + direction < 0 || project.elements.findIndex(element => element.id === active.id) + direction >= project.elements.length))}</div>
          <button className="danger command" disabled={busy} onClick={() => setDeleteConfirm(true)}><Trash2 />{t('删除此段', 'Delete paragraph', '刪除此段')}</button>
          {deleteConfirm && <div className="confirm-row"><span>{t('可通过撤销恢复。确认删除？', 'Undo can restore it. Delete?', '可透過復原還原。確認刪除？')}</span><button disabled={busy} onClick={() => { const elements = project.elements.filter(element => element.id !== active.id); if (!elements.length) elements.push(createElement('action')); history({ ...project, elements }); setSelected(elements[0].id); setPanel(undefined) }}>{t('删除', 'Delete', '刪除')}</button><button onClick={() => setDeleteConfirm(false)}>{t('取消', 'Cancel', '取消')}</button></div>}</>}
        {panel === 'search' && <><div className="form-fields"><label>{t('查找文字', 'Find text', '尋找文字')}<input value={query} maxLength={1000} onChange={event => setQuery(event.target.value)} /></label><label>{t('替换为', 'Replace with', '取代為')}<input value={replacement} maxLength={1000} onChange={event => setReplacement(event.target.value)} /></label></div><p>{t('匹配段落', 'Matching paragraphs', '符合段落')}：{matching.length}</p>
          <button className="primary" disabled={!matching.length || busy} onClick={() => { const elements = project.elements.map(element => ({ ...element, text: element.text.split(query).join(replacement) })); if (elements.some(element => element.text.length > 250000)) { report(t('替换后段落过长。', 'Replacement would exceed paragraph size limits.', '取代後段落過長。')); return } history({ ...project, elements }); setStatus('pending') }}>{t('全部替换（可撤销）', 'Replace all (undoable)', '全部取代（可復原）')}</button>
          <h2>{t('角色', 'Characters', '角色')} · {characters.length}</h2><p>{characters.join('、') || '—'}</p>
          <button disabled={busy || project.productionLock?.enabled} onClick={() => { history({ ...project, elements: assignSequentialSceneNumbers(project.elements).elements, exportSettings: { ...createDefaultProject().exportSettings!, ...project.exportSettings, sceneNumbers: true } }) }}>{t('添加连续场序', 'Number scenes sequentially', '新增連續場序')}</button>
          {project.productionLock?.enabled && <p className="quiet">{t('已锁定项目请在桌面版修改场序。', 'Edit locked scene numbers on desktop.', '已鎖定專案請在桌面版修改場序。')}</p>}</>}
        {panel === 'learn' && <><h2>{t('第一次写剧本', 'Your first script', '第一次寫劇本')}</h2><ol><li>{t('场景写清内外景、地点和时间，例如：内景 咖啡馆 - 日。', 'Start with INT. or EXT., a location and time, e.g. INT. CAFE - DAY.', '場景寫清內外景、地點和時間，例如：內景 咖啡館 - 日。')}</li><li>{t('动作只写观众能看到、听到的内容；角色名单独成段，下一段写对白。', 'Action describes what we see and hear. Put character names and dialogue in separate paragraph types.', '動作只寫觀眾能看到、聽到的內容；角色名獨立成段，下一段寫對白。')}</li><li>{t('工具栏选择段落类型，点加号接着写；通过导出保留项目备份。', 'Choose paragraph types in the toolbar and tap + to continue. Export project backups.', '工具列選擇段落類型，點加號接著寫；透過匯出保留專案備份。')}</li></ol>
          <h2>{t('结构提示', 'Story structure', '結構提示')}</h2>{beatSheets.map(sheet => <details key={sheet.id}><summary>{sheet.title[locale]}</summary><ol>{sheet.beats[locale].map(beat => <li key={beat}>{beat}</li>)}</ol></details>)}
          <h2>{t('10 个好莱坞示例', '10 Hollywood examples (Chinese)', '10 個好萊塢示例（簡體原文）')}</h2>{hollywoodExamples.map(example => <details key={example.id}><summary>{example.title}</summary><p>{example.summary}</p><pre>{example.elements.map(element => element.text).join('\n\n')}</pre><button disabled={busy} onClick={() => void run(async () => { const fresh = createDefaultProject(); await activate(newRecord({ ...fresh, title: example.title, elements: example.elements.map(element => createElement(element.type, element.text)) })) })}>{t('以新项目练习', 'Practice in a new project', '以新專案練習')}</button></details>)}
          <h2>{t('格式参考', 'Format reference (Chinese)', '格式參考（簡體原文）')}</h2>{hollywoodFormatRules.map(rule => <details key={rule.id}><summary>{rule.title}</summary><p>{rule.detail}</p><p>{rule.recommended}</p></details>)}</>}
        {panel === 'preview' && <iframe title={panelTitle} className="page-preview" sandbox="allow-same-origin" srcDoc={preview} />}
      </div>
    </section></div>}
    {!ready && <div className="opening" role="status"><Check />{t('正在打开本地项目…', 'Opening local project…', '正在開啟本機專案…')}</div>}
  </main>
}
