import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { UiLocale } from './i18n'
import { workflowText } from './workflowText'
import { policyText, privacyPolicyDate, privacyPolicyIntro, privacyPolicySections, privacyPolicyUrl } from './privacyPolicy'

export function PrivacyPolicyContent({ locale }: { locale: UiLocale }) {
  const L = (cn: string, en: string, tw: string) => workflowText(locale, cn, en, tw)
  const [opening, setOpening] = useState(false), [message, setMessage] = useState('')
  async function openOnline() {
    setOpening(true)
    setMessage('')
    try {
      if (!window.screenplay?.openPrivacyPolicy) throw new Error('Unavailable')
      await window.screenplay.openPrivacyPolicy()
    } catch {
      setMessage(L('未能打开浏览器。您仍可在下方阅读完整政策，或在浏览器输入上述网址。', 'Could not open the browser. Read the complete policy below, or enter the URL above in your browser.', '未能開啟瀏覽器。您仍可在下方閱讀完整政策，或在瀏覽器輸入上述網址。'))
    } finally {
      setOpening(false)
    }
  }
  return <article className="app-privacy-policy" aria-label={L('Mac 版隐私政策正文', 'Mac privacy policy', 'Mac 版隱私政策正文')}>
    <p>{policyText(locale, privacyPolicyIntro)}</p>
    <p>{L('更新及生效日期', 'Updated and effective', '更新及生效日期')}：{privacyPolicyDate}</p>
    <div className="workflow-controls"><button type="button" disabled={opening} onClick={() => { void openOnline() }}><ExternalLink size={17} aria-hidden="true" />{L('在浏览器中查看政策', 'View policy in browser', '在瀏覽器中檢視政策')}</button><span className="app-privacy-url">{privacyPolicyUrl}</span></div>
    {message && <p role="status">{message}</p>}
    {privacyPolicySections.map((section, index) => <section key={section.id} data-policy-section={section.id}><h3>{index + 1}. {policyText(locale, section.title)}</h3>{section.paragraphs.map((paragraph, i) => <p key={i}>{policyText(locale, paragraph)}</p>)}</section>)}
  </article>
}
