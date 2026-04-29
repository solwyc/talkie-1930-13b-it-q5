const messagesEl = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const promptEl = document.querySelector("#prompt");
const sendBtn = document.querySelector("#sendBtn");
const stopBtn = document.querySelector("#stopBtn");
const clearBtn = document.querySelector("#clearBtn");
const runtimeText = document.querySelector("#runtimeText");
const runtimePill = document.querySelector("#runtimePill");
const modelLine = document.querySelector("#modelLine");
const temperature = document.querySelector("#temperature");
const temperatureOut = document.querySelector("#temperatureOut");
const maxTokens = document.querySelector("#maxTokens");
const topP = document.querySelector("#topP");
const topK = document.querySelector("#topK");
const repetitionPenalty = document.querySelector("#repetitionPenalty");
const repetitionPenaltyOut = document.querySelector("#repetitionPenaltyOut");
const noRepeatNgramSize = document.querySelector("#noRepeatNgramSize");
const systemPrompt = document.querySelector("#systemPrompt");
const groundingToggle = document.querySelector("#groundingToggle");
const runtimeStartBtn = document.querySelector("#runtimeStartBtn");
const runtimeStopBtn = document.querySelector("#runtimeStopBtn");
const backendValue = document.querySelector("#backendValue");
const quantValue = document.querySelector("#quantValue");
const workerValue = document.querySelector("#workerValue");
const gpuValue = document.querySelector("#gpuValue");
const contextValue = document.querySelector("#contextValue");
const directRepliesValue = document.querySelector("#directRepliesValue");
const serverValue = document.querySelector("#serverValue");
const speedValue = document.querySelector("#speedValue");
const tokenValue = document.querySelector("#tokenValue");
const elapsedValue = document.querySelector("#elapsedValue");

const state = {
  messages: JSON.parse(localStorage.getItem("talkie.messages") || "[]"),
  controller: null,
  isStreaming: false,
};

renderMessages();
refreshStatus();
setInterval(refreshStatus, 5000);

temperature.addEventListener("input", () => {
  temperatureOut.value = Number(temperature.value).toFixed(2);
});

repetitionPenalty.addEventListener("input", () => {
  repetitionPenaltyOut.value = Number(repetitionPenalty.value).toFixed(2);
});

promptEl.addEventListener("input", () => {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptEl.value.trim();
  if (!prompt || state.isStreaming) return;

  promptEl.value = "";
  promptEl.style.height = "auto";
  appendMessage("user", prompt);
  const assistantMessage = appendMessage("assistant", "");
  await streamReply(assistantMessage);
});

clearBtn.addEventListener("click", () => {
  if (state.isStreaming) return;
  state.messages = [];
  localStorage.removeItem("talkie.messages");
  renderMessages();
  speedValue.textContent = "-";
  tokenValue.textContent = "-";
});

stopBtn.addEventListener("click", () => {
  if (state.controller) state.controller.abort();
});

runtimeStartBtn.addEventListener("click", async () => {
  if (state.isStreaming) return;
  runtimeStartBtn.disabled = true;
  setRuntime("Starting", "loading");
  try {
    await fetch("/api/runtime/start", { method: "POST" });
  } finally {
    refreshStatus();
  }
});

runtimeStopBtn.addEventListener("click", async () => {
  if (state.isStreaming) return;
  runtimeStopBtn.disabled = true;
  setRuntime("Stopping", "loading");
  try {
    await fetch("/api/runtime/stop", { method: "POST" });
  } finally {
    speedValue.textContent = "-";
    tokenValue.textContent = "-";
    elapsedValue.textContent = "-";
    refreshStatus();
  }
});

async function streamReply(assistantMessage) {
  state.isStreaming = true;
  state.controller = new AbortController();
  setBusy(true);

  try {
    const payload = {
      messages: buildRequestMessages(),
      temperature: Number(temperature.value),
      maxTokens: Number(maxTokens.value),
      topP: topP.value === "" ? null : Number(topP.value),
      topK: topK.value === "" ? null : Number(topK.value),
      repetitionPenalty: Number(repetitionPenalty.value),
      noRepeatNgramSize: Number(noRepeatNgramSize.value),
      grounding: groundingToggle.checked,
    };

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: state.controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server returned ${response.status}`);
    }

    await readSse(response, {
      status: (data) => setRuntime(data.message || "Streaming", "loading"),
      token: (data) => {
        assistantMessage.content += data.token || "";
        updateMessage(assistantMessage);
      },
      metrics: updateMetrics,
      done: (data) => {
        updateMetrics(data);
        setRuntime("Ready", "ready");
      },
      error: (data) => {
        assistantMessage.content = data.message || "Generation failed.";
        assistantMessage.error = true;
        updateMessage(assistantMessage);
        setRuntime("Error", "error");
      },
    });
  } catch (err) {
    if (err.name !== "AbortError") {
      assistantMessage.content = err.message || "Request failed.";
      assistantMessage.error = true;
      updateMessage(assistantMessage);
      setRuntime("Error", "error");
    }
  } finally {
    if (!assistantMessage.content.trim()) {
      assistantMessage.content = "[stopped]";
      updateMessage(assistantMessage);
    }
    persistMessages();
    state.controller = null;
    state.isStreaming = false;
    setBusy(false);
    refreshStatus();
  }
}

async function readSse(response, handlers) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const eventText of events) {
      const event = parseSseEvent(eventText);
      if (!event) continue;
      const handler = handlers[event.event];
      if (handler) handler(event.data);
    }
  }
}

function parseSseEvent(text) {
  const lines = text.split("\n");
  let event = "message";
  const data = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

function buildRequestMessages() {
  const requestMessages = [];
  const system = systemPrompt.value.trim();
  if (system) requestMessages.push({ role: "system", content: system });
  requestMessages.push(...state.messages.map(({ role, content }) => ({ role, content })));
  return requestMessages;
}

function appendMessage(role, content) {
  const message = { id: crypto.randomUUID(), role, content };
  state.messages.push(message);
  persistMessages();
  renderMessages();
  return message;
}

function updateMessage(message) {
  const node = messagesEl.querySelector(`[data-id="${message.id}"] .bubble-body`);
  if (!node) return renderMessages();
  node.textContent = message.content;
  node.closest(".message").classList.toggle("is-error", Boolean(message.error));
  messagesEl.scrollTop = messagesEl.scrollHeight;
  persistMessages();
}

function renderMessages() {
  messagesEl.replaceChildren();
  if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Ready for a first prompt.";
    messagesEl.append(empty);
    return;
  }

  for (const message of state.messages) {
    const item = document.createElement("article");
    item.className = `message ${message.role === "user" ? "from-user" : "from-assistant"}`;
    item.dataset.id = message.id;
    if (message.error) item.classList.add("is-error");

    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = message.role === "user" ? "You" : "Talkie";

    const body = document.createElement("div");
    body.className = "bubble-body";
    body.textContent = message.content;

    item.append(label, body);
    messagesEl.append(item);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    const runtime = status.runtime || status.worker || {};
    const quant = status.quantization || runtime.quantization?.mode || "";
    modelLine.textContent = quant ? `${status.model} - ${quant}` : status.model || "talkie-1930-13b-it";
    backendValue.textContent = status.backend || status.mode || "-";
    quantValue.textContent = quant || "-";
    workerValue.textContent = runtime.state || "-";
    gpuValue.textContent = status.llama?.nGpuLayers ? `${status.llama.nGpuLayers}` : status.gpuLayers || "-";
    contextValue.textContent = status.llama?.contextSize ? `${status.llama.contextSize}` : "-";
    directRepliesValue.textContent = status.directReplies ? "on" : "off";
    serverValue.textContent = status.llama?.baseUrl || "-";
    syncRuntimeButtons(runtime.state, status.backend || status.mode);
    if (!state.isStreaming) {
      setRuntime(runtime.state || status.mode || "ready", runtime.state || status.mode);
    }
  } catch {
    setRuntime("Offline", "error");
  }
}

function setRuntime(text, stateName = "") {
  runtimeText.textContent = text;
  runtimePill.dataset.state = stateName;
}

function setBusy(isBusy) {
  state.isStreaming = isBusy;
  sendBtn.disabled = isBusy;
  clearBtn.disabled = isBusy;
  stopBtn.disabled = !isBusy;
  promptEl.disabled = isBusy;
  runtimeStartBtn.disabled = isBusy;
  runtimeStopBtn.disabled = isBusy;
}

function updateMetrics(data) {
  const tps = Number(data.tokensPerSecond || 0);
  const tokens = Number(data.tokenCount || 0);
  const elapsed = Number(data.elapsedSeconds || 0);
  speedValue.textContent = tps ? `${tps.toFixed(2)} tok/s` : "-";
  tokenValue.textContent = tokens ? `${tokens}` : "-";
  elapsedValue.textContent = elapsed ? `${elapsed.toFixed(1)} s` : "-";
}

function persistMessages() {
  localStorage.setItem("talkie.messages", JSON.stringify(state.messages));
}

function syncRuntimeButtons(runtimeState, backend) {
  if (state.isStreaming) return;
  const isMock = backend === "mock";
  const isLoading = runtimeState === "loading";
  const isReady = runtimeState === "ready";
  runtimeStartBtn.disabled = isMock || isLoading || isReady;
  runtimeStopBtn.disabled = isMock || (!isLoading && !isReady);
}
