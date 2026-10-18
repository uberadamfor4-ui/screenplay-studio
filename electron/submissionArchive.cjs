const JSZip = require('jszip')
const allowed = new Set(['logline.txt', 'synopsis.txt', 'characters.txt', 'statement.txt', 'README.txt'])

function validateSubmissionFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) throw new Error('Invalid submission materials')
  const used = new Set()
  let total = 0
  for (const file of files) {
    if (!file || !allowed.has(file.name) || used.has(file.name) || typeof file.content !== 'string') throw new Error('Invalid submission entry')
    const bytes = Buffer.byteLength(file.content, 'utf8')
    total += bytes
    if (bytes > 200000 || total > 800000) throw new Error('Submission materials exceed limits')
    used.add(file.name)
  }
}
async function buildSubmissionArchive(files, pdf) {
  validateSubmissionFiles(files)
  const archive = new JSZip()
  for (const file of files) archive.file(file.name, file.content)
  if (pdf !== undefined) {
    if (!Buffer.isBuffer(pdf) || pdf.length > 64 * 1024 * 1024 || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid submission PDF')
    archive.file('script.pdf', pdf)
  }
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}
module.exports = { buildSubmissionArchive, validateSubmissionFiles }
