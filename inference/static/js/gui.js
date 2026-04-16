const config = window.MolmoWebConfig || {};
const lang = config.lang || "en";
const text = config.text || {};
const windowSizeInvalidText = config.windowSizeInvalidText || "";

const form = document.getElementById("run-form");
const runButton = document.getElementById("run-button");
const runButtonLabel = document.getElementById("run-button-label");
const resetButton = document.getElementById("reset-button");
const stopButton = document.getElementById("stop-button");
const historyToggle = document.getElementById("history-toggle");
const helpToggle = document.getElementById("help-toggle");
const helpPopover = document.getElementById("help-popover");
const historyClose = document.getElementById("history-close");
const historyClear = document.getElementById("history-clear");
const historyDrawer = document.getElementById("history-drawer");
const historyBackdrop = document.getElementById("history-backdrop");
const notice = document.getElementById("notice");
const error = document.getElementById("error");
const traceToggle = document.getElementById("trace-toggle");
let pollTimer = null;

function applyTraceToggle() {
  const open = traceToggle.checked;
  document.querySelectorAll(".trace-item").forEach(el => {
    el.open = open;
  });
}
traceToggle.addEventListener("change", applyTraceToggle);

function setDrawer(open) {
  historyDrawer.classList.toggle("open", open);
  historyBackdrop.classList.toggle("open", open);
  historyDrawer.setAttribute("aria-hidden", open ? "false" : "true");
}

function setHelp(open) {
  helpPopover.classList.toggle("open", open);
}

function setRunningUI(isRunning) {
  runButton.disabled = isRunning;
  resetButton.disabled = isRunning;
  stopButton.disabled = !isRunning;
  runButton.classList.toggle("is-running", isRunning);
  runButtonLabel.textContent = isRunning ? text.running : text.runTask;
}

function setMessage(target, value) {
  if (!value) {
    target.style.display = "none";
    target.textContent = "";
    return;
  }
  target.style.display = "block";
  target.textContent = value;
}

function updateProgressBar(data) {
  const bar = document.getElementById("progress-bar");
  const maxSteps = data.max_steps || 0;
  const stepNum = data.step_num || 0;
  const isRunning = Boolean(data.running);
  const isDone = !isRunning && data.status !== "idle";
  if (!maxSteps) {
    bar.innerHTML = "";
    return;
  }
  if (bar.children.length !== maxSteps) {
    bar.innerHTML = Array.from({length: maxSteps}, () => '<div class="progress-seg"></div>').join("");
  }
  const segs = bar.children;
  for (let i = 0; i < maxSteps; i++) {
    if (isDone) {
      segs[i].className = "progress-seg done";
    } else if (i < stepNum - 1) {
      segs[i].className = "progress-seg filled";
    } else if (i === stepNum - 1 && isRunning) {
      segs[i].className = "progress-seg active";
    } else if (i < stepNum) {
      segs[i].className = "progress-seg filled";
    } else {
      segs[i].className = "progress-seg";
    }
  }
}

function updateLive(data) {
  document.getElementById("browser-status").textContent = data.browser_status;
  document.getElementById("live-status").textContent = data.localized_status;
  document.getElementById("live-page-title").textContent = data.page_title || "-";
  document.getElementById("latest-step").innerHTML = data.latest_step_html || "-";
  document.getElementById("trace-list").innerHTML = data.trace_html;
  applyTraceToggle();
  document.getElementById("history").innerHTML = data.history_html;
  attachRecordListeners();
  const step = data.step_num ? `${data.step_num}/${data.max_steps}` : (data.running ? text.queued : "-");
  document.getElementById("live-step-badge").textContent = step;
  updateProgressBar(data);
  setRunningUI(Boolean(data.running));
  setMessage(error, data.last_error || data.error || "");
  if (!data.running && data.status !== "idle") {
    setMessage(notice, data.error ? text.taskFailed : text.taskFinished);
  }
}

async function fetchStatus() {
  const response = await fetch(`/api/status?lang=${encodeURIComponent(lang)}`, { cache: "no-store" });
  const data = await response.json();
  updateLive(data);
  if (!data.running && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function parseWindowSize(widthValue, heightValue) {
  const width = Number(widthValue);
  const height = Number(heightValue);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 640 || height < 480) return null;
  return { width, height };
}

async function deleteHistoryRecord(recordId) {
  const formData = new FormData();
  formData.append("lang", lang);
  const response = await fetch(`/api/history/${encodeURIComponent(recordId)}/delete`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  updateLive(data);
}

async function clearHistory() {
  const formData = new FormData();
  formData.append("lang", lang);
  const response = await fetch("/api/history/clear", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  updateLive(data);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(notice, "");
  setMessage(error, "");
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) {
    setMessage(error, text.enterTask);
    return;
  }
  const size = parseWindowSize(
    document.getElementById("window_width").value,
    document.getElementById("window_height").value,
  );
  if (!size) {
    setMessage(error, windowSizeInvalidText);
    return;
  }
  setRunningUI(true);
  document.getElementById("live-step-badge").textContent = text.queued;
  document.getElementById("live-page-title").textContent = "-";
  document.getElementById("latest-step").innerHTML = "-";
  document.getElementById("trace-list").innerHTML = `<p class="hint">${text.queued}</p>`;
  document.getElementById("live-status").textContent = text.running;
  const formData = new FormData(form);
  formData.set("window_width", String(size.width));
  formData.set("window_height", String(size.height));
  const response = await fetch("/api/run", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    setRunningUI(false);
    setMessage(error, data.detail || text.taskFailed);
    return;
  }
  updateLive(data);
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(fetchStatus, 1000);
});

const promptEl = document.getElementById("prompt");
const saved = sessionStorage.getItem("molmoweb_prompt");
if (saved) promptEl.value = saved;
promptEl.addEventListener("input", () => {
  sessionStorage.setItem("molmoweb_prompt", promptEl.value);
});

fetchStatus();
helpToggle.addEventListener("click", () => setHelp(!helpPopover.classList.contains("open")));
historyToggle.addEventListener("click", () => setDrawer(true));
historyClose.addEventListener("click", () => setDrawer(false));
historyBackdrop.addEventListener("click", () => setDrawer(false));
document.addEventListener("click", (event) => {
  if (!helpPopover.classList.contains("open")) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (helpPopover.contains(target) || helpToggle.contains(target)) return;
  setHelp(false);
});
historyClear.addEventListener("click", clearHistory);
resetButton.addEventListener("click", async () => {
  if (runButton.disabled) return;
  setMessage(notice, "");
  setMessage(error, "");
  const formData = new FormData();
  formData.append("lang", lang);
  const response = await fetch("/reset", {
    method: "POST",
    body: formData,
    redirect: "follow",
  });
  if (!response.ok) {
    setMessage(error, text.taskFailed);
    return;
  }
  await fetchStatus();
});
stopButton.addEventListener("click", async () => {
  if (stopButton.disabled) return;
  setMessage(notice, "");
  setMessage(error, "");
  const formData = new FormData();
  formData.append("lang", lang);
  const response = await fetch("/api/stop", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  updateLive(data);
});
function attachRecordListeners() {
  document.querySelectorAll(".record .delete-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await deleteHistoryRecord(btn.dataset.recordId);
    };
  });
  document.querySelectorAll(".record a").forEach(el => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });
}
attachRecordListeners();
