export type PetState = "idle" | "hovering" | "performingAction" | "dragging" | "angry" | "hidden";

export type PetStateEvent =
  | { type: "hide" }
  | { type: "show" }
  | { type: "hover-start" }
  | { type: "hover-end" }
  | { type: "action-start" }
  | { type: "action-complete" }
  | { type: "drag-start" }
  | { type: "drag-release"; angry: boolean }
  | { type: "anger-complete" };

export const PET_STATE_PRIORITY: Readonly<Record<PetState, number>> = Object.freeze({
  idle: 10,
  hovering: 20,
  performingAction: 30,
  dragging: 40,
  angry: 50,
  hidden: 60,
});

export function transitionPetState(state: PetState, event: PetStateEvent): PetState {
  if (event.type === "hide") return "hidden";
  if (state === "hidden") return event.type === "show" ? "idle" : "hidden";
  if (event.type === "show") return state;

  switch (event.type) {
    case "drag-start":
      return requestState(state, "dragging");
    case "drag-release":
      return state === "dragging" ? (event.angry ? "angry" : "idle") : state;
    case "anger-complete":
      return state === "angry" ? "idle" : state;
    case "action-start":
      return requestState(state, "performingAction");
    case "action-complete":
      return state === "performingAction" ? "idle" : state;
    case "hover-start":
      return requestState(state, "hovering");
    case "hover-end":
      return state === "hovering" ? "idle" : state;
  }
}

function requestState(current: PetState, next: PetState): PetState {
  return PET_STATE_PRIORITY[next] >= PET_STATE_PRIORITY[current] ? next : current;
}
