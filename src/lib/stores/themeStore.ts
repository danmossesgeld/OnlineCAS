import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'digisoft-theme';

function getInitialTheme(): Theme {
  if (!browser) return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (!browser) return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
}

function createThemeStore() {
  const { subscribe, set, update } = writable<Theme>(getInitialTheme());

  return {
    subscribe,
    /** Applies the current (already-initialized) theme to the DOM. Call once on app mount. */
    init() {
      update((theme) => {
        applyTheme(theme);
        return theme;
      });
    },
    set(theme: Theme) {
      applyTheme(theme);
      set(theme);
    },
    toggle() {
      update((theme) => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        return next;
      });
    }
  };
}

export const theme = createThemeStore();
