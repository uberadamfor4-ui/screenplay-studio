import { anonymousProject, defaultPrivacyOptions } from './writingTools'
import { createElement } from './formats'
import type { ScriptProject } from './types'

export type SubmissionFields = NonNullable<ScriptProject['submission']>
export type SubmissionOptions = { anonymous: boolean; script: boolean; logline: boolean; synopsis: boolean; characters: boolean; statement: boolean }
export const emptySubmission: SubmissionFields = { logline: '', synopsis: '', characters: '', statement: '' }
export const defaultSubmissionOptions: SubmissionOptions = { anonymous: false, script: true, logline: true, synopsis: false, characters: false, statement: false }
const limits = { logline: 2000, synopsis: 20000, characters: 20000, statement: 20000 }
export function prepareSubmission(project: ScriptProject, options: SubmissionOptions) {
  const fields = { ...emptySubmission, ...project.submission }
  const identities = [project.author, project.titlePage?.authors, project.titlePage?.contact, ...(project.titlePage?.authors?.split(/[,，、;；\n]/u) ?? [])].filter((v): v is string => Boolean(v?.trim()) && v!.trim().length >= 2).map(v => v.trim())
  const scrubIdentity = (value: string) => { let text = value; for (const id of identities) text = text.split(id).join('[REDACTED]'); return text }
  const copy = options.anonymous ? anonymousProject(project, defaultPrivacyOptions) : structuredClone(project)
  if (options.anonymous) {
    copy.title = scrubIdentity(copy.title)
    copy.elements = copy.elements.map(e => ({ ...e, text: scrubIdentity(e.text) }))
    if (copy.titlePage) copy.titlePage = { ...copy.titlePage, title: scrubIdentity(copy.titlePage.title), credit: '', basedOn: '', authors: '', contact: '', copyright: '' }
  }
  const files: Array<{ name: string; content: string }> = []
  for (const key of ['logline', 'synopsis', 'characters', 'statement'] as const) {
    if (!options[key] || options.anonymous && key === 'statement') continue
    const text = fields[key]
    if (typeof text !== 'string' || !text.trim()) throw new Error('emptyMaterial')
    if (text.length > limits[key]) throw new Error('tooLong')
    const safe = options.anonymous ? anonymousProject({ ...project, elements: [createElement('action', text)] }, defaultPrivacyOptions).elements[0].text : text
    files.push({ name: `${key}.txt`, content: options.anonymous ? scrubIdentity(safe) : safe })
  }
  if (!options.script && !files.length) throw new Error('emptySelection')
  const receipt = `Screenplay Studio submission\nVersion: ${project.appVersion}\nAnonymous: ${options.anonymous ? 'yes' : 'no'}\nScript: ${options.script ? 'script.pdf (desktop) / script.txt + script.fdx (Android)' : 'no'}\nMaterials: ${files.map(f => f.name).join(', ')}\nReview each file before submission. PDF is not an editable project backup.\n`
  files.push({ name: 'README.txt', content: receipt })
  return { project: copy, files, includeScript: options.script, suggestedName: options.anonymous ? 'submission-anonymous.zip' : 'submission.zip' }
}
