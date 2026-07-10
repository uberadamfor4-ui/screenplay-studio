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
    labels: { 'zh-CN': '\u5207\u81f3', 'en-US': 'Cut To', 'zh-TW': '\u5207\u81f3' },
    text: { 'zh-CN': '\u5207\u81f3\uff1a', 'en-US': 'CUT TO:', 'zh-TW': '\u5207\u81f3\uff1a', 'ja-JP': '\u30ab\u30c3\u30c8\u30fb\u30c8\u30a5\uff1a', 'ko-KR': '\ucef7 \ud22c:' },
  },
  {
    id: 'dissolve-to',
    labels: { 'zh-CN': '\u53e0\u5316\u81f3', 'en-US': 'Dissolve To', 'zh-TW': '\u758a\u5316\u81f3' },
    text: { 'zh-CN': '\u53e0\u5316\u81f3\uff1a', 'en-US': 'DISSOLVE TO:', 'zh-TW': '\u758a\u5316\u81f3\uff1a', 'ja-JP': '\u30c7\u30a3\u30be\u30eb\u30d6\uff1a', 'ko-KR': '\ub514\uc878\ube0c \ud22c:' },
  },
  {
    id: 'fade-in',
    labels: { 'zh-CN': '\u6de1\u5165', 'en-US': 'Fade In', 'zh-TW': '\u6de1\u5165' },
    text: { 'zh-CN': '\u6de1\u5165\uff1a', 'en-US': 'FADE IN:', 'zh-TW': '\u6de1\u5165\uff1a', 'ja-JP': '\u30d5\u30a7\u30fc\u30c9\u30a4\u30f3\uff1a', 'ko-KR': '\ud398\uc774\ub4dc \uc778:' },
  },
  {
    id: 'fade-out',
    labels: { 'zh-CN': '\u6de1\u51fa', 'en-US': 'Fade Out', 'zh-TW': '\u6de1\u51fa' },
    text: { 'zh-CN': '\u6de1\u51fa\u3002', 'en-US': 'FADE OUT.', 'zh-TW': '\u6de1\u51fa\u3002', 'ja-JP': '\u30d5\u30a7\u30fc\u30c9\u30a2\u30a6\u30c8\u3002', 'ko-KR': '\ud398\uc774\ub4dc \uc544\uc6c3.' },
  },
  {
    id: 'fade-to-black',
    labels: { 'zh-CN': '\u6de1\u51fa\u81f3\u9ed1', 'en-US': 'Fade To Black', 'zh-TW': '\u6de1\u51fa\u81f3\u9ed1' },
    text: { 'zh-CN': '\u6de1\u51fa\u81f3\u9ed1\u3002', 'en-US': 'FADE TO BLACK.', 'zh-TW': '\u6de1\u51fa\u81f3\u9ed1\u3002', 'ja-JP': '\u9ed2\u3078\u30d5\u30a7\u30fc\u30c9\u30a2\u30a6\u30c8\u3002', 'ko-KR': '\uac80\uc815\uc73c\ub85c \ud398\uc774\ub4dc \uc544\uc6c3.' },
  },
  {
    id: 'match-cut-to',
    labels: { 'zh-CN': '\u5339\u914d\u526a\u63a5\u81f3', 'en-US': 'Match Cut To', 'zh-TW': '\u5339\u914d\u526a\u63a5\u81f3' },
    text: { 'zh-CN': '\u5339\u914d\u526a\u63a5\u81f3\uff1a', 'en-US': 'MATCH CUT TO:', 'zh-TW': '\u5339\u914d\u526a\u63a5\u81f3\uff1a', 'ja-JP': '\u30de\u30c3\u30c1\u30ab\u30c3\u30c8\uff1a', 'ko-KR': '\ub9e4\uce58 \ucef7 \ud22c:' },
  },
  {
    id: 'jump-cut-to',
    labels: { 'zh-CN': '\u8df3\u5207\u81f3', 'en-US': 'Jump Cut To', 'zh-TW': '\u8df3\u5207\u81f3' },
    text: { 'zh-CN': '\u8df3\u5207\u81f3\uff1a', 'en-US': 'JUMP CUT TO:', 'zh-TW': '\u8df3\u5207\u81f3\uff1a', 'ja-JP': '\u30b8\u30e3\u30f3\u30d7\u30ab\u30c3\u30c8\uff1a', 'ko-KR': '\uc810\ud504 \ucef7 \ud22c:' },
  },
  {
    id: 'smash-cut-to',
    labels: { 'zh-CN': '\u7a81\u5207\u81f3', 'en-US': 'Smash Cut To', 'zh-TW': '\u7a81\u5207\u81f3' },
    text: { 'zh-CN': '\u7a81\u5207\u81f3\uff1a', 'en-US': 'SMASH CUT TO:', 'zh-TW': '\u7a81\u5207\u81f3\uff1a', 'ja-JP': '\u30b9\u30de\u30c3\u30b7\u30e5\u30ab\u30c3\u30c8\uff1a', 'ko-KR': '\uc2a4\ub9e4\uc2dc \ucef7 \ud22c:' },
  },
  {
    id: 'wipe-to',
    labels: { 'zh-CN': '\u5212\u53d8\u81f3', 'en-US': 'Wipe To', 'zh-TW': '\u5283\u8b8a\u81f3' },
    text: { 'zh-CN': '\u5212\u53d8\u81f3\uff1a', 'en-US': 'WIPE TO:', 'zh-TW': '\u5283\u8b8a\u81f3\uff1a', 'ja-JP': '\u30ef\u30a4\u30d7\uff1a', 'ko-KR': '\uc640\uc774\ud504 \ud22c:' },
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
