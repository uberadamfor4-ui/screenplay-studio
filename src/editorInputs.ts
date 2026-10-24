import { $createRangeSelection, $createRangeSelectionFromDom, $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, $setSelection, type LexicalEditor, type LexicalNode } from 'lexical'
import { escapeCssAttributeValue } from './domSelectors'

export type ScriptInputElement = HTMLTextAreaElement | HTMLDivElement
export const paragraphEditors = new WeakMap<HTMLElement, LexicalEditor>()

export function findScriptInput(id: string) {
  const value = escapeCssAttributeValue(id)
  return document.querySelector<ScriptInputElement>(`textarea[data-element-id="${value}"], .rich-script-editor[data-element-id="${value}"]`) ?? undefined
}

export function inputText(node: ScriptInputElement) {
  if (node instanceof HTMLTextAreaElement) return node.value
  return paragraphEditors.get(node)?.getEditorState().read(() => $getRoot().getTextContent()) ?? node.textContent ?? ''
}

export function inputSelection(node: ScriptInputElement): { start: number; end: number } {
  if (node instanceof HTMLTextAreaElement) return { start: node.selectionStart, end: node.selectionEnd }
  const editor = paragraphEditors.get(node)
  return editor?.getEditorState().read(() => {
    const dom = node.ownerDocument.getSelection()
    const live = dom?.anchorNode && dom.focusNode && node.contains(dom.anchorNode) && node.contains(dom.focusNode)
      ? $createRangeSelectionFromDom(dom, editor) : undefined
    const selected = live ?? $getSelection()
    if (!$isRangeSelection(selected)) return { start: 0, end: 0 }
    const index = editorTextIndex()
    const at = (point: { key: string; offset: number; type: 'text' | 'element' }) => {
      const item = index.nodes.get(point.key)
      if (!item) return 0
      return point.type === 'text' ? item.start + point.offset : item.boundaries?.[point.offset] ?? item.start
    }
    const a = at(selected.anchor), b = at(selected.focus)
    return { start: Math.min(a, b), end: Math.max(a, b) }
  }) ?? { start: 0, end: 0 }
}

export function selectInputText(node: ScriptInputElement, start: number, end: number) {
  if (node instanceof HTMLTextAreaElement) { node.setSelectionRange(start, end); return }
  paragraphEditors.get(node)?.update(() => {
    const a = textPointAtOffset(start), b = textPointAtOffset(end)
    const selected = $createRangeSelection()
    selected.anchor.set(a.key, a.offset, a.type)
    selected.focus.set(b.key, b.offset, b.type)
    $setSelection(selected)
  }, { discrete: true, tag: 'selection-only' })
}

export function textPointAtOffset(offset: number): { key: string; offset: number; type: 'text' | 'element' } {
  const root = $getRoot(), index = editorTextIndex()
  for (const leaf of index.leaves) {
    if (offset <= leaf.end) return leaf.text
      ? { key: leaf.key, offset: Math.max(0, offset - leaf.start), type: 'text' }
      : { key: leaf.key, offset: leaf.childIndex + (offset > leaf.start ? 1 : 0), type: 'element' }
  }
  const last = root.getLastChild()
  return $isElementNode(last) ? { key: last.getKey(), offset: last.getChildrenSize(), type: 'element' } : { key: root.getKey(), offset: root.getChildrenSize(), type: 'element' }
}

function editorTextIndex() {
  const nodes = new Map<string, { start: number; boundaries?: number[] }>()
  const leaves: Array<{ key: string; start: number; end: number; text: boolean; childIndex: number }> = []
  let offset = 0
  const visit = (node: LexicalNode, parent?: LexicalNode, childIndex = 0) => {
    const start = offset
    if ($isElementNode(node)) {
      const children = node.getChildren(), boundaries = [offset]
      if (!children.length) leaves.push({ key: node.getKey(), start, end: offset, text: false, childIndex: 0 })
      children.forEach((child, index) => {
        visit(child, node, index)
        // Match ElementNode.getTextContent(), not RangeSelection's single-newline text.
        if ($isElementNode(child) && !child.isInline() && index < children.length - 1) offset += 2
        boundaries.push(offset)
      })
      nodes.set(node.getKey(), { start, boundaries })
    } else {
      offset += node.getTextContentSize()
      const text = $isTextNode(node)
      nodes.set(node.getKey(), { start })
      leaves.push({ key: text ? node.getKey() : parent!.getKey(), start, end: offset, text, childIndex })
    }
  }
  visit($getRoot())
  return { nodes, leaves }
}
