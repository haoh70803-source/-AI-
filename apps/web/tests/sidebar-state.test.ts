import { describe, expect, it } from "vitest";
import {
  initialSidebarState,
  sidebarMachineReducer,
  sidebarVisualState,
  type SidebarMachineAction,
} from "../components/sidebar-state";

function apply(pinned: boolean, actions: SidebarMachineAction[]) {
  return actions.reduce(sidebarMachineReducer, initialSidebarState(pinned));
}

describe("sidebar state machine", () => {
  it("moves between collapsed, temporary expanded, and pinned expanded", () => {
    const collapsed = initialSidebarState(false);
    expect(sidebarVisualState(collapsed, true)).toBe("COLLAPSED");

    const hovered = sidebarMachineReducer(collapsed, { type: "POINTER_ENTER" });
    expect(sidebarVisualState(hovered, true)).toBe("TEMP_EXPANDED");

    const left = sidebarMachineReducer(hovered, { type: "POINTER_LEAVE" });
    expect(sidebarVisualState(left, true)).toBe("COLLAPSED");

    const pinned = sidebarMachineReducer(hovered, { type: "PIN" });
    expect(sidebarVisualState(pinned, true)).toBe("PINNED_EXPANDED");
  });

  it("suppresses hover until the pointer leaves after unpinning", () => {
    const unpinned = apply(true, [{ type: "POINTER_ENTER" }, { type: "UNPIN" }]);
    expect(unpinned.suppressHoverUntilLeave).toBe(true);
    expect(sidebarVisualState(unpinned, true)).toBe("COLLAPSED");

    const reentered = apply(true, [
      { type: "POINTER_ENTER" },
      { type: "UNPIN" },
      { type: "POINTER_LEAVE" },
      { type: "POINTER_ENTER" },
    ]);
    expect(sidebarVisualState(reentered, true)).toBe("TEMP_EXPANDED");
  });

  it("keeps a temporary sidebar open while an interaction lock is held", () => {
    const locked = apply(false, [
      { type: "POINTER_ENTER" },
      { type: "LOCK", lock: "MENU" },
      { type: "POINTER_LEAVE" },
    ]);
    expect(sidebarVisualState(locked, true)).toBe("TEMP_EXPANDED");

    const unlocked = sidebarMachineReducer(locked, { type: "UNLOCK", lock: "MENU" });
    expect(sidebarVisualState(unlocked, true)).toBe("COLLAPSED");
  });

  it("supports search and dialog locks and a non-persistent touch overlay", () => {
    const searchLocked = apply(false, [{ type: "LOCK", lock: "SEARCH" }]);
    expect(sidebarVisualState(searchLocked, true)).toBe("TEMP_EXPANDED");

    const dialogLocked = apply(false, [{ type: "LOCK", lock: "DIALOG" }]);
    expect(sidebarVisualState(dialogLocked, true)).toBe("TEMP_EXPANDED");

    const touchOpen = apply(false, [{ type: "TOGGLE_TOUCH" }]);
    expect(sidebarVisualState(touchOpen, false)).toBe("TEMP_EXPANDED");
    expect(touchOpen.pinned).toBe(false);
    expect(sidebarVisualState(sidebarMachineReducer(touchOpen, { type: "CLOSE_TOUCH" }), false)).toBe("COLLAPSED");
  });
});
