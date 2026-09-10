import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { PHOTO_TRANSITION_MS, REDUCED_PHOTO_TRANSITION_MS } from "@shared/companion-motion";
import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH, type PetAsset } from "@shared/contracts";
import { computeAssetGeometry } from "@shared/image-normalization";
import styles from "./PhotoTransition.module.css";

export function PhotoTransition({
  petId,
  asset,
  fallbackAsset,
  targetHeight,
  onTransitionComplete,
  onDisplayedAssetChange,
}: {
  petId: string;
  asset: PetAsset;
  fallbackAsset: PetAsset;
  targetHeight: number;
  onTransitionComplete?: (assetId: string) => void;
  onDisplayedAssetChange?: (current: PetAsset, outgoing: PetAsset | null) => void;
}): React.JSX.Element {
  const [current, setCurrent] = useState(asset);
  const currentRef = useRef(asset);
  const [outgoing, setOutgoing] = useState<PetAsset | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const completionRef = useRef(onTransitionComplete);
  const displayedAssetCallbackRef = useRef(onDisplayedAssetChange);
  const desiredUrl = useMemo(() => petAssetUrl(petId, asset.id), [asset.id, petId]);
  const transitionDurationMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_PHOTO_TRANSITION_MS
    : PHOTO_TRANSITION_MS;

  const clearTimers = useCallback((): void => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    completionRef.current = onTransitionComplete;
  }, [onTransitionComplete]);

  useEffect(() => {
    displayedAssetCallbackRef.current = onDisplayedAssetChange;
  }, [onDisplayedAssetChange]);

  useEffect(() => {
    currentRef.current = current;
    displayedAssetCallbackRef.current?.(current, outgoing);
  }, [current, outgoing]);

  useEffect(() => {
    clearTimers();
    if (asset.id === currentRef.current.id) {
      currentRef.current = asset;
      setCurrent(asset);
      setOutgoing(null);
      completionRef.current?.(asset.id);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const previous = currentRef.current;
      setOutgoing(previous);
      currentRef.current = asset;
      setCurrent(asset);
      timers.current.push(
        setTimeout(() => {
          if (cancelled) return;
          setOutgoing(null);
          completionRef.current?.(asset.id);
        }, transitionDurationMs)
      );
    };
    image.onerror = () => {
      if (cancelled) return;
      setOutgoing(null);
      completionRef.current?.(currentRef.current.id);
    };
    image.src = desiredUrl;
    return () => {
      cancelled = true;
      clearTimers();
      image.onload = null;
      image.onerror = null;
    };
  }, [asset, clearTimers, desiredUrl, transitionDurationMs]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleCurrentLoadFailure = (): void => {
    if (current.id === fallbackAsset.id) return;
    clearTimers();
    currentRef.current = fallbackAsset;
    setCurrent(fallbackAsset);
    setOutgoing(null);
    completionRef.current?.(fallbackAsset.id);
  };

  const viewport = {
    width: window.innerWidth || PET_WINDOW_WIDTH,
    height: window.innerHeight || PET_WINDOW_HEIGHT,
  };
  const currentGeometry = computeAssetGeometry(current, targetHeight, viewport);
  const outgoingGeometry = outgoing ? computeAssetGeometry(outgoing, targetHeight, viewport) : null;

  return (
    <>
      {outgoing && outgoingGeometry && (
        <span
          className={clsx(styles.frame, styles.crossOutgoing, "pet-image-frame")}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          style={{
            left: outgoingGeometry.left,
            top: outgoingGeometry.top,
            width: outgoingGeometry.renderedWidth,
            height: outgoingGeometry.renderedHeight,
            zIndex: 1,
            animationDuration: `${transitionDurationMs}ms`,
          }}
          aria-hidden="true"
        >
          <img className={styles.image} draggable={false} src={petAssetUrl(petId, outgoing.id)} alt="" />
        </span>
      )}
      <span
        className={clsx(styles.frame, outgoing ? styles.crossIncoming : "photo-idle", "pet-image-frame")}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        style={{
          left: currentGeometry.left,
          top: currentGeometry.top,
          width: currentGeometry.renderedWidth,
          height: currentGeometry.renderedHeight,
          zIndex: 2,
          animationDuration: outgoing ? `${transitionDurationMs}ms` : undefined,
        }}
      >
        <img
          className={styles.image}
          draggable={false}
          src={petAssetUrl(petId, current.id)}
          alt=""
          onError={handleCurrentLoadFailure}
        />
      </span>
    </>
  );
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`;
}
