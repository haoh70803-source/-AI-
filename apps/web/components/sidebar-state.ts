export const SIDEBAR_PIN_COOKIE = "xsj_sidebar_pinned";

export type SidebarVisualState = "COLLAPSED" | "TEMP_EXPANDED" | "PINNED_EXPANDED";
export type SidebarInteractionLock = "MENU" | "SEARCH" | "DIALOG";

export type SidebarMachineState = {
  pinned: boolean;
  pointerInside: boolean;
  suppressHoverUntilLeave: boolean;
  touchExpanded: boolean;
  locks: SidebarInteractionLock[];
};

export type SidebarMachineAction =
  | { type: "POINTER_ENTER" }
  | { type: "POINTER_LEAVE" }
  | { type: "PIN" }
  | { type: "UNPIN" }
  | { type: "TOGGLE_TOUCH" }
  | { type: "CLOSE_TOUCH" }
  | { type: "LOCK"; lock: SidebarInteractionLock }
  | { type: "UNLOCK"; lock: SidebarInteractionLock };

export function initialSidebarState(pinned: boolean): SidebarMachineState {
  return {
    pinned,
    pointerInside: false,
    suppressHoverUntilLeave: false,
    touchExpanded: false,
    locks: [],
  };
}

export function sidebarMachineReducer(state: SidebarMachineState, action: SidebarMachineAction): SidebarMachineState {
  switch (action.type) {
    case "POINTER_ENTER":
      return { ...state, pointerInside: true };
    case "POINTER_LEAVE":
      return { ...state, pointerInside: false, suppressHoverUntilLeave: false };
    case "PIN":
      return { ...state, pinned: true, suppressHoverUntilLeave: false, touchExpanded: false };
    case "UNPIN":
      return { ...state, pinned: false, suppressHoverUntilLeave: state.pointerInside, touchExpanded: false };
    case "TOGGLE_TOUCH":
      return state.pinned ? state : { ...state, touchExpanded: !state.touchExpanded };
    case "CLOSE_TOUCH":
      return { ...state, touchExpanded: false };
    case "LOCK":
      return state.locks.includes(action.lock) ? state : { ...state, locks: [...state.locks, action.lock] };
    case "UNLOCK":
      return { ...state, locks: state.locks.filter((lock) => lock !== action.lock) };
  }
}

export function sidebarVisualState(state: SidebarMachineState, hoverCapable: boolean): SidebarVisualState {
  if (state.pinned) return "PINNED_EXPANDED";
  if (state.touchExpanded) return "TEMP_EXPANDED";
  if (state.locks.length > 0) return "TEMP_EXPANDED";
  if (hoverCapable && state.pointerInside && !state.suppressHoverUntilLeave) return "TEMP_EXPANDED";
  return "COLLAPSED";
}
