import assert from 'node:assert/strict'
import test from 'node:test'
import { assetLedgerCsv, budgetCsv, buildAle, buildCallSheet, buildDailyReport, buildEdl, buildRevisionPackage, buildScheduleConflicts, createEmptyShootDay, createRevisionDistribution, createRevisionSet, productionCsv, synchronizeProductionData } from '../src/production'
import type { ScriptElement } from '../src/types'

const elements: ScriptElement[] = [
  { id: 'scene-1', type: 'scene', text: '内景 公寓 - 夜' },
  { id: 'action-1', type: 'action', text: '道具：旧钥匙、红色信封。服装：黑色风衣。VFX：窗外闪电。' },
  { id: 'character-1', type: 'character', text: '林夏' },
  { id: 'dialogue-1', type: 'dialogue', text: '门外有人。' },
  { id: 'scene-2', type: 'scene', text: 'EXT. ROOFTOP - DAWN' },
  { id: 'character-2', type: 'character', text: 'MAYA' },
]

test('production sync creates stable scene records and local breakdown tags', () => {
  const data = synchronizeProductionData(elements)
  assert.equal(data.scenes.length, 2)
  assert.equal(data.scenes[0].locationName, '公寓')
  assert.equal(data.scenes[1].locationName, 'ROOFTOP')
  assert.deepEqual(data.tags.filter((tag) => tag.category === 'cast').map((tag) => tag.name), ['林夏', 'MAYA'])
  assert.deepEqual(data.tags.filter((tag) => tag.category === 'props').map((tag) => tag.name), ['旧钥匙', '红色信封'])
  assert.equal(data.tags.some((tag) => tag.category === 'costume' && tag.name === '黑色风衣'), true)
  assert.equal(data.tags.some((tag) => tag.category === 'vfx' && tag.name === '窗外闪电'), true)
})

test('repeat sync does not duplicate tags or change the script fingerprint', () => {
  const first = synchronizeProductionData(elements)
  const second = synchronizeProductionData(elements, first)
  assert.equal(second.scriptFingerprint, first.scriptFingerprint)
  assert.equal(second.tags.length, first.tags.length)
  assert.equal(new Set(second.tags.map((tag) => tag.id)).size, second.tags.length)
  assert.equal(second.changeImpacts.length, 0)
})

test('script edits create a department impact while preserving manual production fields', () => {
  const first = synchronizeProductionData(elements)
  first.scenes[0].notes = '只允许静音拍摄'
  const changed = elements.map((element) => element.id === 'action-1' ? { ...element, text: `${element.text} 声音：门铃。` } : element)
  const second = synchronizeProductionData(changed, first)
  assert.equal(second.scenes[0].notes, '只允许静音拍摄')
  assert.equal(second.changeImpacts.length, 1)
  assert.equal(second.changeImpacts[0].changeType, 'changed')
  assert.equal(second.changeImpacts[0].departments.includes('editorial'), true)
  assert.equal(second.tags.some((tag) => tag.category === 'sound' && tag.name === '门铃'), true)
})

test('production reports quote CSV values and create call sheet, ALE, and EDL handoffs', () => {
  const data = synchronizeProductionData(elements)
  const day = createEmptyShootDay(1)
  day.sceneIds = [data.scenes[0].sceneId]
  data.shootDays = [day]
  data.scenes[0].shootDayId = day.id
  data.shots = [{ id: 'shot-1', sceneId: 'scene-1', number: '1-1', description: '钥匙特写', shotSize: '特写', angle: '俯拍', movement: '固定', lens: '85mm', fps: '24', shutter: '180°', filter: '', support: '三脚架', camera: 'A机', lighting: '', equipment: '', estimatedMinutes: 10, durationSeconds: 3, storyboardPath: '', dialogueReference: '', status: 'approved', notes: '' }]
  data.takes = [{ id: 'take-1', shotId: 'shot-1', takeNumber: 2, timecodeIn: '01:00:00:00', timecodeOut: '01:00:03:00', videoRoll: 'A001', soundRoll: 'S001', selected: true, status: 'good', notes: '优选表演' }]

  assert.equal(productionCsv(data).startsWith('\uFEFF'), true)
  assert.match(buildCallSheet(data, day.id, '测试项目'), /第 1 拍摄日通告/u)
  assert.match(buildDailyReport(data, day.id, '测试项目'), /场次完成：0\/1/u)
  assert.match(buildAle(data), /shot-1|1-1/u)
  assert.match(buildEdl(data, '测试项目'), /A001/u)
  assert.match(buildEdl(data, '测试项目'), /FROM CLIP NAME: 1-1/u)
})

test('active revision sets collect changed scenes and create offline department packages', () => {
  const first = synchronizeProductionData(elements)
  const revision = createRevisionSet(first, ['1', '2'])
  first.revisionSets = [revision]
  first.activeRevisionSetId = revision.id
  const changed = elements.map((element) => element.id === 'dialogue-1' ? { ...element, text: '门外真的有人。' } : element)
  const second = synchronizeProductionData(changed, first)

  assert.deepEqual(second.revisionSets[0].sceneIds, ['scene-1'])
  const distribution = createRevisionDistribution(second.revisionSets[0], ['1'])
  const output = buildRevisionPackage(second, distribution, '测试项目')
  assert.match(output, /蓝页修订/u)
  assert.match(output, /场次清单/u)
  assert.match(output, /1 · 内景 公寓 - 夜/u)
  assert.match(output, /\[ \] 制片/u)
})

test('schedule conflict engine checks cast dates, locations, readiness, travel, and workload', () => {
  const data = synchronizeProductionData(elements)
  const day = createEmptyShootDay(1)
  day.date = '2026-08-02'
  day.sceneIds = data.scenes.map((scene) => scene.sceneId)
  data.shootDays = [day]
  data.scenes.forEach((scene) => {
    scene.shootDayId = day.id
    scene.pageEighths = 40
  })
  data.castAvailability = [{ id: 'cast-maya', castName: 'MAYA', unavailableDates: ['2026-08-02'], maxConsecutiveDays: 6, notes: '' }]
  data.tags = data.tags.map((tag) => tag.category === 'props' ? { ...tag, confirmed: true } : tag)

  const conflicts = buildScheduleConflicts(data)
  assert.equal(conflicts.some((conflict) => conflict.severity === 'blocking' && conflict.message.includes('超过 8 页')), true)
  assert.equal(conflicts.some((conflict) => conflict.severity === 'blocking' && conflict.message.includes('MAYA')), true)
  assert.equal(conflicts.some((conflict) => conflict.message.includes('尚未建立勘景记录')), true)
  assert.equal(conflicts.some((conflict) => conflict.message.includes('尚未填写转场时间')), true)
  assert.equal(conflicts.some((conflict) => conflict.message.includes('旧钥匙')), true)
})

test('budget and asset lifecycle exports retain local financial records', () => {
  const data = synchronizeProductionData(elements)
  data.assets = [{ id: 'asset-1', department: 'props', name: '旧钥匙', category: '手持道具', sceneIds: ['scene-1'], character: '', quantity: 2, source: '租赁', vendor: '测试供应商', cost: '300', lifecycleStatus: 'received', fittingOrDelivery: '2026-08-01', returnOrStrike: '2026-08-05', continuity: '', photoPaths: [], status: 'approved', notes: '' }]
  data.budgetLines = [{ id: 'budget-1', category: 'props', description: '旧钥匙租赁', department: 'props', assetId: 'asset-1', sceneIds: ['scene-1'], vendor: '测试供应商', budgetAmount: 500, committedAmount: 300, actualAmount: 280, status: 'approved', notes: '' }]
  data.assetEvents = [{ id: 'event-1', assetId: 'asset-1', type: 'received', date: '2026-08-01', quantity: 2, amount: 280, person: '道具师', notes: '验收完成' }]

  assert.match(budgetCsv(data), /旧钥匙租赁/u)
  assert.match(budgetCsv(data), /220/u)
  assert.match(assetLedgerCsv(data), /到货\/入库/u)
  assert.match(assetLedgerCsv(data), /道具师/u)
})
