export type DialogueCategory =
  | 'daily:click'
  | 'playful:click'
  | 'daily:petting'
  | 'auto:cute'
  | 'state:daily'
  | 'state:drowsy'
  | 'drowsy:click'
  | 'drowsy:petting'
  | 'state:sleeping'
  | 'sleeping:murmur'
  | 'sleeping:stirring'
  | 'sleeping:awake'
  | 'sleeping:touch'
  | 'state:working'
  | 'working:click'
  | 'working:petting'
  | 'angry'

export type DialogueGroupId = 'daily' | 'drowsy' | 'sleeping' | 'working' | 'other'

export interface BuiltInDialogueRow {
  readonly id: string
  readonly text: string
}

export interface DialogueTriggerMeta {
  readonly id: DialogueCategory
  readonly group: DialogueGroupId
  readonly label: string
  readonly builtIns: readonly BuiltInDialogueRow[]
}

export interface DialogueGroupMeta {
  readonly id: DialogueGroupId
  readonly label: string
  readonly triggers: readonly DialogueTriggerMeta[]
}

export const SYSTEM_DIALOGUES = {
  crying: ['还没休息够呢～', '再休息一会儿吧～', '闭目养神一会儿好不好？'],
  reminderCompletion: ['休息结束啦！', '活动一下，感觉好多了～', '充满电啦，继续加油！']
} as const

export const DIALOGUE_GROUPS: readonly DialogueGroupMeta[] = Object.freeze([
  {
    id: 'daily',
    label: '平时陪伴',
    triggers: [
      {
        id: 'daily:click',
        group: 'daily',
        label: '被点一下',
        builtIns: [
          { id: 'daily-click-here', text: '在呢。' },
          { id: 'daily-click-whats-up', text: '怎么啦？' },
          { id: 'daily-click-see-you', text: '看见你了。' },
          { id: 'daily-click-with-you', text: '一直陪着你呢。' },
          { id: 'daily-click-hard-work', text: '今天也辛苦啦。' }
        ]
      },
      {
        id: 'playful:click',
        group: 'daily',
        label: '活泼时被点一下',
        builtIns: [
          { id: 'playful-click-coming', text: '来啦！' },
          { id: 'playful-click-play-more', text: '再玩一下？' },
          { id: 'playful-click-moving', text: '动起来动起来。' },
          { id: 'playful-click-watch-me', text: '看我动一动～' }
        ]
      },
      {
        id: 'daily:petting',
        group: 'daily',
        label: '摸摸头',
        builtIns: [
          { id: 'daily-petting-comfy', text: '嗯，舒服。' },
          { id: 'daily-petting-touch-again', text: '再摸一下。' },
          { id: 'daily-petting-received', text: '收到了。' },
          { id: 'daily-petting-warm', text: '好暖和。' },
          { id: 'daily-petting-favorite', text: '最喜欢摸头啦。' }
        ]
      },
      {
        id: 'auto:cute',
        group: 'daily',
        label: '主动开口',
        builtIns: [
          { id: 'auto-cute-stretch', text: '活动一下。' },
          { id: 'auto-cute-posture', text: '换个姿势。' },
          { id: 'auto-cute-walk', text: '走两步。' },
          { id: 'auto-cute-yawn', text: '伸个懒腰～' },
          { id: 'auto-cute-refresh', text: '抖抖精神。' }
        ]
      },
      {
        id: 'state:daily',
        group: 'daily',
        label: '回到日常',
        builtIns: [
          { id: 'state-daily-back', text: '回来了。' },
          { id: 'state-daily-stay', text: '继续待着。' },
          { id: 'state-daily-energetic', text: '元气满满！' }
        ]
      }
    ]
  },
  {
    id: 'drowsy',
    label: '有点困了',
    triggers: [
      {
        id: 'state:drowsy',
        group: 'drowsy',
        label: '刚开始犯困',
        builtIns: [
          { id: 'state-drowsy-sleepy', text: '有点困了。' },
          { id: 'state-drowsy-yawn', text: '打个哈欠……' },
          { id: 'state-drowsy-eyelids', text: '眼睛有点打架。' }
        ]
      },
      {
        id: 'drowsy:click',
        group: 'drowsy',
        label: '被点一下',
        builtIns: [
          { id: 'drowsy-click-awake', text: '还醒着呢。' },
          { id: 'drowsy-click-sleepy', text: '有点困……' },
          { id: 'drowsy-click-almost', text: '差点睡着啦。' },
          { id: 'drowsy-click-heavy', text: '脑袋沉沉的。' }
        ]
      },
      {
        id: 'drowsy:petting',
        group: 'drowsy',
        label: '摸摸头',
        builtIns: [
          { id: 'drowsy-petting-gentle', text: '轻一点……' },
          { id: 'drowsy-petting-sleepier', text: '更困了。' },
          { id: 'drowsy-petting-slowly', text: '慢慢摸……' },
          { id: 'drowsy-petting-falling-asleep', text: '要睡着啦。' }
        ]
      }
    ]
  },
  {
    id: 'sleeping',
    label: '睡觉',
    triggers: [
      {
        id: 'state:sleeping',
        group: 'sleeping',
        label: '刚睡着',
        builtIns: [
          { id: 'state-sleeping-nap', text: '我先眯一会儿。' },
          { id: 'state-sleeping-sleep', text: '先睡一下啦。' },
          { id: 'state-sleeping-dream', text: '做个好梦。' }
        ]
      },
      {
        id: 'sleeping:murmur',
        group: 'sleeping',
        label: '第一次叫它',
        builtIns: [
          { id: 'sleeping-murmur-hum', text: '唔……' },
          { id: 'sleeping-murmur-heard', text: '听见了……' },
          { id: 'sleeping-murmur-not-awake', text: '还没醒呢……' }
        ]
      },
      {
        id: 'sleeping:stirring',
        group: 'sleeping',
        label: '快醒了',
        builtIns: [
          { id: 'sleeping-stirring-waking', text: '快醒了……' },
          { id: 'sleeping-stirring-call-again', text: '再叫一下……' },
          { id: 'sleeping-stirring-open-eyes', text: '快睁开眼啦……' }
        ]
      },
      {
        id: 'sleeping:awake',
        group: 'sleeping',
        label: '完全醒来',
        builtIns: [
          { id: 'sleeping-awake-awake', text: '醒了！' },
          { id: 'sleeping-awake-up', text: '起来了。' },
          { id: 'sleeping-awake-always-here', text: '我一直在。' }
        ]
      },
      {
        id: 'sleeping:touch',
        group: 'sleeping',
        label: '睡觉时摸摸头',
        builtIns: [
          { id: 'sleeping-touch-felt', text: '感觉到了……' },
          { id: 'sleeping-touch-sweet-dreams', text: '轻一点……好梦中。' }
        ]
      }
    ]
  },
  {
    id: 'working',
    label: '专注陪伴',
    triggers: [
      {
        id: 'state:working',
        group: 'working',
        label: '刚进入专注',
        builtIns: [
          { id: 'state-working-quiet', text: '我安静陪你。' },
          { id: 'state-working-focus', text: '先不打扰你啦，专心哦。' }
        ]
      },
      {
        id: 'working:click',
        group: 'working',
        label: '被点一下',
        builtIns: [
          { id: 'working-click-with-you', text: '我陪着你。' },
          { id: 'working-click-reassured', text: '安心做事吧。' },
          { id: 'working-click-guard', text: '在这里守着你。' }
        ]
      },
      {
        id: 'working:petting',
        group: 'working',
        label: '摸摸头',
        builtIns: [
          { id: 'working-petting-yes', text: '嗯。' },
          { id: 'working-petting-cheer', text: '收到了，继续加油。' }
        ]
      }
    ]
  },
  {
    id: 'other',
    label: '其他互动',
    triggers: [
      {
        id: 'angry',
        group: 'other',
        label: '拖动太快',
        builtIns: [
          { id: 'angry-slower', text: '慢一点呀。' },
          { id: 'angry-dizzy', text: '晃晕了！' },
          { id: 'angry-not-too-fast', text: '别太急嘛。' },
          { id: 'angry-giddy', text: '晕乎乎的……' }
        ]
      }
    ]
  }
])

export const DIALOGUE_CATEGORIES: readonly DialogueCategory[] = Object.freeze(
  DIALOGUE_GROUPS.flatMap((group) => group.triggers.map((trigger) => trigger.id))
)

const CATEGORY_MAP = new Map<DialogueCategory, DialogueTriggerMeta>()
for (const group of DIALOGUE_GROUPS) {
  for (const trigger of group.triggers) {
    CATEGORY_MAP.set(trigger.id, trigger)
  }
}

export function isDialogueCategory(value: unknown): value is DialogueCategory {
  return typeof value === 'string' && CATEGORY_MAP.has(value as DialogueCategory)
}

export function getDialogueTriggerMeta(category: DialogueCategory): DialogueTriggerMeta {
  const meta = CATEGORY_MAP.get(category)
  if (!meta) throw new Error(`Unknown dialogue category: ${category}`)
  return meta
}
