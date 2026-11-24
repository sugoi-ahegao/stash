export interface ITheme {
  id: string;
  name: string;
}

// Blueprint is the base stylesheet; every other theme overrides it from
// rules scoped to html[data-theme="<id>"]. Browsers that never picked a
// theme get defaultThemeID.
const baseThemeID = "blueprint";
export const defaultThemeID = "pb";

export const themes: ITheme[] = [
  { id: baseThemeID, name: "Blueprint" },
  { id: "pb", name: "Blackhole" },
];

const storageKey = "theme";

function isTheme(id: string | null): id is string {
  return !!id && themes.some((t) => t.id === id);
}

export function getStoredTheme(): string {
  try {
    const id = localStorage.getItem(storageKey);
    if (isTheme(id)) {
      return id;
    }
  } catch {
    // storage may be unavailable, e.g. in private browsing
  }
  return defaultThemeID;
}

export function applyTheme(id: string) {
  if (id === baseThemeID) {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
}

export function storeTheme(id: string) {
  try {
    localStorage.setItem(storageKey, id);
  } catch {
    // storage may be unavailable, e.g. in private browsing
  }
}
