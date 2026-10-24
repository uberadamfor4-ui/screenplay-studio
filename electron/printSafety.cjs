const coverOverflowCode = 'SCREENPLAY_COVER_OVERFLOW'

function inspectCoverBounds() {
  for (const page of document.querySelectorAll('.title-page')) {
    const bounds = page.getBoundingClientRect()
    const marginBottom = Number(page.getAttribute('data-cover-bottom'))
    if (!Number.isFinite(marginBottom) || marginBottom < 0 || marginBottom >= bounds.height) return false
    const bottom = bounds.bottom - marginBottom
    const content = page.querySelector('.title-content')
    const furniture = [...page.querySelectorAll('.title-contact, .title-meta')]
    for (const element of [content, ...furniture]) {
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (rect.top < bounds.top - 1 || rect.bottom > bottom + 1) return false
      const range = document.createRange()
      range.selectNodeContents(element)
      for (const fragment of range.getClientRects()) {
        if (fragment.left < rect.left - 1 || fragment.right > rect.right + 1) return false
      }
    }
    if (content) {
      const contentBottom = content.getBoundingClientRect().bottom
      if (furniture.some(element => element.getBoundingClientRect().top < contentBottom + 16)) return false
    }
  }
  return true
}

module.exports = { coverOverflowCode, coverBoundsScript: `(${inspectCoverBounds.toString()})()` }
