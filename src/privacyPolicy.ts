import type { UiLocale } from './i18n'
import { workflowText } from './workflowText'

type Translation = [string, string, string]
export const privacyPolicyUrl = 'https://cultivatingframes.top/portal/privacy.html'
export const privacyPolicyDate = '2026-10-24'
export const publicSupportEmail = 'uberadamfor4@gmail.com'
export const privacyPolicyIntro: Translation = ["本政策说明剧本工坊 Mac 版如何处理您的资料。开发者为1037 Film 郭之然。","This policy explains how Screenplay Studio for Mac handles your information. The developer is 1037 Film / Guo Zhiran.","本政策說明劇本工坊 Mac 版如何處理您的資料。開發者為1037 Film 郭之然。"]
export const privacyPolicySections: { id: string; title: Translation; paragraphs: Translation[] }[] = [
  {
    "id": "local-projects",
    "title": [
      "在您的设备上使用剧本",
      "Working on your device",
      "在您的裝置上使用劇本"
    ],
    "paragraphs": [
      [
        "您输入或导入的剧本、角色、场景、制作计划和附件用于本机编辑、排版、导入导出及恢复。项目文件由您选择保存位置；偏好设置、必要的文件授权记录及恢复副本保存在应用使用的本机存储中。",
        "Scripts, characters, scenes, production plans and attachments you enter or import are used locally for editing, layout, import, export and recovery. You choose where to save projects. Preferences, necessary file authorization records and recovery copies are stored locally by the app.",
        "您輸入或匯入的劇本、角色、場景、製作計畫和附件用於本機編輯、排版、匯入匯出及復原。專案檔案由您選擇儲存位置；偏好設定、必要的檔案授權紀錄及復原副本儲存在應用程式使用的本機儲存空間中。"
      ],
      [
        "本版本不提供应用账户、在线协作、云端同步或广告服务。应用不会自动把您的剧本或诊断报告发送给开发者。正常写作不要求您关注公众号或联系开发者。",
        "This version has no app accounts, online collaboration, cloud sync or advertising services. It does not automatically send scripts or diagnostic reports to the developer. Writing does not require following a WeChat account or contacting the developer.",
        "本版本不提供應用程式帳戶、線上協作、雲端同步或廣告服務。應用程式不會自動將您的劇本或診斷報告傳送給開發者。正常寫作不要求您關注公眾號或聯絡開發者。"
      ],
      [
        "您的Mac可能由您或操作系统配置了iCloud、备份或同步文件夹；这不属于剧本工坊提供的云服务，应由您根据相应服务设置管理。",
        "You or your operating system may configure iCloud, backups or synced folders on your Mac. These are not cloud services provided by Screenplay Studio; manage them through the relevant service settings.",
        "您的Mac可能由您或作業系統設定了iCloud、備份或同步資料夾；這不屬於劇本工坊提供的雲端服務，應由您依相應服務設定管理。"
      ]
    ]
  },
  {
    "id": "file-access",
    "title": [
      "文件访问与设备权限",
      "File access and permissions",
      "檔案存取與裝置權限"
    ],
    "paragraphs": [
      [
        "导入、保存和导出时，macOS可能要求您选择文件或授权访问相应文件夹。应用使用系统提供的文件访问机制，仅为完成相关操作和重新打开您授权的项目。",
        "When importing, saving or exporting, macOS may ask you to select a file or authorize a folder. The app uses system file access mechanisms only to perform these operations and reopen projects you authorized.",
        "匯入、儲存和匯出時，macOS可能要求您選擇檔案或授權存取相應資料夾。應用程式使用系統提供的檔案存取機制，僅為完成相關操作和重新開啟您授權的專案。"
      ],
      [
        "应用可能读取本机可用字体信息，并使用所选字体排版。字体、图像和PDF处理在本机执行。",
        "The app may read locally available font information and use selected fonts for layout. Font, image and PDF processing takes place on your device.",
        "應用程式可能讀取本機可用字型資訊，並使用所選字型排版。字型、影像和PDF處理在本機執行。"
      ]
    ]
  },
  {
    "id": "recovery",
    "title": [
      "自动恢复和资料保护",
      "Recovery and protection",
      "自動復原和資料保護"
    ],
    "paragraphs": [
      [
        "为协助处理中断，应用可在本机保留恢复及历史副本。这些副本不会自动上传，但也不等于已完成原文件保存。请自行保留必要的独立备份。",
        "The app may keep recovery and history copies locally to help after interruptions. These are not uploaded automatically and do not mean the original file was saved. Keep separate backups as needed.",
        "為協助處理中斷，應用程式可在本機保留復原及歷史副本。這些副本不會自動上傳，但也不等於已完成原檔案儲存。請自行保留必要的獨立備份。"
      ],
      [
        "本版本的SSProj项目以JSON保存，普通ZIP交接文件也不提供密码加密。文件夹授权和macOS沙盒不能替代设备加密或其他必要保护措施。请勿将敏感项目放在不可信或公开共享的位置。",
        "SSProj projects in this version use JSON. Ordinary ZIP handoff files are not password-encrypted either. Folder authorization and the macOS sandbox do not replace device encryption or other necessary protections. Do not store sensitive projects in untrusted or publicly shared locations.",
        "本版本的SSProj專案以JSON儲存，一般ZIP交接檔案也不提供密碼加密。資料夾授權和macOS沙盒不能取代裝置加密或其他必要保護措施。請勿將敏感專案放在不可信或公開分享的位置。"
      ]
    ]
  },
  {
    "id": "feedback",
    "title": [
      "主动反馈和诊断",
      "Voluntary feedback and diagnostics",
      "主動回報和診斷"
    ],
    "paragraphs": [
      [
        "您可以在应用中生成反馈模板，并自行通过1037 Film微信公众号等外部渠道联系开发者。请在发送前移除真实剧本、私人联系方式、完整本机路径和密钥。",
        "You may create a feedback template in the app and choose to contact the developer through external channels such as the 1037 Film WeChat account. Remove real scripts, private contact details, full local paths and keys before sending.",
        "您可以在應用程式中產生回報範本，並自行透過1037 Film微信公眾號等外部管道聯絡開發者。請在傳送前移除真實劇本、私人聯絡方式、完整本機路徑和金鑰。"
      ],
      [
        "本地诊断报告用于描述软件版本、系统版本和有限的操作结果，不会自动包含剧本正文、文件名或完整路径，也不会由应用自动上传。",
        "Local diagnostic reports describe the app version, system version and limited operation results. They do not automatically include script text, file names or full paths, and the app does not upload them automatically.",
        "本機診斷報告用於描述軟體版本、系統版本和有限的操作結果，不會自動包含劇本正文、檔名或完整路徑，也不會由應用程式自動上傳。"
      ],
      [
        "如果您主动发送反馈、诊断或示例文件，开发者将收到您发送的内容及该沟通渠道向接收者提供的信息。",
        "If you voluntarily send feedback, diagnostics or samples, the developer receives what you send and information the communication channel provides to recipients.",
        "如果您主動傳送回報、診斷或範例檔案，開發者將收到您傳送的內容及該溝通管道向接收者提供的資訊。"
      ],
      [
        "您主动发送的可识别反馈、诊断或示例资料，仅用于分析问题和迭代更新软件。我们自收到资料之日起保存90天，到期删除开发者可控制的可识别会话记录、附件及另行保存的副本。我们不会将这些资料用于广告定向、出售或与反馈处理无关的用途；拟公开内容时会另行征求您的同意。",
        "Identifiable feedback, diagnostics and samples you send are used only to investigate problems and improve the software. We retain them for 90 days from receipt, then delete identifiable conversation records, attachments and separately saved copies under the developer's control. We do not sell them, use them for targeted advertising or unrelated purposes. We will separately seek consent before publishing content.",
        "您主動傳送的可識別回報、診斷或範例資料，僅用於分析問題和迭代更新軟體。我們自收到資料之日起保存90天，到期刪除開發者可控制的可識別對話紀錄、附件及另行儲存的副本。我們不會將這些資料用於廣告定向、出售或與回報處理無關的用途；擬公開內容時會另行徵求您的同意。"
      ],
      [
        "微信等外部平台自身保存的服务记录适用其独立政策，开发者不能代平台保证删除其服务器或安全日志中的全部记录。我们会按上述期限处理自己能够控制的记录与副本。",
        "Service records held by external platforms such as WeChat follow their own policies. The developer cannot guarantee removal of all records on their servers or security logs. We handle records and copies under our control within the period above.",
        "微信等外部平台自行保存的服務紀錄適用其獨立政策，開發者不能代平台保證刪除其伺服器或安全日誌中的全部紀錄。我們會按上述期限處理自己能夠控制的紀錄與副本。"
      ],
      [
        "微信公众号等外部平台独立处理其服务中的信息，适用其自身政策。请自行选择是否使用该渠道，写作功能不以提供反馈为条件。",
        "External platforms, including WeChat, independently process service information under their own policies. Using them is optional; writing features do not depend on providing feedback.",
        "微信公眾號等外部平台獨立處理其服務中的資訊，適用其自身政策。請自行選擇是否使用該管道，寫作功能不以提供回報為條件。"
      ]
    ]
  },
  {
    "id": "third-parties",
    "title": [
      "Apple与第三方组件",
      "Apple and third-party components",
      "Apple與第三方元件"
    ],
    "paragraphs": [
      [
        "应用使用Electron、PDF解析、文档处理、字体和编辑器等第三方组件提供本机功能。开发者应按实际集成行为披露数据处理，不能以“离线”为由忽略第三方行为。",
        "The app uses third-party components for local functions, including Electron, PDF parsing, document processing, fonts and editing. The developer must disclose data handling based on actual integration; being offline does not excuse ignoring third-party behavior.",
        "應用程式使用Electron、PDF解析、文件處理、字型和編輯器等第三方元件提供本機功能。開發者應按實際整合行為揭露資料處理，不能以「離線」為由忽略第三方行為。"
      ],
      [
        "您通过App Store取得应用时，Apple会按其政策处理下载、交易及平台服务信息。本政策不代替Apple或您另行使用的外部服务政策。",
        "When you obtain the app through the App Store, Apple handles download, transaction and platform service information under its policies. This policy does not replace Apple's policies or those of external services you use.",
        "您透過App Store取得應用程式時，Apple會按其政策處理下載、交易及平台服務資訊。本政策不取代Apple或您另行使用的外部服務政策。"
      ],
      [
        "本应用当前未设置广告投放、跨应用追踪或自动诊断上传服务。如数据处理方式变化，应先更新政策、商店披露并完成适用的告知或同意流程。",
        "The app currently has no advertising, cross-app tracking or automatic diagnostic upload services. Changes to data handling should be preceded by updated policies, store disclosures and any applicable notice or consent steps.",
        "本應用程式目前未設定廣告投放、跨應用程式追蹤或自動診斷上傳服務。如資料處理方式變更，應先更新政策、商店揭露並完成適用的告知或同意流程。"
      ]
    ]
  },
  {
    "id": "your-choices",
    "title": [
      "您的选择",
      "Your choices",
      "您的選擇"
    ],
    "paragraphs": [
      [
        "您可选择不提交反馈，撤回相应文件夹访问，或删除自己保存的项目和备份。删除项目前请核对是否仍需恢复副本；恢复、历史和外部备份可能需要分别处理。",
        "You may decline to send feedback, revoke relevant folder access or delete projects and backups you saved. Check whether recovery copies are still needed before deleting projects. Recovery, history and external backups may need separate handling.",
        "您可選擇不提交回報，撤回相應資料夾存取，或刪除自己儲存的專案和備份。刪除專案前請核對是否仍需復原副本；復原、歷史和外部備份可能需要分別處理。"
      ],
      [
        "如您曾向开发者发送可识别资料，可通过下方联系方式请求查阅、更正或删除。开发者将先核实必要的请求信息，再依适用要求处理；不会索取您的Apple密码或证书私钥。",
        "If you sent identifiable information to the developer, use the contact below to request access, correction or deletion. The developer will verify necessary request details and respond under applicable requirements, without asking for your Apple password or certificate private key.",
        "如您曾向開發者傳送可識別資料，可透過下方聯絡方式請求查閱、更正或刪除。開發者將先核實必要的請求資訊，再依適用要求處理；不會索取您的Apple密碼或憑證私密金鑰。"
      ]
    ]
  },
  {
    "id": "minors",
    "title": [
      "未成年人",
      "Minors",
      "未成年人"
    ],
    "paragraphs": [
      [
        "本软件不是面向儿童的社交服务，不提供公开用户内容社区。监护人应指导未成年人选择适当的创作内容，并避免向反馈渠道发送不必要的个人信息。",
        "This software is not a social service for children and has no public user-content community. Guardians should guide minors in choosing appropriate creative material and avoiding unnecessary personal information in feedback.",
        "本軟體不是面向兒童的社交服務，不提供公開使用者內容社群。監護人應指導未成年人選擇適當的創作內容，並避免向回報管道傳送不必要的個人資訊。"
      ]
    ]
  },
  {
    "id": "contact",
    "title": [
      "联系开发者",
      "Contact the developer",
      "聯絡開發者"
    ],
    "paragraphs": [
      [
        "开发者：1037 Film 郭之然",
        "Developer: 1037 Film / Guo Zhiran",
        "開發者：1037 Film 郭之然"
      ],
      [
        "公开支持邮箱：uberadamfor4@gmail.com",
        "Public support email: uberadamfor4@gmail.com",
        "公開支援信箱：uberadamfor4@gmail.com"
      ],
      [
        "辅助反馈渠道：微信公众号1037 Film后台留言",
        "Optional feedback channel: message the 1037 Film WeChat account",
        "輔助回報管道：微信公眾號1037 Film後台留言"
      ]
    ]
  },
  {
    "id": "changes",
    "title": [
      "政策变更",
      "Policy changes",
      "政策變更"
    ],
    "paragraphs": [
      [
        "当实际数据处理方式发生变化时，开发者将更新本政策及相关商店披露；如适用要求需要进一步告知或同意，应在实施前完成相应步骤。",
        "The developer will update this policy and relevant store disclosures when actual data handling changes. Further notice or consent required by applicable requirements should be completed before implementation.",
        "當實際資料處理方式發生變更時，開發者將更新本政策及相關商店揭露；如適用要求需要進一步告知或同意，應在實施前完成相應步驟。"
      ]
    ]
  }
]

export function policyText(locale: UiLocale, value: Translation) {
  return workflowText(locale, ...value)
}

