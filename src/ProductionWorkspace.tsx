import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Clapperboard,
  Download,
  Film,
  GripVertical,
  History,
  ListChecks,
  MapPin,
  PackageOpen,
  Palette,
  Plus,
  Scissors,
  Shirt,
  Tags,
  Trash2,
} from 'lucide-react'
import './ProductionWorkspace.css'
import {
  assetLedgerCsv,
  assetsCsv,
  buildAle,
  buildCallSheet,
  buildDailyReport,
  buildEdl,
  buildRevisionPackage,
  buildScheduleConflicts,
  budgetCsv,
  createEmptyShootDay,
  createProductionId,
  createRevisionDistribution,
  createRevisionSet,
  locationsCsv,
  productionCsv,
  shotsCsv,
  standardRevisionColors,
} from './production'
import type {
  AssetLifecycleEvent,
  AssetLifecycleEventType,
  BreakdownCategory,
  BreakdownTag,
  BudgetCategory,
  BudgetLine,
  CastAvailability,
  LocationRecord,
  ProductionAsset,
  ProductionData,
  ProductionDepartment,
  ProductionStage,
  ProductionStatus,
  ProductionTask,
  RevisionDistribution,
  ScriptChangeImpact,
  ShotRecord,
  TakeRecord,
  TravelTimeRecord,
} from './types'

type ProductionView =
  | 'overview'
  | 'breakdown'
  | 'schedule'
  | 'location'
  | 'camera'
  | 'storyboard'
  | 'art'
  | 'props'
  | 'costume'
  | 'onset'
  | 'editorial'
  | 'finance'
  | 'impacts'

type ExportKind = 'csv' | 'ale' | 'edl' | 'markdown'

type Props = {
  projectTitle: string
  stage: ProductionStage
  data: ProductionData
  onChange: (data: ProductionData) => void
  onChangeStage: (stage: ProductionStage) => void
  onClose: () => void
  onExport: (content: string, name: string, kind: ExportKind) => void
  productionLocked: boolean
  pageLabels: string[]
  scenePageLabels: Record<string, string[]>
  onLockProduction: () => void
}

const departmentLabels: Record<ProductionDepartment, string> = {
  producer: '制片',
  location: '勘景',
  camera: '摄影',
  storyboard: '分镜',
  art: '美术',
  props: '道具',
  costume: '服装',
  editorial: '剪辑',
}

const statusLabels: Record<ProductionStatus, string> = {
  todo: '待处理',
  inProgress: '进行中',
  review: '待审核',
  approved: '已确认',
  blocked: '受阻',
}

const categoryLabels: Record<BreakdownCategory, string> = {
  cast: '角色',
  extras: '群演',
  location: '场地',
  props: '道具',
  costume: '服装',
  makeup: '妆发',
  vehicle: '车辆',
  animal: '动物',
  stunt: '特技',
  vfx: '视效',
  sfx: '实拍特效',
  sound: '声音',
  setDressing: '置景',
  equipment: '特殊设备',
  note: '制作备注',
}

const budgetCategoryLabels: Record<BudgetCategory, string> = {
  cast: '演员',
  location: '场地',
  camera: '摄影',
  art: '美术',
  props: '道具',
  costume: '服装',
  transport: '交通',
  post: '后期',
  contingency: '不可预见费',
  other: '其他',
}

const assetEventLabels: Record<AssetLifecycleEventType, string> = {
  planned: '计划',
  ordered: '采购/下单',
  received: '到货/入库',
  issued: '领用',
  returned: '归还',
  damaged: '损坏',
  lost: '丢失',
  paid: '付款',
}

const navItems: Array<{ id: ProductionView; label: string; icon: typeof Clapperboard; stages: ProductionStage[] }> = [
  { id: 'overview', label: '生产总览', icon: Clapperboard, stages: ['preproduction', 'onset', 'post'] },
  { id: 'breakdown', label: '剧本拆解', icon: Tags, stages: ['preproduction'] },
  { id: 'schedule', label: '拍摄排期', icon: CalendarDays, stages: ['preproduction', 'onset'] },
  { id: 'location', label: '勘景', icon: MapPin, stages: ['preproduction'] },
  { id: 'camera', label: '摄影', icon: Camera, stages: ['preproduction', 'onset'] },
  { id: 'storyboard', label: '分镜', icon: Film, stages: ['preproduction'] },
  { id: 'art', label: '美术', icon: Palette, stages: ['preproduction'] },
  { id: 'props', label: '道具', icon: PackageOpen, stages: ['preproduction', 'onset'] },
  { id: 'costume', label: '服装', icon: Shirt, stages: ['preproduction', 'onset'] },
  { id: 'onset', label: '拍摄现场', icon: ClipboardCheck, stages: ['onset'] },
  { id: 'editorial', label: '剪辑交接', icon: Scissors, stages: ['onset', 'post'] },
  { id: 'finance', label: '预算与资产', icon: CircleDollarSign, stages: ['preproduction', 'onset', 'post'] },
  { id: 'impacts', label: '修订与分发', icon: History, stages: ['preproduction', 'onset', 'post'] },
]

export function ProductionWorkspace(props: Props) {
  const [view, setView] = useState<ProductionView>('overview')
  const [selectedSceneId, setSelectedSceneId] = useState(props.data.scenes[0]?.sceneId ?? '')
  const [selectedLocationId, setSelectedLocationId] = useState(props.data.locations[0]?.id ?? '')
  const [selectedShotId, setSelectedShotId] = useState(props.data.shots[0]?.id ?? '')
  const [selectedAssetId, setSelectedAssetId] = useState(props.data.assets[0]?.id ?? '')
  const [selectedDayId, setSelectedDayId] = useState(props.data.shootDays[0]?.id ?? '')

  useEffect(() => {
    const available = navItems.filter((item) => item.stages.includes(props.stage)).map((item) => item.id)
    if (!available.includes(view)) setView(props.stage === 'onset' ? 'onset' : props.stage === 'post' ? 'editorial' : 'overview')
  }, [props.stage, view])

  const selectedScene = props.data.scenes.find((scene) => scene.sceneId === selectedSceneId) ?? props.data.scenes[0]
  const openImpacts = props.data.changeImpacts.filter((impact) => impact.acknowledgedBy.length < impact.departments.length)
  const activeTasks = props.data.tasks.filter((task) => task.status !== 'approved')
  const selectedTakes = props.data.takes.filter((take) => take.selected).length

  function update(patch: Partial<ProductionData>) {
    props.onChange({ ...props.data, ...patch, syncedAt: new Date().toISOString() })
  }

  function exportFile(content: string, name: string, kind: ExportKind) {
    props.onExport(content, name, kind)
  }

  return (
    <section className="production-workspace">
      <header className="production-header">
        <button type="button" className="production-back" onClick={props.onClose} title="返回写作">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>返回写作</span>
        </button>
        <div className="production-title">
          <strong>{props.projectTitle}</strong>
          <span>制片工作区</span>
        </div>
        <div className="stage-switcher" aria-label="制作阶段">
          <button type="button" className={props.stage === 'preproduction' ? 'active' : ''} onClick={() => props.onChangeStage('preproduction')}>前期制片</button>
          <button type="button" className={props.stage === 'onset' ? 'active' : ''} onClick={() => props.onChangeStage('onset')}>拍摄现场</button>
          <button type="button" className={props.stage === 'post' ? 'active' : ''} onClick={() => props.onChangeStage('post')}>后期交接</button>
        </div>
        <div className="production-header-metrics">
          <span><b>{props.data.scenes.length}</b> 场</span>
          <span><b>{props.data.shots.length}</b> 镜</span>
          <span className={openImpacts.length ? 'warning' : ''}><b>{openImpacts.length}</b> 项变更</span>
        </div>
      </header>

      <nav className="production-nav" aria-label="制片部门">
        {navItems.filter((item) => item.stages.includes(props.stage)).map((item) => {
          const Icon = item.icon
          return (
            <button type="button" key={item.id} className={view === item.id ? 'active' : ''} aria-label={item.label} title={item.label} onClick={() => setView(item.id)}>
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === 'impacts' && openImpacts.length > 0 && <b>{openImpacts.length}</b>}
            </button>
          )
        })}
      </nav>

      <main className="production-main">
        {view === 'overview' && (
          <OverviewPanel
            data={props.data}
            activeTasks={activeTasks}
            openImpacts={openImpacts}
            selectedTakes={selectedTakes}
            onChange={update}
            onNavigate={setView}
          />
        )}
        {view === 'breakdown' && selectedScene && (
          <BreakdownPanel data={props.data} selectedSceneId={selectedScene.sceneId} onSelectScene={setSelectedSceneId} onChange={update} onExport={() => exportFile(productionCsv(props.data), `${props.projectTitle}-拍摄分解表.csv`, 'csv')} />
        )}
        {view === 'schedule' && (
          <SchedulePanel data={props.data} selectedDayId={selectedDayId} onSelectDay={setSelectedDayId} onChange={update} onExportCallSheet={(dayId) => exportFile(buildCallSheet(props.data, dayId, props.projectTitle), `${props.projectTitle}-通告单.md`, 'markdown')} />
        )}
        {view === 'location' && (
          <LocationPanel data={props.data} selectedId={selectedLocationId} onSelect={setSelectedLocationId} onChange={update} onExport={() => exportFile(locationsCsv(props.data), `${props.projectTitle}-勘景表.csv`, 'csv')} />
        )}
        {(view === 'camera' || view === 'storyboard') && (
          <ShotPanel data={props.data} storyboardMode={view === 'storyboard'} selectedSceneId={selectedSceneId} selectedShotId={selectedShotId} onSelectScene={setSelectedSceneId} onSelectShot={setSelectedShotId} onChange={update} onExport={() => exportFile(shotsCsv(props.data), `${props.projectTitle}-镜头表.csv`, 'csv')} />
        )}
        {(view === 'art' || view === 'props' || view === 'costume') && (
          <AssetPanel department={view} data={props.data} selectedId={selectedAssetId} onSelect={setSelectedAssetId} onChange={update} onExport={() => exportFile(assetsCsv(props.data), `${props.projectTitle}-美术道具服装表.csv`, 'csv')} />
        )}
        {view === 'onset' && (
          <OnsetPanel data={props.data} selectedDayId={selectedDayId} selectedShotId={selectedShotId} onSelectDay={setSelectedDayId} onSelectShot={setSelectedShotId} onChange={update} onExportReport={(dayId) => exportFile(buildDailyReport(props.data, dayId, props.projectTitle), `${props.projectTitle}-拍摄日报.md`, 'markdown')} />
        )}
        {view === 'editorial' && (
          <EditorialPanel data={props.data} onChange={update} onExportAle={() => exportFile(buildAle(props.data), `${props.projectTitle}-剪辑交接.ale`, 'ale')} onExportEdl={() => exportFile(buildEdl(props.data, props.projectTitle), `${props.projectTitle}-优选条.edl`, 'edl')} />
        )}
        {view === 'finance' && (
          <BudgetLifecyclePanel
            data={props.data}
            onChange={update}
            onExportBudget={() => exportFile(budgetCsv(props.data), `${props.projectTitle}-预算执行表.csv`, 'csv')}
            onExportLedger={() => exportFile(assetLedgerCsv(props.data), `${props.projectTitle}-资产流转台账.csv`, 'csv')}
          />
        )}
        {view === 'impacts' && (
          <ImpactPanel
            data={props.data}
            productionLocked={props.productionLocked}
            pageLabels={props.pageLabels}
            scenePageLabels={props.scenePageLabels}
            onChange={update}
            onLockProduction={props.onLockProduction}
            onExport={(distribution) => exportFile(buildRevisionPackage(props.data, distribution, props.projectTitle), `${props.projectTitle}-${distribution.title}.md`, 'markdown')}
          />
        )}
      </main>
    </section>
  )
}

function OverviewPanel(props: {
  data: ProductionData
  activeTasks: ProductionTask[]
  openImpacts: ScriptChangeImpact[]
  selectedTakes: number
  onChange: (patch: Partial<ProductionData>) => void
  onNavigate: (view: ProductionView) => void
}) {
  const completion = props.data.tasks.length ? Math.round((props.data.tasks.filter((task) => task.status === 'approved').length / props.data.tasks.length) * 100) : 0
  const unconfirmedTags = props.data.tags.filter((tag) => !tag.confirmed && !tag.dismissed).length

  function addTask() {
    props.onChange({
      tasks: [...props.data.tasks, {
        id: createProductionId('task'),
        department: 'producer',
        title: '新制作任务',
        assignee: '',
        dueDate: '',
        priority: 'normal',
        status: 'todo',
        notes: '',
      }],
    })
  }

  return (
    <div className="production-panel overview-panel">
      <PanelHeading title="生产总览" detail="剧本、排期和各部门共用同一套场次与镜头数据。">
        <button type="button" className="production-primary" onClick={addTask}><Plus size={15} />新建任务</button>
      </PanelHeading>
      <div className="production-metrics">
        <MetricButton label="拆解待确认" value={unconfirmedTags} onClick={() => props.onNavigate('breakdown')} />
        <MetricButton label="未完成任务" value={props.activeTasks.length} onClick={() => undefined} />
        <MetricButton label="剧本修改影响" value={props.openImpacts.length} onClick={() => props.onNavigate('impacts')} warning={props.openImpacts.length > 0} />
        <MetricButton label="已选剪辑条次" value={props.selectedTakes} onClick={() => props.onNavigate('editorial')} />
        <MetricButton label="任务完成率" value={`${completion}%`} onClick={() => undefined} />
      </div>
      <div className="overview-grid">
        <section className="production-section">
          <h3>部门任务</h3>
          <div className="data-list">
            {props.data.tasks.length === 0 && <EmptyState text="尚无任务。可以先从剧本拆解或拍摄排期开始。" />}
            {props.data.tasks.map((task) => (
              <div className="task-row" key={task.id}>
                <select value={task.department} onChange={(event) => props.onChange({ tasks: replaceById(props.data.tasks, task.id, { department: event.target.value as ProductionDepartment }) })}>
                  {Object.entries(departmentLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <input value={task.title} onChange={(event) => props.onChange({ tasks: replaceById(props.data.tasks, task.id, { title: event.target.value }) })} />
                <input aria-label="负责人" placeholder="负责人" value={task.assignee} onChange={(event) => props.onChange({ tasks: replaceById(props.data.tasks, task.id, { assignee: event.target.value }) })} />
                <input aria-label="截止日期" type="date" value={task.dueDate} onChange={(event) => props.onChange({ tasks: replaceById(props.data.tasks, task.id, { dueDate: event.target.value }) })} />
                <StatusSelect value={task.status} onChange={(status) => props.onChange({ tasks: replaceById(props.data.tasks, task.id, { status }) })} />
                <IconAction label="删除任务" onClick={() => props.onChange({ tasks: props.data.tasks.filter((item) => item.id !== task.id) })}><Trash2 size={15} /></IconAction>
              </div>
            ))}
          </div>
        </section>
        <section className="production-section department-progress">
          <h3>部门进度</h3>
          {Object.entries(departmentLabels).map(([id, label]) => {
            const tasks = props.data.tasks.filter((task) => task.department === id)
            const complete = tasks.filter((task) => task.status === 'approved').length
            const percent = tasks.length ? Math.round((complete / tasks.length) * 100) : 0
            return <div key={id}><span>{label}</span><progress max={100} value={percent} /><b>{percent}%</b></div>
          })}
        </section>
      </div>
    </div>
  )
}

function BreakdownPanel(props: { data: ProductionData; selectedSceneId: string; onSelectScene: (id: string) => void; onChange: (patch: Partial<ProductionData>) => void; onExport: () => void }) {
  const scene = props.data.scenes.find((item) => item.sceneId === props.selectedSceneId)!
  const tags = props.data.tags.filter((tag) => tag.sceneId === scene.sceneId && !tag.dismissed)
  const [category, setCategory] = useState<BreakdownCategory>('props')
  const [name, setName] = useState('')

  function addTag() {
    if (!name.trim()) return
    props.onChange({ tags: [...props.data.tags, { id: createProductionId('tag'), sceneId: scene.sceneId, category, name: name.trim(), confirmed: true, notes: '' }] })
    setName('')
  }

  function updateScene(patch: Record<string, unknown>) {
    props.onChange({ scenes: replaceByKey(props.data.scenes, 'sceneId', scene.sceneId, patch) })
  }

  return (
    <div className="production-panel split-panel">
      <aside className="record-sidebar">
        <div className="sidebar-heading"><strong>场次</strong><span>{props.data.scenes.length}</span></div>
        {props.data.scenes.map((item) => (
          <button type="button" key={item.sceneId} className={item.sceneId === scene.sceneId ? 'active' : ''} onClick={() => props.onSelectScene(item.sceneId)}>
            <b>{item.number}</b><span>{item.heading}</span><small>{item.pageEighths}/8 页</small>
          </button>
        ))}
      </aside>
      <div className="record-content">
        <PanelHeading title={`场 ${scene.number} · ${scene.heading}`} detail="自动识别的元素需确认；人工新增的元素会直接进入部门分解表。">
          <button type="button" className="production-secondary" onClick={props.onExport}><Download size={15} />导出分解表</button>
        </PanelHeading>
        <div className="scene-fields compact-fields">
          <LabeledInput label="场地" value={scene.locationName} onChange={(value) => updateScene({ locationName: value })} />
          <LabeledSelect label="内外景" value={scene.interiorExterior} options={[['int', '内景'], ['ext', '外景'], ['intExt', '内外景']]} onChange={(value) => updateScene({ interiorExterior: value })} />
          <LabeledSelect label="时间" value={scene.timeOfDay} options={productionTimeOptions} onChange={(value) => updateScene({ timeOfDay: value })} />
          <LabeledNumber label="页数（八分法）" value={scene.pageEighths} min={1} max={64} onChange={(value) => updateScene({ pageEighths: value })} />
          <label><span>状态</span><StatusSelect value={scene.status} onChange={(status) => updateScene({ status })} /></label>
        </div>
        <section className="production-section">
          <div className="section-heading"><h3>场景元素</h3><span>{tags.filter((tag) => tag.confirmed).length}/{tags.length} 已确认</span></div>
          <div className="tag-groups">
            {Object.entries(categoryLabels).map(([id, label]) => {
              const categoryTags = tags.filter((tag) => tag.category === id)
              if (categoryTags.length === 0) return null
              return <div className="tag-group" key={id}><b>{label}</b><div>{categoryTags.map((tag) => <TagChip key={tag.id} tag={tag} onConfirm={() => props.onChange({ tags: replaceById(props.data.tags, tag.id, { confirmed: !tag.confirmed }) })} onDelete={() => props.onChange({ tags: tag.sourceElementId ? replaceById(props.data.tags, tag.id, { dismissed: true }) : props.data.tags.filter((item) => item.id !== tag.id) })} />)}</div></div>
            })}
          </div>
          <div className="inline-editor">
            <select aria-label="元素类别" value={category} onChange={(event) => setCategory(event.target.value as BreakdownCategory)}>{Object.entries(categoryLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <input aria-label="元素名称" placeholder="输入元素名称" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addTag()} />
            <button type="button" className="production-primary" onClick={addTag}><Plus size={15} />添加</button>
          </div>
        </section>
        <label className="full-note"><span>制片备注</span><textarea value={scene.notes} onChange={(event) => updateScene({ notes: event.target.value })} /></label>
      </div>
    </div>
  )
}

function SchedulePanel(props: { data: ProductionData; selectedDayId: string; onSelectDay: (id: string) => void; onChange: (patch: Partial<ProductionData>) => void; onExportCallSheet: (id: string) => void }) {
  const selectedDay = props.data.shootDays.find((day) => day.id === props.selectedDayId)
  const conflicts = buildScheduleConflicts(props.data)
  const [draggingSceneId, setDraggingSceneId] = useState('')
  const [constraintsOpen, setConstraintsOpen] = useState(false)
  const castNames = [...new Set(props.data.tags.filter((tag) => tag.category === 'cast' && !tag.dismissed).map((tag) => tag.name))].sort((left, right) => left.localeCompare(right, 'zh-CN'))

  function addDay() {
    const day = createEmptyShootDay(props.data.shootDays.length + 1)
    props.onChange({ shootDays: [...props.data.shootDays, day] })
    props.onSelectDay(day.id)
  }

  function assignScene(sceneId: string, dayId: string, beforeSceneId?: string) {
    const shootDays = props.data.shootDays.map((day) => ({ ...day, sceneIds: day.sceneIds.filter((id) => id !== sceneId) }))
    const target = shootDays.find((day) => day.id === dayId)
    if (target) {
      const targetIndex = beforeSceneId ? target.sceneIds.indexOf(beforeSceneId) : -1
      if (targetIndex >= 0) target.sceneIds.splice(targetIndex, 0, sceneId)
      else target.sceneIds.push(sceneId)
    }
    props.onChange({ shootDays, scenes: replaceByKey(props.data.scenes, 'sceneId', sceneId, { shootDayId: dayId || undefined }) })
  }

  function dropScene(dayId: string, beforeSceneId?: string) {
    if (!draggingSceneId) return
    assignScene(draggingSceneId, dayId, beforeSceneId)
    setDraggingSceneId('')
  }

  function updateAvailability(name: string, patch: Partial<CastAvailability>) {
    const existing = props.data.castAvailability.find((item) => item.castName === name)
    if (existing) props.onChange({ castAvailability: replaceById(props.data.castAvailability, existing.id, patch) })
    else props.onChange({ castAvailability: [...props.data.castAvailability, { id: createProductionId('cast'), castName: name, unavailableDates: [], maxConsecutiveDays: 6, notes: '', ...patch }] })
  }

  function addTravelTime() {
    const record: TravelTimeRecord = { id: createProductionId('travel'), fromLocation: '', toLocation: '', minutes: 30 }
    props.onChange({ travelTimes: [...props.data.travelTimes, record] })
  }

  return (
    <div className="production-panel">
      <PanelHeading title="条带式拍摄计划" detail="拖动场次到拍摄日并调整顺序；冲突引擎检查演员、地点、昼夜、准备状态、转场与连续工作日。">
        <button type="button" className="production-primary" onClick={addDay}><Plus size={15} />增加拍摄日</button>
      </PanelHeading>
      <div className="schedule-conflict-summary" role="status">
        <span className={conflicts.some((item) => item.severity === 'blocking') ? 'blocking' : ''}><b>{conflicts.filter((item) => item.severity === 'blocking').length}</b> 项阻断</span>
        <span><b>{conflicts.filter((item) => item.severity === 'warning').length}</b> 项提醒</span>
        <button type="button" className="production-secondary" onClick={() => setConstraintsOpen((value) => !value)}>{constraintsOpen ? '收起排期条件' : '演员与转场条件'}</button>
      </div>
      {conflicts.length > 0 && <div className="schedule-warnings" role="status">{conflicts.map((conflict) => <button type="button" className={conflict.severity} key={conflict.id} onClick={() => conflict.dayId && props.onSelectDay(conflict.dayId)}><AlertTriangle size={14} />{conflict.message}</button>)}</div>}
      <div className="schedule-board">
        <section className="schedule-column unassigned" onDragOver={(event) => event.preventDefault()} onDrop={() => dropScene('')}>
          <header><strong>未排场次</strong><span>{props.data.scenes.filter((scene) => !scene.shootDayId).length}</span></header>
          {props.data.scenes.filter((scene) => !scene.shootDayId).map((scene) => <SceneStrip key={scene.sceneId} scene={scene} data={props.data} dragging={scene.sceneId === draggingSceneId} onAssign={assignScene} onDragStart={setDraggingSceneId} onDragEnd={() => setDraggingSceneId('')} onDropBefore={(sceneId) => dropScene('', sceneId)} />)}
        </section>
        {props.data.shootDays.map((day) => {
          const dayScenes = day.sceneIds.map((id) => props.data.scenes.find((scene) => scene.sceneId === id)).filter(Boolean)
          const eighths = dayScenes.reduce((total, scene) => total + (scene?.pageEighths ?? 0), 0)
          return (
            <section className={day.id === selectedDay?.id ? 'schedule-column active' : 'schedule-column'} key={day.id} onClick={() => props.onSelectDay(day.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropScene(day.id)}>
              <header><div><strong>第 {day.dayNumber} 天</strong><small>{day.date || '日期待定'} · {day.unit}</small></div><span>{eighths}/8 页</span></header>
              {dayScenes.map((scene) => scene && <SceneStrip key={scene.sceneId} scene={scene} data={props.data} dragging={scene.sceneId === draggingSceneId} onAssign={assignScene} onDragStart={setDraggingSceneId} onDragEnd={() => setDraggingSceneId('')} onDropBefore={(sceneId) => dropScene(day.id, sceneId)} />)}
            </section>
          )
        })}
      </div>
      {constraintsOpen && (
        <section className="schedule-constraints production-section">
          <div className="constraint-column">
            <div className="section-heading"><h3>演员可用性</h3><span>不可用日期用逗号分隔</span></div>
            {castNames.map((name) => {
              const availability = props.data.castAvailability.find((item) => item.castName === name)
              return <div className="constraint-row cast" key={name}><b>{name}</b><input aria-label={`${name} 不可用日期`} placeholder="2026-08-02, 2026-08-05" value={availability?.unavailableDates.join(', ') ?? ''} onChange={(event) => updateAvailability(name, { unavailableDates: splitDates(event.target.value) })} /><label><span>最多连拍</span><input type="number" min="1" max="14" value={availability?.maxConsecutiveDays ?? 6} onChange={(event) => updateAvailability(name, { maxConsecutiveDays: Number(event.target.value) || 1 })} /></label></div>
            })}
            {castNames.length === 0 && <EmptyState text="剧本拆解出角色后，可在这里设置档期。" />}
          </div>
          <div className="constraint-column">
            <div className="section-heading"><h3>场地转场时间</h3><button type="button" className="production-secondary" onClick={addTravelTime}><Plus size={14} />增加路线</button></div>
            {props.data.travelTimes.map((record) => <div className="constraint-row travel" key={record.id}><input aria-label="出发场地" placeholder="出发场地" value={record.fromLocation} onChange={(event) => props.onChange({ travelTimes: replaceById(props.data.travelTimes, record.id, { fromLocation: event.target.value }) })} /><span>至</span><input aria-label="到达场地" placeholder="到达场地" value={record.toLocation} onChange={(event) => props.onChange({ travelTimes: replaceById(props.data.travelTimes, record.id, { toLocation: event.target.value }) })} /><input aria-label="转场分钟" type="number" min="0" max="999" value={record.minutes} onChange={(event) => props.onChange({ travelTimes: replaceById(props.data.travelTimes, record.id, { minutes: Number(event.target.value) }) })} /><span>分钟</span><IconAction label="删除路线" onClick={() => props.onChange({ travelTimes: props.data.travelTimes.filter((item) => item.id !== record.id) })}><Trash2 size={14} /></IconAction></div>)}
            {props.data.travelTimes.length === 0 && <EmptyState text="多场地拍摄时，增加本地估算的转场时间。" />}
          </div>
        </section>
      )}
      {selectedDay && (
        <section className="day-inspector production-section">
          <div className="section-heading"><h3>第 {selectedDay.dayNumber} 天设置</h3><button type="button" className="production-secondary" onClick={() => props.onExportCallSheet(selectedDay.id)}><Download size={15} />生成通告单</button></div>
          <div className="compact-fields">
            <LabeledInput label="日期" type="date" value={selectedDay.date} onChange={(value) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { date: value }) })} />
            <LabeledInput label="组别" value={selectedDay.unit} onChange={(value) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { unit: value }) })} />
            <LabeledInput label="集合" type="time" value={selectedDay.callTime} onChange={(value) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { callTime: value }) })} />
            <LabeledInput label="午餐" type="time" value={selectedDay.mealTime} onChange={(value) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { mealTime: value }) })} />
            <LabeledInput label="收工目标" type="time" value={selectedDay.wrapTime} onChange={(value) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { wrapTime: value }) })} />
            <LabeledInput label="主场地" value={selectedDay.locationName} onChange={(value) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { locationName: value }) })} />
          </div>
          <label className="full-note"><span>拍摄日备注</span><textarea value={selectedDay.notes} onChange={(event) => props.onChange({ shootDays: replaceById(props.data.shootDays, selectedDay.id, { notes: event.target.value }) })} /></label>
        </section>
      )}
    </div>
  )
}

function LocationPanel(props: { data: ProductionData; selectedId: string; onSelect: (id: string) => void; onChange: (patch: Partial<ProductionData>) => void; onExport: () => void }) {
  const selected = props.data.locations.find((location) => location.id === props.selectedId)
  function addLocation() {
    const location: LocationRecord = { id: createProductionId('location'), name: '新候选场地', address: '', coordinates: '', contact: '', phone: '', availability: '', unavailableDates: [], permitStatus: '待确认', fee: '', power: '', noise: '', parking: '', facilities: '', accessibility: '', safety: '', sunDirection: '', dimensions: '', score: 3, status: 'todo', notes: '', photoPaths: [] }
    props.onChange({ locations: [...props.data.locations, location] })
    props.onSelect(location.id)
  }
  function patch(patch: Partial<LocationRecord>) {
    if (selected) props.onChange({ locations: replaceById(props.data.locations, selected.id, patch) })
  }
  return (
    <div className="production-panel split-panel">
      <aside className="record-sidebar">
        <div className="sidebar-heading"><strong>候选场地</strong><button type="button" onClick={addLocation} title="新增场地"><Plus size={15} /></button></div>
        {props.data.locations.map((location) => <button type="button" key={location.id} className={location.id === selected?.id ? 'active' : ''} onClick={() => props.onSelect(location.id)}><MapPin size={15} /><span>{location.name}</span><small>{location.address || '地址待补充'}</small><b>{location.score}/5</b></button>)}
        {props.data.locations.length === 0 && <EmptyState text="添加第一个候选场地。" />}
      </aside>
      <div className="record-content">
        <PanelHeading title={selected?.name ?? '勘景资料'} detail="记录许可、环境、基础设施和现场判断，支持完全离线使用。">
          <button type="button" className="production-secondary" onClick={props.onExport} disabled={props.data.locations.length === 0}><Download size={15} />导出勘景表</button>
        </PanelHeading>
        {!selected ? <EmptyState text="请添加或选择候选场地。" /> : <>
          <div className="form-grid">
            <LabeledInput label="名称" value={selected.name} onChange={(value) => patch({ name: value })} />
            <LabeledInput label="地址" value={selected.address} onChange={(value) => patch({ address: value })} />
            <LabeledInput label="经纬度" value={selected.coordinates} onChange={(value) => patch({ coordinates: value })} />
            <LabeledInput label="联系人" value={selected.contact} onChange={(value) => patch({ contact: value })} />
            <LabeledInput label="电话" value={selected.phone} onChange={(value) => patch({ phone: value })} />
            <LabeledInput label="可用时间" value={selected.availability} onChange={(value) => patch({ availability: value })} />
            <LabeledInput label="不可用日期" placeholder="2026-08-02, 2026-08-05" value={selected.unavailableDates?.join(', ') ?? ''} onChange={(value) => patch({ unavailableDates: splitDates(value) })} />
            <LabeledInput label="许可状态" value={selected.permitStatus} onChange={(value) => patch({ permitStatus: value })} />
            <LabeledInput label="费用" value={selected.fee} onChange={(value) => patch({ fee: value })} />
            <LabeledInput label="电力" value={selected.power} onChange={(value) => patch({ power: value })} />
            <LabeledInput label="噪声" value={selected.noise} onChange={(value) => patch({ noise: value })} />
            <LabeledInput label="停车与装卸" value={selected.parking} onChange={(value) => patch({ parking: value })} />
            <LabeledInput label="卫生间/休息区" value={selected.facilities} onChange={(value) => patch({ facilities: value })} />
            <LabeledInput label="无障碍" value={selected.accessibility} onChange={(value) => patch({ accessibility: value })} />
            <LabeledInput label="安全风险" value={selected.safety} onChange={(value) => patch({ safety: value })} />
            <LabeledInput label="日照方向" value={selected.sunDirection} onChange={(value) => patch({ sunDirection: value })} />
            <LabeledInput label="空间尺寸" value={selected.dimensions} onChange={(value) => patch({ dimensions: value })} />
            <LabeledNumber label="综合评分" value={selected.score} min={1} max={5} onChange={(value) => patch({ score: value })} />
            <label><span>状态</span><StatusSelect value={selected.status} onChange={(status) => patch({ status })} /></label>
          </div>
          <label className="full-note"><span>勘景结论</span><textarea value={selected.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
          <label className="full-note"><span>现场照片/视频路径（每行一个）</span><textarea value={selected.photoPaths.join('\n')} onChange={(event) => patch({ photoPaths: splitLines(event.target.value) })} /></label>
          <button type="button" className="danger-link" onClick={() => props.onChange({ locations: props.data.locations.filter((item) => item.id !== selected.id) })}><Trash2 size={14} />删除场地</button>
        </>}
      </div>
    </div>
  )
}

function ShotPanel(props: { data: ProductionData; storyboardMode: boolean; selectedSceneId: string; selectedShotId: string; onSelectScene: (id: string) => void; onSelectShot: (id: string) => void; onChange: (patch: Partial<ProductionData>) => void; onExport: () => void }) {
  const sceneId = props.data.scenes.some((scene) => scene.sceneId === props.selectedSceneId) ? props.selectedSceneId : props.data.scenes[0]?.sceneId ?? ''
  const shots = props.data.shots.filter((shot) => shot.sceneId === sceneId)
  const selected = props.data.shots.find((shot) => shot.id === props.selectedShotId) ?? shots[0]
  function addShot() {
    if (!sceneId) return
    const shot: ShotRecord = { id: createProductionId('shot'), sceneId, number: `${props.data.scenes.find((scene) => scene.sceneId === sceneId)?.number ?? '1'}-${shots.length + 1}`, description: '新镜头', shotSize: '中景', angle: '平视', movement: '固定', lens: '50mm', fps: '24', shutter: '180°', filter: '', support: '三脚架', camera: '', lighting: '', equipment: '', estimatedMinutes: 20, durationSeconds: 5, storyboardPath: '', dialogueReference: '', status: 'todo', notes: '' }
    props.onChange({ shots: [...props.data.shots, shot] })
    props.onSelectShot(shot.id)
  }
  function patch(patch: Partial<ShotRecord>) {
    if (selected) props.onChange({ shots: replaceById(props.data.shots, selected.id, patch) })
  }
  return (
    <div className="production-panel">
      <PanelHeading title={props.storyboardMode ? '分镜设计' : '摄影镜头表'} detail={props.storyboardMode ? '分镜画格与镜头使用相同编号，可用于现场和剪辑交接。' : '记录景别、机位、运动、焦段、灯光和器材需求。'}>
        <button type="button" className="production-secondary" onClick={props.onExport} disabled={props.data.shots.length === 0}><Download size={15} />导出镜头表</button>
        <button type="button" className="production-primary" onClick={addShot}><Plus size={15} />增加镜头</button>
      </PanelHeading>
      <div className="shot-toolbar"><label><span>场次</span><select value={sceneId} onChange={(event) => props.onSelectScene(event.target.value)}>{props.data.scenes.map((scene) => <option key={scene.sceneId} value={scene.sceneId}>场 {scene.number} · {scene.heading}</option>)}</select></label></div>
      {props.storyboardMode ? (
        <div className="storyboard-grid">
          {shots.map((shot) => <button type="button" key={shot.id} className={shot.id === selected?.id ? 'storyboard-frame active' : 'storyboard-frame'} onClick={() => props.onSelectShot(shot.id)}><div>{shot.storyboardPath ? <img src={shot.storyboardPath} alt="" /> : <Film size={30} />}</div><b>{shot.number}</b><span>{shot.description}</span><small>{shot.shotSize} · {shot.movement} · {shot.durationSeconds}秒</small></button>)}
          {shots.length === 0 && <EmptyState text="这个场次还没有分镜。" />}
        </div>
      ) : (
        <div className="shot-table data-table">
          <div className="table-head"><span>镜号</span><span>描述</span><span>景别</span><span>焦段</span><span>运动</span><span>预计</span><span>状态</span></div>
          {shots.map((shot) => <button type="button" key={shot.id} className={shot.id === selected?.id ? 'table-row active' : 'table-row'} onClick={() => props.onSelectShot(shot.id)}><b>{shot.number}</b><span>{shot.description}</span><span>{shot.shotSize}</span><span>{shot.lens}</span><span>{shot.movement}</span><span>{shot.estimatedMinutes} 分</span><StatusBadge status={shot.status} /></button>)}
          {shots.length === 0 && <EmptyState text="这个场次还没有镜头。点击“增加镜头”开始设计。" />}
        </div>
      )}
      {selected && <section className="production-section shot-inspector">
        <h3>{selected.number} 镜头设置</h3>
        <div className="form-grid">
          <LabeledInput label="镜号" value={selected.number} onChange={(value) => patch({ number: value })} />
          <LabeledInput label="描述" value={selected.description} onChange={(value) => patch({ description: value })} />
          <LabeledInput label="景别" value={selected.shotSize} onChange={(value) => patch({ shotSize: value })} />
          <LabeledInput label="角度" value={selected.angle} onChange={(value) => patch({ angle: value })} />
          <LabeledInput label="运动" value={selected.movement} onChange={(value) => patch({ movement: value })} />
          <LabeledInput label="焦段" value={selected.lens} onChange={(value) => patch({ lens: value })} />
          <LabeledInput label="帧率" value={selected.fps} onChange={(value) => patch({ fps: value })} />
          <LabeledInput label="快门" value={selected.shutter} onChange={(value) => patch({ shutter: value })} />
          <LabeledInput label="滤镜" value={selected.filter} onChange={(value) => patch({ filter: value })} />
          <LabeledInput label="支撑设备" value={selected.support} onChange={(value) => patch({ support: value })} />
          <LabeledInput label="摄影机" value={selected.camera} onChange={(value) => patch({ camera: value })} />
          <LabeledInput label="灯光" value={selected.lighting} onChange={(value) => patch({ lighting: value })} />
          <LabeledInput label="特殊设备" value={selected.equipment} onChange={(value) => patch({ equipment: value })} />
          <LabeledNumber label="预计搭建分钟" value={selected.estimatedMinutes} min={0} max={999} onChange={(value) => patch({ estimatedMinutes: value })} />
          <LabeledNumber label="预计镜头秒数" value={selected.durationSeconds} min={0} max={9999} onChange={(value) => patch({ durationSeconds: value })} />
          <LabeledInput label="分镜图片路径或URL" value={selected.storyboardPath} onChange={(value) => patch({ storyboardPath: value })} />
          <LabeledInput label="对白范围" value={selected.dialogueReference} onChange={(value) => patch({ dialogueReference: value })} />
          <label><span>状态</span><StatusSelect value={selected.status} onChange={(status) => patch({ status })} /></label>
        </div>
        <label className="full-note"><span>镜头备注</span><textarea value={selected.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
      </section>}
    </div>
  )
}

function AssetPanel(props: { department: 'art' | 'props' | 'costume'; data: ProductionData; selectedId: string; onSelect: (id: string) => void; onChange: (patch: Partial<ProductionData>) => void; onExport: () => void }) {
  const assets = props.data.assets.filter((asset) => asset.department === props.department)
  const selected = props.data.assets.find((asset) => asset.id === props.selectedId && asset.department === props.department) ?? assets[0]
  const label = props.department === 'art' ? '美术与置景' : props.department === 'props' ? '道具管理' : '服装连续性'
  function addAsset() {
    const asset: ProductionAsset = { id: createProductionId('asset'), department: props.department, name: props.department === 'costume' ? '新造型' : props.department === 'props' ? '新道具' : '新美术项目', category: '', sceneIds: [], character: '', quantity: 1, source: '', vendor: '', cost: '', lifecycleStatus: 'planned', fittingOrDelivery: '', returnOrStrike: '', continuity: '', photoPaths: [], status: 'todo', notes: '' }
    props.onChange({ assets: [...props.data.assets, asset] })
    props.onSelect(asset.id)
  }
  function patch(patch: Partial<ProductionAsset>) {
    if (selected) props.onChange({ assets: replaceById(props.data.assets, selected.id, patch) })
  }
  return (
    <div className="production-panel split-panel">
      <aside className="record-sidebar">
        <div className="sidebar-heading"><strong>{label}</strong><button type="button" onClick={addAsset} title="新增"><Plus size={15} /></button></div>
        {assets.map((asset) => <button type="button" key={asset.id} className={asset.id === selected?.id ? 'active' : ''} onClick={() => props.onSelect(asset.id)}><span>{asset.name}</span><small>{asset.category || '未分类'} · 数量 {asset.quantity}</small><StatusBadge status={asset.status} /></button>)}
        {assets.length === 0 && <EmptyState text={`尚无${label}项目。`} />}
      </aside>
      <div className="record-content">
        <PanelHeading title={selected?.name ?? label} detail="把资产与具体场次和角色关联，连续性信息会跟随到拍摄现场。">
          <button type="button" className="production-secondary" onClick={props.onExport} disabled={assets.length === 0}><Download size={15} />导出部门表</button>
        </PanelHeading>
        {!selected ? <EmptyState text="请新增或选择一项。" /> : <>
          <div className="form-grid">
            <LabeledInput label="名称/造型号" value={selected.name} onChange={(value) => patch({ name: value })} />
            <LabeledInput label="类别" value={selected.category} onChange={(value) => patch({ category: value })} />
            <LabeledInput label="角色" value={selected.character} onChange={(value) => patch({ character: value })} />
            <LabeledNumber label="数量/备份" value={selected.quantity} min={0} max={9999} onChange={(value) => patch({ quantity: value })} />
            <LabeledInput label="来源/租赁" value={selected.source} onChange={(value) => patch({ source: value })} />
            <LabeledInput label="供应商" value={selected.vendor} onChange={(value) => patch({ vendor: value })} />
            <LabeledInput label="费用" value={selected.cost} onChange={(value) => patch({ cost: value })} />
            <LabeledSelect label="资产状态" value={selected.lifecycleStatus ?? 'planned'} options={Object.entries(assetEventLabels).filter(([id]) => id !== 'paid')} onChange={(value) => patch({ lifecycleStatus: value as NonNullable<ProductionAsset['lifecycleStatus']> })} />
            <LabeledInput label={props.department === 'costume' ? '试装日期' : '交付日期'} type="date" value={selected.fittingOrDelivery} onChange={(value) => patch({ fittingOrDelivery: value })} />
            <LabeledInput label={props.department === 'art' ? '拆除日期' : '归还日期'} type="date" value={selected.returnOrStrike} onChange={(value) => patch({ returnOrStrike: value })} />
            <label><span>状态</span><StatusSelect value={selected.status} onChange={(status) => patch({ status })} /></label>
          </div>
          <fieldset className="scene-checkboxes"><legend>使用场次</legend>{props.data.scenes.map((scene) => <label key={scene.sceneId}><input type="checkbox" checked={selected.sceneIds.includes(scene.sceneId)} onChange={(event) => patch({ sceneIds: event.target.checked ? [...selected.sceneIds, scene.sceneId] : selected.sceneIds.filter((id) => id !== scene.sceneId) })} /><span>{scene.number} · {scene.heading}</span></label>)}</fieldset>
          <label className="full-note"><span>连续性记录</span><textarea value={selected.continuity} onChange={(event) => patch({ continuity: event.target.value })} /></label>
          <label className="full-note"><span>参考图/连续性照片路径（每行一个）</span><textarea value={selected.photoPaths.join('\n')} onChange={(event) => patch({ photoPaths: splitLines(event.target.value) })} /></label>
          <label className="full-note"><span>部门备注</span><textarea value={selected.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
          <button type="button" className="danger-link" onClick={() => props.onChange({ assets: props.data.assets.filter((item) => item.id !== selected.id) })}><Trash2 size={14} />删除项目</button>
        </>}
      </div>
    </div>
  )
}

function OnsetPanel(props: { data: ProductionData; selectedDayId: string; selectedShotId: string; onSelectDay: (id: string) => void; onSelectShot: (id: string) => void; onChange: (patch: Partial<ProductionData>) => void; onExportReport: (dayId: string) => void }) {
  const day = props.data.shootDays.find((item) => item.id === props.selectedDayId) ?? props.data.shootDays[0]
  const sceneIds = day?.sceneIds ?? []
  const shots = props.data.shots.filter((shot) => sceneIds.includes(shot.sceneId))
  const shot = props.data.shots.find((item) => item.id === props.selectedShotId) ?? shots[0]
  const takes = props.data.takes.filter((take) => take.shotId === shot?.id)
  function addTake() {
    if (!shot) return
    const take: TakeRecord = { id: createProductionId('take'), shotId: shot.id, takeNumber: takes.length + 1, timecodeIn: '', timecodeOut: '', videoRoll: '', soundRoll: '', selected: false, status: 'hold', notes: '' }
    props.onChange({ takes: [...props.data.takes, take] })
  }
  return (
    <div className="production-panel onset-panel">
      <PanelHeading title="现场拍摄记录" detail="大尺寸控件适合片场和平板操作；优选条会直接进入剪辑交接。" />
      <div className="onset-controls">
        <label><span>拍摄日</span><select value={day?.id ?? ''} onChange={(event) => props.onSelectDay(event.target.value)}>{props.data.shootDays.map((item) => <option key={item.id} value={item.id}>第 {item.dayNumber} 天 · {item.date || '待定'}</option>)}</select></label>
        <label><span>镜头</span><select value={shot?.id ?? ''} onChange={(event) => props.onSelectShot(event.target.value)}>{shots.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.description}</option>)}</select></label>
        <div className="onset-actions"><button type="button" className="production-secondary" onClick={() => day && props.onExportReport(day.id)} disabled={!day || sceneIds.length === 0}><Download size={17} />拍摄日报</button><button type="button" className="production-primary onset-add" onClick={addTake} disabled={!shot}><Clapperboard size={18} />记录新一条</button></div>
      </div>
      {!day && <EmptyState text="请先在拍摄排期中建立拍摄日。" />}
      {day && sceneIds.length === 0 && <EmptyState text="请先在拍摄排期中为当天安排场次。" />}
      {day && sceneIds.length > 0 && shots.length === 0 && <EmptyState text="今日场次尚未建立镜头表。" />}
      {day && sceneIds.length > 0 && <section className="onset-scene-progress production-section"><div className="section-heading"><h3>今日场次进度</h3><span>{props.data.scenes.filter((scene) => sceneIds.includes(scene.sceneId) && scene.status === 'approved').length}/{sceneIds.length} 完成</span></div><div>{sceneIds.map((sceneId) => { const scene = props.data.scenes.find((item) => item.sceneId === sceneId); return scene ? <label key={sceneId}><b>{scene.number}</b><span>{scene.heading}</span><StatusSelect value={scene.status} onChange={(status) => props.onChange({ scenes: replaceByKey(props.data.scenes, 'sceneId', scene.sceneId, { status }) })} /></label> : null })}</div></section>}
      {shot && <>
        <div className="onset-shot-summary"><b>{shot.number}</b><strong>{shot.description}</strong><span>{shot.shotSize} · {shot.lens} · {shot.movement}</span><StatusBadge status={shot.status} /></div>
        <div className="take-grid">
          {takes.map((take) => <div className={take.selected ? 'take-card selected' : 'take-card'} key={take.id}>
            <header><strong>第 {take.takeNumber} 条</strong><button type="button" className={take.selected ? 'circle-take selected' : 'circle-take'} onClick={() => props.onChange({ takes: replaceById(props.data.takes, take.id, { selected: !take.selected }) })}><Check size={17} />{take.selected ? '优选' : '设为优选'}</button></header>
            <div className="take-fields">
              <LabeledInput label="入点" placeholder="01:00:00:00" value={take.timecodeIn} onChange={(value) => props.onChange({ takes: replaceById(props.data.takes, take.id, { timecodeIn: value }) })} />
              <LabeledInput label="出点" placeholder="01:00:05:00" value={take.timecodeOut} onChange={(value) => props.onChange({ takes: replaceById(props.data.takes, take.id, { timecodeOut: value }) })} />
              <LabeledInput label="画面卷" value={take.videoRoll} onChange={(value) => props.onChange({ takes: replaceById(props.data.takes, take.id, { videoRoll: value }) })} />
              <LabeledInput label="声音卷" value={take.soundRoll} onChange={(value) => props.onChange({ takes: replaceById(props.data.takes, take.id, { soundRoll: value }) })} />
              <label><span>评价</span><select value={take.status} onChange={(event) => props.onChange({ takes: replaceById(props.data.takes, take.id, { status: event.target.value as TakeRecord['status'] }) })}><option value="good">好</option><option value="hold">保留</option><option value="ng">NG</option></select></label>
            </div>
            <textarea aria-label="条次备注" placeholder="表演、技术或连续性备注" value={take.notes} onChange={(event) => props.onChange({ takes: replaceById(props.data.takes, take.id, { notes: event.target.value }) })} />
          </div>)}
        </div>
      </>}
    </div>
  )
}

function EditorialPanel(props: { data: ProductionData; onChange: (patch: Partial<ProductionData>) => void; onExportAle: () => void; onExportEdl: () => void }) {
  const rows = props.data.takes.map((take) => ({ take, shot: props.data.shots.find((shot) => shot.id === take.shotId) })).sort((left, right) => (left.shot?.number ?? '').localeCompare(right.shot?.number ?? '', undefined, { numeric: true }) || left.take.takeNumber - right.take.takeNumber)
  return (
    <div className="production-panel">
      <PanelHeading title="剪辑交接" detail="汇总镜号、条次、时间码、声画卷号和优选状态，导出给主流剪辑流程。">
        <button type="button" className="production-secondary" onClick={props.onExportAle} disabled={rows.length === 0}><Download size={15} />导出 ALE</button>
        <button type="button" className="production-primary" onClick={props.onExportEdl} disabled={!rows.some((row) => row.take.selected)}><Download size={15} />导出优选条 EDL</button>
      </PanelHeading>
      <div className="editorial-summary"><span>全部条次 <b>{rows.length}</b></span><span>优选 <b>{rows.filter((row) => row.take.selected).length}</b></span><span>NG <b>{rows.filter((row) => row.take.status === 'ng').length}</b></span></div>
      <div className="editorial-table data-table">
        <div className="table-head"><span>优选</span><span>镜号</span><span>条</span><span>入点</span><span>出点</span><span>画面卷</span><span>声音卷</span><span>评价</span><span>备注</span></div>
        {rows.map(({ take, shot }) => <div className="table-row" key={take.id}><input aria-label="优选条" type="checkbox" checked={take.selected} onChange={(event) => props.onChange({ takes: replaceById(props.data.takes, take.id, { selected: event.target.checked }) })} /><b>{shot?.number ?? '未关联'}</b><span>{take.takeNumber}</span><span>{take.timecodeIn || '-'}</span><span>{take.timecodeOut || '-'}</span><span>{take.videoRoll || '-'}</span><span>{take.soundRoll || '-'}</span><span>{takeStatusLabel(take.status)}</span><span title={take.notes}>{take.notes || '-'}</span></div>)}
        {rows.length === 0 && <EmptyState text="现场尚未记录条次。" />}
      </div>
    </div>
  )
}

function BudgetLifecyclePanel(props: {
  data: ProductionData
  onChange: (patch: Partial<ProductionData>) => void
  onExportBudget: () => void
  onExportLedger: () => void
}) {
  const [selectedLineId, setSelectedLineId] = useState(props.data.budgetLines[0]?.id ?? '')
  const [selectedAssetId, setSelectedAssetId] = useState(props.data.assets[0]?.id ?? '')
  const selectedLine = props.data.budgetLines.find((line) => line.id === selectedLineId) ?? props.data.budgetLines[0]
  const selectedAsset = props.data.assets.find((asset) => asset.id === selectedAssetId) ?? props.data.assets[0]
  const assetEvents = props.data.assetEvents.filter((event) => event.assetId === selectedAsset?.id).sort((left, right) => right.date.localeCompare(left.date))
  const budget = props.data.budgetLines.reduce((sum, line) => sum + line.budgetAmount, 0)
  const committed = props.data.budgetLines.reduce((sum, line) => sum + line.committedAmount, 0)
  const actual = props.data.budgetLines.reduce((sum, line) => sum + line.actualAmount, 0)

  function addBudgetLine() {
    const line: BudgetLine = {
      id: createProductionId('budget'),
      category: 'other',
      description: '新预算项目',
      department: 'producer',
      sceneIds: [],
      vendor: '',
      budgetAmount: 0,
      committedAmount: 0,
      actualAmount: 0,
      status: 'todo',
      notes: '',
    }
    props.onChange({ budgetLines: [...props.data.budgetLines, line] })
    setSelectedLineId(line.id)
  }

  function patchLine(patch: Partial<BudgetLine>) {
    if (selectedLine) props.onChange({ budgetLines: replaceById(props.data.budgetLines, selectedLine.id, patch) })
  }

  function addAssetEvent() {
    if (!selectedAsset) return
    const event: AssetLifecycleEvent = {
      id: createProductionId('asset-event'),
      assetId: selectedAsset.id,
      type: 'ordered',
      date: new Date().toISOString().slice(0, 10),
      quantity: selectedAsset.quantity || 1,
      amount: 0,
      person: '',
      notes: '',
    }
    props.onChange({
      assetEvents: [event, ...props.data.assetEvents],
      assets: replaceById(props.data.assets, selectedAsset.id, { lifecycleStatus: 'ordered' }),
    })
  }

  function patchAssetEvent(event: AssetLifecycleEvent, patch: Partial<AssetLifecycleEvent>) {
    const nextType = patch.type ?? event.type
    const assetPatch = nextType === 'paid' ? undefined : { lifecycleStatus: nextType }
    props.onChange({
      assetEvents: replaceById(props.data.assetEvents, event.id, patch),
      ...(assetPatch ? { assets: replaceById(props.data.assets, event.assetId, assetPatch) } : {}),
    })
  }

  return (
    <div className="production-panel budget-panel">
      <PanelHeading title="预算与资产全生命周期" detail="把拆解、采购、租赁、领用、归还、损坏与实际支出保存在当前项目中。">
        <button type="button" className="production-secondary" disabled={props.data.budgetLines.length === 0} onClick={props.onExportBudget}><Download size={15} />预算表</button>
        <button type="button" className="production-secondary" disabled={props.data.assetEvents.length === 0} onClick={props.onExportLedger}><Download size={15} />资产台账</button>
        <button type="button" className="production-primary" onClick={addBudgetLine}><Plus size={15} />预算项目</button>
      </PanelHeading>
      <div className="budget-metrics">
        <span><small>预算</small><b>{formatMoney(budget)}</b></span>
        <span><small>已承诺</small><b>{formatMoney(committed)}</b></span>
        <span><small>实际支出</small><b>{formatMoney(actual)}</b></span>
        <span className={budget - actual < 0 ? 'over' : ''}><small>剩余/超支</small><b>{formatMoney(budget - actual)}</b></span>
      </div>

      <div className="budget-workspace">
        <aside className="budget-line-list">
          {props.data.budgetLines.map((line) => <button type="button" className={line.id === selectedLine?.id ? 'active' : ''} key={line.id} onClick={() => setSelectedLineId(line.id)}><span>{line.description}</span><small>{budgetCategoryLabels[line.category]} · {departmentLabels[line.department]}</small><b>{formatMoney(line.actualAmount)} / {formatMoney(line.budgetAmount)}</b></button>)}
          {props.data.budgetLines.length === 0 && <EmptyState text="建立第一条预算后，可跟踪承诺额与实际支出。" />}
        </aside>
        <section className="budget-editor">
          {!selectedLine ? <EmptyState text="新增或选择预算项目。" /> : <>
            <div className="form-grid">
              <LabeledInput label="项目" value={selectedLine.description} onChange={(value) => patchLine({ description: value })} />
              <LabeledSelect label="类别" value={selectedLine.category} options={Object.entries(budgetCategoryLabels)} onChange={(value) => patchLine({ category: value as BudgetCategory })} />
              <LabeledSelect label="责任部门" value={selectedLine.department} options={Object.entries(departmentLabels)} onChange={(value) => patchLine({ department: value as ProductionDepartment })} />
              <LabeledInput label="供应商" value={selectedLine.vendor} onChange={(value) => patchLine({ vendor: value })} />
              <MoneyInput label="预算金额" value={selectedLine.budgetAmount} onChange={(value) => patchLine({ budgetAmount: value })} />
              <MoneyInput label="已承诺金额" value={selectedLine.committedAmount} onChange={(value) => patchLine({ committedAmount: value })} />
              <MoneyInput label="实际支出" value={selectedLine.actualAmount} onChange={(value) => patchLine({ actualAmount: value })} />
              <label><span>关联资产</span><select value={selectedLine.assetId ?? ''} onChange={(event) => patchLine({ assetId: event.target.value || undefined })}><option value="">不关联</option>{props.data.assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>
              <label><span>状态</span><StatusSelect value={selectedLine.status} onChange={(status) => patchLine({ status })} /></label>
            </div>
            <fieldset className="scene-checkboxes"><legend>涉及场次</legend>{props.data.scenes.map((scene) => <label key={scene.sceneId}><input type="checkbox" checked={selectedLine.sceneIds.includes(scene.sceneId)} onChange={(event) => patchLine({ sceneIds: event.target.checked ? [...selectedLine.sceneIds, scene.sceneId] : selectedLine.sceneIds.filter((id) => id !== scene.sceneId) })} /><span>{scene.number} · {scene.heading}</span></label>)}</fieldset>
            <label className="full-note"><span>预算备注</span><textarea value={selectedLine.notes} onChange={(event) => patchLine({ notes: event.target.value })} /></label>
            <button type="button" className="danger-link" onClick={() => props.onChange({ budgetLines: props.data.budgetLines.filter((line) => line.id !== selectedLine.id) })}><Trash2 size={14} />删除预算项目</button>
          </>}
        </section>
      </div>

      <section className="asset-ledger production-section">
        <div className="section-heading"><div><h3>资产流转台账</h3><span>采购、租赁资产从到货到归还均可追溯</span></div><div className="asset-ledger-actions"><select aria-label="选择资产" value={selectedAsset?.id ?? ''} onChange={(event) => setSelectedAssetId(event.target.value)}><option value="">选择资产</option>{props.data.assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select><button type="button" className="production-primary" disabled={!selectedAsset} onClick={addAssetEvent}><Plus size={14} />记录流转</button></div></div>
        {selectedAsset && <div className="asset-current-state"><b>{selectedAsset.name}</b><span>{assetEventLabels[selectedAsset.lifecycleStatus ?? 'planned']}</span><small>数量 {selectedAsset.quantity} · {selectedAsset.source || '来源待补充'}</small></div>}
        <div className="asset-event-list data-table">
          <div className="asset-event-row head"><span>事件</span><span>日期</span><span>数量</span><span>金额</span><span>经办人</span><span>备注</span><span>操作</span></div>
          {assetEvents.map((event) => <div className="asset-event-row" key={event.id}><select aria-label="资产事件" value={event.type} onChange={(change) => patchAssetEvent(event, { type: change.target.value as AssetLifecycleEventType })}>{Object.entries(assetEventLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><input aria-label="事件日期" type="date" value={event.date} onChange={(change) => patchAssetEvent(event, { date: change.target.value })} /><input aria-label="事件数量" type="number" min="0" value={event.quantity} onChange={(change) => patchAssetEvent(event, { quantity: Number(change.target.value) })} /><input aria-label="事件金额" type="number" min="0" step="0.01" value={event.amount} onChange={(change) => patchAssetEvent(event, { amount: Number(change.target.value) })} /><input aria-label="经办人" value={event.person} onChange={(change) => patchAssetEvent(event, { person: change.target.value })} /><input aria-label="事件备注" value={event.notes} onChange={(change) => patchAssetEvent(event, { notes: change.target.value })} /><IconAction label="删除记录" onClick={() => props.onChange({ assetEvents: props.data.assetEvents.filter((item) => item.id !== event.id) })}><Trash2 size={14} /></IconAction></div>)}
          {selectedAsset && assetEvents.length === 0 && <EmptyState text="这个资产还没有流转记录。" />}
          {!selectedAsset && <EmptyState text="先在美术、道具或服装页面建立资产。" />}
        </div>
      </section>
    </div>
  )
}

function ImpactPanel(props: {
  data: ProductionData
  productionLocked: boolean
  pageLabels: string[]
  scenePageLabels: Record<string, string[]>
  onChange: (patch: Partial<ProductionData>) => void
  onLockProduction: () => void
  onExport: (distribution: RevisionDistribution) => void
}) {
  const activeSet = props.data.revisionSets.find((set) => set.id === props.data.activeRevisionSetId)

  function acknowledge(impact: ScriptChangeImpact, department: ProductionDepartment) {
    const acknowledgedBy = impact.acknowledgedBy.includes(department) ? impact.acknowledgedBy.filter((id) => id !== department) : [...impact.acknowledgedBy, department]
    props.onChange({ changeImpacts: replaceById(props.data.changeImpacts, impact.id, { acknowledgedBy }) })
  }

  function startRevisionSet() {
    if (!props.productionLocked) {
      props.onLockProduction()
      return
    }
    if (activeSet) return
    const set = createRevisionSet(props.data, props.pageLabels)
    props.onChange({ revisionSets: [...props.data.revisionSets, set], activeRevisionSetId: set.id })
  }

  function patchActiveSet(patch: Partial<NonNullable<typeof activeSet>>) {
    if (activeSet) props.onChange({ revisionSets: replaceById(props.data.revisionSets, activeSet.id, patch) })
  }

  function issueRevisionSet() {
    if (!activeSet || activeSet.sceneIds.length === 0) return
    const affectedPages = [...new Set(activeSet.sceneIds.flatMap((sceneId) => props.scenePageLabels[sceneId] ?? []))]
    const distribution = createRevisionDistribution(activeSet, affectedPages)
    props.onChange({
      revisionSets: replaceById(props.data.revisionSets, activeSet.id, { status: 'issued', closedAt: new Date().toISOString(), pageLabels: affectedPages }),
      activeRevisionSetId: undefined,
      revisionDistributions: [distribution, ...props.data.revisionDistributions],
    })
  }

  function acknowledgeDistribution(distribution: RevisionDistribution, department: ProductionDepartment) {
    const acknowledgedBy = distribution.acknowledgedBy.includes(department) ? distribution.acknowledgedBy.filter((id) => id !== department) : [...distribution.acknowledgedBy, department]
    props.onChange({ revisionDistributions: replaceById(props.data.revisionDistributions, distribution.id, { acknowledgedBy }) })
  }

  return (
    <div className="production-panel revision-panel">
      <PanelHeading title="专业修订与分发" detail="锁定制片基准后，按标准颜色记录修订、生成修订页和部门分发确认。">
        <button type="button" className="production-secondary" onClick={() => props.onChange({ changeImpacts: props.data.changeImpacts.filter((impact) => impact.acknowledgedBy.length < impact.departments.length) })}>清理已完成</button>
        <button type="button" className="production-primary" disabled={Boolean(activeSet)} onClick={startRevisionSet}>{props.productionLocked ? activeSet ? '修订组进行中' : '开始下一修订组' : '先锁页并锁场'}</button>
      </PanelHeading>

      {!props.productionLocked && <div className="revision-lock-notice"><AlertTriangle size={17} /><div><strong>尚未锁定制片基准</strong><p>专业修订应先固定当前页数和场号。点击“先锁页并锁场”后，新增场次会使用 A/B 场号。</p></div></div>}

      <div className="revision-set-strip">
        {props.data.revisionSets.map((set) => <article className={set.id === activeSet?.id ? 'active' : ''} key={set.id}><span className={`revision-color-dot ${set.color}`} /><div><strong>{set.label}</strong><small>{set.status === 'active' ? '正在记录' : `${set.pageLabels.length} 个修订页`}</small></div><b>{set.mark}</b></article>)}
        {props.data.revisionSets.length === 0 && <EmptyState text="锁定制片基准并开始第一组蓝页修订。" />}
      </div>

      {activeSet && <section className="active-revision production-section">
        <div className="section-heading"><div><h3>当前修订组</h3><span>{activeSet.sceneIds.length} 个受影响场次</span></div><button type="button" className="production-primary" disabled={activeSet.sceneIds.length === 0} onClick={issueRevisionSet}><Download size={15} />封版并生成部门包</button></div>
        <div className="compact-fields">
          <LabeledInput label="修订名称" value={activeSet.label} onChange={(value) => patchActiveSet({ label: value })} />
          <LabeledSelect label="页面颜色" value={activeSet.color} options={standardRevisionColors.map((item) => [item.color, item.label])} onChange={(value) => patchActiveSet({ color: value as typeof activeSet.color })} />
          <LabeledInput label="页边标记" value={activeSet.mark} onChange={(value) => patchActiveSet({ mark: Array.from(value).slice(0, 2).join('') || '*' })} />
        </div>
        <div className="revision-scene-chips">{activeSet.sceneIds.map((sceneId) => { const scene = props.data.scenes.find((item) => item.sceneId === sceneId); return <span key={sceneId}>{scene ? `${scene.number} · ${scene.heading}` : '已删除场次'}</span> })}{activeSet.sceneIds.length === 0 && <small>开始修订组后，正文修改会自动登记到这里。</small>}</div>
      </section>}

      <section className="revision-distributions production-section">
        <div className="section-heading"><h3>部门分发与确认</h3><span>{props.data.revisionDistributions.filter((item) => item.acknowledgedBy.length < item.departments.length).length} 包待确认</span></div>
        {props.data.revisionDistributions.map((distribution) => {
          const done = distribution.acknowledgedBy.length === distribution.departments.length
          return <article className={done ? 'distribution-row done' : 'distribution-row'} key={distribution.id}><header><div><StatusBadge status={done ? 'approved' : 'review'} /><strong>{distribution.title}</strong></div><div><span>{distribution.pageLabels.length ? `修订页 ${distribution.pageLabels.join('、')}` : '按场次分发'}</span><button type="button" className="production-secondary" onClick={() => props.onExport(distribution)}><Download size={14} />导出部门包</button></div></header><p>{distribution.sceneIds.length} 个场次 · {new Date(distribution.createdAt).toLocaleString('zh-CN')}</p><div className="department-acks">{distribution.departments.map((department) => <button type="button" key={department} className={distribution.acknowledgedBy.includes(department) ? 'active' : ''} onClick={() => acknowledgeDistribution(distribution, department)}>{distribution.acknowledgedBy.includes(department) && <Check size={13} />}{departmentLabels[department]}</button>)}</div><label className="distribution-note"><span>分发备注</span><input value={distribution.notes} onChange={(event) => props.onChange({ revisionDistributions: replaceById(props.data.revisionDistributions, distribution.id, { notes: event.target.value }) })} /></label></article>
        })}
        {props.data.revisionDistributions.length === 0 && <EmptyState text="修订封版后，会在这里生成可离线交付的部门包和确认记录。" />}
      </section>

      <div className="section-heading impact-heading"><h3>逐项修改影响</h3><span>{props.data.changeImpacts.length} 项记录</span></div>
      <div className="impact-list">
        {props.data.changeImpacts.map((impact) => {
          const scene = props.data.scenes.find((item) => item.sceneId === impact.sceneId)
          const done = impact.acknowledgedBy.length === impact.departments.length
          return <article className={`impact-row ${impact.changeType} ${done ? 'done' : ''}`} key={impact.id}><header><StatusBadge status={done ? 'approved' : 'review'} /><strong>{scene ? `场 ${scene.number}` : '已删除场次'}</strong><time>{new Date(impact.createdAt).toLocaleString('zh-CN')}</time></header><p>{impact.summary}</p><div className="department-acks">{impact.departments.map((department) => <button type="button" key={department} className={impact.acknowledgedBy.includes(department) ? 'active' : ''} onClick={() => acknowledge(impact, department)}>{impact.acknowledgedBy.includes(department) && <Check size={13} />}{departmentLabels[department]}</button>)}</div></article>
        })}
        {props.data.changeImpacts.length === 0 && <EmptyState text="当前没有待传达的剧本修改。" />}
      </div>
    </div>
  )
}

function SceneStrip(props: {
  scene: ProductionData['scenes'][number]
  data: ProductionData
  dragging: boolean
  onAssign: (sceneId: string, dayId: string) => void
  onDragStart: (sceneId: string) => void
  onDragEnd: () => void
  onDropBefore: (sceneId: string) => void
}) {
  const cast = props.data.tags.filter((tag) => tag.sceneId === props.scene.sceneId && tag.category === 'cast').map((tag) => tag.name)
  return <article className={`scene-strip ${props.scene.interiorExterior}${props.dragging ? ' dragging' : ''}`} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; props.onDragStart(props.scene.sceneId) }} onDragEnd={props.onDragEnd} onDragOver={(event) => { event.preventDefault(); event.stopPropagation() }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); props.onDropBefore(props.scene.sceneId) }}><GripVertical className="scene-strip-grip" size={15} aria-hidden="true" /><header><b>{props.scene.number}</b><span>{productionPlaceLabel(props.scene.interiorExterior)} · {productionTimeLabel(props.scene.timeOfDay)}</span><strong>{props.scene.pageEighths}/8</strong></header><p>{props.scene.locationName}</p><small>{cast.join('、') || '无角色'}</small><select aria-label="分配拍摄日" value={props.scene.shootDayId ?? ''} onChange={(event) => props.onAssign(props.scene.sceneId, event.target.value)}><option value="">未安排</option>{props.data.shootDays.map((day) => <option key={day.id} value={day.id}>第 {day.dayNumber} 天</option>)}</select></article>
}

function TagChip(props: { tag: BreakdownTag; onConfirm: () => void; onDelete: () => void }) {
  return <span className={props.tag.confirmed ? 'tag-chip confirmed' : 'tag-chip'}><button type="button" onClick={props.onConfirm} title={props.tag.confirmed ? '取消确认' : '确认元素'}>{props.tag.confirmed && <Check size={12} />}{props.tag.name}</button><button type="button" onClick={props.onDelete} title="删除"><Trash2 size={12} /></button></span>
}

function PanelHeading(props: { title: string; detail: string; children?: React.ReactNode }) {
  return <header className="panel-heading"><div><h1>{props.title}</h1><p>{props.detail}</p></div><div className="panel-heading-actions">{props.children}</div></header>
}

function MetricButton(props: { label: string; value: string | number; onClick: () => void; warning?: boolean }) {
  return <button type="button" className={props.warning ? 'production-metric warning' : 'production-metric'} onClick={props.onClick}><strong>{props.value}</strong><span>{props.label}</span></button>
}

function StatusBadge({ status }: { status: ProductionStatus }) {
  return <span className={`status-badge ${status}`}>{statusLabels[status]}</span>
}

function StatusSelect(props: { value: ProductionStatus; onChange: (status: ProductionStatus) => void }) {
  return <select className="status-select" value={props.value} onChange={(event) => props.onChange(event.target.value as ProductionStatus)}>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
}

function LabeledInput(props: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label><span>{props.label}</span><input type={props.type ?? 'text'} placeholder={props.placeholder} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>
}

function LabeledNumber(props: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label><span>{props.label}</span><input type="number" min={props.min} max={props.max} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} /></label>
}

function MoneyInput(props: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{props.label}</span><input type="number" min="0" step="0.01" value={props.value} onChange={(event) => props.onChange(Math.max(0, Number(event.target.value) || 0))} /></label>
}

function LabeledSelect(props: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label><span>{props.label}</span><select value={props.value} onChange={(event) => props.onChange(event.target.value)}>{props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
}

function IconAction(props: { label: string; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className="icon-action" title={props.label} aria-label={props.label} onClick={props.onClick}>{props.children}</button>
}

function EmptyState({ text }: { text: string }) {
  return <div className="production-empty"><ListChecks size={24} /><span>{text}</span></div>
}

function replaceById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item)
}

function replaceByKey<T, K extends keyof T>(items: T[], key: K, value: T[K], patch: Partial<T>) {
  return items.map((item) => item[key] === value ? { ...item, ...patch } : item)
}

const productionTimeOptions: Array<[string, string]> = [
  ['day', '日'],
  ['night', '夜'],
  ['morning', '早晨'],
  ['dawn', '黎明'],
  ['dusk', '黄昏'],
  ['continuous', '连续'],
  ['later', '稍后'],
]

function productionTimeLabel(value: string) {
  return productionTimeOptions.find(([id]) => id === value)?.[1] ?? value
}

function productionPlaceLabel(value: string) {
  return ({ int: '内景', ext: '外景', intExt: '内外景', extInt: '外内景' } as Record<string, string>)[value] ?? value
}

function takeStatusLabel(value: TakeRecord['status']) {
  return ({ good: '好', hold: '保留', ng: 'NG' } as const)[value]
}

function splitLines(value: string) {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean)
}

function splitDates(value: string) {
  return [...new Set(value.split(/[,，;；\s]+/u).map((item) => item.trim()).filter(Boolean))]
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
}
