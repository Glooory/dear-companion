import { describe, expect, it } from "vitest";
import { PetPresenceTransitionController } from "./pet-presence-transition";

function harness() {
  const requests: Array<{ id: number; kind: "enter" | "exit" }> = [];
  const hidden: number[] = [];
  const revealed: number[] = [];
  const settled: number[] = [];
  const timers = new Map<number, () => void>();
  let nextTimerId = 1;
  const controller = new PetPresenceTransitionController({
    send: (request) => requests.push(request),
    hide: () => hidden.push(requests.at(-1)?.id ?? 0),
    reveal: () => revealed.push(requests.at(-1)?.id ?? 0),
    settle: () => settled.push(requests.at(-1)?.id ?? 0),
    setTimeout: (callback) => {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => timers.delete(timer as unknown as number),
  });

  return {
    controller,
    requests,
    hidden,
    revealed,
    settled,
    runTimers: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

describe("pet presence transition controller", () => {
  it("waits for the matching exit animation before hiding", async () => {
    const h = harness();

    const completed = h.controller.exit();

    expect(h.requests).toEqual([{ id: 1, kind: "exit" }]);
    expect(h.hidden).toEqual([]);

    h.controller.complete(1);
    await completed;

    expect(h.hidden).toEqual([1]);
  });

  it("hides after the exit animation timeout", async () => {
    const h = harness();

    const completed = h.controller.exit();
    h.runTimers();
    await completed;

    expect(h.hidden).toEqual([1]);
  });

  it("does not hide when an enter request supersedes an exit", async () => {
    const h = harness();

    const exitCompleted = h.controller.exit();
    h.controller.enter();
    h.controller.complete(1);
    h.runTimers();
    await exitCompleted;

    expect(h.requests).toEqual([
      { id: 1, kind: "exit" },
      { id: 2, kind: "enter" },
    ]);
    expect(h.hidden).toEqual([]);
  });

  it("ignores a late entrance completion after an exit supersedes it", async () => {
    const h = harness();

    const enterCompleted = h.controller.enter();
    const exitCompleted = h.controller.exit();
    h.controller.complete(1);

    expect(h.requests).toEqual([
      { id: 1, kind: "enter" },
      { id: 2, kind: "exit" },
    ]);
    expect(h.hidden).toEqual([]);

    h.controller.complete(2);
    await Promise.all([enterCompleted, exitCompleted]);

    expect(h.hidden).toEqual([2]);
  });

  it("reuses a pending exit for repeated hide requests", () => {
    const h = harness();

    const first = h.controller.exit();
    const second = h.controller.exit();

    expect(second).toBe(first);
    expect(h.requests).toEqual([{ id: 1, kind: "exit" }]);
  });

  it("reveals only the matching entrance request and settles on completion", async () => {
    const h = harness();

    const completed = h.controller.enter();
    h.controller.ready(2);
    expect(h.revealed).toEqual([]);

    h.controller.ready(1);
    h.controller.ready(1);
    expect(h.revealed).toEqual([1]);

    h.controller.complete(1);
    await completed;
    expect(h.settled).toEqual([1]);
  });

  it("reveals an entrance on timeout when the renderer never becomes ready", async () => {
    const h = harness();

    const completed = h.controller.enter();
    h.runTimers();
    await completed;

    expect(h.revealed).toEqual([1]);
    expect(h.settled).toEqual([1]);
  });

  it("does not restart an entrance while visibility is already requested", () => {
    const h = harness();

    h.controller.enter();
    h.controller.enter();

    expect(h.requests).toEqual([{ id: 1, kind: "enter" }]);
  });

  it("hides immediately when motion is disabled", async () => {
    const h = harness();

    await h.controller.exit(false);

    expect(h.requests).toEqual([]);
    expect(h.hidden).toEqual([0]);
    expect(h.settled).toEqual([0]);
  });

  it("resets pending work when the renderer is replaced", async () => {
    const h = harness();

    const exitCompleted = h.controller.exit();
    h.controller.reset(false);
    h.controller.complete(1);
    h.runTimers();
    await exitCompleted;

    h.controller.enter();

    expect(h.hidden).toEqual([]);
    expect(h.requests.at(-1)).toEqual({ id: 2, kind: "enter" });
  });
});
