export const coverOverflowCode = 'SCREENPLAY_COVER_OVERFLOW'

export class CoverOverflowError extends Error {
  constructor() {
    super(`${coverOverflowCode}: Cover text does not fit on one page.`)
    this.name = 'CoverOverflowError'
  }
}

export function exportFailureStatus(error: unknown): 'exportCoverOverflow' | 'exportFailed' {
  return error instanceof Error && error.message.includes(coverOverflowCode) ? 'exportCoverOverflow' : 'exportFailed'
}
