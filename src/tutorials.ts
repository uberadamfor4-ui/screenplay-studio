import type { ScriptElementType } from './types'

export type TutorialLesson = {
  id: string
  title: string
  summary: string
  steps: string[]
  shortcut?: string
}

export type FormatRule = {
  id: string
  title: string
  detail: string
  recommended: string
  avoid: string
}

export type TutorialExampleElement = {
  type: ScriptElementType
  text: string
}

export type HollywoodExample = {
  id: string
  title: string
  focus: string
  summary: string
  tips: string[]
  elements: TutorialExampleElement[]
}

export const softwareLessons: TutorialLesson[] = [
  {
    id: 'first-script',
    title: '建立并保存第一份剧本',
    summary: '从一个干净项目开始，先确定剧本格式、语言和字体，再保存项目文件。',
    steps: [
      '点击顶部“新建”，建立空白剧本。',
      '在“偏好设置”中选择默认格式、剧本语言、场景词和字体。',
      '输入剧名和作者后，使用“保存”生成可继续编辑的项目文件。',
      '写作中软件会自动保存恢复快照；重要节点仍建议手动保存版本。',
    ],
    shortcut: 'Ctrl+N 新建，Ctrl+S 保存',
  },
  {
    id: 'paragraph-flow',
    title: '用段落类型快速写作',
    summary: '剧本不是普通文字排版，每一段都应有明确类型，软件会自动套用位置与间距。',
    steps: [
      '场景标题之后按 Enter，自动进入动作段落。',
      '动作之后切换为角色，输入角色名，再按 Enter 进入对白。',
      '使用 Tab 在常用段落类型之间切换，不必手动敲空格对齐。',
      '段落类型选错时，直接从格式栏更改，文字内容不会丢失。',
    ],
    shortcut: 'Enter 进入下一段，Tab 切换段落类型',
  },
  {
    id: 'scene-heading',
    title: '正确建立场景标题',
    summary: '场景标题交代内外景、地点和时间，是分场、统计与制片功能的基础。',
    steps: [
      '选择“场景标题”段落，依次填写内/外景、具体地点和昼夜。',
      '中文可写“内景 公寓客厅 - 日”，英文可写“INT. APARTMENT - DAY”。',
      '通过偏好设置统一 INT./EXT.、内景/外景和日/夜等术语。',
      '保持同一地点命名一致，项目地图和制片统计才能准确归类。',
    ],
  },
  {
    id: 'dialogue',
    title: '写角色、对白与括注',
    summary: '角色名、括注和对白是三个独立段落；让内容决定节奏，不用手动居中。',
    steps: [
      '角色首次出现时在动作中简洁介绍，并保持角色名拼写一致。',
      '角色段落只放姓名及必要扩展，如“林乔 (V.O.)”。',
      '括注只用于读者无法从对白本身判断的短动作或语气。',
      '对白保持可说、可演；长段落可按情绪或动作节点自然拆分。',
    ],
  },
  {
    id: 'navigate',
    title: '在长剧本中快速移动',
    summary: '用快速跳转、剧本地图和打字机模式减少找段落与滚动的负担。',
    steps: [
      '打开“快速跳转”，按场号、地点、角色或关键词检索。',
      '使用“剧本地图”查看场景顺序、长度和主要角色。',
      '开启打字机模式，让当前段落稳定停留在舒适视线区域。',
      '多选段落后可统一移动或删除，场景卡片墙适合调整整场顺序。',
    ],
  },
  {
    id: 'import',
    title: '导入 Word、TXT 与 FDX',
    summary: '导入时先识别段落语义，再检查场景标题、角色名和转场。',
    steps: [
      '从辅助功能选择“导入 Word/TXT”，软件会尝试识别好莱坞段落类型。',
      '从 Final Draft 交换项目时使用 FDX 导入，完成后抽查特殊段落。',
      '普通散文可能缺少明确格式标记，导入后应逐场检查识别结果。',
      '导入完成先另存一份项目，再进行全局替换或术语转换。',
    ],
  },
  {
    id: 'assistive',
    title: '使用辅助功能整理剧本',
    summary: '把机械工作交给工具，但在应用批量修改前先看清范围。',
    steps: [
      '统一错别字与替换文字时，先搜索确认不会误改角色名或专有名词。',
      '一键统计角色与场景，检查同一人物是否出现多个拼写。',
      '完成初稿后再统一场序，规格稿投稿时可按要求清除场号。',
      '运行剧本诊断，逐项处理过长动作段、空段落和格式异常。',
    ],
  },
  {
    id: 'review',
    title: '批注、版本与恢复',
    summary: '把创作版本和审阅意见分开管理，避免修改过程覆盖重要文本。',
    steps: [
      '重大改写前保存版本快照，并写清这一版的目标。',
      '审阅意见使用批注，不要直接混入剧本文字。',
      '修订模式可标记新增和修改内容，适合制片阶段交付。',
      '误改后先用撤销；跨会话问题可从版本时间线或自动恢复中找回。',
    ],
    shortcut: 'Ctrl+Z 撤销，Ctrl+Shift+Z 重做',
  },
  {
    id: 'export',
    title: '专业预检与导出',
    summary: '导出前同时检查内容、分页和阅读效果，PDF 才是最终交付基准。',
    steps: [
      '打开“专业预览”，确认 Letter 纸、12 磅等项目设置。',
      '检查孤行、跨页对白、长动作段和转场位置。',
      '导出 PDF 后逐页查看页码、分页和字体嵌入效果。',
      'PNG 适合快速查看或分享画面，FDX 适合继续编辑和交换。',
    ],
  },
  {
    id: 'shortcuts',
    title: '建立自己的快捷键习惯',
    summary: '快捷键应服务写作节奏，可从预设开始，再调整高频命令。',
    steps: [
      '在“快捷键偏好”中选择接近自己习惯的预设。',
      '优先记住保存、撤销、段落类型、快速跳转和命令面板。',
      '为常用功能改键时避免与系统快捷键冲突。',
      '命令面板可搜索不常用功能，不必把所有按钮都留在眼前。',
    ],
  },
]

export const hollywoodFormatRules: FormatRule[] = [
  {
    id: 'page-font',
    title: '页面与字体',
    detail: '行业没有唯一到小数点的绝对模板，但美国规格稿通常使用 Letter 纸和 12 磅等宽 Courier 系字体。',
    recommended: 'Letter 纸、12 磅 Courier New/Courier Prime 类等宽字体；用段落样式控制缩进。',
    avoid: '用空格或 Tab 手动排版、使用比例字体、为压页数随意缩小字号和页边距。',
  },
  {
    id: 'scene',
    title: '场景标题',
    detail: '场景标题通常大写，由内外景、具体地点和时间组成。中文写作可使用语义等价的本地化术语。',
    recommended: 'INT. APARTMENT - DAY；或“内景 公寓 - 日”。同一项目保持术语和地点命名一致。',
    avoid: '把剧情动作写进场景标题；同一地点反复使用不同名称。',
  },
  {
    id: 'action',
    title: '动作与描述',
    detail: '只写观众能够看见或听见的内容，通常采用现在时，并以短段落维持阅读速度。',
    recommended: '用具体动词和可拍摄信息；多数动作块控制在约四至五行以内。',
    avoid: '直接解释角色无法被看见的内心、连续大段散文、过度指导表演和镜头。',
  },
  {
    id: 'character',
    title: '角色提示',
    detail: '角色提示位于对白上方，通常使用大写并保持名称一致；它不是页面正中央。',
    recommended: '固定使用同一角色名；必要时加入 (V.O.)、(O.S.) 等扩展。',
    avoid: '角色姓名拼写漂移、把动作说明塞进角色提示、手工敲空格居中。',
  },
  {
    id: 'dialogue',
    title: '对白',
    detail: '对白位于角色提示下方，栏宽明显窄于动作段；自然换行由软件处理。',
    recommended: '让台词可说、可演；用动作或角色变化拆开过长独白。',
    avoid: '把对白拉到整页宽、依赖空格换行、为说明剧情写出不自然的信息倾倒。',
  },
  {
    id: 'parenthetical',
    title: '括注',
    detail: '括注位于角色提示与对白之间，用来提供必要且很短的表演或动作信息。',
    recommended: '只在台词含义可能被误读时使用，如“（压低声音）”。',
    avoid: '每句对白都加语气、写成长动作段、替导演和演员决定所有表演细节。',
  },
  {
    id: 'transition',
    title: '转场',
    detail: '传统显式转场通常靠右并使用大写，如 CUT TO:。现代规格稿常依靠新场景标题自然完成转场。',
    recommended: '确有节奏或叙事意义时使用“CUT TO:”或“切至：”，并保持靠右。',
    avoid: '每场都写 CUT TO、把转场放在左侧、将普通动作误设为转场。',
  },
  {
    id: 'shots',
    title: '镜头与声音强调',
    detail: '规格稿以讲清故事为主；镜头指令和大写强调应当克制，仅用于不可替代的阅读信息。',
    recommended: '必要时使用 INSERT、POV 或关键声音强调，并让其服务叙事。',
    avoid: '逐镜头指挥摄影、频繁使用粗体和全大写、让页面充满技术标记。',
  },
  {
    id: 'spec-shooting',
    title: '规格稿与拍摄稿',
    detail: '投稿或阅读用规格稿通常不含场号，也尽量减少镜头指令；进入制片后才使用场号、修订色和锁页。',
    recommended: '先明确交付对象；投稿前清除不需要的场号，制片锁定后再统一编号。',
    avoid: '把制片标记带进阅读稿，或在制作已锁定后随意重排场号和页码。',
  },
  {
    id: 'pagination',
    title: '分页与最终检查',
    detail: '专业软件会处理跨页对白和段落分页，但作者仍应检查页面是否出现孤立角色名、异常空白或拥挤。',
    recommended: '以导出的 PDF 为准逐页检查；先修内容，再微调分页。',
    avoid: '靠空行推页、为凑页数改字体、只看编辑器而不检查最终 PDF。',
  },
]

export const hollywoodExamples: HollywoodExample[] = [
  {
    id: 'master-scene',
    title: '01 基础主场景',
    focus: '场景标题 + 动作 + 对白',
    summary: '最常见的主场景写法：先建立地点和时间，再只写观众能看到、听到的内容。',
    tips: ['场景标题交代内外景、地点与昼夜。', '角色提示和对白使用独立段落。'],
    elements: [
      { type: 'scene', text: 'INT. COMMUNITY RADIO STATION - NIGHT' },
      { type: 'action', text: '暴雨拍打窗户。林乔推高最后一只推子，直播间的红灯亮起。' },
      { type: 'character', text: '林乔' },
      { type: 'dialogue', text: '这里是午夜频率。还醒着的人，今晚请别挂断。' },
    ],
  },
  {
    id: 'localized-heading',
    title: '02 中文场景术语',
    focus: '本地化场景标题',
    summary: '用中文写作时可以采用语义等价的内景、外景和日夜术语，同时保持好莱坞段落结构。',
    tips: ['项目内的术语风格应统一。', '地点名称要具体且可重复识别。'],
    elements: [
      { type: 'scene', text: '外景 江边旧码头 - 黎明' },
      { type: 'action', text: '潮水退去，一只红色行李箱搁在湿亮的石阶上。' },
      { type: 'action', text: '程野停下自行车。他没有靠近。' },
    ],
  },
  {
    id: 'character-intro',
    title: '03 角色首次登场',
    focus: '简洁可拍的角色介绍',
    summary: '第一次介绍角色时给读者一个鲜明、可见且与当下行动有关的印象。',
    tips: ['年龄可用范围表达，不必写人物小传。', '介绍之后保持角色名拼写一致。'],
    elements: [
      { type: 'scene', text: 'INT. COUNTY HOSPITAL CORRIDOR - DAY' },
      { type: 'action', text: '周岚，三十多岁，白大褂袖口沾着咖啡，逆着下班的人流快步走来。' },
      { type: 'character', text: '周岚' },
      { type: 'dialogue', text: '手术室给我留着。病人五分钟后到。' },
    ],
  },
  {
    id: 'parenthetical',
    title: '04 克制使用括注',
    focus: '对白含义的必要提示',
    summary: '当一句话的真实意图无法从上下文看清时，用短括注消除歧义。',
    tips: ['括注要短。', '能用动作表达时，优先使用动作段落。'],
    elements: [
      { type: 'scene', text: 'INT. ELEVATOR - NIGHT' },
      { type: 'action', text: '电梯停在十三层。门没有打开。' },
      { type: 'character', text: '许然' },
      { type: 'parenthetical', text: '（压低声音）' },
      { type: 'dialogue', text: '我们刚才经过这里了。' },
    ],
  },
  {
    id: 'voice-offscreen',
    title: '05 画外音与画外对白',
    focus: 'V.O. 与 O.S.',
    summary: 'V.O. 常用于旁白、录音或跨时空声音；O.S. 表示角色在当前场景中但不在画面内。',
    tips: ['根据声音与当前场景的关系选择标记。', '同一项目保持扩展写法一致。'],
    elements: [
      { type: 'scene', text: 'INT. POLICE ARCHIVE - NIGHT' },
      { type: 'action', text: '录音带缓慢转动。顾衡逐页翻看一宗二十年前的失踪案。' },
      { type: 'character', text: '女孩 (V.O.)' },
      { type: 'dialogue', text: '如果你听到这里，说明他们还是没有找到我。' },
      { type: 'character', text: '管理员 (O.S.)' },
      { type: 'dialogue', text: '顾警官，我们要关门了。' },
    ],
  },
  {
    id: 'intercut',
    title: '06 电话交叉剪辑',
    focus: 'INTERCUT 简化往返场景',
    summary: '先建立通话双方地点，再用交叉剪辑提示减少重复场景标题。',
    tips: ['先让读者清楚双方各自在哪里。', '通话结束后用新场景标题退出交叉剪辑。'],
    elements: [
      { type: 'scene', text: 'INT. TAXI - MOVING - NIGHT' },
      { type: 'action', text: '沈青贴着车窗打电话。' },
      { type: 'scene', text: 'INT. EMPTY CLASSROOM - NIGHT' },
      { type: 'action', text: '韩川站在黑板前接起手机。' },
      { type: 'shot', text: 'INTERCUT - TAXI / CLASSROOM' },
      { type: 'character', text: '沈青' },
      { type: 'dialogue', text: '别擦黑板。上面那道题就是地址。' },
    ],
  },
  {
    id: 'montage',
    title: '07 蒙太奇段落',
    focus: '一组有推进关系的短画面',
    summary: '蒙太奇适合压缩时间或展示过程，每个画面应短、具体并共同推动一个变化。',
    tips: ['开头和结尾都给出清晰标记。', '每一项都应带来新的信息或进展。'],
    elements: [
      { type: 'shot', text: 'MONTAGE - THE FIRST WEEK OF REHEARSAL' },
      { type: 'action', text: '— 空舞台上，苏遥独自对着两百个空座位念第一句台词。' },
      { type: 'action', text: '— 道具桌逐日堆满胶带、旧报纸和凉掉的咖啡。' },
      { type: 'action', text: '— 全组第一次完整跑完终场，没有人看剧本。' },
      { type: 'shot', text: 'END MONTAGE' },
    ],
  },
  {
    id: 'flashback',
    title: '08 闪回与返回现在',
    focus: '时间层级清晰',
    summary: '闪回开始和结束都要让读者毫不费力地知道当前时间。',
    tips: ['短闪回可在场景标题中标记。', '返回现在时明确写出 PRESENT 或“回到现在”。'],
    elements: [
      { type: 'scene', text: 'EXT. SCHOOL PLAYGROUND - DAY - FLASHBACK' },
      { type: 'action', text: '十岁的陈默把一枚铜钥匙埋在梧桐树下。' },
      { type: 'character', text: '小陈默' },
      { type: 'dialogue', text: '等我回来，就把门打开。' },
      { type: 'scene', text: 'EXT. SCHOOL PLAYGROUND - NIGHT - PRESENT' },
      { type: 'action', text: '成年陈默站在同一棵树前，手里握着一把铲子。' },
    ],
  },
  {
    id: 'insert-sound',
    title: '09 插入画面与关键声音',
    focus: '只强调真正重要的信息',
    summary: '当一个细节必须被读者准确看见或听见时，可使用 INSERT 或克制的大写声音。',
    tips: ['强调应当稀少，才会有效。', '不要把每个道具和声音都写成技术指令。'],
    elements: [
      { type: 'scene', text: 'INT. PAWNSHOP - DAY' },
      { type: 'action', text: '老板把旧怀表推回玻璃柜台中央。' },
      { type: 'shot', text: 'INSERT - THE WATCH' },
      { type: 'action', text: '秒针倒着走。表盖内侧刻着今天的日期。' },
      { type: 'action', text: '门外传来一声急促的刹车。砰！' },
    ],
  },
  {
    id: 'transition',
    title: '10 有意义的显式转场',
    focus: '靠右转场与画面关联',
    summary: '多数场景可以直接进入下一个场景标题；显式转场留给能创造节奏或含义的时刻。',
    tips: ['转场段落应靠右。', '中文“切至：”与 CUT TO: 可以承担相同格式功能。'],
    elements: [
      { type: 'scene', text: 'INT. BAKERY - PRE-DAWN' },
      { type: 'action', text: '面粉落在案板上，像一层新雪。' },
      { type: 'transition', text: '切至：' },
      { type: 'scene', text: 'EXT. MOUNTAIN PASS - DAY' },
      { type: 'action', text: '真正的雪吞没公路。救援车缓慢驶入白色深处。' },
    ],
  },
]
