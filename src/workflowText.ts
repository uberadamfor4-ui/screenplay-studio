import type { UiLocale } from './i18n'
export const workflowText = (locale: UiLocale, cn: string, en: string, tw: string) => locale === 'en-US' ? en : locale === 'zh-TW' ? tw : cn
