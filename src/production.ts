import { parseSceneHeading } from './screenplayTerms'
import type {
  BreakdownCategory,
  BreakdownTag,
  ProductionData,
  ProductionDepartment,
  ProductionScene,
  ScriptElement,
  ScriptChangeImpact,
  ShootDay,
} from './types'

const allDepartments: ProductionDepartment[] = [
  'producer',
  'location',
  'camera',
  'storyboard',
  'art',
  'props',
  'costume',
  'editorial',
]

const markerPatterns: Array<{ category: BreakdownCategory; pattern: RegExp }> = [
  { category: 'props', pattern: /(?:道具|PROP(?:S)?)[：:]\s*([^\n。；;]+)/giu },
  { category: 'costume', pattern: /(?:服装|服饰|COSTUME)[：:]\s*([^\n。；;]+)/giu },
  { category: 'makeup', pattern: /(?:化妆|妆发|MAKEUP)[：:]\s*([^\n。；;]+)/giu },
  { category: 'vehicle', pattern: /(?:车辆|载具|VEHICLE)[：:]\s*([^\n。；;]+)/giu },
  { category: 'animal', pattern: /(?:动物|ANIMAL)[：:]\s*([^\n。；;]+)/giu },
  { category: 'stunt', pattern: /(?:特技|动作|STUNT)[：:]\s*([^\n。；;]+)/giu },
  { category: 'vfx', pattern: /(?:视效|视觉特效|VFX)[：:]\s*([^\n。；;]+)/giu },
  { category: 'sfx', pattern: /(?:实拍特效|SFX)[：:]\s*([^\n。；;]+)/giu },
  { category: 'sound', pattern: /(?:声音|音效|SOUND)[：:]\s*([^\n。；;]+)/giu },
  { category: 'setDressing', pattern: /(?:置景|陈设|SET DRESSING)[：:]\s*([^\n。；;]+)/giu },
  { category: 'equipment', pattern: /(?:特殊设备|设备|EQUIPMENT)[：:]\s*([^\n。；;]+)/giu },
  { category: 'extras', pattern: /(?:群演|群众演员|EXTRAS?)[：:]\s*([^\n。；;]+)/giu },
  { category: 'note', pattern: /(?:制片备注|制作备注|PRODUCTION NOTE)[：:]\s*([^\n。；;]+)/giu },
]

type SceneBlock = {
  scene: ScriptElement
  index: number
  elements: ScriptElement[]
}

export function synchronizeProductionData(elements: ScriptElement[], existing?: ProductionData): ProductionData {
  const current = normalizeProductionData(existing)
  const blocks = collectSceneBlocks(elements)
  const scriptFingerprint = fingerprint(elements.map((element) => `${element.id}|${element.type}|${element.text}`).join('\n'))
  const sceneFingerprints = Object.fromEntries(blocks.map((block) => [block.scene.id, fingerprint(block.elements.map((element) => `${element.type}|${element.text}`).join('\n'))]))
  const previousSceneMap = new Map(current.scenes.map((scene) => [scene.sceneId, scene]))
  const scenes = blocks.map((block) => buildProductionScene(block, previousSceneMap.get(block.scene.id), current))
  const tags = mergeBreakdownTags(blocks, current.tags)
  const tagIdsByScene = groupTagIds(tags)
  const taggedScenes = scenes.map((scene) => ({ ...scene, tagIds: tagIdsByScene.get(scene.sceneId) ?? [] }))

  if (current.scriptFingerprint === scriptFingerprint) {
    return {
      ...current,
      scenes: taggedScenes,
      tags,
      sceneFingerprints,
    }
  }

  const changeImpacts = buildChangeImpacts(current, blocks, sceneFingerprints)
  return {
    ...current,
    syncedAt: new Date().toISOString(),
    scriptFingerprint,
    sceneFingerprints,
    scenes: taggedScenes,
    tags,
    changeImpacts: [...changeImpacts, ...current.changeImpacts].slice(0, 300),
  }
}

export function normalizeProductionData(data?: Partial<ProductionData>): ProductionData {
  return {
    schemaVersion: 1,
    syncedAt: data?.syncedAt ?? new Date().toISOString(),
    scriptFingerprint: data?.scriptFingerprint ?? '',
    sceneFingerprints: data?.sceneFingerprints ?? {},
    scenes: data?.scenes ?? [],
    tags: data?.tags ?? [],
    locations: data?.locations ?? [],
    shots: data?.shots ?? [],
    takes: data?.takes ?? [],
    assets: data?.assets ?? [],
    shootDays: data?.shootDays ?? [],
    tasks: data?.tasks ?? [],
    notes: data?.notes ?? [],
    changeImpacts: data?.changeImpacts ?? [],
  }
}

export function createEmptyShootDay(dayNumber: number): ShootDay {
  return {
    id: createProductionId('day'),
    dayNumber,
    date: '',
    unit: 'A组',
    sceneIds: [],
    callTime: '07:00',
    mealTime: '12:00',
    wrapTime: '19:00',
    locationName: '',
    notes: '',
  }
}

export function createProductionId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function productionCsv(data: ProductionData) {
  const headers = ['场号', '场景', '内外景', '时间', '页数八分法', '拍摄日', '状态', '角色', '道具', '服装', '视效', '备注']
  const rows = data.scenes.map((scene) => {
    const tags = data.tags.filter((tag) => tag.sceneId === scene.sceneId && !tag.dismissed)
    const names = (category: BreakdownCategory) => tags.filter((tag) => tag.category === category).map((tag) => tag.name).join('、')
    const day = data.shootDays.find((item) => item.id === scene.shootDayId)
    return [
      scene.number,
      scene.heading,
      placeLabel(scene.interiorExterior),
      timeLabel(scene.timeOfDay),
      scene.pageEighths,
      day ? `D${day.dayNumber}` : '',
      scene.status,
      names('cast'),
      names('props'),
      names('costume'),
      names('vfx'),
      scene.notes,
    ]
  })
  return toCsv([headers, ...rows])
}

export function locationsCsv(data: ProductionData) {
  return toCsv([
    ['名称', '地址', '坐标', '联系人', '电话', '可用时间', '许可', '费用', '电力', '噪声', '停车', '设施', '安全', '日照', '尺寸', '评分', '状态', '备注'],
    ...data.locations.map((item) => [item.name, item.address, item.coordinates, item.contact, item.phone, item.availability, item.permitStatus, item.fee, item.power, item.noise, item.parking, item.facilities, item.safety, item.sunDirection, item.dimensions, item.score, item.status, item.notes]),
  ])
}

export function assetsCsv(data: ProductionData) {
  return toCsv([
    ['部门', '名称', '类别', '场号', '角色', '数量', '来源', '供应商', '费用', '试装/交付', '归还/拆除', '连续性', '状态', '备注'],
    ...data.assets.map((item) => [({ art: '美术', props: '道具', costume: '服装' } as const)[item.department], item.name, item.category, item.sceneIds.map((id) => data.scenes.find((scene) => scene.sceneId === id)?.number ?? '').join('、'), item.character, item.quantity, item.source, item.vendor, item.cost, item.fittingOrDelivery, item.returnOrStrike, item.continuity, item.status, item.notes]),
  ])
}

export function shotsCsv(data: ProductionData) {
  return toCsv([
    ['场号', '镜号', '描述', '景别', '角度', '运动', '焦段', '帧率', '快门', '滤镜', '支撑', '摄影机', '灯光', '设备', '预计分钟', '镜头秒数', '状态', '备注'],
    ...data.shots.map((shot) => [data.scenes.find((scene) => scene.sceneId === shot.sceneId)?.number ?? '', shot.number, shot.description, shot.shotSize, shot.angle, shot.movement, shot.lens, shot.fps, shot.shutter, shot.filter, shot.support, shot.camera, shot.lighting, shot.equipment, shot.estimatedMinutes, shot.durationSeconds, shot.status, shot.notes]),
  ])
}

export function buildAle(data: ProductionData) {
  const lines = ['Heading', 'FIELD_DELIM\tTABS', 'VIDEO_FORMAT\t1080', 'AUDIO_FORMAT\t48khz', 'FPS\t24', '', 'Column', 'Name\tStart\tEnd\tScene\tTake\tTracks\tComments', '', 'Data']
  data.takes.forEach((take) => {
    const shot = data.shots.find((item) => item.id === take.shotId)
    const scene = data.scenes.find((item) => item.sceneId === shot?.sceneId)
    lines.push(`${shot?.number ?? take.shotId}\t${take.timecodeIn || '00:00:00:00'}\t${take.timecodeOut || '00:00:00:00'}\t${scene?.number ?? ''}\t${take.takeNumber}\tV\t${sanitizeLine(take.notes)}`)
  })
  return lines.join('\n')
}

export function buildEdl(data: ProductionData, title: string) {
  const lines = [`TITLE: ${sanitizeLine(title).toUpperCase()}`, 'FCM: NON-DROP FRAME', '']
  data.takes.filter((take) => take.selected).forEach((take, index) => {
    const shot = data.shots.find((item) => item.id === take.shotId)
    const reel = (take.videoRoll || 'AX').replace(/\s+/g, '').slice(0, 8).toUpperCase()
    const sourceIn = take.timecodeIn || '00:00:00:00'
    const sourceOut = take.timecodeOut || sourceIn
    lines.push(`${String(index + 1).padStart(3, '0')}  ${reel.padEnd(8, ' ')} V     C        ${sourceIn} ${sourceOut} ${sourceIn} ${sourceOut}`)
    lines.push(`* FROM CLIP NAME: ${sanitizeLine(shot?.number ?? take.id)}`)
  })
  return lines.join('\n')
}

export function buildCallSheet(data: ProductionData, shootDayId: string, projectTitle: string) {
  const day = data.shootDays.find((item) => item.id === shootDayId)
  if (!day) return ''
  const scenes = day.sceneIds.map((id) => data.scenes.find((scene) => scene.sceneId === id)).filter((scene): scene is ProductionScene => Boolean(scene))
  const sceneTags = data.tags.filter((tag) => day.sceneIds.includes(tag.sceneId) && !tag.dismissed)
  const unique = (category: BreakdownCategory) => [...new Set(sceneTags.filter((tag) => tag.category === category).map((tag) => tag.name))]
  const sceneLines = scenes.map((scene) => `| ${scene.number} | ${scene.heading} | ${scene.pageEighths}/8 | ${scene.status} |`).join('\n')
  return `# ${projectTitle} 第 ${day.dayNumber} 拍摄日通告\n\n- 日期：${day.date || '待定'}\n- 组别：${day.unit}\n- 集合：${day.callTime}\n- 午餐：${day.mealTime}\n- 收工目标：${day.wrapTime}\n- 主场地：${day.locationName || '待定'}\n\n## 今日场次\n\n| 场号 | 场景 | 页数 | 状态 |\n| --- | --- | ---: | --- |\n${sceneLines}\n\n## 人员与特殊需求\n\n- 角色：${unique('cast').join('、') || '无'}\n- 群演：${unique('extras').join('、') || '无'}\n- 道具：${unique('props').join('、') || '无'}\n- 服装：${unique('costume').join('、') || '无'}\n- 车辆：${unique('vehicle').join('、') || '无'}\n- 特技/视效：${[...unique('stunt'), ...unique('vfx'), ...unique('sfx')].join('、') || '无'}\n\n## 备注\n\n${day.notes || '无'}\n`
}

export function buildDailyReport(data: ProductionData, shootDayId: string, projectTitle: string) {
  const day = data.shootDays.find((item) => item.id === shootDayId)
  if (!day) return ''
  const scenes = day.sceneIds.map((id) => data.scenes.find((scene) => scene.sceneId === id)).filter((scene): scene is ProductionScene => Boolean(scene))
  const shots = data.shots.filter((shot) => day.sceneIds.includes(shot.sceneId))
  const shotIds = new Set(shots.map((shot) => shot.id))
  const takes = data.takes.filter((take) => shotIds.has(take.shotId))
  const completedScenes = scenes.filter((scene) => scene.status === 'approved')
  const completedShots = shots.filter((shot) => shot.status === 'approved')
  const sceneRows = scenes.map((scene) => `| ${scene.number} | ${scene.heading} | ${scene.pageEighths}/8 | ${statusLabel(scene.status)} |`).join('\n')
  const takeRows = takes.map((take) => {
    const shot = shots.find((item) => item.id === take.shotId)
    return `| ${shot?.number ?? ''} | ${take.takeNumber} | ${take.timecodeIn || '-'} | ${take.timecodeOut || '-'} | ${take.selected ? '是' : ''} | ${take.status === 'good' ? '好' : take.status === 'hold' ? '保留' : 'NG'} | ${sanitizeLine(take.notes)} |`
  }).join('\n')
  return `# ${projectTitle} 第 ${day.dayNumber} 拍摄日报\n\n- 日期：${day.date || '待定'}\n- 组别：${day.unit}\n- 集合：${day.callTime}\n- 实际/目标收工：${day.wrapTime}\n- 场次完成：${completedScenes.length}/${scenes.length}\n- 镜头完成：${completedShots.length}/${shots.length}\n- 拍摄条次：${takes.length}\n- 优选条次：${takes.filter((take) => take.selected).length}\n- NG：${takes.filter((take) => take.status === 'ng').length}\n\n## 场次进度\n\n| 场号 | 场景 | 页数 | 状态 |\n| --- | --- | ---: | --- |\n${sceneRows}\n\n## 条次记录\n\n| 镜号 | 条 | 入点 | 出点 | 优选 | 评价 | 备注 |\n| --- | ---: | --- | --- | --- | --- | --- |\n${takeRows}\n\n## 当日备注\n\n${day.notes || '无'}\n`
}

function collectSceneBlocks(elements: ScriptElement[]): SceneBlock[] {
  const blocks: SceneBlock[] = []
  let current: SceneBlock | undefined
  elements.forEach((element) => {
    if (element.type === 'scene') {
      current = { scene: element, index: blocks.length, elements: [element] }
      blocks.push(current)
      return
    }
    current?.elements.push(element)
  })
  return blocks
}

function buildProductionScene(block: SceneBlock, existing: ProductionScene | undefined, data: ProductionData): ProductionScene {
  const parsed = parseSceneHeading(block.scene.text)
  const lockedNumber = data.scenes.find((scene) => scene.sceneId === block.scene.id)?.number
  const textUnits = block.elements.reduce((total, element) => total + Math.max(1, Math.ceil(Array.from(element.text).length / 50)), 0)
  return {
    sceneId: block.scene.id,
    number: existing?.number || lockedNumber || String(block.index + 1),
    heading: block.scene.text,
    locationName: existing?.locationName || parsed.location,
    timeOfDay: existing?.timeOfDay || parsed.time,
    interiorExterior: existing?.interiorExterior || parsed.place,
    pageEighths: existing?.pageEighths || Math.max(1, Math.min(64, Math.ceil(textUnits / 5))),
    shootDayId: existing?.shootDayId,
    status: existing?.status ?? 'todo',
    notes: existing?.notes ?? '',
    tagIds: existing?.tagIds ?? [],
  }
}

function mergeBreakdownTags(blocks: SceneBlock[], existing: BreakdownTag[]) {
  const validSceneIds = new Set(blocks.map((block) => block.scene.id))
  const manual = existing.filter((tag) => validSceneIds.has(tag.sceneId) && (!tag.sourceElementId || tag.confirmed || tag.dismissed))
  const detected = blocks.flatMap((block) => detectTags(block))
  const merged = new Map<string, BreakdownTag>()
  ;[...manual, ...detected].forEach((tag) => {
    const key = `${tag.sceneId}|${tag.category}|${normalizeName(tag.name)}`
    const previous = merged.get(key)
    merged.set(key, previous?.confirmed || previous?.dismissed ? previous : tag)
  })
  return [...merged.values()]
}

function detectTags(block: SceneBlock): BreakdownTag[] {
  const tags: BreakdownTag[] = []
  const parsed = parseSceneHeading(block.scene.text)
  tags.push(autoTag(block.scene.id, 'location', parsed.location, block.scene))
  block.elements.forEach((element) => {
    if (element.type === 'character' && element.text.trim()) {
      tags.push(autoTag(block.scene.id, 'cast', element.text.replace(/\s*\([^)]*\)\s*$/u, '').trim(), element))
    }
    markerPatterns.forEach(({ category, pattern }) => {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(element.text)) !== null) {
        splitNames(match[1]).forEach((name) => tags.push(autoTag(block.scene.id, category, name, element)))
      }
    })
  })
  return tags
}

function autoTag(sceneId: string, category: BreakdownCategory, name: string, element: ScriptElement): BreakdownTag {
  const normalized = normalizeName(name)
  return {
    id: `tag-${fingerprint(`${sceneId}|${category}|${normalized}`)}`,
    sceneId,
    category,
    name: name.trim(),
    sourceElementId: element.id,
    sourceText: element.text,
    confirmed: false,
    notes: '',
  }
}

function buildChangeImpacts(current: ProductionData, blocks: SceneBlock[], fingerprints: Record<string, string>) {
  if (!current.scriptFingerprint) return []
  const now = new Date().toISOString()
  const nextSceneIds = new Set(blocks.map((block) => block.scene.id))
  const impacts: ScriptChangeImpact[] = blocks.flatMap((block) => {
    const previous = current.sceneFingerprints[block.scene.id]
    if (previous === fingerprints[block.scene.id]) return []
    const changeType = previous ? 'changed' as const : 'added' as const
    const departments = departmentsForScene(block.scene.id, current.tags)
    return [{
      id: `impact-${fingerprint(`${block.scene.id}|${fingerprints[block.scene.id]}|${changeType}`)}`,
      sceneId: block.scene.id,
      changeType,
      summary: changeType === 'added' ? `新增场次：${block.scene.text}` : `剧本文字已修改：${block.scene.text}`,
      departments,
      acknowledgedBy: [],
      createdAt: now,
    }]
  })
  current.scenes.filter((scene) => !nextSceneIds.has(scene.sceneId)).forEach((scene) => {
    impacts.push({
      id: `impact-${fingerprint(`${scene.sceneId}|removed|${now}`)}`,
      sceneId: scene.sceneId,
      changeType: 'removed',
      summary: `删除场次：${scene.heading}`,
      departments: allDepartments,
      acknowledgedBy: [],
      createdAt: now,
    })
  })
  const known = new Set(current.changeImpacts.map((impact) => impact.id))
  return impacts.filter((impact) => !known.has(impact.id))
}

function departmentsForScene(sceneId: string, tags: BreakdownTag[]) {
  const departments = new Set<ProductionDepartment>(['producer', 'location', 'camera', 'storyboard', 'editorial'])
  tags.filter((tag) => tag.sceneId === sceneId).forEach((tag) => {
    if (tag.category === 'props') departments.add('props')
    if (tag.category === 'costume' || tag.category === 'makeup') departments.add('costume')
    if (['setDressing', 'vfx', 'sfx'].includes(tag.category)) departments.add('art')
  })
  return [...departments]
}

function groupTagIds(tags: BreakdownTag[]) {
  const map = new Map<string, string[]>()
  tags.forEach((tag) => map.set(tag.sceneId, [...(map.get(tag.sceneId) ?? []), tag.id]))
  return map
}

function splitNames(value: string) {
  return value.split(/[、,，/／]/u).map((item) => item.trim()).filter(Boolean)
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase()
}

function fingerprint(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function toCsv(rows: Array<Array<string | number>>) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

function csvCell(value: string | number) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function sanitizeLine(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').trim()
}

function timeLabel(value: string) {
  return ({ day: '日', night: '夜', morning: '早晨', dawn: '黎明', dusk: '黄昏', continuous: '连续', later: '稍后' } as Record<string, string>)[value] ?? value
}

function placeLabel(value: string) {
  return ({ int: '内景', ext: '外景', intExt: '内外景', extInt: '外内景' } as Record<string, string>)[value] ?? value
}

function statusLabel(value: string) {
  return ({ todo: '待处理', inProgress: '进行中', review: '待审核', approved: '已确认', blocked: '受阻' } as Record<string, string>)[value] ?? value
}
