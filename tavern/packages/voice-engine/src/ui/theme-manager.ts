import { updateSettings } from "../settings-store.js";

const THEME_LINK_ID = "theme-link";
const SKIN_STYLE_ID = "skin-style";

export const applyTheme = (theme: string): void => {
  const link = document.getElementById(THEME_LINK_ID) as HTMLLinkElement | null;

  if (!link) {
    return;
  }

  link.href = `./src/themes/${theme}.css`;
  updateSettings({ theme });
};

export const applySkinCss = (cssText: string | null, skinName: string | null): void => {
  let style = document.getElementById(SKIN_STYLE_ID) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = SKIN_STYLE_ID;
    document.head.append(style);
  }

  style.textContent = cssText ?? "";
  updateSettings({ customSkinCss: cssText, selectedSkinName: skinName });
};

export const resetSkin = (): void => {
  applySkinCss(null, null);
};
