export const DIALOGUES = {
  dailyClick: ['在呢。', '怎么啦？', '看见你了。'],
  dailyCute: ['活动一下。', '换个姿势。', '走两步。'],
  dailyPetting: ['嗯，舒服。', '再摸一下。', '收到了。'],
  playfulClick: ['来啦。', '再玩一下？', '动起来。'],
  drowsyClick: ['还醒着。', '有点困。', '差点睡着。'],
  drowsyPetting: ['轻一点。', '更困了。', '慢慢摸。'],
  drowsyEnter: ['有点困了。', '打个哈欠。'],
  sleepingMurmur: ['唔……', '听见了……', '还没醒。'],
  sleepingStirring: ['快醒了……', '再叫一下……', '睁不开眼……'],
  sleepingWake: ['醒了。', '起来了。', '我在。'],
  sleepingTouch: ['感觉到了。', '轻一点……'],
  workingClick: ['我陪着。', '安静一会儿。', '在这里。'],
  workingPetting: ['嗯。', '收到了。'],
  workingEnter: ['我安静陪你。', '先不打扰你。'],
  angry: ['慢一点。', '晃晕了。', '别太急。'],
  crying: ['还没休息够。', '再坐一会儿。'],
  reminderCompletion: ['休息结束。', '时间到了。', '可以起来了。'],
  dailyEnter: ['回来了。', '继续待着。'],
  sleepingEnter: ['我眯一会儿。', '先睡一下。']
} as const

export type DialoguePool = (typeof DIALOGUES)[keyof typeof DIALOGUES]
