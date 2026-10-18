import appPackage from '../package.json'
export type DiagnosticOperation = 'project-save' | 'recovery-write' | 'backup' | 'diagnostic-export' | 'import' | 'pdf-export' | 'png-export'
export type DiagnosticCode = 'failed' | 'ok' | 'canceled' | 'quota' | 'unavailable'
const operations: DiagnosticOperation[] = ['project-save', 'recovery-write', 'backup', 'diagnostic-export', 'import', 'pdf-export', 'png-export']
const codes: DiagnosticCode[] = ['failed', 'ok', 'canceled', 'quota', 'unavailable']
const events: { operation: DiagnosticOperation; code: DiagnosticCode; at: string }[] = []
export function recordDiagnostic(operation: DiagnosticOperation, code: DiagnosticCode) {
  if (!operations.includes(operation) || !codes.includes(code)) return
  events.push({ operation, code, at: new Date().toISOString() })
  if (events.length > 50) events.shift()
}
export function buildDiagnosticReport(input: { platform?: string; systemVersion?: string; locale?: string; protection?: string; recovery?: string; mobileVersion?: string }) {
  const platform = ['win32', 'darwin', 'linux', 'android', 'browser'].includes(input.platform ?? '') ? input.platform : 'browser'
  return {
    schema: 1, application: 'Screenplay Studio', version: platform === 'android' && /^\d+\.\d+\.\d+$/.test(input.mobileVersion ?? '') ? input.mobileVersion : appPackage.version,
    platform, systemVersion: /^\d+(?:\.\d+){0,3}$/.test(input.systemVersion ?? '') ? input.systemVersion : undefined,
    locale: ['zh-CN', 'en-US', 'zh-TW'].includes(input.locale ?? '') ? input.locale : undefined,
    protection: ['file', 'recovery', 'writing', 'failed', 'pending'].includes(input.protection ?? '') ? input.protection : 'pending',
    recovery: ['idle', 'writing', 'saved', 'failed'].includes(input.recovery ?? '') ? input.recovery : 'idle',
    generatedAt: new Date().toISOString(), events: events.map(event => ({ ...event })),
    privacy: { scriptIncluded: false, fileNamesIncluded: false, pathsIncluded: false, automaticallyUploaded: false },
  }
}
