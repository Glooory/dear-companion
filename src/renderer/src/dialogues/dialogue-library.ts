export const DIALOGUES = {
  dailyClick: ['我在这里呀。', '嘿，看到你啦。', '要一起晃一晃吗？'],
  dailyCute: ['偷偷卖个萌。', '给你一点好心情。', '今天也轻轻松松。'],
  dailyPetting: ['好舒服呀。', '再摸一下也可以。', '嘿嘿，收到啦。'],
  playfulClick: ['抓到你啦！', '来一起动一动！', '今天很有精神哦。'],
  drowsyClick: ['唔……还醒着呢。', '让我再缓一会儿。', '差一点就睡着啦。'],
  drowsyPetting: ['轻一点，我有点困。', '这样更想睡啦。', '慢慢摸就好。'],
  drowsyEnter: ['开始有点困啦。', '先打个小哈欠。'],
  sleepingMurmur: ['唔……', '听见啦……', '还在做小梦呢。'],
  sleepingStirring: ['快醒一点点了……', '再叫一下嘛……', '眼睛要睁开啦……'],
  sleepingWake: ['醒来啦！', '好啦，我起来了。', '新的清醒时间开始。'],
  sleepingTouch: ['梦里也感觉到啦。', '轻轻的，不要吵醒我哦。'],
  workingClick: ['我在陪你专心。', '慢慢来，做好眼前这一点。', '一起安静工作吧。'],
  workingPetting: ['收到鼓励，继续专心。', '摸一下，再一起努力。'],
  workingEnter: ['工作时间，我安静陪你。', '开始专心啦。'],
  angry: ['慢一点呀！', '晃得我头晕啦！', '别这么急嘛。'],
  crying: ['休息一下嘛，不要乱跑呀。', '说好一起歇一会儿的。'],
  reminderCompletion: ['休息完成啦！', '充好一点点电啦。', '辛苦啦，我们继续吧。'],
  dailyEnter: ['回来陪你啦。', '继续轻轻松松待在一起。'],
  sleepingEnter: ['晚安一小会儿。', '我先眯一下。']
} as const

export type DialoguePool = (typeof DIALOGUES)[keyof typeof DIALOGUES]
