export function buildDataElementSelector(tagName: 'article' | 'textarea', elementId: string) {
  return `${tagName}[data-element-id="${escapeCssAttributeValue(elementId)}"]`
}

export function escapeCssAttributeValue(value: string) {
  let escaped = ''
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0xfffd
    if (character === '\\') {
      escaped += '\\\\'
    } else if (character === '"') {
      escaped += '\\"'
    } else if (codePoint === 0) {
      escaped += '\ufffd'
    } else if (codePoint <= 0x1f || codePoint === 0x7f) {
      escaped += `\\${codePoint.toString(16)} `
    } else {
      escaped += character
    }
  }
  return escaped
}
