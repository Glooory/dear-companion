import { describe, expect, it } from "vitest";
import { CrashRecoveryBudget } from "./crash-recovery";

describe("CrashRecoveryBudget", () => {
  it("allows one automatic rebuild and enters safe mode if it fails before ready", () => {
    const budget = new CrashRecoveryBudget();

    expect(budget.rendererFailed()).toBe("rebuild");
    expect(budget.rendererFailed()).toBe("safe-mode");
    expect(budget.rendererFailed()).toBe("safe-mode");
    expect(budget.getState()).toBe("safe-mode");
  });

  it("resets the automatic rebuild allowance only after the replacement is ready", () => {
    const budget = new CrashRecoveryBudget();

    expect(budget.rendererFailed()).toBe("rebuild");
    budget.rendererReady();
    expect(budget.getState()).toBe("healthy");
    expect(budget.rendererFailed()).toBe("rebuild");
  });

  it("ignores a ready signal that did not follow a rebuild", () => {
    const budget = new CrashRecoveryBudget();

    budget.rendererReady();
    expect(budget.getState()).toBe("healthy");
    expect(budget.rendererFailed()).toBe("rebuild");
  });

  it("allows one explicit retry from safe mode and keeps retry idempotent", () => {
    const budget = new CrashRecoveryBudget();
    budget.rendererFailed();
    budget.rendererFailed();

    expect(budget.retry()).toBe(true);
    expect(budget.retry()).toBe(false);
    expect(budget.getState()).toBe("rebuilding");
    expect(budget.rendererFailed()).toBe("safe-mode");
  });
});
