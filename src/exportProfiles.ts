import { getFormat, type ScriptFormat } from './formats'
import type { ExportProfileId, ExportSettings, ScriptProject, TitlePageData } from './types'

export type ExportProfile = {
  id: ExportProfileId
  label: string
  detail: string
  pageSize: 'letter' | 'a4' | 'project'
  fontFamily?: string
  fontSize?: number
  defaults: Omit<ExportSettings, 'profileId'>
}

export const exportProfiles: ExportProfile[] = [
  {
    id: 'us-spec',
    label: '美国投稿稿',
    detail: 'Letter、12pt Courier Prime、无场号、对白跨页续写',
    pageSize: 'letter',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    defaults: { includeTitlePage: true, moreContinued: true, sceneNumbers: false, lockedPageLabels: false, headerText: '', footerText: '' },
  },
  {
    id: 'us-production',
    label: '美国制作稿',
    detail: 'Letter、场号、锁页标签和对白跨页续写',
    pageSize: 'letter',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    defaults: { includeTitlePage: true, moreContinued: true, sceneNumbers: true, lockedPageLabels: true, headerText: '', footerText: '' },
  },
  {
    id: 'china-a4',
    label: '中文 A4 制作稿',
    detail: 'A4、内置中文字体、场号和中文续写标记',
    pageSize: 'a4',
    fontFamily: 'Screenplay CJK SC',
    fontSize: 12,
    defaults: { includeTitlePage: true, moreContinued: true, sceneNumbers: true, lockedPageLabels: true, headerText: '', footerText: '' },
  },
  {
    id: 'bbc-tv',
    label: 'BBC 风格电视稿',
    detail: 'A4、12pt Courier、清晰的页眉与场景结构',
    pageSize: 'a4',
    fontFamily: 'Courier Prime',
    fontSize: 12,
    defaults: { includeTitlePage: true, moreContinued: true, sceneNumbers: false, lockedPageLabels: false, headerText: '', footerText: '' },
  },
  {
    id: 'custom',
    label: '自定义',
    detail: '沿用当前项目的纸张、字体和导出选项',
    pageSize: 'project',
    defaults: { includeTitlePage: true, moreContinued: true, sceneNumbers: false, lockedPageLabels: false, headerText: '', footerText: '' },
  },
]

export const defaultExportSettings: ExportSettings = {
  profileId: 'us-spec',
  ...exportProfiles[0].defaults,
}

export function createDefaultTitlePage(project: Pick<ScriptProject, 'title' | 'author'>): TitlePageData {
  return {
    enabled: true,
    title: project.title,
    credit: '编剧',
    authors: project.author,
    basedOn: '',
    draftDate: '',
    contact: '',
    copyright: '',
  }
}

export function resolveExportSettings(project: ScriptProject): ExportSettings {
  const stored = project.exportSettings ?? defaultExportSettings
  const profile = exportProfiles.find((item) => item.id === stored.profileId) ?? exportProfiles[0]
  return { ...profile.defaults, ...stored, profileId: profile.id }
}

export function applyExportProfile(profileId: ExportProfileId): ExportSettings {
  const profile = exportProfiles.find((item) => item.id === profileId) ?? exportProfiles[0]
  return { profileId: profile.id, ...profile.defaults }
}

export function resolveExportProject(project: ScriptProject) {
  const settings = resolveExportSettings(project)
  const profile = exportProfiles.find((item) => item.id === settings.profileId) ?? exportProfiles[0]
  const baseFormat = getFormat(project.formatId)
  const format = resolveProfileFormat(baseFormat, profile.id === 'custom' ? { ...profile, pageSize: project.pageSize } : profile)

  return {
    project: {
      ...project,
      fontFamily: profile.id === 'custom' ? project.fontFamily : profile.fontFamily ?? project.fontFamily,
      fontSize: profile.id === 'custom' ? project.fontSize : profile.fontSize ?? project.fontSize,
      pageSize: format.page.kind,
      exportSettings: settings,
    },
    format,
    settings,
    profile,
  }
}

function resolveProfileFormat(format: ScriptFormat, profile: ExportProfile): ScriptFormat {
  if (profile.pageSize === 'project' || format.page.kind === profile.pageSize) {
    return format
  }

  if (profile.pageSize === 'a4') {
    return {
      ...format,
      page: { ...format.page, kind: 'a4', width: 794, height: 1123, marginTop: 96, marginRight: 80, marginBottom: 96, marginLeft: 114 },
    }
  }

  return {
    ...format,
    page: { ...format.page, kind: 'letter', width: 816, height: 1056, marginTop: 96, marginRight: 96, marginBottom: 96, marginLeft: 144 },
  }
}
