export function deriveIdentityTag(publicKeyHex: string): string {
  const prefix = publicKeyHex.slice(0, 8).padEnd(8, "0");
  const first = prefix.slice(0, 4);
  const second = prefix.slice(4, 8);
  return `TVN-${first}-${second}`;
}

export function formatIdentityDisplay(tag: string, displayName: string | null): string {
  if (displayName) {
    return `${displayName} (${tag})`;
  }

  return tag;
}
