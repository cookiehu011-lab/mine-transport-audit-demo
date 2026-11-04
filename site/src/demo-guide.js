(() => {
  let guide = null;
  window.openDemoGuide = (opener, onStart) => {
    if (guide) return;
    const dialog = document.createElement("dialog");
    dialog.className = "demo-guide-dialog";
    dialog.setAttribute("aria-labelledby", "demo-guide-title");
    dialog.innerHTML = `
      <header class="demo-guide-heading"><div><span>矿山运营 · 业务导览</span><h2 id="demo-guide-title">先看全流程，再核查一趟运输</h2></div><button type="button" class="demo-guide-close" aria-label="关闭演示导览">×</button></header>
      <div class="demo-guide-player"><video controls playsinline preload="metadata" poster="./public/images/operations-guide-poster.jpg?v=pingfang-sc-20261104" aria-label="矿山运营 AI 价值演示视频"><source src="./public/videos/operations-guide.mp4?v=pingfang-sc-20261104" type="video/mp4" /></video></div>
      <p class="demo-guide-error" role="alert" hidden>视频暂时无法加载。可重试播放，或直接进入平台体验。<button type="button" data-guide-retry>重试加载</button></p>
      <footer class="demo-guide-footer"><div><strong data-guide-status>79 秒 · 平稳女声 · 完整画面</strong><span>示例数据与 AI 模拟；最终结论由人工核实。</span></div><button type="button" class="demo-guide-start">跳过视频，开始体验 ›</button></footer>`;
    const video = dialog.querySelector("video");
    const start = dialog.querySelector(".demo-guide-start");
    dialog.querySelector(".demo-guide-close").addEventListener("click", () => dialog.close());
    start.addEventListener("click", () => { dialog.close(); onStart(); });
    video.addEventListener("ended", () => {
      start.textContent = "进入平台，开始体验 ›";
      dialog.querySelector("[data-guide-status]").textContent = "下一步：运营驾驶舱 · 查看运营全貌";
      start.focus();
    });
    video.addEventListener("error", () => { dialog.querySelector(".demo-guide-error").hidden = false; }, true);
    dialog.querySelector("[data-guide-retry]").addEventListener("click", () => {
      dialog.querySelector(".demo-guide-error").hidden = true;
      video.load();
    });
    dialog.addEventListener("click", (event) => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    dialog.addEventListener("close", () => {
      video.pause();
      dialog.remove();
      document.body.classList.remove("demo-guide-open");
      guide = null;
      if (opener?.isConnected) opener.focus();
    }, { once: true });
    guide = dialog;
    document.body.appendChild(dialog);
    document.body.classList.add("demo-guide-open");
    dialog.showModal();
  };
})();
