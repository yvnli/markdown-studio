export const IS_MAC =
  typeof navigator !== 'undefined' &&
  (/Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    /Macintosh/.test(navigator.userAgent));

export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';
export const SHIFT_KEY = IS_MAC ? '⇧' : 'Shift';
export const ALT_KEY = IS_MAC ? '⌥' : 'Alt';

export function modShortcut(key: string): string {
  return IS_MAC ? `${MOD_KEY}${key}` : `${MOD_KEY}+${key}`;
}

export function shiftModShortcut(key: string): string {
  return IS_MAC ? `${SHIFT_KEY}${MOD_KEY}${key}` : `${MOD_KEY}+${SHIFT_KEY}+${key}`;
}

export function altModShortcut(key: string): string {
  return IS_MAC ? `${ALT_KEY}${MOD_KEY}${key}` : `${MOD_KEY}+${ALT_KEY}+${key}`;
}
