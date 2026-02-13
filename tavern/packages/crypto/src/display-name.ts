const DISPLAY_NAME_KEY = "tavern-display-name";
const DISPLAY_NAME_MAX_LENGTH = 32;

export function getDisplayName(): string | null {
  const value = localStorage.getItem(DISPLAY_NAME_KEY);

  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function setDisplayName(name: string): void {
  const trimmed = name.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);

  if (trimmed.length === 0) {
    localStorage.removeItem(DISPLAY_NAME_KEY);
    console.log("[identity] Display name set: ");
    return;
  }

  localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  console.log(`[identity] Display name set: ${trimmed}`);
}

export function clearDisplayName(): void {
  localStorage.removeItem(DISPLAY_NAME_KEY);
}
