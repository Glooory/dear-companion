export type CrashRecoveryState = "healthy" | "rebuilding" | "safe-mode";
export type CrashRecoveryDecision = "rebuild" | "safe-mode";

export class CrashRecoveryBudget {
  private state: CrashRecoveryState = "healthy";

  rendererFailed(): CrashRecoveryDecision {
    if (this.state === "healthy") {
      this.state = "rebuilding";
      return "rebuild";
    }
    this.state = "safe-mode";
    return "safe-mode";
  }

  rendererReady(): void {
    if (this.state === "rebuilding") this.state = "healthy";
  }

  retry(): boolean {
    if (this.state !== "safe-mode") return false;
    this.state = "rebuilding";
    return true;
  }

  getState(): CrashRecoveryState {
    return this.state;
  }
}
