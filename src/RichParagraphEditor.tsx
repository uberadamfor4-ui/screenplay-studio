import { useLayoutEffect, useRef, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react'
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, $isElementNode, $isTextNode, createEditor, type LexicalEditor, type LexicalNode } from 'lexical'
import { registerRichText } from '@lexical/rich-text'
import { textSegments, type TextRun } from './textStyles'
import type { ScriptElement } from './types'
import { inputSelection, inputText, selectInputText, paragraphEditors, type ScriptInputElement } from './editorInputs'
import { fontFallbacks, readStoredInlineFont } from './fontFamilies'

const signatureFor = (text: string, runs: ScriptElement['textRuns'], style: CSSProperties) => JSON.stringify([text, runs, style.fontWeight, style.fontStyle, style.textDecoration, style.textAlign])

type Props = {
  element: ScriptElement
  style: CSSProperties
  onChange: (text: string, runs: TextRun[] | undefined) => void
  onFocus: () => void
  onBlur: (event: FocusEvent<ScriptInputElement>) => void
  onKeyDown: (event: KeyboardEvent<ScriptInputElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: (text: string) => void
}

export function RichParagraphEditor(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<LexicalEditor | null>(null)
  const latest = useRef(props)
  latest.current = props
  const syncing = useRef(false)
  const initialized = useRef(false)

  useLayoutEffect(() => {
    const root = rootRef.current!
    initialized.current = false
    const editor = createEditor({ namespace: 'screenplay-paragraph', onError: error => { throw error }, theme: { text: { base: 'rich-text', bold: 'rich-bold', italic: 'rich-italic', underline: 'rich-underline' } } })
    editorRef.current = editor
    paragraphEditors.set(root, editor)
    const unregisterRich = registerRichText(editor)
    const unregister = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      if (!initialized.current || syncing.current || tags.has('project-sync') || (!dirtyElements.size && !dirtyLeaves.size)) return
      editorState.read(() => {
        const text = $getRoot().getTextContent()
        const runs: TextRun[] = []
        let offset = 0
        const visit = (child: LexicalNode) => {
              if ($isTextNode(child)) {
                const size = child.getTextContentSize()
                const fontFamily = readStoredInlineFont(child.getStyle())
                if (size) runs.push({ start: offset, end: offset + size, bold: child.hasFormat('bold'), italic: child.hasFormat('italic'), underline: child.hasFormat('underline'), ...(fontFamily ? { fontFamily } : {}) })
                offset += size
              } else if (child.getType() === 'linebreak') offset++
              else if ($isElementNode(child)) child.getChildren().forEach(visit)
        }
        $getRoot().getChildren().forEach((paragraph, index) => { if (index) offset += 2; visit(paragraph) })
        root.dataset.signature = signatureFor(text, runs.length ? runs : undefined, latest.current.style)
        latest.current.onChange(text, runs.length ? runs : undefined)
      })
    })
    editor.setRootElement(root)
    return () => { unregister(); unregisterRich(); paragraphEditors.delete(root); editor.setRootElement(null); editorRef.current = null }
  }, [])

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || editor.isComposing()) return
    const signature = signatureFor(props.element.text, props.element.textRuns, props.style)
    if (rootRef.current?.dataset.signature === signature) return
    // Parent state is authoritative for undo, recovery, imports, and toolbar changes.
    const selected = rootRef.current ? inputSelection(rootRef.current) : undefined
    const focused = document.activeElement === rootRef.current
    syncing.current = true
    editor.update(() => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.setFormat(props.style.textAlign === 'right' || props.style.textAlign === 'center' ? props.style.textAlign : 'left')
      for (const segment of textSegments(props.element)) {
        segment.text.split('\n').forEach((part, index) => {
          if (index) paragraph.append($createLineBreakNode())
          if (!part) return
          const text = $createTextNode(part)
          const defaults = { bold: props.style.fontWeight === 700, italic: props.style.fontStyle === 'italic', underline: props.style.textDecoration === 'underline' }
          for (const key of ['bold', 'italic', 'underline'] as const) if (segment.style[key] ?? defaults[key]) text.toggleFormat(key)
          if (segment.style.fontFamily) text.setStyle(`--screenplay-font: ${encodeURIComponent(segment.style.fontFamily)}; font-family: ${fontFallbacks(segment.style.fontFamily).map(font => JSON.stringify(font)).join(', ')}`)
          paragraph.append(text)
        })
      }
      root.append(paragraph)
    }, { discrete: true, tag: 'project-sync' })
    rootRef.current!.dataset.signature = signature
    syncing.current = false
    initialized.current = true
    if (focused && selected) selectInputText(rootRef.current!, selected.start, selected.end)
  }, [props.element, props.style])

  return <div ref={rootRef} className="rich-script-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-element-id={props.element.id} style={{ ...props.style, textDecoration: 'none' }}
    onFocus={props.onFocus} onBlur={props.onBlur}
    onKeyDownCapture={event => { props.onKeyDown(event); if (event.defaultPrevented) event.stopPropagation() }}
    onCompositionStart={props.onCompositionStart} onCompositionEnd={() => queueMicrotask(() => { if (rootRef.current) props.onCompositionEnd(inputText(rootRef.current)) })} />
}
