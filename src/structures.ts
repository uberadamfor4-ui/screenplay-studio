import type { AppLocale, ScriptElement } from './types'
import { createElement } from './formats'

export type BeatSheet = {
  id: string
  title: Record<AppLocale, string>
  beats: Record<AppLocale, string[]>
}

export const beatSheets: BeatSheet[] = [
  {
    id: 'three-act',
    title: {
      'zh-CN': '三幕式',
      'en-US': 'Three Act',
      'zh-TW': '三幕式',
      'ja-JP': '三幕構成',
      'ko-KR': '3막 구조',
    },
    beats: {
      'zh-CN': ['开场状态', '诱发事件', '第一幕转折', '中点反转', '危机', '第二幕转折', '高潮', '余波'],
      'en-US': ['Opening State', 'Inciting Incident', 'Act One Turn', 'Midpoint', 'Crisis', 'Act Two Turn', 'Climax', 'Aftermath'],
      'zh-TW': ['開場狀態', '誘發事件', '第一幕轉折', '中點反轉', '危機', '第二幕轉折', '高潮', '餘波'],
      'ja-JP': ['導入状態', '発端', '第一幕転換', 'ミッドポイント', '危機', '第二幕転換', 'クライマックス', '余韻'],
      'ko-KR': ['시작 상태', '촉발 사건', '1막 전환', '중간 반전', '위기', '2막 전환', '클라이맥스', '여운'],
    },
  },
  {
    id: 'save-the-cat',
    title: {
      'zh-CN': '商业片节拍',
      'en-US': 'Commercial Beat Sheet',
      'zh-TW': '商業片節拍',
      'ja-JP': '商業映画ビート',
      'ko-KR': '상업영화 비트',
    },
    beats: {
      'zh-CN': ['开场画面', '主题陈述', '铺垫', '催化剂', '争辩', '进入第二幕', '副线', '游戏时间', '中点', '坏人逼近', '一无所有', '黑夜灵魂', '进入第三幕', '结局', '终场画面'],
      'en-US': ['Opening Image', 'Theme Stated', 'Set-Up', 'Catalyst', 'Debate', 'Break Into Two', 'B Story', 'Fun and Games', 'Midpoint', 'Bad Guys Close In', 'All Is Lost', 'Dark Night', 'Break Into Three', 'Finale', 'Final Image'],
      'zh-TW': ['開場畫面', '主題陳述', '鋪墊', '催化劑', '爭辯', '進入第二幕', '副線', '遊戲時間', '中點', '壞人逼近', '一無所有', '黑夜靈魂', '進入第三幕', '結局', '終場畫面'],
      'ja-JP': ['冒頭画', 'テーマ提示', 'セットアップ', 'きっかけ', '葛藤', '第二幕へ', 'Bストーリー', '楽しみ', '中点', '敵の接近', 'すべてを失う', '魂の闇夜', '第三幕へ', 'フィナーレ', '最後の画'],
      'ko-KR': ['오프닝 이미지', '주제 제시', '설정', '촉매', '논쟁', '2막 진입', 'B 스토리', '재미와 약속', '중간점', '압박', '모든 것을 잃음', '어두운 밤', '3막 진입', '피날레', '마지막 이미지'],
    },
  },
  {
    id: 'hero-journey',
    title: {
      'zh-CN': '英雄旅程',
      'en-US': "Hero's Journey",
      'zh-TW': '英雄旅程',
      'ja-JP': '英雄の旅',
      'ko-KR': '영웅의 여정',
    },
    beats: {
      'zh-CN': ['日常世界', '冒险召唤', '拒绝召唤', '导师', '跨越门槛', '试炼盟友敌人', '接近深层洞穴', '严峻考验', '奖赏', '归途', '复活', '带着灵药归来'],
      'en-US': ['Ordinary World', 'Call to Adventure', 'Refusal', 'Mentor', 'Threshold', 'Tests Allies Enemies', 'Approach', 'Ordeal', 'Reward', 'Road Back', 'Resurrection', 'Return'],
      'zh-TW': ['日常世界', '冒險召喚', '拒絕召喚', '導師', '跨越門檻', '試煉盟友敵人', '接近深層洞穴', '嚴峻考驗', '獎賞', '歸途', '復活', '帶著靈藥歸來'],
      'ja-JP': ['日常世界', '冒険への誘い', '拒絶', '師', '境界越え', '試練と仲間と敵', '最深部へ', '試練', '報酬', '帰路', '復活', '帰還'],
      'ko-KR': ['일상 세계', '모험의 부름', '거절', '멘토', '문턱 넘기', '시험과 동맹과 적', '접근', '시련', '보상', '귀환길', '부활', '귀환'],
    },
  },
  {
    id: 'kishotenketsu',
    title: {
      'zh-CN': '起承转合',
      'en-US': 'Kishotenketsu',
      'zh-TW': '起承轉合',
      'ja-JP': '起承転結',
      'ko-KR': '기승전결',
    },
    beats: {
      'zh-CN': ['起：建立人物与世界', '承：深化关系与规则', '转：引入反差或新视角', '合：重组意义并收束'],
      'en-US': ['Ki: Establish', 'Sho: Develop', 'Ten: Turn', 'Ketsu: Reconcile'],
      'zh-TW': ['起：建立人物與世界', '承：深化關係與規則', '轉：引入反差或新視角', '合：重組意義並收束'],
      'ja-JP': ['起：世界を置く', '承：関係を深める', '転：視点を変える', '結：意味を結ぶ'],
      'ko-KR': ['기: 세계를 세움', '승: 관계를 확장', '전: 새 관점', '결: 의미의 수렴'],
    },
  },
  {
    id: 'tv-hour',
    title: {
      'zh-CN': '一小时剧集',
      'en-US': 'One-Hour TV',
      'zh-TW': '一小時劇集',
      'ja-JP': '一時間ドラマ',
      'ko-KR': '1시간 드라마',
    },
    beats: {
      'zh-CN': ['冷开场', '第一幕问题', '第二幕升级', '第三幕反转', '第四幕代价', '第五幕解决', '尾声钩子'],
      'en-US': ['Cold Open', 'Act One Problem', 'Act Two Escalation', 'Act Three Turn', 'Act Four Cost', 'Act Five Resolution', 'Tag'],
      'zh-TW': ['冷開場', '第一幕問題', '第二幕升級', '第三幕反轉', '第四幕代價', '第五幕解決', '尾聲鉤子'],
      'ja-JP': ['コールドオープン', '第一幕の問題', '第二幕の拡大', '第三幕の転換', '第四幕の代償', '第五幕の解決', 'タグ'],
      'ko-KR': ['콜드 오픈', '1막 문제', '2막 확대', '3막 반전', '4막 대가', '5막 해결', '태그'],
    },
  },
]

export function createBeatElements(sheet: BeatSheet, locale: AppLocale): ScriptElement[] {
  return sheet.beats[locale].map((beat) => createElement('section', beat))
}
