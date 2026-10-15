import JSZip from 'jszip'
import mammoth from 'mammoth'
import { createDefaultProject } from '../../src/sample'
import { createDefaultTitlePage } from '../../src/exportProfiles'
import { normalizeScriptProject } from '../../src/projectMigration'
import { parseFdx } from '../../src/fdx'
import { parseImportedScript } from '../../src/plainTextImport'
import type { ScriptProject } from '../../src/types'

export const maxMobileFileBytes = 20 * 1024 * 1024
export type TextEncoding = 'auto' | 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030'

export function decodeText(bytes: Uint8Array, encoding: TextEncoding = 'auto') {
  if (encoding !== 'auto') return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '')
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const sample = bytes.subarray(0, Math.min(bytes.length, 512))
  let even = 0, odd = 0
  sample.forEach((value, index) => { if (value === 0) { if (index % 2) odd++; else even++ } })
  if (odd > sample.length / 5 && even < odd / 4) return new TextDecoder('utf-16le').decode(bytes)
  if (even > sample.length / 5 && odd < even / 4) return new TextDecoder('utf-16be').decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '') }
  catch { return new TextDecoder('gb18030', { fatal: true }).decode(bytes) }
}

async function preflightWord(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const entries = Object.values(zip.files)
  if (entries.length > 2000 || !zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) throw new Error('Word 文档结构无效或超过安全上限。')
  let total = 0
  for (const entry of entries) {
    if (entry.dir) continue
    const declared = (entry as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize
    if (declared > 16 * 1024 * 1024 || total + declared > 48 * 1024 * 1024) throw new Error('Word 解压内容过大，请拆分文档。')
    await new Promise<void>((resolve, reject) => {
      let size = 0
      const stream = (entry as unknown as { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array')
      stream.on('data', (chunk: Uint8Array) => { size += chunk.length; total += chunk.length; if (size > 16 * 1024 * 1024 || total > 48 * 1024 * 1024) { stream.pause(); reject(new Error('Word 解压内容超过安全上限。')) } })
      stream.on('error', reject).on('end', () => resolve()).resume()
    })
  }
}

export async function parseMobileDocument(name: string, bytes: Uint8Array, encoding: TextEncoding = 'auto'): Promise<ScriptProject> {
  if (!bytes.length || bytes.length > maxMobileFileBytes) throw new Error('文件为空或超过移动端 20 MB 上限。请拆分后再导入。')
  const extension = name.split('.').at(-1)?.toLowerCase()
  if (!['ssproj', 'fdx', 'docx', 'txt', 'fountain', 'md', 'markdown', 'srt'].includes(extension ?? '')) throw new Error('不支持此文件类型。请选择 SSProj、FDX、DOCX、TXT 或 Fountain。')
  if (extension === 'ssproj') return normalizeScriptProject(JSON.parse(decodeText(bytes)))
  if (extension === 'fdx') return normalizeScriptProject(parseFdx(decodeText(bytes)))
  let content: string
  if (extension === 'docx') { await preflightWord(bytes); content = (await mammoth.extractRawText({ arrayBuffer: bytes.slice().buffer })).value }
  else content = decodeText(bytes, encoding)
  const imported = parseImportedScript(content, { format: extension === 'fountain' ? 'fountain' : 'text' })
  if (!imported.elements.length) throw new Error('没有找到正文。原项目已保留，请检查文档内容。')
  const fresh = createDefaultProject()
  const title = imported.titlePage?.title || name.replace(/\.[^.]+$/u, '') || fresh.title
  return normalizeScriptProject({ ...fresh, title, author: imported.titlePage?.authors ?? '', elements: imported.elements, titlePage: { ...createDefaultTitlePage({ ...fresh, title }), ...imported.titlePage } })
}

export function fromBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, character => character.charCodeAt(0)) }
export function toBase64(bytes: Uint8Array) { const chunks: string[] = []; for (let index = 0; index < bytes.length; index += 32768) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768))); return btoa(chunks.join('')) }
