import type { ElementLayout } from './formats'
import type { ScriptElement, ScriptElementTextStyle } from './types'

export type ResolvedElementTextStyle = {
  bold: boolean
  italic: boolean
  underline: boolean
  fontFamily: string
  fontFamilyOverride?: string
}

export function resolveElementTextStyle(
  element: Pick<ScriptElement, 'textStyle'>,
  layout: Pick<ElementLayout, 'bold' | 'italic'>,
  projectFontFamily: string,
): ResolvedElementTextStyle {
  const fontFamilyOverride = element.textStyle?.fontFamily?.trim() || undefined
  return {
    bold: element.textStyle?.bold ?? Boolean(layout.bold),
    italic: element.textStyle?.italic ?? Boolean(layout.italic),
    underline: element.textStyle?.underline ?? false,
    fontFamily: fontFamilyOverride || projectFontFamily,
    fontFamilyOverride,
  }
}

export function mergeElementTextStyle(
  current: ScriptElementTextStyle | undefined,
  patch: Partial<ScriptElementTextStyle>,
): ScriptElementTextStyle | undefined {
  const merged = { ...current, ...patch }
  if (!merged.fontFamily) {
    delete merged.fontFamily
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}
