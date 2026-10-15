import { Capacitor, registerPlugin } from '@capacitor/core'
import { fromBase64, maxMobileFileBytes, toBase64 } from './documents'

type FileResult = { canceled: boolean; name?: string; data?: string }
type LocalDocumentsPlugin = {
  openDocument(): Promise<FileResult>
  saveDocument(payload: { name: string; mime: string; data: string }): Promise<FileResult>
  exportPdf(payload: { name: string; html: string; a4: boolean }): Promise<FileResult>
  choosePngFolder(): Promise<{ canceled: boolean; token?: string }>
  writePngPage(payload: { token: string; name: string; data: string }): Promise<void>
  finishPngFolder(payload: { token: string }): Promise<void>
  saveRecovery(payload: { content: string }): Promise<void>
  loadRecovery(): Promise<{ content?: string }>
}
export const LocalDocuments = registerPlugin<LocalDocumentsPlugin>('LocalDocuments')
export const nativeAndroid = Capacitor.isNativePlatform()

export async function openDocument(): Promise<{ name: string; bytes: Uint8Array } | undefined> {
  if (nativeAndroid) { const result = await LocalDocuments.openDocument(); return result.canceled || !result.name || !result.data ? undefined : { name: result.name, bytes: fromBase64(result.data) } }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.ssproj,.fdx,.docx,.txt,.fountain,.md,.markdown,.srt'
    input.addEventListener('cancel', () => { input.remove(); resolve(undefined) }, { once: true })
    input.addEventListener('change', async () => {
      try { const file = input.files?.[0]; if (!file) return resolve(undefined); if (file.size > maxMobileFileBytes) throw new Error('文件超过移动端 20 MB 上限。'); resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) }
      catch (error) { reject(error) } finally { input.remove() }
    }, { once: true })
    input.style.display = 'none'; document.body.append(input); input.click()
  })
}

export async function saveDocument(name: string, mime: string, bytes: Uint8Array) {
  if (nativeAndroid) return LocalDocuments.saveDocument({ name, mime, data: toBase64(bytes) })
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }))
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000)
  return { canceled: false }
}
