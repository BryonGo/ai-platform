// 多页路由版共享数据层（原型 mock）。
// 字段结构与 docs/contracts/openapi-hougong.yaml 对齐，后端接入后替换为契约类型。

export type WorkKind = '视频' | '图集'
export type WorkStatus = 'done' | 'running'

export interface CharacterAppearance {
  label: string
  value: string
}

export interface CharacterOutfit {
  name: string
  note: string
  swatch: string
}

export interface Character {
  id: string
  name: string
  alias: string
  age: string
  image: string
  tagline: string
  traits: string[]
  appearance: CharacterAppearance[]
  outfits: CharacterOutfit[]
  workCount: number
}

export interface Work {
  id: string
  title: string
  characterId: string
  kind: WorkKind
  meta: string
  image: string
  tone: string
  recommended?: boolean
  status: WorkStatus
}

export interface StoryClip {
  id: string
  workId: string
  order: number
  note: string
}

export interface Story {
  id: string
  title: string
  synopsis: string
  characterIds: string[]
  cover: string
  tone: string
  updatedAt: string
  relation: { from: string, to: string, note: string }[]
  settings: { name: string, note: string }[]
  clips: StoryClip[]
}

export const characters: Character[] = [
  {
    id: 'daji',
    name: '妲己',
    alias: '首位角色 · 狐灵',
    age: '24 岁 · 三尾狐灵',
    image: '/images/daji-three-tail-front-v1.webp',
    tagline: '妖艳、聪明、从容、狡黠。白狐耳，朱红丝缎裙，三尾收放自如，赤足踝间细金铃。',
    traits: ['妖艳', '聪明', '从容', '狡黠'],
    appearance: [
      { label: '耳', value: '白狐耳' },
      { label: '发', value: '深棕近黑半束长发，银白花枝发饰' },
      { label: '眼', value: '琥珀棕，细长上挑眼线' },
      { label: '裙', value: '朱红丝缎细肩带，单侧开衩' },
      { label: '尾', value: '固定三条白狐尾，一上两下收拢' },
      { label: '足', value: '赤足，双踝细金链三枚铃铛' }
    ],
    outfits: [
      { name: '朱红丝缎裙', note: '默认造型 · 不对称下摆', swatch: '#b3261e' },
      { name: '银白花枝', note: '发饰与耳饰组合', swatch: '#d8d4c8' },
      { name: '狐灵形态', note: '完整小白狐 · 延展中', swatch: '#f3f1eb' }
    ],
    workCount: 6
  },
  {
    id: 'office',
    name: 'Office Lady',
    alias: '都市白领 · 深夜来函',
    age: '21 岁 · 成年角色',
    image: '/images/office-lady-gold-glasses-v1.webp',
    tagline: '干练、知性、克制。金丝眼镜后的目光冷静，深夜加班时只有她与文件为伴。',
    traits: ['干练', '知性', '克制'],
    appearance: [
      { label: '镜', value: '金丝细框眼镜' },
      { label: '发', value: '深色盘发，额前碎发' },
      { label: '装', value: '藏青西装外套' },
      { label: '裙', value: '及膝铅笔裙' },
      { label: '饰', value: '银色细链手表' },
      { label: '履', value: '黑色中跟皮鞋' }
    ],
    outfits: [
      { name: '深夜办公室', note: '西装外套 · 领口微松', swatch: '#1f3a5f' },
      { name: '金丝眼镜', note: '细框 · 冷光下反光', swatch: '#c9a24b' },
      { name: '通勤手袋', note: '深棕公文袋', swatch: '#6b4a2b' }
    ],
    workCount: 3
  },
  {
    id: 'nurse',
    name: '甜美护士',
    alias: '晨光值班 · 温柔守望',
    age: '25 岁 · 成年角色',
    image: '/images/nurse-sweet-adult25-v1.webp',
    tagline: '温柔、细致、耐心。盘发齐整，笑起来带着晨光值班的暖意。',
    traits: ['温柔', '细致', '耐心'],
    appearance: [
      { label: '发', value: '浅色盘发' },
      { label: '帽', value: '护士帽' },
      { label: '衣', value: '浅粉护士制服' },
      { label: '围', value: '白色围裙' },
      { label: '饰', value: '简约银链' },
      { label: '履', value: '白色软底护士鞋' }
    ],
    outfits: [
      { name: '晨光值班', note: '浅粉制服 · 白围裙', swatch: '#e8b4b8' },
      { name: '盘发', note: '低盘发 · 发网收束', swatch: '#d9c9a3' },
      { name: '出勤外套', note: '浅灰开衫', swatch: '#9aa0a6' }
    ],
    workCount: 3
  }
]

export const works: Work[] = [
  { id: 'w-1', title: '夜色来信', characterId: 'daji', kind: '视频', meta: '00:12', image: '/images/daji-three-tail-cutout-v2.webp', tone: 'cool', recommended: true, status: 'done' },
  { id: 'w-2', title: '第二次相遇', characterId: 'daji', kind: '图集', meta: '6 张', image: '/images/daji-approved-direction-v1.webp', tone: 'warm', status: 'done' },
  { id: 'w-3', title: '未完的对白', characterId: 'daji', kind: '视频', meta: '00:08', image: '/images/daji-three-tail-front-v1.webp', tone: 'jade', status: 'done' },
  { id: 'w-4', title: '镜前回眸', characterId: 'daji', kind: '图集', meta: '4 张', image: '/images/daji-three-tail-cutout-v2.webp', tone: 'cool', status: 'running' },
  { id: 'w-5', title: '午夜加班', characterId: 'office', kind: '图集', meta: '8 张', image: '/images/office-lady-gold-glasses-v1.webp', tone: 'office', recommended: true, status: 'done' },
  { id: 'w-6', title: '深夜来函', characterId: 'office', kind: '视频', meta: '00:10', image: '/images/office-lady-gold-glasses-v1.webp', tone: 'office', status: 'done' },
  { id: 'w-7', title: '灯下批注', characterId: 'office', kind: '图集', meta: '3 张', image: '/images/office-lady-gold-glasses-v1.webp', tone: 'office', status: 'done' },
  { id: 'w-8', title: '晨间问候', characterId: 'nurse', kind: '视频', meta: '00:10', image: '/images/nurse-sweet-adult25-v1.webp', tone: 'ivory', status: 'done' },
  { id: 'w-9', title: '午间巡房', characterId: 'nurse', kind: '图集', meta: '5 张', image: '/images/nurse-sweet-adult25-v1.webp', tone: 'ivory', status: 'done' },
  { id: 'w-10', title: '值班手记', characterId: 'nurse', kind: '视频', meta: '00:06', image: '/images/nurse-sweet-adult25-v1.webp', tone: 'ivory', status: 'done' }
]

export const stories: Story[] = [
  {
    id: 's-1',
    title: '狐影朱门',
    synopsis: '朱门深院，狐影徘徊。她在镜前等待一个只属于夜晚的约定，每一次快门落下，故事就向前推进一格。',
    characterIds: ['daji'],
    cover: '/images/daji-three-tail-cutout-v2.webp',
    tone: 'cool',
    updatedAt: '今天 14:20',
    relation: [
      { from: '你', to: '妲己', note: '镜中人 · 彼此唯一的观众' }
    ],
    settings: [
      { name: '月下回廊', note: '夜风、灯笼、铃音' },
      { name: '朱阁镜台', note: '烛火与三尾的倒影' }
    ],
    clips: [
      { id: 'c-1', workId: 'w-1', order: 1, note: '开场：夜色里的第一封信' },
      { id: 'c-2', workId: 'w-2', order: 2, note: '第二次相遇，她先开了口' },
      { id: 'c-3', workId: 'w-3', order: 3, note: '未完的对白，等在镜前' }
    ]
  },
  {
    id: 's-2',
    title: '深夜来函',
    synopsis: '写字楼最后一盏灯。金丝眼镜搁在文件上，她决定把没说完的话写进深夜。',
    characterIds: ['office'],
    cover: '/images/office-lady-gold-glasses-v1.webp',
    tone: 'office',
    updatedAt: '昨天 23:41',
    relation: [
      { from: '你', to: 'Office Lady', note: '客户 · 逐渐越界的深夜邮件' }
    ],
    settings: [
      { name: '深夜办公室', note: '一盏台灯、一杯冷咖啡' },
      { name: '天台', note: '城市灯火与风' }
    ],
    clips: [
      { id: 'c-4', workId: 'w-6', order: 1, note: '深夜来函，第一封' },
      { id: 'c-5', workId: 'w-7', order: 2, note: '灯下批注的侧影' }
    ]
  },
  {
    id: 's-3',
    title: '晨光值班',
    synopsis: '清晨六点的病房走廊很安静，她把第一声问候留给刚醒的人。',
    characterIds: ['nurse'],
    cover: '/images/nurse-sweet-adult25-v1.webp',
    tone: 'ivory',
    updatedAt: '9 月 4 日',
    relation: [
      { from: '你', to: '甜美护士', note: '病房常客 · 被记住的偏好' }
    ],
    settings: [
      { name: '晨光病房', note: '百叶窗与消毒水气味' },
      { name: '护士站', note: '交接班日志' }
    ],
    clips: [
      { id: 'c-6', workId: 'w-8', order: 1, note: '晨间问候' },
      { id: 'c-7', workId: 'w-9', order: 2, note: '午间巡房' },
      { id: 'c-8', workId: 'w-10', order: 3, note: '值班手记' }
    ]
  }
]

export function characterOf(id: string) {
  return characters.find(c => c.id === id)
}

export function workOf(id: string) {
  return works.find(w => w.id === id)
}

export function worksOf(characterId: string) {
  return works.filter(w => w.characterId === characterId)
}

export function storyOf(id: string) {
  return stories.find(s => s.id === id)
}

export function clipsOf(story: Story) {
  return [...story.clips].sort((a, b) => a.order - b.order)
}
