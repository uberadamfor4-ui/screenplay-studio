import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileJson, FlaskConical, ShieldCheck, Upload, X, XCircle } from 'lucide-react'
import type { FdxInteropReport } from './fdx'
import './FdxLabDialog.css'

type Props = {
  reports: FdxInteropReport[]
  busy: boolean
  error?: string
  onAddSamples: () => void
  onClose: () => void
  onExport: () => void
  onRemove: (id: string) => void
  onTestCurrent: () => void
  onUseProject: (report: FdxInteropReport) => void
}

export function FdxLabDialog(props: Props) {
  const [selectedId, setSelectedId] = useState(props.reports[0]?.id ?? '')

  useEffect(() => {
    if (!props.reports.some((report) => report.id === selectedId)) setSelectedId(props.reports[0]?.id ?? '')
  }, [props.reports, selectedId])

  const selected = props.reports.find((report) => report.id === selectedId) ?? props.reports[0]
  const average = props.reports.length ? Math.round(props.reports.reduce((sum, report) => sum + report.score, 0) / props.reports.length) : 0

  return (
    <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-labelledby="fdx-lab-title">
      <section className="fdx-lab-dialog">
        <header>
          <div>
            <h2 id="fdx-lab-title"><FlaskConical size={18} aria-hidden="true" />FDX 专业互通实验室</h2>
            <p>真实 FDX 文件只在本机内存中往返检查，不上传、不联网。</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" title="关闭" onClick={props.onClose}><X size={17} /></button>
        </header>

        <div className="fdx-lab-toolbar">
          <button type="button" className="primary-button" disabled={props.busy} onClick={props.onAddSamples}><Upload size={16} />{props.busy ? '正在检查…' : '加入真实 FDX 样本'}</button>
          <button type="button" className="text-button" disabled={props.busy} onClick={props.onTestCurrent}><FileJson size={16} />测试当前剧本</button>
          <button type="button" className="text-button" disabled={props.reports.length === 0} onClick={props.onExport}><Download size={16} />导出实验报告</button>
          <span className="fdx-offline-badge"><ShieldCheck size={15} />纯本地运行</span>
        </div>

        {props.error && <div className="fdx-lab-error" role="alert"><AlertTriangle size={16} />{props.error}</div>}

        <div className="fdx-lab-summary">
          <span><b>{props.reports.length}</b> 个样本</span>
          <span><b>{average || '-'}</b> 平均互通分</span>
          <span><b>{props.reports.reduce((sum, report) => sum + report.sourceParagraphs, 0)}</b> 个段落</span>
          <span><b>{props.reports.reduce((sum, report) => sum + report.sourceScenes, 0)}</b> 个场次</span>
        </div>

        <div className="fdx-lab-body">
          <aside className="fdx-sample-list" aria-label="FDX 样本">
            {props.reports.map((report) => (
              <button type="button" className={report.id === selected?.id ? 'active' : ''} key={report.id} onClick={() => setSelectedId(report.id)}>
                <span>{report.sourceName}</span>
                <small>FDX {report.documentVersion} · {report.sourceScenes} 场 · {report.localPages} 页</small>
                <b className={report.score >= 90 ? 'good' : report.score >= 70 ? 'warning' : 'bad'}>{report.score}</b>
              </button>
            ))}
            {props.reports.length === 0 && <div className="fdx-empty"><FlaskConical size={28} /><strong>尚无样本</strong><span>可一次选择多个真实 FDX 文件，或先测试当前剧本。</span></div>}
          </aside>

          <main className="fdx-report-detail">
            {selected ? (
              <>
                <div className="fdx-report-heading">
                  <div><h3>{selected.sourceName}</h3><span>{new Date(selected.checkedAt).toLocaleString('zh-CN')}</span></div>
                  <div className="fdx-report-actions">
                    <button type="button" className="text-button" onClick={() => props.onRemove(selected.id)}>移除样本</button>
                    <button type="button" className="primary-button" onClick={() => props.onUseProject(selected)}>用此样本打开新项目</button>
                  </div>
                </div>
                <div className="fdx-check-list">
                  {selected.checks.map((check) => {
                    const Icon = check.status === 'pass' ? CheckCircle2 : check.status === 'warning' ? AlertTriangle : XCircle
                    return <article className={check.status} key={check.id}><Icon size={18} /><div><strong>{check.label}</strong><p>{check.detail}</p></div></article>
                  })}
                </div>
              </>
            ) : (
              <div className="fdx-detail-empty">加入样本后，这里会逐项比较正文、标题页、场号、双栏对白、多语言字符、修订标记和分页。</div>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
