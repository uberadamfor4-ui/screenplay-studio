import assert from 'node:assert/strict'
import test from 'node:test'
import { createEditor, $createParagraphNode, $createTextNode, $createLineBreakNode, $getRoot } from 'lexical'
import { textPointAtOffset } from '../src/editorInputs'

test('rich cursor restoration includes empty lines and trailing linebreaks', () => {
  const editor = createEditor({ onError: error => { throw error } })
  editor.update(() => {
    const paragraph = $createParagraphNode(), a = $createTextNode('aa'), b = $createTextNode('bb')
    paragraph.append(a, $createLineBreakNode(), $createLineBreakNode(), b, $createLineBreakNode())
    $getRoot().append(paragraph)
    assert.deepEqual(textPointAtOffset(2), { key: a.getKey(), offset: 2, type: 'text' })
    assert.deepEqual(textPointAtOffset(3), { key: paragraph.getKey(), offset: 2, type: 'element' })
    assert.deepEqual(textPointAtOffset(4), { key: paragraph.getKey(), offset: 3, type: 'element' })
    assert.deepEqual(textPointAtOffset(7), { key: paragraph.getKey(), offset: 5, type: 'element' })
    assert.deepEqual(textPointAtOffset(100), { key: paragraph.getKey(), offset: 5, type: 'element' })
  }, { discrete: true })
})

test('rich cursor offsets use the same two-newline paragraph separators as saved text', () => {
  const editor = createEditor({ onError: error => { throw error } })
  editor.update(() => {
    const first = $createTextNode('aa'), second = $createTextNode('bb')
    $getRoot().append($createParagraphNode().append(first), $createParagraphNode().append(second))
    assert.equal($getRoot().getTextContent(), 'aa\n\nbb')
    assert.deepEqual(textPointAtOffset(4), { key: second.getKey(), offset: 0, type: 'text' })
    assert.deepEqual(textPointAtOffset(5), { key: second.getKey(), offset: 1, type: 'text' })
    assert.deepEqual(textPointAtOffset(6), { key: second.getKey(), offset: 2, type: 'text' })
  }, { discrete: true })
})

test('restoring a dense styled caret does not repeatedly read every text prefix', () => {
  const editor = createEditor({ onError: error => { throw error } })
  editor.update(() => {
    const paragraph = $createParagraphNode()
    const leaves = Array.from({ length: 800 }, (_, i) => $createTextNode('a').setFormat(i % 2 ? 'bold' : 'italic'))
    paragraph.append(...leaves); $getRoot().append(paragraph)
    let reads = 0
    for (const leaf of leaves) {
      const original = leaf.getTextContent.bind(leaf)
      leaf.getTextContent = () => { reads++; return original() }
    }
    assert.deepEqual(textPointAtOffset(800), { key: leaves[799].getKey(), offset: 1, type: 'text' })
    assert.ok(reads <= leaves.length * 3, `Cursor restoration performed ${reads} text reads for ${leaves.length} nodes`)
  }, { discrete: true })
})
