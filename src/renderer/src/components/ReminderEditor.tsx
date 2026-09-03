import type { CreateReminderInput, CursorTolerance } from "@shared/contracts";
import { WeekdayPicker } from "./WeekdayPicker";
import styles from "./ReminderEditor.module.css";

export interface ReminderDraft extends Omit<CreateReminderInput, "hour" | "minute"> {
  id?: string;
  hour: number | null;
  minute: number | null;
}

interface Props {
  value: ReminderDraft;
  disabled: boolean;
  onChange(value: ReminderDraft): void;
  onSave(): void;
  onCancel(): void;
  onDelete?: () => void;
}

export function ReminderEditor({ value, disabled, onChange, onSave, onCancel, onDelete }: Props): React.JSX.Element {
  const timeValue =
    value.hour === null || value.minute === null
      ? ""
      : `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
  const valid =
    value.hour !== null &&
    value.minute !== null &&
    value.weekdays.length > 0 &&
    value.message.trim().length >= 1 &&
    value.message.trim().length <= 200;

  return (
    <div className={styles.editor}>
      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>时间与重复</h3>
        <div className={styles.fields}>
          <label>
            <span>提醒时间</span>
            <input
              type="time"
              value={timeValue}
              onChange={(event) => {
                const [hour, minute] = event.currentTarget.value.split(":").map(Number);
                onChange({
                  ...value,
                  hour: Number.isInteger(hour) ? hour! : null,
                  minute: Number.isInteger(minute) ? minute! : null,
                });
              }}
            />
          </label>
          <label>
            <span>休息时长（分钟）</span>
            <input
              type="number"
              min={1}
              max={120}
              value={value.restDurationMinutes}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isInteger(next)) {
                  onChange({
                    ...value,
                    restDurationMinutes: Math.min(Math.max(next, 1), 120),
                  });
                }
              }}
            />
          </label>
          <label>
            <span>鼠标移动灵敏度</span>
            <select
              value={value.cursorTolerance}
              onChange={(event) =>
                onChange({
                  ...value,
                  cursorTolerance: event.currentTarget.value as CursorTolerance,
                })
              }
            >
              <option value="sensitive">轻微移动即提醒</option>
              <option value="standard">适度移动后提醒</option>
              <option value="relaxed">明显移动才提醒</option>
            </select>
          </label>
        </div>
        <WeekdayPicker
          value={value.weekdays}
          disabled={disabled}
          onChange={(weekdays) => onChange({ ...value, weekdays })}
        />
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>提醒内容</h3>
        <label className={styles.messageField}>
          <span>提醒气泡文案</span>
          <textarea
            maxLength={200}
            value={value.message}
            onChange={(event) => onChange({ ...value, message: event.currentTarget.value })}
          />
        </label>
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>声音与启用状态</h3>
        <div className={styles.togglesGrid}>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.enabled}
                disabled={!value.id || disabled}
                onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
              />
              <strong>启用此条提醒</strong>
            </div>
            <span className={styles.toggleSubtext}>是否在预定时间触发提醒</span>
          </label>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.sounds.reminder}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sounds: { ...value.sounds, reminder: event.currentTarget.checked },
                  })
                }
              />
              <strong>播放休息提示音</strong>
            </div>
            <span className={styles.toggleSubtext}>到点弹出提醒气泡时发出提示音</span>
          </label>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.sounds.crying}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sounds: { ...value.sounds, crying: event.currentTarget.checked },
                  })
                }
              />
              <strong>督促继续休息时播放提示音</strong>
            </div>
            <span className={styles.toggleSubtext}>休息期间检测到鼠标移动时发声督促</span>
          </label>
        </div>
      </div>

      <div className="editor-actions">
        {onDelete && (
          <button type="button" className="danger-button" disabled={disabled} onClick={onDelete}>
            删除
          </button>
        )}
        <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary-button" disabled={disabled || !valid} onClick={onSave}>
          保存提醒
        </button>
      </div>
    </div>
  );
}
