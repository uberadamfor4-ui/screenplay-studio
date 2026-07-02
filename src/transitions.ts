import type { AppLocale } from './types'
import type { UiLocale } from './i18n'

export type TransitionPresetId =
  | 'cut-to'
  | 'dissolve-to'
  | 'fade-in'
  | 'fade-out'
  | 'fade-to-black'
  | 'match-cut-to'
  | 'jump-cut-to'
  | 'smash-cut-to'
  | 'wipe-to'

export type TransitionPreset = {
  id: TransitionPresetId
  labels: Record<UiLocale, string>
  text: Record<AppLocale, string>
}

export const transitionPresets: TransitionPreset[] = [
  {
    id: 'cut-to',
    labels: { 'zh-CN': '切至', 'en-US': 'Cut To', 'zh-TW': '切至' },
    text: {
      'zh-CN': '切至：',
      'en-US': 'CUT TO:',
      'zh-TW': '切至：',
      'ja-JP': 'カット・トゥ：',
      'ko-KR': '컷 투:',
    },
  },
  {
    id: 'dissolve-to',
    labels: { 'zh-CN': '叠化至', 'en-US': 'Dissolve To', 'zh-TW': '疊化至' },
    text: {
      'zh-CN': '叠化至：',
      'en-US': 'DISSOLVE TO:',
      'zh-TW': '疊化至：',
      'ja-JP': 'ディゾルブ：',
      'ko-KR': '디졸브 투:',
    },
  },
  {
    id: 'fade-in',
    labels: { 'zh-CN': '淡入', 'en-US': 'Fade In', 'zh-TW': '淡入' },
    text: {
      'zh-CN': '淡入：',
      'en-US': 'FADE IN:',
      'zh-TW': '淡入：',
      'ja-JP': 'フェードイン：',
      'ko-KR': '페이드 인:',
    },
  },
  {
    id: 'fade-out',
    labels: { 'zh-CN': '淡出', 'en-US': 'Fade Out', 'zh-TW': '淡出' },
    text: {
      'zh-CN': '淡出。',
      'en-US': 'FADE OUT.',
      'zh-TW': '淡出。',
      'ja-JP': 'フェードアウト。',
      'ko-KR': '페이드 아웃.',
    },
  },
  {
    id: 'fade-to-black',
    labels: { 'zh-CN': '淡出至黑', 'en-US': 'Fade To Black', 'zh-TW': '淡出至黑' },
    text: {
      'zh-CN': '淡出至黑。',
      'en-US': 'FADE TO BLACK.',
      'zh-TW': '淡出至黑。',
      'ja-JP': '黒にフェードアウト。',
      'ko-KR': '암전.',
    },
  },
  {
    id: 'match-cut-to',
    labels: { 'zh-CN': '匹配剪辑至', 'en-US': 'Match Cut To', 'zh-TW': '匹配剪接至' },
    text: {
      'zh-CN': '匹配剪辑至：',
      'en-US': 'MATCH CUT TO:',
      'zh-TW': '匹配剪接至：',
      'ja-JP': 'マッチカット：',
      'ko-KR': '매치 컷:',
    },
  },
  {
    id: 'jump-cut-to',
    labels: { 'zh-CN': '跳切至', 'en-US': 'Jump Cut To', 'zh-TW': '跳切至' },
    text: {
      'zh-CN': '跳切至：',
      'en-US': 'JUMP CUT TO:',
      'zh-TW': '跳切至：',
      'ja-JP': 'ジャンプカット：',
      'ko-KR': '점프 컷:',
    },
  },
  {
    id: 'smash-cut-to',
    labels: { 'zh-CN': '突切至', 'en-US': 'Smash Cut To', 'zh-TW': '突切至' },
    text: {
      'zh-CN': '突切至：',
      'en-US': 'SMASH CUT TO:',
      'zh-TW': '突切至：',
      'ja-JP': 'スマッシュカット：',
      'ko-KR': '스매시 컷:',
    },
  },
  {
    id: 'wipe-to',
    labels: { 'zh-CN': '划变至', 'en-US': 'Wipe To', 'zh-TW': '劃變至' },
    text: {
      'zh-CN': '划变至：',
      'en-US': 'WIPE TO:',
      'zh-TW': '劃變至：',
      'ja-JP': 'ワイプ：',
      'ko-KR': '와이프:',
    },
  },
]

export function getTransitionPresetOptions(scriptLocale: AppLocale, uiLocale: UiLocale) {
  return transitionPresets.map((preset) => ({
    id: preset.id,
    label: preset.labels[uiLocale],
    text: preset.text[scriptLocale] ?? preset.text['en-US'],
  }))
}

export function getTransitionPresetText(id: TransitionPresetId, scriptLocale: AppLocale) {
  const preset = transitionPresets.find((item) => item.id === id) ?? transitionPresets[0]
  return preset.text[scriptLocale] ?? preset.text['en-US']
}
