import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { projectDataLimits } from '../src/dataLimits'
import { analyzeFdxRoundTrip, assertFdxXmlSafety, buildFdx, limitFdxInteropReports, parseFdx } from '../src/fdx'
import type { ScriptProject } from '../src/types'

Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: XmlDomParser })

test('FDX export preserves title-page metadata, XML escaping, and dual dialogue', () => {
  const groupId = 'dual-regression'
  const project: ScriptProject = {
    appVersion: '0.4.0',
    title: 'The <Signal>',
    author: 'A & B',
    language: 'en-US',
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    titlePage: {
      enabled: true,
      title: 'The <Signal>',
      credit: 'Written by',
      authors: 'A & B',
      basedOn: '',
      draftDate: 'July 2026',
      contact: 'studio@example.com',
      copyright: '',
    },
    elements: [
      { id: 'left-cue', type: 'character', text: 'MAYA', dualDialogue: { groupId, side: 'left' } },
      { id: 'left-line', type: 'dialogue', text: 'Wait.', dualDialogue: { groupId, side: 'left' } },
      { id: 'right-cue', type: 'character', text: 'NOAH', dualDialogue: { groupId, side: 'right' } },
      { id: 'right-line', type: 'dialogue', text: 'Go.', dualDialogue: { groupId, side: 'right' } },
    ],
  }

  const fdx = buildFdx(project)
  assert.match(fdx, /<Text>The &lt;Signal&gt;<\/Text>/)
  assert.match(fdx, /<Text>A &amp; B<\/Text>/)
  assert.equal((fdx.match(/<DualDialogue>/g) ?? []).length, 1)
  assert.match(fdx, /<Paragraph Type="General">\s*<DualDialogue>/u)
  assert.equal((fdx.match(/<Paragraph Type="Character">/g) ?? []).length, 2)
  assert.equal((fdx.match(/<Paragraph Type="Dialogue">/g) ?? []).length, 2)
})

test('FDX import preserves native nested dual dialogue and excludes script-note text', () => {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="3">
  <TitlePage>
    <Content>
      <Paragraph Type="Title"><Text>Dual Test</Text></Paragraph>
    </Content>
  </TitlePage>
  <Content>
    <Paragraph Type="Action">
      <Text>Visible\u2028line</Text>
      <ScriptNote ID="note-1">
        <Paragraph Type="General"><Text>Hidden note text</Text></Paragraph>
      </ScriptNote>
    </Paragraph>
    <Paragraph Type="General">
      <DualDialogue>
        <Paragraph Type="Character"><Text>MAYA</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Wait.</Text></Paragraph>
        <Paragraph Type="Character"><Text>NOAH</Text></Paragraph>
        <Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Go.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`

  const project = parseFdx(content)
  assert.equal(project.title, 'Dual Test')
  assert.deepEqual(project.elements.map((element) => element.text), ['Visible\nline', 'MAYA', 'Wait.', 'NOAH', '(quietly)', 'Go.'])
  assert.equal(project.elements.some((element) => element.text.includes('Hidden note text')), false)
  const groupIds = new Set(project.elements.slice(1).map((element) => element.dualDialogue?.groupId))
  assert.equal(groupIds.size, 1)
  assert.deepEqual(project.elements.slice(1).map((element) => element.dualDialogue?.side), ['left', 'left', 'right', 'right', 'right'])

  const roundTrip = buildFdx(project)
  assert.match(roundTrip, /<Paragraph Type="General">\s*<DualDialogue>/u)
  assert.ok(roundTrip.includes('Visible\u2028line'))
  const reparsed = parseFdx(roundTrip)
  assert.deepEqual(reparsed.elements.map((element) => element.text), project.elements.map((element) => element.text))

  const report = analyzeFdxRoundTrip(content, 'native-dual-dialogue.fdx')
  assert.equal(report.sourceParagraphs, 6)
  assert.deepEqual(report.unsupportedTypes, [])
  assert.equal(report.checks.find((check) => check.id === 'notes-tags')?.status, 'warning')
})

test('FDX export preserves professional scene numbers and revision identifiers', () => {
  const project: ScriptProject = {
    appVersion: '0.6.0',
    title: '编号测试',
    author: '编剧',
    language: 'zh-CN',
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    elements: [
      { id: 'scene-a', type: 'scene', text: '内景 公寓 - 夜', sceneNumber: '12A', revisionSetId: '2' },
      { id: 'action-a', type: 'action', text: '雨打在窗上。', revisionSetId: '2' },
    ],
  }

  const fdx = buildFdx(project)
  assert.match(fdx, /<Paragraph Type="Scene Heading" Number="12A">/u)
  assert.equal((fdx.match(/RevisionID="2"/gu) ?? []).length, 2)
})

test('FDX export preserves paragraph-level bold italic and underline styles', () => {
  const project: ScriptProject = {
    appVersion: '0.6.0',
    title: '样式测试',
    author: '编剧',
    language: 'zh-CN',
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    elements: [
      { id: 'action-a', type: 'action', text: '必须保留的重点。', textStyle: { bold: true, italic: true, underline: true } },
      { id: 'dialogue-a', type: 'dialogue', text: '只加粗。', textStyle: { bold: true } },
    ],
  }

  const fdx = buildFdx(project)
  assert.match(fdx, /<Text Style="Bold\+Italic\+Underline">必须保留的重点。<\/Text>/u)
  assert.match(fdx, /<Text Style="Bold">只加粗。<\/Text>/u)
})

test('FDX export does not reorder invalid noncontiguous dual-dialogue groups', () => {
  const groupId = 'broken-dual'
  const project: ScriptProject = {
    appVersion: '0.6.0',
    title: '双栏防错',
    author: '编剧',
    language: 'zh-CN',
    formatId: 'hollywood',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    pageSize: 'letter',
    elements: [
      { id: 'left-cue', type: 'character', text: '甲', dualDialogue: { groupId, side: 'left' } },
      { id: 'left-line', type: 'dialogue', text: '左侧。', dualDialogue: { groupId, side: 'left' } },
      { id: 'action', type: 'action', text: '门突然打开。' },
      { id: 'right-cue', type: 'character', text: '乙', dualDialogue: { groupId, side: 'right' } },
      { id: 'right-line', type: 'dialogue', text: '右侧。', dualDialogue: { groupId, side: 'right' } },
    ],
  }

  const fdx = buildFdx(project)
  assert.doesNotMatch(fdx, /<DualDialogue>/u)
  assert.ok(fdx.indexOf('左侧。') < fdx.indexOf('门突然打开。'))
  assert.ok(fdx.indexOf('门突然打开。') < fdx.indexOf('右侧。'))
})

test('FDX import rejects a document that would create too many editor rows', () => {
  const paragraphs = Array.from(
    { length: projectDataLimits.maxScriptElements + 1 },
    (_, index) => `<Paragraph Type="Action"><Text>${index}</Text></Paragraph>`,
  ).join('')
  const content = `<FinalDraft><Content>${paragraphs}</Content></FinalDraft>`

  assert.throws(() => parseFdx(content), /超过 5000 个段落/u)
})

test('FDX import rejects a single paragraph that could freeze the editor', () => {
  const text = '字'.repeat(projectDataLimits.maxElementTextCharacters + 1)
  const content = `<FinalDraft><Content><Paragraph Type="Action"><Text>${text}</Text></Paragraph></Content></FinalDraft>`

  assert.throws(() => parseFdx(content), /过长的单个段落/u)
})

test('FDX preflight rejects entity declarations and pathological XML node counts before parsing', () => {
  const entityDocument = `<?xml version="1.0"?>
<!DOCTYPE FinalDraft [<!ENTITY repeated "expanded">]>
<FinalDraft><Content><Paragraph Type="Action"><Text>&repeated;</Text></Paragraph></Content></FinalDraft>`
  assert.throws(() => parseFdx(entityDocument), /实体声明/u)

  const excessiveMarkup = `<FinalDraft><Content>${'<Tag />'.repeat(100_001)}</Content></FinalDraft>`
  assert.throws(() => assertFdxXmlSafety(excessiveMarkup), /过多 XML 节点/u)
})

test('FDX lab bounds retained reports by both count and screenplay text size', () => {
  const content = '<FinalDraft><Content><Paragraph Type="Action"><Text>sample</Text></Paragraph></Content></FinalDraft>'
  const report = analyzeFdxRoundTrip(content)

  assert.equal(limitFdxInteropReports([report, report], 1).length, 1)
  assert.equal(limitFdxInteropReports([report], 50, 1).length, 0)
})
