export const APPEARANCE_KEY = "xin-world.appearance";
export const APPEARANCE_EVENT = "xin-world:appearance";
export const DEFAULT_APPEARANCE = "black-titanium";
export type Appearance = typeof DEFAULT_APPEARANCE | "light";

export function parseAppearance(value: string | null | undefined): Appearance {
  return value === "light" ? "light" : DEFAULT_APPEARANCE;
}

export function getAppearance(): Appearance {
  return parseAppearance(document.documentElement.dataset.theme);
}

function applyAppearance(appearance: Appearance) {
  document.documentElement.dataset.theme = appearance;
  document.body.dataset.theme = appearance;
}

/** A local display preference; it never writes account or workspace data. */
export function setAppearance(appearance: Appearance): boolean {
  applyAppearance(appearance);
  let saved = true;
  try { localStorage.setItem(APPEARANCE_KEY, appearance); } catch { saved = false; }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
  return saved;
}

export function subscribeAppearance(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== APPEARANCE_KEY && event.key !== null) return;
    applyAppearance(parseAppearance(event.key === null ? null : event.newValue));
    onChange();
  }
  window.addEventListener(APPEARANCE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// Runs synchronously before page content is parsed, avoiding a dark flash on reload.
export const APPEARANCE_BOOTSTRAP = `(()=>{let theme=${JSON.stringify(DEFAULT_APPEARANCE)};try{if(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})==="light")theme="light";}catch{}document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;})();`;
