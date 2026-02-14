import type { SavedTavern } from "../../shared/src/types.js";

const STORAGE_KEY = "tavern-servers";

const isSavedTavern = (value: unknown): value is SavedTavern => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.lastJoined === "string" &&
    typeof candidate.inviteCode === "string" &&
    (typeof candidate.icon === "string" || typeof candidate.icon === "undefined")
  );
};

export const loadSavedTaverns = (): SavedTavern[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isSavedTavern);
};

export const saveTaverns = (taverns: SavedTavern[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(taverns));
};

export const upsertSavedTavern = (entry: SavedTavern): SavedTavern[] => {
  const existing = loadSavedTaverns().filter((item) => item.id !== entry.id);
  const next = [entry, ...existing];
  saveTaverns(next);
  return next;
};

export const parseInvitePath = (pathname: string): string | null => {
  const match = pathname.match(/^\/join\/([a-zA-Z0-9-]+)$/);
  return match?.[1] ?? null;
};

export const buildInviteUrl = (tavernId: string): string => {
  return `${window.location.origin}/join/${tavernId}`;
};
