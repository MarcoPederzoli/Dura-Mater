window.MPCARDS_VERSION = {
  version: "0.1.8",
  commit: "local",
  deployedAt: "2026-07-20"
};

(function showAppVersion() {
  function render() {
    const target = document.getElementById("app-version");
    if (!target || !window.MPCARDS_VERSION) return;
    const info = window.MPCARDS_VERSION;
    target.textContent = `v${info.version} ${info.commit}`;
    target.title = `Versione ${info.version}, commit ${info.commit}, deploy ${info.deployedAt}`;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
}());
