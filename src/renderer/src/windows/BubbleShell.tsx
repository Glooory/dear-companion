import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { clsx } from "clsx";
import type { BubbleSystemSnapshot, ReleaseHardeningApi, RestSystemSnapshot } from "@shared/contracts";
import styles from "./BubbleShell.module.css";

interface BubbleShellProps {
  api: ReleaseHardeningApi;
}

export function BubbleShell({ api }: BubbleShellProps): React.JSX.Element {
  const [bubbleSnapshot, setBubbleSnapshot] = useState<BubbleSystemSnapshot>({
    dialogue: null,
    placement: "top",
    tailOffsetX: 160,
  });
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null);
  const [displayNow, setDisplayNow] = useState(0);
  const dialogueRef = useRef<HTMLSpanElement>(null);
  const [dialogueWidth, setDialogueWidth] = useState(0);

  useLayoutEffect(() => {
    if (dialogueRef.current) {
      setDialogueWidth(dialogueRef.current.offsetWidth);
    }
  }, [bubbleSnapshot.dialogue]);

  useEffect(() => {
    let cancelled = false;
    void api.getBubbleSystemSnapshot().then(
      (snap) => {
        if (!cancelled && snap) setBubbleSnapshot(snap);
      },
      () => undefined
    );
    void api.getRestSystemSnapshot().then(
      (rest) => {
        if (!cancelled) setRestSnapshot(rest);
      },
      () => undefined
    );

    const unsubscribeRest = api.onRestSystemChanged((next) => {
      if (!cancelled) setRestSnapshot(next);
    });

    const unsubscribeBubble = api.onBubbleSystemChanged((next) => {
      if (!cancelled) setBubbleSnapshot(next);
    });

    return () => {
      cancelled = true;
      unsubscribeRest();
      unsubscribeBubble();
    };
  }, [api]);

  useEffect(() => {
    if (!restSnapshot?.runtime.session || restSnapshot.runtime.session.state === "celebrating") return;
    const refresh = (): void => setDisplayNow(Date.now());
    const initialTimer = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 250);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [restSnapshot?.runtime.session]);

  // Mouse ignore handling
  useEffect(() => {
    let ignoring = false;
    const applyIgnore = (nextIgnore: boolean): void => {
      if (ignoring === nextIgnore) return;
      ignoring = nextIgnore;
      api.setIgnoreMouseEvents(nextIgnore);
    };

    const initialInteractive = Boolean(document.querySelector('[data-pet-interactive="true"]:hover'));
    applyIgnore(!initialInteractive);

    const handleMouseMove = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      const isInteractive = Boolean(target?.closest?.('[data-pet-interactive="true"]'));
      applyIgnore(!isInteractive);
    };

    const handleMouseLeave = (): void => {
      applyIgnore(true);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      applyIgnore(false);
    };
  }, [api]);

  const prompt = restSnapshot?.runtime.prompt ?? null;
  const session = restSnapshot?.runtime.session ?? null;
  const dialogue = bubbleSnapshot.dialogue;
  const remainingSeconds = session ? Math.max(0, Math.ceil((session.endsAt - displayNow) / 1_000)) : 0;

  const startRest = (): void => {
    if (prompt) {
      void api
        .startPromptedRest(prompt.occurrenceId)
        .then(setRestSnapshot)
        .catch(() => undefined);
    }
  };

  const snooze = (minutes: 5 | 10 | 15): void => {
    if (prompt) {
      void api
        .snoozePrompt(prompt.occurrenceId, minutes)
        .then(setRestSnapshot)
        .catch(() => undefined);
    }
  };

  const skipRest = (): void => {
    if (prompt) {
      void api
        .skipPrompt(prompt.occurrenceId)
        .then(setRestSnapshot)
        .catch(() => undefined);
    }
  };

  const endRest = (): void => {
    void api
      .endRestSession()
      .then(setRestSnapshot)
      .catch(() => undefined);
  };

  const halfWidth = dialogueWidth > 0 ? dialogueWidth / 2 : 60;
  const minCenter = halfWidth + 8;
  const maxCenter = Math.max(minCenter, 320 - halfWidth - 8);
  const dialogueCenterX = Math.max(minCenter, Math.min(maxCenter, bubbleSnapshot.tailOffsetX));
  const rawArrow = bubbleSnapshot.tailOffsetX - (dialogueCenterX - halfWidth);
  const arrowOffset = Math.max(14, Math.min(dialogueWidth > 0 ? dialogueWidth - 14 : 106, rawArrow));

  const dialogueStyle = {
    "--dialogue-center-x": `${dialogueCenterX}px`,
    "--arrow-offset": `${arrowOffset}px`,
  } as CSSProperties;

  return (
    <main className={styles.shell} data-placement={bubbleSnapshot.placement}>
      {prompt && (
        <section
          className={clsx(styles.restBubble, "rest-bubble")}
          role="dialog"
          aria-label="休息提醒"
          data-pet-interactive="true"
        >
          <p>{prompt.message}</p>
          <div className={styles.restActions}>
            <button type="button" onClick={startRest}>
              开始休息
            </button>
            {([5, 10, 15] as const).map((minutes) => (
              <button type="button" key={minutes} onClick={() => snooze(minutes)}>
                稍后 {minutes} 分钟
              </button>
            ))}
            <button type="button" onClick={skipRest}>
              跳过
            </button>
          </div>
        </section>
      )}

      {session && (
        <section
          className={clsx(styles.restBubble, "rest-bubble", `rest-${session.state}`)}
          role="status"
          data-pet-interactive="true"
        >
          {session.state === "crying" ? (
            <p>{dialogue ?? "还没休息够呢～"}</p>
          ) : session.state === "celebrating" ? (
            <p>{dialogue ?? "休息结束啦！"}</p>
          ) : (
            <p>
              {session.message} · {formatCountdown(remainingSeconds)}
            </p>
          )}
          {session.state !== "celebrating" && (
            <button type="button" onClick={endRest}>
              结束休息
            </button>
          )}
        </section>
      )}

      {!prompt && !session && dialogue && (
        <span
          ref={dialogueRef}
          className={clsx(styles.dialogue, "pet-dialogue")}
          role="status"
          data-pet-interactive="true"
          style={dialogueStyle}
        >
          {dialogue}
        </span>
      )}
    </main>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
