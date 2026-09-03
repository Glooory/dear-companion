import type { Weekday } from "@shared/contracts";
import styles from "./WeekdayPicker.module.css";

const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

export function WeekdayPicker({
  value,
  legend = "重复星期",
  disabled = false,
  onChange,
}: {
  value: readonly Weekday[];
  legend?: string;
  disabled?: boolean;
  onChange(value: readonly Weekday[]): void;
}): React.JSX.Element {
  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend>{legend}</legend>
      {WEEKDAYS.map((day) => (
        <label key={day.value} className={styles.item}>
          <input
            type="checkbox"
            checked={value.includes(day.value)}
            onChange={(event) =>
              onChange(
                event.currentTarget.checked
                  ? ([...value, day.value].sort() as Weekday[])
                  : value.filter((candidate) => candidate !== day.value)
              )
            }
          />
          {day.label}
        </label>
      ))}
    </fieldset>
  );
}
