import type { ScriptProject } from './types'
import { createElement, getFormat } from './formats'
import { defaultPreferences, type UserPreferences } from './preferences'
import { buildSceneHeading } from './screenplayTerms'
import { getTransitionPresetText } from './transitions'

export function createDefaultProject(preferences: UserPreferences = defaultPreferences): ScriptProject {
  const format = getFormat(preferences.defaultFormatId)

  return {
    appVersion: '0.2.0',
    title: '未命名剧本',
    author: '',
    language: preferences.scriptLanguage,
    formatId: format.id,
    fontFamily: preferences.defaultFontFamily,
    fontSize: preferences.defaultFontSize,
    pageSize: format.page.kind,
    elements: [
      createElement('scene', buildSceneHeading({ style: preferences.termStyle, place: 'int', location: '写作室', time: 'night' })),
      createElement('action', '屏幕发出柔和的光。一个新剧本正在成形。'),
      createElement('character', '编剧'),
      createElement('dialogue', '先把人物放到压力里，再让选择替他们说话。'),
      createElement('transition', getTransitionPresetText(preferences.defaultTransition, preferences.scriptLanguage)),
      createElement('scene', buildSceneHeading({ style: preferences.termStyle, place: 'ext', location: '城市天台', time: 'dawn' })),
      createElement('action', '第一缕晨光越过楼群。故事的方向变得清楚。'),
    ],
  }
}
