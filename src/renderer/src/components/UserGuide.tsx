import styles from "./UserGuide.module.css";

export function UserGuide(): React.JSX.Element {
  return (
    <section className={styles.guideGrid} aria-label="使用说明">
      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon} aria-hidden="true">
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <circle cx="8" cy="8" r="1.5" />
              <path d="M17 13l-5-5-6 6" />
            </svg>
          </span>
          <h2>准备与定制</h2>
        </div>
        <ul className={styles.itemList} role="list">
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              导入透明照片
            </span>
            <p className={styles.itemDesc}>
              添加已抠好透明背景的 PNG 或 WebP 图片。可为日常陪伴、有点困了、睡觉和专注工作分别指定照片。
            </p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              头部感应校准
            </span>
            <p className={styles.itemDesc}>在照片设置中微调头顶的椭圆光圈，即可精确指定摸头抚摩的触发热区。</p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              录音与配音
            </span>
            <p className={styles.itemDesc}>
              支持为对白录制最长 8 秒的语音，或导入本地音频自由截取，让 TA 用熟悉的声音说话。
            </p>
          </li>
        </ul>
      </article>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon} aria-hidden="true">
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 16.5s-6-3.8-6-7.5a3.5 3.5 0 0 1 6-2.2 3.5 3.5 0 0 1 6 2.2c0 3.7-6 7.5-6 7.5z" />
            </svg>
          </span>
          <h2>桌面日常互动</h2>
        </div>
        <ul className={styles.itemList} role="list">
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              轻点与唤醒
            </span>
            <p className={styles.itemDesc}>单击让 TA 做动作回应；睡着时连续轻点几次可逐渐唤醒 TA。</p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              摸摸头顶
            </span>
            <p className={styles.itemDesc}>光标在头顶范围内来回轻晃，TA 会冒出爱心并向光标方向倾身靠过来。</p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              推动、拖拽与抗议
            </span>
            <p className={styles.itemDesc}>
              光标贴着身体向旁移动可以把 TA 小步推开；按住身体可在桌面上随意挪动；如果拖动速度太急太快，TA
              会晃动身体抗议。
            </p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              靠近注视
            </span>
            <p className={styles.itemDesc}>光标停留在身旁时，TA 会微微偏头朝向光标。</p>
          </li>
        </ul>
      </article>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon} aria-hidden="true">
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h12M4 10h12M4 14h8" />
            </svg>
          </span>
          <h2>快捷菜单与状态</h2>
        </div>
        <ul className={styles.itemList} role="list">
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              伙伴右键菜单
            </span>
            <p className={styles.itemDesc}>
              右键点击伙伴，可选择“逗逗 TA”即时互动，或随时切换生活状态（“安静待着”、“让 TA
              打个盹”、“陪我专注”），也能恢复自动陪伴。
            </p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              常用对白
            </span>
            <p className={styles.itemDesc}>
              在伙伴设置中挑选最多 3 句非休息对白放入快捷列表，右键即可直接让 TA 说话并播放配音。
            </p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              系统托盘
            </span>
            <p className={styles.itemDesc}>通过任务栏或菜单栏图标，可随时隐藏或重新显示伙伴，不影响全屏工作。</p>
          </li>
        </ul>
      </article>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon} aria-hidden="true">
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="10" r="7.5" />
              <polyline points="10,6 10,10 13,12" />
            </svg>
          </span>
          <h2>专注与健康作息</h2>
        </div>
        <ul className={styles.itemList} role="list">
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              专注时段
            </span>
            <p className={styles.itemDesc}>可设定每天的工作时间段，期间 TA 会保持安静、换上工作姿态陪伴。</p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              作息提醒
            </span>
            <p className={styles.itemDesc}>
              支持设置固定时刻或在指定时段内按间隔重复提醒。到点后可选择立即开始，或延后 5–15 分钟。
            </p>
          </li>
          <li className={styles.item}>
            <span className={styles.itemHeading}>
              <span className={styles.bullet} aria-hidden="true" />
              休息监督
            </span>
            <p className={styles.itemDesc}>
              休息倒计时期间若频繁移动鼠标，TA 会哭闹督促你离开屏幕；监督不会锁定电脑，随时可提前结束。
            </p>
          </li>
        </ul>
      </article>
    </section>
  );
}
