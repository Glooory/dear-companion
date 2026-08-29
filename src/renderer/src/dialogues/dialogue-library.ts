export const DIALOGUES = {
  dailyClick: ['在呢。', '怎么啦？', '看见你了。', '一直陪着你呢。', '今天也辛苦啦。'],
  dailyCute: ['活动一下。', '换个姿势。', '走两步。', '伸个懒腰～', '抖抖精神。'],
  dailyPetting: ['嗯，舒服。', '再摸一下。', '收到了。', '好暖和。', '最喜欢摸头啦。'],
  playfulClick: ['来啦！', '再玩一下？', '动起来动起来。', '看我动一动～'],
  drowsyClick: ['还醒着呢。', '有点困……', '差点睡着啦。', '脑袋沉沉的。'],
  drowsyPetting: ['轻一点……', '更困了。', '慢慢摸……', '要睡着啦。'],
  drowsyEnter: ['有点困了。', '打个哈欠……', '眼睛有点打架。'],
  sleepingMurmur: ['唔……', '听见了……', '还没醒呢……'],
  sleepingStirring: ['快醒了……', '再叫一下……', '快睁开眼啦……'],
  sleepingWake: ['醒了！', '起来了。', '我一直在。'],
  sleepingTouch: ['感觉到了……', '轻一点……好梦中。'],
  workingClick: ['我陪着你。', '安心做事吧。', '在这里守着你。'],
  workingPetting: ['嗯。', '收到了，继续加油。'],
  workingEnter: ['我安静陪你。', '先不打扰你啦，专心哦。'],
  angry: ['慢一点呀。', '晃晕了！', '别太急嘛。', '晕乎乎的……'],
  crying: ['还没休息够呢～', '再休息一会儿吧～', '闭目养神一会儿好不好？'],
  reminderCompletion: ['休息结束啦！', '活动一下，感觉好多了～', '充满电啦，继续加油！'],
  dailyEnter: ['回来了。', '继续待着。', '元气满满！'],
  sleepingEnter: ['我先眯一会儿。', '先睡一下啦。', '做个好梦。']
} as const

export type DialoguePool = (typeof DIALOGUES)[keyof typeof DIALOGUES]
