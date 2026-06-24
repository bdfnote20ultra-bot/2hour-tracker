function isBenignBrowserNoise(value) {
  const message = String(value?.message || value || "");
  return message.includes("ResizeObserver loop completed with undelivered notifications") ||
    message.includes("ResizeObserver loop limit exceeded") ||
    message.includes("Wake Lock permission request denied") ||
    (message.includes("NotAllowedError") && message.includes("Wake Lock"));
}

function removeDevOverlay() {
  const remove = () => {
    document
      .querySelectorAll("#webpack-dev-server-client-overlay")
      .forEach(overlay => overlay.remove());
  };

  try { remove(); } catch {}
  try { window.requestAnimationFrame(remove); } catch {}
  window.setTimeout(remove, 0);
  window.setTimeout(remove, 100);
}

if (typeof window !== "undefined" && !window.__fuitsBrowserNoiseFilterInstalled) {
  window.__fuitsBrowserNoiseFilterInstalled = true;

  window.addEventListener("error", event => {
    if (!isBenignBrowserNoise(event.message || event.error)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    removeDevOverlay();
  }, true);

  window.addEventListener("unhandledrejection", event => {
    if (!isBenignBrowserNoise(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    removeDevOverlay();
  }, true);
}
