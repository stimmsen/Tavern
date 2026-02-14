export const openSettings = (): void => {
  const panel = document.getElementById("settings-panel");
  panel?.classList.add("tavern-settings-open");
};

export const closeSettings = (): void => {
  const panel = document.getElementById("settings-panel");
  panel?.classList.remove("tavern-settings-open");
};

export const wireSettingsPanel = (): void => {
  const openButton = document.getElementById("settings-button");
  const closeButton = document.getElementById("settings-close");

  openButton?.addEventListener("click", openSettings);
  closeButton?.addEventListener("click", closeSettings);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettings();
    }
  });
};
