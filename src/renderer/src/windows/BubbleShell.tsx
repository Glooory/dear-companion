import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { clsx } from "clsx";
import type { BubbleSystemSnapshot, PetConfig, ReleaseHardeningApi, RestSystemSnapshot } from "@shared/contracts";
import { DEFAULT_BUBBLE_THEME, extractPetThemeColor, type PetThemeColor } from "@shared/pet-theme-color";
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
  const [themeColor, setThemeColor] = useState<PetThemeColor>(DEFAULT_BUBBLE_THEME);
  const [displayNow, setDisplayNow] = useState(0);
  const dialogueRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const dialogue = bubbleSnapshot.dialogue;

  useLayoutEffect(() => {
    const wrapperEl = dialogueRef.current;
    const textEl = textRef.current;
    if (!wrapperEl || !textEl || !dialogue) return;

    // Reset width constraint to measure intrinsic line widths
    wrapperEl.style.removeProperty("--dialogue-width");

    const range = document.createRange();
    range.selectNodeContents(textEl);
    const rects = Array.from(range.getClientRects());
    const maxLineWidth = rects.length > 0 ? Math.max(...rects.map((r) => r.width)) : textEl.offsetWidth;
    // 14px padding * 2 + 1px border * 2 = 30px, plus 2px subpixel buffer
    const measuredWidth = Math.min(260, Math.ceil(maxLineWidth) + 32);

    const half = measuredWidth / 2;
    const minCenter = half + 12;
    const maxCenter = Math.max(minCenter, 320 - half - 12);
    const centerX = Math.max(minCenter, Math.min(maxCenter, bubbleSnapshot.tailOffsetX));
    const left = Math.round(centerX - half);
    const rawArrow = bubbleSnapshot.tailOffsetX - left;
    const arrow = Math.max(16, Math.min(measuredWidth - 16, rawArrow));

    wrapperEl.style.setProperty("--dialogue-width", `${measuredWidth}px`);
    wrapperEl.style.setProperty("--dialogue-left", `${left}px`);
    wrapperEl.style.setProperty("--arrow-offset", `${arrow}px`);
  }, [dialogue, bubbleSnapshot.tailOffsetX]);

  useEffect(() => {
    let cancelled = false;
    let requestSeq = 0;

    const updateThemeFromPet = (activePet: PetConfig | null): void => {
      const currentSeq = ++requestSeq;
      if (!activePet || activePet.assets.length === 0) {
        setThemeColor(DEFAULT_BUBBLE_THEME);
        return;
      }
      const idleAssetId = activePet.actionSlots.idle[0] ?? activePet.assets[0]?.id;
      if (!idleAssetId) {
        setThemeColor(DEFAULT_BUBBLE_THEME);
        return;
      }
      const url = petAssetUrl(activePet.id, idleAssetId);

      const processImage = (source: ImageBitmap | HTMLImageElement): void => {
        try {
          if (cancelled || currentSeq !== requestSeq) return;
          const canvas = document.createElement("canvas");
          canvas.width = 48;
          canvas.height = 48;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(source, 0, 0, 48, 48);
          const imageData = ctx.getImageData(0, 0, 48, 48);
          const extracted = extractPetThemeColor(imageData.data);
          if (!cancelled && currentSeq === requestSeq) {
            setThemeColor(extracted);
          }
        } catch {
          if (!cancelled && currentSeq === requestSeq) {
            setThemeColor(DEFAULT_BUBBLE_THEME);
          }
        } finally {
          if ("close" in source && typeof source.close === "function") {
            source.close();
          }
        }
      };

      void fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error("fetch failed");
          return res.blob();
        })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          if (!cancelled && currentSeq === requestSeq) {
            processImage(bitmap);
          } else {
            bitmap.close();
          }
        })
        .catch(() => {
          if (cancelled || currentSeq !== requestSeq) return;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (!cancelled && currentSeq === requestSeq) processImage(img);
          };
          img.onerror = () => {
            if (!cancelled && currentSeq === requestSeq) setThemeColor(DEFAULT_BUBBLE_THEME);
          };
          img.src = url;
        });
    };

    void api.getPetSystemSnapshot().then(
      (snap) => {
        if (!cancelled && snap) {
          const activePet = snap.pets.find((p) => p.id === snap.activePetId) ?? null;
          updateThemeFromPet(activePet);
        }
      },
      () => undefined
    );

    const unsubscribePet = api.onPetSystemChanged((snap) => {
      if (!cancelled) {
        const activePet = snap.pets.find((p) => p.id === snap.activePetId) ?? null;
        updateThemeFromPet(activePet);
      }
    });

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
      unsubscribePet();
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

  const halfWidth = 60;
  const minCenter = halfWidth + 12;
  const maxCenter = Math.max(minCenter, 320 - halfWidth - 12);
  const dialogueCenterX = Math.max(minCenter, Math.min(maxCenter, bubbleSnapshot.tailOffsetX));
  const dialogueLeft = Math.round(dialogueCenterX - halfWidth);
  const rawArrow = bubbleSnapshot.tailOffsetX - dialogueLeft;
  const arrowOffset = Math.max(16, Math.min(104, rawArrow));

  const dialogueStyle = {
    "--dialogue-left": `${dialogueLeft}px`,
    "--arrow-offset": `${arrowOffset}px`,
  } as CSSProperties;

  const shellThemeStyle = {
    "--bubble-border": themeColor.borderColor,
    "--bubble-text": themeColor.textColor,
  } as CSSProperties;

  return (
    <main
      className={styles.shell}
      data-placement={bubbleSnapshot.placement}
      style={shellThemeStyle}
    >
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
            <p>{dialogue ?? `${session.message} · ${formatCountdown(remainingSeconds)}`}</p>
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
        <div
          ref={dialogueRef}
          className={clsx(styles.dialogueWrapper, "pet-dialogue")}
          role="status"
          data-pet-interactive="true"
          style={dialogueStyle}
        >
          <div className={styles.dialogue}>
            <span ref={textRef} className={styles.dialogueText}>
              {dialogue}
            </span>
            <svg
              className={styles.dialogueTail}
              viewBox="0 0 18 9"
              width="18"
              height="9"
              aria-hidden="true"
            >
              <path
                d="M 0 0 C 3 3, 6.5 7.5, 8.2 8.8 C 8.7 9.2, 9.3 9.2, 9.8 8.8 C 11.5 7.5, 15 3, 18 0 Z"
                className={styles.tailFill}
              />
              <path
                d="M 0 0 C 3 3, 6.5 7.5, 8.2 8.8 C 8.7 9.2, 9.3 9.2, 9.8 8.8 C 11.5 7.5, 15 3, 18 0"
                className={styles.tailStroke}
              />
            </svg>
          </div>
        </div>
      )}
    </main>
  );
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
