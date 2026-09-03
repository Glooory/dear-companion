import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH, type CompanionSystemApi, type PetAsset } from "@shared/contracts";
import { computeHeadHotspotGeometry } from "@shared/head-hotspot";

export function usePettingGesture({
  api,
  petId,
  asset,
  targetHeight,
  active,
  dependencyKey,
  onDetected,
}: {
  api: Pick<CompanionSystemApi, "beginPettingGesture" | "cancelPettingGesture" | "onPettingGestureDetected">;
  petId: string | null;
  asset: PetAsset | null;
  targetHeight: number;
  active: boolean;
  dependencyKey: string;
  onDetected(): void;
}): (event: PointerEvent<HTMLElement>) => boolean {
  const armed = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    api.cancelPettingGesture();
    armed.current = false;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, [api]);

  useEffect(() => {
    cancel();
    if (!active) return;
    return api.onPettingGestureDetected(() => {
      if (!armed.current) return;
      armed.current = false;
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = null;
      onDetected();
    });
  }, [active, api, cancel, dependencyKey, onDetected, petId]);

  useEffect(() => () => cancel(), [cancel]);

  return useCallback(
    (event: PointerEvent<HTMLElement>): boolean => {
      if (!active || !asset) return false;
      if (armed.current) return true;
      const ellipse = computeHeadHotspotGeometry(asset, targetHeight, {
        width: PET_WINDOW_WIDTH,
        height: PET_WINDOW_HEIGHT,
      });
      if (!ellipse) return false;
      const normalized = Math.hypot(
        (event.clientX - ellipse.centerX) / ellipse.radiusX,
        (event.clientY - ellipse.centerY) / ellipse.radiusY
      );
      if (normalized > 1) return false;
      const windowScreenX = event.screenX - event.clientX;
      const windowScreenY = event.screenY - event.clientY;
      armed.current = true;
      api.beginPettingGesture({
        centerX: windowScreenX + ellipse.centerX,
        centerY: windowScreenY + ellipse.centerY,
        radiusX: clamp(ellipse.radiusX, 6, 200),
        radiusY: clamp(ellipse.radiusY, 6, 200),
      });
      resetTimer.current = setTimeout(() => {
        armed.current = false;
        resetTimer.current = null;
      }, 3_100);
      return true;
    },
    [active, api, asset, targetHeight]
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
