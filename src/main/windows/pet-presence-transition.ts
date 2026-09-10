import type { PetPresenceTransitionRequest } from "../../shared/contracts";

const DEFAULT_TRANSITION_TIMEOUT_MS = 400;

interface PetPresenceTransitionControllerOptions {
  send(request: PetPresenceTransitionRequest): void;
  hide(): void;
  reveal?(): void;
  settle?(): void;
  timeoutMs?: number;
  setTimeout?(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout?(timer: ReturnType<typeof setTimeout>): void;
}

interface PendingTransition {
  request: PetPresenceTransitionRequest;
  timer: ReturnType<typeof setTimeout>;
  promise: Promise<void>;
  revealed: boolean;
  resolve(): void;
}

export class PetPresenceTransitionController {
  private nextId = 1;
  private desiredVisible = false;
  private pending: PendingTransition | null = null;
  private readonly send: PetPresenceTransitionControllerOptions["send"];
  private readonly hide: PetPresenceTransitionControllerOptions["hide"];
  private readonly reveal: NonNullable<PetPresenceTransitionControllerOptions["reveal"]>;
  private readonly settle: NonNullable<PetPresenceTransitionControllerOptions["settle"]>;
  private readonly timeoutMs: number;
  private readonly setTimeout: NonNullable<PetPresenceTransitionControllerOptions["setTimeout"]>;
  private readonly clearTimeout: NonNullable<PetPresenceTransitionControllerOptions["clearTimeout"]>;

  constructor({
    send,
    hide,
    reveal = () => undefined,
    settle = () => undefined,
    timeoutMs = DEFAULT_TRANSITION_TIMEOUT_MS,
    setTimeout: schedule = setTimeout,
    clearTimeout: cancel = clearTimeout,
  }: PetPresenceTransitionControllerOptions) {
    this.send = send;
    this.hide = hide;
    this.reveal = reveal;
    this.settle = settle;
    this.timeoutMs = timeoutMs;
    this.setTimeout = schedule;
    this.clearTimeout = cancel;
  }

  enter(animate = true): Promise<void> {
    if (this.desiredVisible && this.pending?.request.kind !== "exit") {
      return this.pending?.promise ?? Promise.resolve();
    }
    this.desiredVisible = true;
    this.cancelPending();
    if (!animate) {
      this.reveal();
      this.settle();
      return Promise.resolve();
    }
    return this.begin("enter").promise;
  }

  exit(animate = true): Promise<void> {
    this.desiredVisible = false;
    if (this.pending?.request.kind === "exit") return this.pending.promise;
    this.cancelPending();
    if (!animate) {
      this.hide();
      this.settle();
      return Promise.resolve();
    }
    return this.begin("exit").promise;
  }

  complete(id: number): void {
    if (this.pending?.request.id !== id) return;
    this.finishPending();
  }

  ready(id: number): void {
    if (this.pending?.request.id !== id || this.pending.request.kind !== "enter") return;
    if (this.pending.revealed) return;
    this.pending.revealed = true;
    this.reveal();
  }

  isActive(): boolean {
    return this.pending !== null;
  }

  reset(visible: boolean): void {
    this.cancelPending();
    this.desiredVisible = visible;
    if (visible) this.reveal();
    this.settle();
  }

  private begin(kind: PetPresenceTransitionRequest["kind"]): PendingTransition {
    const request = { id: this.nextId++, kind } satisfies PetPresenceTransitionRequest;
    let resolve = (): void => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const timer = this.setTimeout(() => this.complete(request.id), this.timeoutMs);
    const pending = { request, timer, promise, resolve, revealed: false };
    this.pending = pending;
    this.send(request);
    return pending;
  }

  private finishPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.clearTimeout(pending.timer);
    if (pending.request.kind === "enter" && this.desiredVisible && !pending.revealed) this.reveal();
    pending.resolve();
    if (pending.request.kind === "exit" && !this.desiredVisible) this.hide();
    this.settle();
  }

  private cancelPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.clearTimeout(pending.timer);
    pending.resolve();
  }
}
