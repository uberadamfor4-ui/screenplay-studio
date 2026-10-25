import { useState } from 'react'
import { Copy, ShieldCheck } from 'lucide-react'
import { WorkflowDialog } from './WorkflowDialogs'
import { workflowText } from './workflowText'
import { buildFeedbackTemplate, helpTopics } from './helpCenter'
import qr from '../assets/brand/wechat-1037-film.jpg'
import type { UiLocale } from './i18n'
import { PrivacyPolicyContent } from './PrivacyPolicyContent'

export function HelpCenterDialog({ locale, version, platform, initialTab = 'help', onClose, onDiagnostics }: { locale: UiLocale; version: string; platform: string; initialTab?: 'help' | 'privacy'; onClose: () => void; onDiagnostics: () => void }) {
  const L = (cn: string, en: string, tw: string) => workflowText(locale, cn, en, tw)
  const [tab, setTab] = useState<'help' | 'feedback' | 'privacy'>(initialTab), [topic, setTopic] = useState('input'), [description, setDescription] = useState(''), [steps, setSteps] = useState(''), [message, setMessage] = useState('')
  const selected = helpTopics.find(t => t.id === topic)!, text = (v: [string, string, string]) => workflowText(locale, ...v)
  const template = buildFeedbackTemplate(version, platform, topic, description, steps, locale)
  return <WorkflowDialog title={tab === 'privacy' ? L('隐私政策', 'Privacy policy', '隱私政策') : L('使用帮助与 BUG 反馈', 'Help & bug feedback', '使用說明與 BUG 回報')} locale={locale} onClose={onClose}>
    <div className="workflow-controls" role="group" aria-label={L('帮助分类', 'Help sections', '說明分類')}><button aria-pressed={tab === 'help'} onClick={() => setTab('help')}>{L('按症状排查', 'Troubleshoot', '按症狀排查')}</button><button aria-pressed={tab === 'feedback'} onClick={() => setTab('feedback')}>{L('BUG 反馈', 'Bug feedback', 'BUG 回報')}</button><button aria-pressed={tab === 'privacy'} onClick={() => setTab('privacy')}>{L('隐私政策', 'Privacy policy', '隱私政策')}</button></div>
    {tab !== 'privacy' && <label>{L('问题类型', 'Problem type', '問題類型')} <select value={topic} onChange={e => setTopic(e.target.value)}>{helpTopics.map(t => <option key={t.id} value={t.id}>{text(t.title)}</option>)}</select></label>}
    {tab === 'privacy' ? <PrivacyPolicyContent locale={locale} /> : <>
    {tab === 'help' ? <><ol>{selected.steps.map((step, index) => <li key={index}>{text(step)}</li>)}</ol><button onClick={() => setTab('feedback')}>{L('仍未解决，准备反馈', 'Still unresolved: prepare feedback', '仍未解決，準備回報')}</button></> : <div className="workflow-columns"><section><img className="feedback-qr" src={qr} width="220" height="220" alt={L('1037 Film 公众号二维码', '1037 Film WeChat QR code', '1037 Film 公眾號 QR Code')} /><h3>{L('关注微信公众号 1037 Film', 'Follow 1037 Film on WeChat', '關注微信公眾號 1037 Film')}</h3><p>{L('关注后在公众号后台留言，粘贴反馈模板。此入口不在线提交，也不会自动上传任何资料。', 'After following, message the account and paste the template. Nothing is submitted or uploaded automatically.', '關注後在公眾號後台留言，貼上回報範本。此入口不線上提交，也不會自動上傳任何資料。')}</p><button onClick={onDiagnostics}><ShieldCheck size={17} />{L('保存与恢复 / 诊断包', 'Save & recovery / diagnostics', '儲存與復原 / 診斷包')}</button></section><section className="workflow-fields"><label>{L('问题现象', 'What happened', '問題現象')}<textarea value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} /></label><label>{L('复现步骤', 'Steps to reproduce', '重現步驟')}<textarea value={steps} maxLength={4000} onChange={e => setSteps(e.target.value)} /></label><label>{L('反馈模板', 'Feedback template', '回報範本')}<textarea readOnly value={template} onFocus={e => e.currentTarget.select()} /></label><button onClick={() => { void Promise.resolve().then(() => { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); return navigator.clipboard.writeText(template) }).then(() => setMessage(L('已复制，请检查隐私后在公众号后台留言。', 'Copied. Check privacy before messaging the account.', '已複製，請檢查隱私後在公眾號後台留言。'))).catch(() => setMessage(L('复制未完成，请选取模板文字。', 'Copy failed. Select template text manually.', '複製未完成，請選取範本文字。'))) }}><Copy size={17} />{L('复制反馈模板', 'Copy template', '複製回報範本')}</button><p role="status">{message}</p></section></div>}
    </>}
  </WorkflowDialog>
}
