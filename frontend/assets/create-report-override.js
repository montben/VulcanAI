const BACKEND_URL = "http://localhost:8000";
const CREATE_REPORT_ROUTE = /^#\/project\/([^/]+)\/report\/new$/;
const PROJECT_ROUTE = /^#\/project\/([^/]+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OVERLAY_ID = "codex-create-report-override";
const STORAGE_KEY = "sitescribe:lastProjectId";
const INITIAL_CALL_PROMPT = "Tell me what got done on site today.";
const INITIAL_ASSISTANT_FALLBACK_DELAY_MS = 4500;

let state = null;

function isUuid(value) {
  return UUID_RE.test(value || "");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function request(path, options = {}) {
  const url = path.startsWith("/") ? `${BACKEND_URL}${path}` : path;
  const response = await fetch(url, options);
  if (response.ok) {
    return response;
  }

  let message = `${response.status} ${response.statusText}`;
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      message = payload.detail || payload.message || JSON.stringify(payload);
    } else {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }
  } catch {
    // Keep the default status text if the body cannot be parsed.
  }

  const error = new Error(message);
  error.status = response.status;
  throw error;
}

async function requestJson(path, options = {}) {
  const response = await request(path, options);
  return response.json();
}

function getOverlay() {
  return document.getElementById(OVERLAY_ID);
}

function ensureOverlay() {
  let overlay = getOverlay();
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "9999";
    overlay.style.background = "hsl(var(--background))";
    overlay.style.color = "hsl(var(--foreground))";
    overlay.style.overflow = "auto";
    document.body.appendChild(overlay);
  }
  return overlay;
}

function cleanupResources() {
  if (!state) return;

  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  if (state.initialAssistantFallbackTimeout) {
    clearTimeout(state.initialAssistantFallbackTimeout);
    state.initialAssistantFallbackTimeout = null;
  }

  if (state.audioFallbackTimeouts) {
    Object.values(state.audioFallbackTimeouts).forEach((timeoutId) => clearTimeout(timeoutId));
    state.audioFallbackTimeouts = {};
  }

  if (state.ws) {
    try { state.ws.close(); } catch {}
    state.ws = null;
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    try { state.mediaRecorder.stop(); } catch {}
  }
  state.mediaRecorder = null;

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }

  if (state.eventSource) {
    try { state.eventSource.close(); } catch {}
    state.eventSource = null;
  }

  if (state.currentAssistantAudio) {
    try {
      state.currentAssistantAudio.pause();
      state.currentAssistantAudio.src = "";
    } catch {}
    state.currentAssistantAudio = null;
  }
  state.assistantAudioQueue = [];
  state.assistantSpeaking = false;
  state.micBlockedUntil = 0;

  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch {}
  }

  for (const photo of state.photos || []) {
    try { URL.revokeObjectURL(photo.previewUrl); } catch {}
  }
}

function unmountOverride() {
  cleanupResources();
  state = null;
  const overlay = getOverlay();
  if (overlay) {
    overlay.remove();
  }
}

function projectName() {
  return state?.project?.name || "Create Report";
}

function activeReportDateLabel() {
  return state?.reportData?.latest_generated_report?.report_json?.metadata?.report_date
    || state?.existingReportDate
    || todayIso();
}

function showError(message) {
  if (!state) return;
  state.error = message || "Something went wrong.";
  render();
}

function clearError() {
  if (!state) return;
  state.error = "";
}

function showInfo(message) {
  if (!state) return;
  state.info = message || "";
  render();
}

function renderBanner(text, tone) {
  if (!text) return "";
  const classes = tone === "error"
    ? "border-destructive/30 bg-destructive/5 text-destructive"
    : "border-primary/20 bg-primary/5 text-foreground";
  return `
    <div class="mb-4 rounded-md border px-4 py-3 text-sm ${classes}">
      ${escapeHtml(text)}
    </div>
  `;
}

function renderPhotoGrid() {
  if (!state.photos.length) return "";

  const items = state.photos.map((photo, index) => `
    <div class="group flex flex-col gap-1.5">
      <div class="relative aspect-square overflow-hidden rounded-md border bg-card">
        <img src="${photo.previewUrl}" alt="${escapeHtml(photo.file.name)}" class="h-full w-full object-cover" />
        <button
          type="button"
          class="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          data-remove-photo="${index}"
        >
          ×
        </button>
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
          <p class="truncate text-[11px] font-medium text-white">${escapeHtml(photo.file.name)}</p>
        </div>
      </div>
      <input
        type="text"
        value="${escapeHtml(photo.caption)}"
        placeholder="Add caption..."
        class="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none"
        data-caption-index="${index}"
      />
    </div>
  `).join("");

  return `
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="photo-grid">
      ${items}
      <button
        type="button"
        class="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-card"
        data-add-more
      >
        +
      </button>
    </div>
  `;
}

function renderPhotosStep() {
  const nextDisabled = state.uploading || state.photos.length === 0;

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Jobsite Photos</h2>
        ${state.photos.length ? `<span class="text-xs text-muted-foreground">${state.photos.length} ${state.photos.length === 1 ? "photo" : "photos"}</span>` : ""}
      </div>

      <input id="codex-photo-input" type="file" accept="image/*" multiple class="hidden" />

      <button
        type="button"
        class="group flex w-full cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed border-border px-6 py-10 transition-all hover:border-primary/40 hover:bg-card"
        data-open-picker
        ${state.uploading ? "disabled" : ""}
      >
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
          +
        </div>
        <div class="text-center">
          <p class="text-sm font-medium">${state.photos.length ? "Add more photos" : "Add jobsite photos"}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">Drag and drop images, or tap to select</p>
        </div>
      </button>

      ${renderPhotoGrid()}

      <div class="mt-8 flex items-center justify-between border-t pt-6">
        <button type="button" class="inline-flex items-center rounded-md border px-4 py-2 text-sm text-muted-foreground" data-back-project ${state.uploading ? "disabled" : ""}>
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-next
          ${nextDisabled ? "disabled" : ""}
        >
          ${state.uploading ? escapeHtml(state.uploadProgress || "Uploading...") : "Start Voice Intake"}
        </button>
      </div>
    </div>
  `;
}

function renderTranscript() {
  if (!state.messages.length) {
    return `<p class="text-center text-sm text-muted-foreground">${state.callConnecting ? "Connecting to voice agent..." : "Waiting for the call to begin..."}</p>`;
  }

  return state.messages.map((message) => `
    <div class="flex ${message.speaker === "user" ? "justify-end" : "justify-start"}">
      <div class="max-w-[90%] rounded-md px-3 py-2 text-sm ${
        message.speaker === "agent"
          ? "bg-muted text-foreground"
          : message.type === "partial"
          ? "bg-primary/10 text-foreground italic"
          : "bg-primary text-primary-foreground"
      }">
        ${escapeHtml(message.text)}
      </div>
    </div>
  `).join("");
}

function formatCallTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderCallStep() {
  return `
    <div class="flex flex-col items-center gap-6 pt-8 pb-8">
      <div class="relative flex h-28 w-28 items-center justify-center">
        <div class="absolute inset-0 rounded-full bg-primary/10 animate-pulse"></div>
        <div class="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          Call
        </div>
      </div>

      <div class="text-center">
        <p class="font-mono text-lg font-semibold tabular-nums">${formatCallTime(state.seconds)}</p>
        <p class="text-xs text-muted-foreground">${state.callConnecting ? "Connecting to voice agent..." : "Voice intake in progress"}</p>
      </div>

      <div id="call-transcript" class="w-full max-w-lg space-y-3 overflow-y-auto rounded-md border bg-card p-4" style="max-height: 340px">
        ${renderTranscript()}
      </div>

      <div class="flex gap-3">
        <button type="button" class="inline-flex items-center rounded-md border px-4 py-2 text-sm" data-back-project>
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground disabled:opacity-50"
          data-end-call
          ${state.callId ? "" : "disabled"}
        >
          ${state.endingCall ? "Ending..." : "End Call"}
        </button>
      </div>

      ${state.reportId ? `<button type="button" class="text-sm underline" data-generate-without-call>Generate From Stored Inputs</button>` : ""}
    </div>
  `;
}

function renderGeneratingStep() {
  const steps = state.progressSteps.length
    ? state.progressSteps.map((step) => `
        <div class="flex items-center gap-2 text-xs ${step.done ? "text-foreground" : "text-foreground font-medium"}">
          <div class="h-3.5 w-3.5 shrink-0 rounded-full ${step.done ? "bg-[hsl(var(--success))]" : "border-2 border-primary"}"></div>
          ${escapeHtml(step.message)}
        </div>
      `).join("")
    : `<div class="text-xs text-muted-foreground">Starting pipeline...</div>`;

  return `
    <div class="flex flex-col items-center gap-8 pt-16 pb-8">
      <div class="text-center">
        <h2 class="font-display text-lg font-bold">Generating Report JSON</h2>
        <p class="mt-1 text-sm text-muted-foreground">${escapeHtml(state.progressMessage || "Starting pipeline...")}</p>
      </div>
      <div class="w-full max-w-sm space-y-2">${steps}</div>
    </div>
  `;
}

function renderDoneStep() {
  const reportJson = state.reportData?.latest_generated_report?.report_json || {};
  const metadata = reportJson.metadata || {};
  const photoCount = Array.isArray(state.reportData?.photos) ? state.reportData.photos.length : 0;
  const workItems = Array.isArray(reportJson.work_completed) ? reportJson.work_completed.length : 0;
  const safetyNotes = Array.isArray(reportJson.safety_notes) ? reportJson.safety_notes.length : 0;

  return `
    <div class="flex flex-col items-center gap-6 pt-12 pb-8">
      <div class="flex h-14 w-14 items-center justify-center rounded-full" style="background-color: hsl(var(--success) / 0.12)">
        <span style="color: hsl(var(--success))">✓</span>
      </div>

      <div class="text-center">
        <h2 class="font-display text-lg font-bold">Report JSON Ready</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          ${escapeHtml(metadata.project_name || projectName())} · ${escapeHtml(metadata.report_date || activeReportDateLabel())}
        </p>
      </div>

      <div class="w-full max-w-md rounded-md border bg-card p-4 space-y-3">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">Photos analyzed</span>
          <span class="font-medium">${photoCount}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">Work items documented</span>
          <span class="font-medium">${workItems}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">Safety observations</span>
          <span class="font-medium">${safetyNotes} flagged</span>
        </div>
      </div>

      <div class="flex flex-col items-center gap-3 sm:flex-row">
        <button type="button" class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" data-download-pdf ${state.finalizingPdf ? "disabled" : ""}>
          ${state.finalizingPdf ? "Generating PDF..." : "Download PDF"}
        </button>
        <button type="button" class="inline-flex items-center rounded-md border px-4 py-2 text-sm" data-download-json>
          Download JSON
        </button>
        <button type="button" class="inline-flex items-center rounded-md border px-4 py-2 text-sm" data-back-project>
          Back to Project
        </button>
      </div>
    </div>
  `;
}

function renderShell(inner) {
  return `
    <div class="flex min-h-screen flex-col">
      <nav class="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
        <div class="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div class="flex items-center gap-2.5">
            <span class="font-display text-base font-bold tracking-tight">
              Vulcan <span class="ml-1 text-xs font-medium text-muted-foreground">AI</span>
            </span>
          </div>
          <button type="button" class="text-xs text-muted-foreground" data-back-project>Project</button>
        </div>
      </nav>

      <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div class="mb-6">
          <button type="button" class="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-back-project>
            Back to Project
          </button>
          <h1 class="font-display text-xl font-bold tracking-tight">Create Report</h1>
          <p class="mt-0.5 text-xs text-muted-foreground">
            ${escapeHtml(projectName())} · ${escapeHtml(formatDateLabel(new Date()))}
          </p>
        </div>
        ${renderBanner(state?.error, "error")}
        ${renderBanner(state?.info, "info")}
        ${inner}
      </main>
    </div>
  `;
}

function render() {
  if (!state) return;
  const overlay = ensureOverlay();
  let inner = "";
  if (state.step === "photos") inner = renderPhotosStep();
  if (state.step === "call") inner = renderCallStep();
  if (state.step === "generating") inner = renderGeneratingStep();
  if (state.step === "done") inner = renderDoneStep();
  overlay.innerHTML = renderShell(inner);
  bindEvents(overlay);
  if (state.step === "call") {
    const transcript = document.getElementById("call-transcript");
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }
}

function addSelectedFiles(fileList) {
  if (!state) return;
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  const nextPhotos = files.map((file) => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    caption: "",
  }));

  state.photos.push(...nextPhotos);
  clearError();
  render();
}

function bindEvents(root) {
  const picker = root.querySelector("#codex-photo-input");
  if (picker) {
    picker.addEventListener("change", (event) => {
      addSelectedFiles(event.target.files);
      event.target.value = "";
    });
  }

  const dropZone = root.querySelector("[data-open-picker]");
  dropZone?.addEventListener("click", () => picker?.click());
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    addSelectedFiles(event.dataTransfer?.files || []);
  });

  root.querySelector("[data-add-more]")?.addEventListener("click", () => picker?.click());

  root.querySelectorAll("[data-remove-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-remove-photo"));
      const [photo] = state.photos.splice(index, 1);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      render();
    });
  });

  root.querySelectorAll("[data-caption-index]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const index = Number(input.getAttribute("data-caption-index"));
      if (state.photos[index]) {
        state.photos[index].caption = event.target.value;
      }
    });
  });

  root.querySelectorAll("[data-back-project]").forEach((button) => {
    button.addEventListener("click", () => {
      cleanupResources();
      if (state?.projectId) {
        window.location.hash = `#/project/${state.projectId}`;
      } else {
        window.location.hash = "#/";
      }
    });
  });

  root.querySelector("[data-next]")?.addEventListener("click", beginVoiceIntakeFlow);
  root.querySelector("[data-end-call]")?.addEventListener("click", endCallAndGenerate);
  root.querySelector("[data-generate-without-call]")?.addEventListener("click", generateFromStoredInputs);
  root.querySelector("[data-download-json]")?.addEventListener("click", downloadGeneratedJson);
  root.querySelector("[data-download-pdf]")?.addEventListener("click", downloadPdf);
}

async function loadProject(projectId) {
  state.project = await requestJson(`/api/projects/${projectId}`);
}

async function findTodayReport(projectId) {
  const reports = await requestJson(`/api/projects/${projectId}/reports?limit=50&offset=0`);
  return reports.find((report) => report.report_date === todayIso()) || null;
}

async function loadReportDetail(reportId) {
  if (!state?.projectId || !reportId) return null;
  const detail = await requestJson(`/api/projects/${state.projectId}/reports/${reportId}`);
  state.reportData = detail;
  return detail;
}

async function ensureReportReady() {
  if (!state) return null;
  if (state.reportId) {
    return state.reportId;
  }

  const existing = await findTodayReport(state.projectId);
  if (existing) {
    state.reportId = existing.id;
    state.existingReportDate = existing.report_date;
    state.info = "Using the existing report for today.";
    return state.reportId;
  }

  const payload = await requestJson(`/api/projects/${state.projectId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_date: todayIso() }),
  });
  state.reportId = payload.id;
  state.existingReportDate = payload.report_date;
  return state.reportId;
}

async function uploadSelectedPhotos(reportId) {
  for (let index = 0; index < state.photos.length; index += 1) {
    const photo = state.photos[index];
    state.uploadProgress = `Uploading ${index + 1}/${state.photos.length}...`;
    render();

    const formData = new FormData();
    formData.append("photo", photo.file);
    if (photo.caption) {
      formData.append("caption", photo.caption);
    }

    await request(`/api/projects/${state.projectId}/reports/${reportId}/photos`, {
      method: "POST",
      body: formData,
    });
  }
}

async function beginVoiceIntakeFlow() {
  if (!state || !state.photos.length || state.uploading) return;

  clearError();
  primeAudioPlayback();
  state.uploading = true;
  state.uploadProgress = "Preparing report...";
  render();

  try {
    const reportId = await ensureReportReady();
    await uploadSelectedPhotos(reportId);

    state.uploading = false;
    state.uploadProgress = "";
    state.step = "call";
    state.callId = null;
    state.callConnecting = true;
    state.endingCall = false;
    state.seconds = 0;
    state.messages = [];
    state.playedAssistantAudioTexts.clear();
    render();

    await startCall();
  } catch (error) {
    state.uploading = false;
    state.uploadProgress = "";
    showError(error.message || "Failed to prepare the report.");
  }
}

function buildStreamUrl(streamPath) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = new URL(BACKEND_URL).host;
  return `${protocol}//${host}${streamPath}`;
}

async function resolveCallSession() {
  try {
    const payload = await requestJson(`/api/projects/${state.projectId}/reports/${state.reportId}/calls`, {
      method: "POST",
    });
    return {
      callId: payload.call_id,
      streamUrl: payload.stream_url,
    };
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }

    const detail = await loadReportDetail(state.reportId);
    if (!detail?.active_call_session?.id) {
      throw error;
    }

    return {
      callId: detail.active_call_session.id,
      streamUrl: `/api/projects/${state.projectId}/reports/${state.reportId}/calls/${detail.active_call_session.id}/stream`,
    };
  }
}

function startCallTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
  }
  state.timerId = setInterval(() => {
    if (state?.step === "call") {
      state.seconds += 1;
      render();
    }
  }, 1000);
}

function isMicBlocked() {
  return !!state && (state.assistantSpeaking || Date.now() < (state.micBlockedUntil || 0));
}

function blockMicFor(ms) {
  if (!state) return;
  const until = Date.now() + ms;
  state.micBlockedUntil = Math.max(state.micBlockedUntil || 0, until);
}

function updateUserTranscript(messageType, text) {
  if (!state || !text) return;
  state.messages = state.messages.filter((item) => !(item.speaker === "user" && item.type === "partial"));
  state.messages.push({
    speaker: "user",
    type: messageType,
    text,
  });
}

function clearInitialAssistantFallback() {
  if (!state?.initialAssistantFallbackTimeout) return;
  clearTimeout(state.initialAssistantFallbackTimeout);
  state.initialAssistantFallbackTimeout = null;
}

function scheduleInitialAssistantFallback() {
  clearInitialAssistantFallback();
  state.initialAssistantFallbackTimeout = window.setTimeout(() => {
    if (!state) return;
    const hasAgentPrompt = state.messages.some((message) => message.speaker === "agent" && message.type === "final");
    if (!hasAgentPrompt) {
      addAgentMessage(INITIAL_CALL_PROMPT);
      render();
    }
    state.initialAssistantFallbackTimeout = null;
  }, INITIAL_ASSISTANT_FALLBACK_DELAY_MS);
}

async function startCall() {
  if (!state?.reportId) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaStream = stream;

    const call = await resolveCallSession();
    state.callId = call.callId;

    const ws = new WebSocket(buildStreamUrl(call.streamUrl));
    state.ws = ws;

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "ready") {
        state.callConnecting = false;
        startCallTimer();

        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm",
        });
        recorder.addEventListener("dataavailable", (chunkEvent) => {
          if (isMicBlocked()) {
            return;
          }
          if (chunkEvent.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(chunkEvent.data);
          }
        });
        recorder.start(250);
        state.mediaRecorder = recorder;
        scheduleInitialAssistantFallback();
        render();
        return;
      }

      if (message.type === "assistant_text") {
        clearInitialAssistantFallback();
        addAgentMessage(message.text);
        render();
        return;
      }

      if (message.type === "assistant_audio") {
        clearInitialAssistantFallback();
        queueAssistantAudio(message.audio_base64, message.mime_type, message.text);
        return;
      }

      if (message.type === "partial") {
        updateUserTranscript("partial", message.text);
        render();
        return;
      }

      if (message.type === "final") {
        updateUserTranscript("final", message.text);
        render();
        return;
      }

      if (message.type === "error") {
        state.error = message.message || "Voice agent failed.";
        render();
      }
    });

    ws.addEventListener("error", () => {
      showError("WebSocket connection failed.");
    });
  } catch (error) {
    showError(error.message || "Unable to start the voice call.");
  }
}

function primeAudioPlayback() {
  if (!state || state.audioPrimed) return;
  state.audioPrimed = true;

  try {
    const probe = new Audio("data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAACcQCA");
    probe.volume = 0;
    const playPromise = probe.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    window.setTimeout(() => {
      try {
        probe.pause();
        probe.src = "";
      } catch {}
    }, 50);
  } catch (error) {
    console.warn("Audio prime failed", error);
  }

}

function addAgentMessage(text) {
  if (!state || !text) return;
  const lastMessage = state.messages[state.messages.length - 1];
  if (
    lastMessage &&
    lastMessage.speaker === "agent" &&
    lastMessage.type === "final" &&
    lastMessage.text === text
  ) {
    return;
  }
  state.messages.push({ speaker: "agent", type: "final", text });
}

function playNextAssistantAudio() {
  if (!state) return;
  const next = state.assistantAudioQueue.shift();
  if (!next) {
    state.currentAssistantAudio = null;
    state.assistantSpeaking = false;
    return;
  }

  const audio = new Audio(next.src);
  state.currentAssistantAudio = audio;
  state.assistantSpeaking = true;
  blockMicFor(200);

  const finish = () => {
    if (state?.currentAssistantAudio === audio) {
      state.currentAssistantAudio = null;
    }
    if (state) {
      state.assistantSpeaking = false;
      blockMicFor(250);
    }
    try {
      audio.pause();
      audio.src = "";
    } catch {}
    playNextAssistantAudio();
  };

  audio.addEventListener("ended", finish, { once: true });
  audio.addEventListener("error", () => {
    finish();
  }, { once: true });

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      finish();
    });
  }
}

function queueAssistantAudio(audioBase64, mimeType, text) {
  if (!state || !audioBase64) return;
  if (text) {
    state.playedAssistantAudioTexts.add(text);
  }
  state.assistantAudioQueue.push({
    src: `data:${mimeType || "audio/mpeg"};base64,${audioBase64}`,
    text: text || "",
  });
  if (!state.currentAssistantAudio) {
    playNextAssistantAudio();
  }
}

function buildConversationTranscript() {
  if (!state) return "";
  return state.messages
    .filter((message) => message.type === "final" && message.text)
    .map((message) => `${message.speaker === "agent" ? "Agent" : "User"}: ${message.text}`)
    .join("\n");
}

async function stopCallResources() {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    await new Promise((resolve) => {
      state.mediaRecorder.addEventListener("stop", resolve, { once: true });
      state.mediaRecorder.stop();
    });
  }
  state.mediaRecorder = null;

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.close();
  }
  state.ws = null;

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }

  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

async function endCallAndGenerate() {
  if (!state?.callId || !state.reportId || state.endingCall) return;

  try {
    state.endingCall = true;
    render();
    await stopCallResources();

    const transcript = buildConversationTranscript();
    await requestJson(`/api/projects/${state.projectId}/reports/${state.reportId}/calls/${state.callId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    state.step = "generating";
    state.progressSteps = [];
    state.progressMessage = "Starting pipeline...";
    state.error = "";
    state.info = "";
    state.endingCall = false;
    render();
    startProgressStream();
  } catch (error) {
    state.endingCall = false;
    showError(error.message || "Failed to end the call.");
  }
}

function pushProgress(message, donePrevious = true) {
  if (!state || !message) return;
  if (donePrevious && state.progressSteps.length) {
    state.progressSteps[state.progressSteps.length - 1].done = true;
  }
  state.progressSteps.push({ message, done: false });
  state.progressMessage = message;
}

function startProgressStream() {
  if (!state?.reportId) return;

  if (state.eventSource) {
    state.eventSource.close();
  }

  const source = new EventSource(`${BACKEND_URL}/api/projects/${state.projectId}/reports/${state.reportId}/progress`);
  state.eventSource = source;

  source.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.stage === "error") {
        state.error = payload.message || "Pipeline failed.";
        source.close();
        render();
        return;
      }

      if (payload.stage === "complete") {
        if (payload.message) {
          pushProgress(payload.message, true);
        }
        if (state.progressSteps.length) {
          state.progressSteps[state.progressSteps.length - 1].done = true;
        }
        state.progressMessage = "Loading generated JSON...";
        render();
        source.close();
        await loadReportDetail(state.reportId);
        state.step = "done";
        render();
        return;
      }

      if (payload.message) {
        pushProgress(payload.message, true);
        render();
      }
    } catch (error) {
      console.warn("Failed to parse progress payload", error);
    }
  };

  source.onerror = () => {
    state.error = "Lost connection to report progress stream.";
    source.close();
    render();
  };
}

async function generateFromStoredInputs() {
  if (!state?.reportId) return;
  try {
    await requestJson(`/api/projects/${state.projectId}/reports/${state.reportId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality_mode: "standard" }),
    });
    state.step = "generating";
    state.progressSteps = [];
    state.progressMessage = "Starting pipeline...";
    state.error = "";
    render();
    startProgressStream();
  } catch (error) {
    showError(error.message || "Failed to generate report.");
  }
}

function downloadGeneratedJson() {
  const reportJson = state?.reportData?.latest_generated_report?.report_json;
  if (!reportJson) {
    showError("Generated report JSON is not available yet.");
    return;
  }

  const metadata = reportJson.metadata || {};
  const projectSlug = (metadata.project_name || projectName())
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
  const reportDate = (metadata.report_date || todayIso()).toString();
  const filename = `${projectSlug}-${reportDate}.json`;
  const blob = new Blob([JSON.stringify(reportJson, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPdf() {
  if (!state?.projectId || !state?.reportId || state.finalizingPdf) return;

  try {
    state.finalizingPdf = true;
    clearError();
    render();

    // Call finalize endpoint — this generates the PDF via Node.js pipeline
    const result = await requestJson(
      `/api/projects/${state.projectId}/reports/${state.reportId}/finalize`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
    );

    // Download the PDF
    const pdfUrl = result.pdf_url;
    if (pdfUrl) {
      const anchor = document.createElement("a");
      anchor.href = pdfUrl;
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } else {
      showError("PDF URL not returned from server.");
    }
  } catch (error) {
    showError(error.message || "Failed to generate PDF.");
  } finally {
    if (state) {
      state.finalizingPdf = false;
      render();
    }
  }
}

async function resolveProjectId(projectId) {
  if (isUuid(projectId)) return projectId;
  const remembered = sessionStorage.getItem(STORAGE_KEY);
  if (isUuid(remembered)) return remembered;
  const projects = await requestJson("/api/projects?limit=1&offset=0");
  return projects[0]?.id || null;
}

async function mountForRoute(projectId) {
  cleanupResources();
  state = {
    projectId,
    project: null,
    reportId: null,
    existingReportDate: null,
    photos: [],
    step: "photos",
    callId: null,
    callConnecting: false,
    endingCall: false,
    seconds: 0,
    timerId: null,
    initialAssistantFallbackTimeout: null,
    ws: null,
    mediaRecorder: null,
    mediaStream: null,
    messages: [],
    uploading: false,
    uploadProgress: "",
    progressSteps: [],
    progressMessage: "",
    eventSource: null,
    reportData: null,
    assistantAudioQueue: [],
    currentAssistantAudio: null,
    assistantSpeaking: false,
    micBlockedUntil: 0,
    audioFallbackTimeouts: {},
    playedAssistantAudioTexts: new Set(),
    audioPrimed: false,
    finalizingPdf: false,
    info: "",
    error: "",
  };

  render();

  try {
    await loadProject(projectId);
    render();
  } catch (error) {
    showError(error.message || "Failed to load project.");
  }
}

async function syncRoute() {
  const projectMatch = window.location.hash.match(PROJECT_ROUTE);
  if (projectMatch && isUuid(projectMatch[1])) {
    sessionStorage.setItem(STORAGE_KEY, projectMatch[1]);
  }

  const match = window.location.hash.match(CREATE_REPORT_ROUTE);
  if (!match) {
    unmountOverride();
    return;
  }

  const resolvedProjectId = await resolveProjectId(match[1]);
  if (!resolvedProjectId) {
    ensureOverlay().innerHTML = renderShell(`
      <div class="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        No project is available yet. Create a project first.
      </div>
    `);
    return;
  }

  if (resolvedProjectId !== match[1]) {
    window.location.hash = `#/project/${resolvedProjectId}/report/new`;
    return;
  }

  if (!state || state.projectId !== resolvedProjectId) {
    await mountForRoute(resolvedProjectId);
    return;
  }

  render();
}

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("a[href]");
  if (!anchor) return;
  const href = anchor.getAttribute("href") || "";

  const projectLink = href.match(/\/project\/([0-9a-f-]{36})(?:$|\/)/i);
  if (projectLink) {
    sessionStorage.setItem(STORAGE_KEY, projectLink[1]);
  }

  if (href.includes("/project/p1/report/new")) {
    const currentProject = window.location.hash.match(PROJECT_ROUTE)?.[1];
    const remembered = isUuid(currentProject) ? currentProject : sessionStorage.getItem(STORAGE_KEY);
    if (isUuid(remembered)) {
      event.preventDefault();
      sessionStorage.setItem(STORAGE_KEY, remembered);
      window.location.hash = `#/project/${remembered}/report/new`;
    }
  }
}, true);

window.addEventListener("hashchange", () => {
  syncRoute().catch((error) => {
    console.error(error);
  });
});

syncRoute().catch((error) => {
  console.error(error);
});
