import { describe, expect, it, vi } from "vitest";
import { ClickIntentArbiter, type IntentTimer } from "./interaction-intents";

function createTimer(): IntentTimer & { runAll(): void } {
  const callbacks = new Map<object, () => void>();
  return {
    set(callback) {
      const handle = {};
      callbacks.set(handle, callback);
      return handle;
    },
    clear(handle) {
      callbacks.delete(handle as object);
    },
    runAll() {
      for (const callback of [...callbacks.values()]) callback();
      callbacks.clear();
    },
  };
}

describe("click intent arbitration", () => {
  it("delays a single click until competition closes", () => {
    const timer = createTimer();
    const single = vi.fn();
    new ClickIntentArbiter(220, timer).singleClick(single);

    expect(single).not.toHaveBeenCalled();
    timer.runAll();
    expect(single).toHaveBeenCalledOnce();
  });

  it("cancels the pending single click when a double click arrives", () => {
    const timer = createTimer();
    const single = vi.fn();
    const double = vi.fn();
    const arbiter = new ClickIntentArbiter(220, timer);

    arbiter.singleClick(single);
    arbiter.doubleClick(double);
    timer.runAll();

    expect(single).not.toHaveBeenCalled();
    expect(double).toHaveBeenCalledOnce();
  });

  it("cancels pending work on dispose", () => {
    const timer = createTimer();
    const single = vi.fn();
    const arbiter = new ClickIntentArbiter(220, timer);
    arbiter.singleClick(single);
    arbiter.dispose();
    timer.runAll();
    expect(single).not.toHaveBeenCalled();
  });
});
