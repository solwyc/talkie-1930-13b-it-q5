const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const APP_ROOT = __dirname;
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const WORKER_SCRIPT = path.join(APP_ROOT, "python", "talkie_worker.py");
const TALKIE_REPO = path.resolve(process.env.TALKIE_REPO || path.join(APP_ROOT, "..", "talkie"));
const TALKIE_MODEL = process.env.TALKIE_MODEL || "talkie-1930-13b-it-q5";
const TALKIE_GPU_LAYERS = process.env.TALKIE_GPU_LAYERS || "";
const TALKIE_GPU_LAYER_STRATEGY = process.env.TALKIE_GPU_LAYER_STRATEGY || "first";
const TALKIE_QUANTIZATION = process.env.TALKIE_QUANTIZATION || "";
const TALKIE_LORA_ADAPTER = process.env.TALKIE_LORA_ADAPTER || "";
const TALKIE_VENV_PYTHON = path.join(TALKIE_REPO, ".venv", "Scripts", "python.exe");
const PYTHON_BIN = process.env.TALKIE_PYTHON || (fs.existsSync(TALKIE_VENV_PYTHON) ? TALKIE_VENV_PYTHON : "python");
const PORT = Number.parseInt(flagValue("--port") || process.env.PORT || "5177", 10);
const MOCK_MODE = hasFlag("--mock") || /^(1|true|yes)$/i.test(process.env.TALKIE_MOCK || "");
const REQUESTED_BACKEND = (flagValue("--backend") || process.env.TALKIE_BACKEND || "python").toLowerCase();
const ACTIVE_BACKEND = MOCK_MODE ? "mock" : REQUESTED_BACKEND;
const LLAMA_SERVER_BIN = path.resolve(process.env.LLAMA_SERVER_BIN || path.join(APP_ROOT, "runtime", "win-cuda12.8", "llama-server.exe"));
const LLAMA_MODEL_PATH = path.resolve(process.env.LLAMA_MODEL || process.env.TALKIE_GGUF || path.join(APP_ROOT, "models", "talkie-1930-13b-it-q5.gguf"));
const LLAMA_MODEL_ALIAS = process.env.LLAMA_MODEL_ALIAS || path.basename(LLAMA_MODEL_PATH, ".gguf");
const LLAMA_HOST = process.env.LLAMA_HOST || "127.0.0.1";
const LLAMA_PORT = Number.parseInt(process.env.LLAMA_PORT || "8187", 10);
const LLAMA_BASE_URL = (process.env.LLAMA_BASE_URL || `http://${LLAMA_HOST}:${LLAMA_PORT}`).replace(/\/$/, "");
const LLAMA_CUDA_BIN = path.resolve(process.env.LLAMA_CUDA_BIN || path.join(APP_ROOT, "runtime", "win-cuda12.8"));
const LLAMA_EXTERNAL = /^(1|true|yes)$/i.test(process.env.LLAMA_EXTERNAL || "");
const LLAMA_N_GPU_LAYERS = process.env.LLAMA_N_GPU_LAYERS || process.env.TALKIE_LLAMA_NGL || "26";
const LLAMA_CTX_SIZE = process.env.LLAMA_CTX_SIZE || "1024";
const LLAMA_BATCH_SIZE = process.env.LLAMA_BATCH_SIZE || "256";
const LLAMA_UBATCH_SIZE = process.env.LLAMA_UBATCH_SIZE || "128";
const LLAMA_THREADS = process.env.LLAMA_THREADS || "4";
const LLAMA_PARALLEL = process.env.LLAMA_PARALLEL || "1";
const LLAMA_STARTUP_TIMEOUT_MS = Number.parseInt(process.env.LLAMA_STARTUP_TIMEOUT_MS || "600000", 10);
const LLAMA_AUTOSTART = hasFlag("--autoload") || /^(1|true|yes)$/i.test(process.env.LLAMA_AUTOSTART || "");
const TALKIE_DIRECT_REPLIES = /^(1|true|yes)$/i.test(
  process.env.TALKIE_DIRECT_REPLIES || (ACTIVE_BACKEND === "llama" ? "0" : "1")
);
const GROUNDING_PROMPT = [
  "Critical identity rule: your name is Talkie.",
  "You are a local language model running on this computer, not a human character.",
  "You have no body, travel history, hometown, nationality, memories, senses, firsthand sources, or personal dates.",
  "When asked about your own experiences, answer plainly as a model and do not invent a biography unless the user explicitly asks for fictional roleplay.",
  "For real-world claims about yourself, avoid phrases like I heard, I saw, I visited, I went, I was born, or I come from.",
].join(" ");
const PERSONAL_EXPERIENCE_GUARD = [
  "The latest user message asks about your identity, origin, or personal experience.",
  "For that answer, say that you are Talkie, a local model, and that you do not have real personal experiences.",
  "Do not supply a place, date, trip, newspaper, witness, or firsthand source.",
].join(" ");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

class TalkieWorker {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.startPromise = null;
    this.current = null;
    this.nextId = 1;
    this.stderrTail = "";
    this.status = {
      state: MOCK_MODE ? "mock" : "idle",
      message: MOCK_MODE ? "Mock mode is active." : "Talkie worker has not started.",
      model: TALKIE_MODEL,
      loraAdapter: TALKIE_LORA_ADAPTER || null,
      pid: null,
      startedAt: null,
    };
  }

  async ensureStarted() {
    if (MOCK_MODE) return;
    if (this.ready) return;
    if (this.startPromise) return this.startPromise;

    this.status = {
      state: "loading",
      message: "Starting Python worker and loading Talkie.",
      model: TALKIE_MODEL,
      loraAdapter: TALKIE_LORA_ADAPTER || null,
      pid: null,
      startedAt: new Date().toISOString(),
    };

    this.startPromise = new Promise((resolve, reject) => {
      const pythonPathParts = [path.join(TALKIE_REPO, "src")];
      if (process.env.PYTHONPATH) pythonPathParts.push(process.env.PYTHONPATH);

      const env = {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONPATH: pythonPathParts.join(path.delimiter),
        TALKIE_REPO,
        TALKIE_MODEL,
      };
      if (process.env.TALKIE_DEVICE) env.TALKIE_DEVICE = process.env.TALKIE_DEVICE;
      if (process.env.TALKIE_CACHE_DIR) env.TALKIE_CACHE_DIR = process.env.TALKIE_CACHE_DIR;
      if (process.env.TALKIE_GPU_LAYERS) env.TALKIE_GPU_LAYERS = process.env.TALKIE_GPU_LAYERS;
      if (process.env.TALKIE_GPU_LAYER_STRATEGY) env.TALKIE_GPU_LAYER_STRATEGY = process.env.TALKIE_GPU_LAYER_STRATEGY;
      if (process.env.TALKIE_QUANTIZATION) env.TALKIE_QUANTIZATION = process.env.TALKIE_QUANTIZATION;
      if (process.env.TALKIE_LORA_ADAPTER) env.TALKIE_LORA_ADAPTER = process.env.TALKIE_LORA_ADAPTER;

      this.proc = spawn(PYTHON_BIN, [WORKER_SCRIPT], {
        cwd: APP_ROOT,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.status.pid = this.proc.pid;

      const finishStart = (err) => {
        if (err) {
          this.startPromise = null;
          reject(err);
          return;
        }
        resolve();
      };

      const rl = readline.createInterface({ input: this.proc.stdout });
      rl.on("line", (line) => this.handleLine(line, finishStart));

      this.proc.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        this.stderrTail = (this.stderrTail + text).slice(-6000);
        process.stderr.write(text);
      });

      this.proc.on("error", (err) => {
        this.status.state = "error";
        this.status.message = err.message;
        finishStart(err);
      });

      this.proc.on("exit", (code, signal) => {
        const message = `Python worker exited (${signal || code}).`;
        this.ready = false;
        this.startPromise = null;
        this.status.state = "stopped";
        this.status.message = message;
        this.status.pid = null;
        if (this.current) {
          this.current.reject(new Error(message));
          this.current = null;
        }
        finishStart(new Error(message));
      });
    });

    return this.startPromise;
  }

  handleLine(line, finishStart) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      this.status.message = `Worker emitted non-JSON output: ${line.slice(0, 160)}`;
      return;
    }

    if (msg.type === "status") {
      this.status.state = msg.state || this.status.state;
      this.status.message = msg.message || this.status.message;
      return;
    }

    if (msg.type === "ready") {
      this.ready = true;
      this.status.state = "ready";
      this.status.message = msg.message || "Talkie is ready.";
      this.status.model = msg.model || TALKIE_MODEL;
      this.status.offload = msg.offload || null;
      this.status.quantization = msg.quantization || null;
      this.status.loraAdapter = msg.loraAdapter || (TALKIE_LORA_ADAPTER ? { path: TALKIE_LORA_ADAPTER } : null);
      finishStart();
      return;
    }

    if (msg.type === "fatal") {
      const detail = msg.traceback ? `${msg.error}\n${msg.traceback}` : msg.error;
      this.ready = false;
      this.status.state = "error";
      this.status.message = msg.error || "Worker failed while loading Talkie.";
      finishStart(new Error(detail || this.status.message));
      return;
    }

    if (!this.current || msg.id !== this.current.id) return;

    if (msg.type === "token") {
      this.current.send("token", { token: msg.token || "" });
      return;
    }

    if (msg.type === "metrics") {
      this.current.send("metrics", {
        tokenCount: msg.tokenCount || 0,
        elapsedSeconds: msg.elapsedSeconds || 0,
        tokensPerSecond: msg.tokensPerSecond || 0,
      });
      return;
    }

    if (msg.type === "done") {
      this.current.send("done", {
        tokenCount: msg.tokenCount || 0,
        elapsedSeconds: msg.elapsedSeconds || 0,
        tokensPerSecond: msg.tokensPerSecond || 0,
      });
      this.current.resolve();
      this.current = null;
      return;
    }

    if (msg.type === "error") {
      const err = new Error(msg.error || "Talkie generation failed.");
      this.current.reject(err);
      this.current = null;
    }
  }

  async streamChat(payload, send) {
    await this.ensureStarted();
    if (!this.proc || !this.ready) {
      throw new Error("Talkie worker is not ready.");
    }
    if (this.current) {
      throw new Error("Talkie is already generating. Wait for the current reply to finish.");
    }

    return new Promise((resolve, reject) => {
      const id = String(this.nextId++);
      this.current = {
        id,
        send,
        resolve,
        reject,
        startedAt: new Date().toISOString(),
      };
      const request = { ...payload, id };
      this.proc.stdin.write(`${JSON.stringify(request)}\n`, (err) => {
        if (!err) return;
        this.current = null;
        reject(err);
      });
    });
  }

  cancelCurrent(reason = "Generation was cancelled.") {
    if (!this.current) return;
    const current = this.current;
    this.current = null;
    current.reject(new Error(reason));
    this.status.state = "cancelled";
    this.status.message = reason;
    this.shutdown();
  }

  shutdown() {
    if (this.proc && !this.proc.killed) {
      if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(this.proc.pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 10000,
        });
      } else {
        this.proc.kill();
      }
    }
  }

  getStatus() {
    return {
      ...this.status,
      activeRequest: this.current
        ? { id: this.current.id, startedAt: this.current.startedAt }
        : null,
    };
  }
}

class LlamaCppBackend {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.startPromise = null;
    this.currentAbort = null;
    this.stdoutTail = "";
    this.stderrTail = "";
    this.status = {
      state: "idle",
      message: LLAMA_EXTERNAL
        ? "Using an external llama.cpp server."
        : "llama.cpp server has not started.",
      model: LLAMA_MODEL_ALIAS,
      modelPath: LLAMA_MODEL_PATH,
      serverUrl: LLAMA_BASE_URL,
      nGpuLayers: LLAMA_N_GPU_LAYERS,
      contextSize: Number(LLAMA_CTX_SIZE),
      pid: null,
      startedAt: null,
    };
  }

  async ensureStarted() {
    if (this.ready) return;
    if (this.startPromise) return this.startPromise;

    this.status.state = "loading";
    this.status.message = LLAMA_EXTERNAL
      ? "Waiting for external llama.cpp server."
      : "Starting patched llama.cpp server.";
    this.status.startedAt = new Date().toISOString();

    this.startPromise = (async () => {
      if (!LLAMA_EXTERNAL) this.launch();
      await this.waitUntilReady();
      this.ready = true;
      this.status.state = "ready";
      this.status.message = "llama.cpp is ready.";
    })();

    try {
      await this.startPromise;
    } catch (err) {
      this.ready = false;
      this.startPromise = null;
      this.status.state = "error";
      this.status.message = err.message || "llama.cpp failed to start.";
      throw err;
    }
  }

  launch() {
    if (this.proc && this.proc.exitCode === null) return;
    if (!fs.existsSync(LLAMA_SERVER_BIN)) {
      throw new Error(`llama-server.exe was not found at ${LLAMA_SERVER_BIN}`);
    }
    if (!fs.existsSync(LLAMA_MODEL_PATH)) {
      throw new Error(`GGUF model was not found at ${LLAMA_MODEL_PATH}`);
    }

    const args = buildLlamaServerArgs();
    const env = {
      ...process.env,
      PATH: fs.existsSync(LLAMA_CUDA_BIN)
        ? `${LLAMA_CUDA_BIN}${path.delimiter}${process.env.PATH || ""}`
        : process.env.PATH,
    };

    this.proc = spawn(LLAMA_SERVER_BIN, args, {
      cwd: path.dirname(LLAMA_SERVER_BIN),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.status.pid = this.proc.pid;
    this.status.command = `${LLAMA_SERVER_BIN} ${args.map(formatArg).join(" ")}`;

    this.proc.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      this.stdoutTail = (this.stdoutTail + text).slice(-8000);
      process.stdout.write(text);
    });

    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      this.stderrTail = (this.stderrTail + text).slice(-8000);
      process.stderr.write(text);
    });

    this.proc.on("error", (err) => {
      this.ready = false;
      this.status.state = "error";
      this.status.message = err.message;
    });

    this.proc.on("exit", (code, signal) => {
      this.ready = false;
      this.startPromise = null;
      this.status.pid = null;
      if (this.status.state !== "stopped") {
        this.status.state = "stopped";
        this.status.message = `llama.cpp server exited (${signal || code}).`;
      }
      if (this.currentAbort) this.currentAbort.abort();
    });
  }

  async waitUntilReady() {
    const started = Date.now();
    let lastError = "";
    while (Date.now() - started < LLAMA_STARTUP_TIMEOUT_MS) {
      if (this.proc && this.proc.exitCode !== null) {
        const tail = (this.stderrTail || this.stdoutTail || "").trim();
        throw new Error(`llama.cpp exited while loading.${tail ? ` Last output: ${tail.slice(-1000)}` : ""}`);
      }

      try {
        const response = await fetch(`${LLAMA_BASE_URL}/health`, {
          headers: { Accept: "application/json,text/plain,*/*" },
        });
        const text = await response.text();
        if (response.ok) return;
        lastError = `${response.status} ${text.slice(0, 220)}`;
      } catch (err) {
        lastError = err.message || String(err);
      }

      await delay(1000);
    }

    throw new Error(`Timed out waiting for llama.cpp at ${LLAMA_BASE_URL}. ${lastError}`);
  }

  async streamChat(payload, send) {
    await this.ensureStarted();
    if (this.currentAbort) {
      throw new Error("llama.cpp is already generating. Wait for the current reply to finish.");
    }

    const controller = new AbortController();
    this.currentAbort = controller;
    const started = Date.now();
    let tokenCount = 0;
    let finalTokenCount = null;

    try {
      const response = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(buildLlamaChatRequest(payload)),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => "");
        throw new Error(`llama.cpp returned ${response.status}${body ? `: ${body.slice(0, 800)}` : ""}`);
      }

      for await (const event of readOpenAiSse(response.body)) {
        if (event === "[DONE]") break;
        const chunk = safeJsonParse(event);
        if (!chunk) continue;

        const usageTokens = chunk.usage?.completion_tokens;
        const timingTokens = chunk.timings?.predicted_n || chunk.timings?.predicted_tokens;
        if (Number.isFinite(usageTokens)) finalTokenCount = usageTokens;
        if (Number.isFinite(timingTokens)) finalTokenCount = timingTokens;

        const delta = chunk.choices?.[0]?.delta?.content
          ?? chunk.choices?.[0]?.message?.content
          ?? chunk.content
          ?? "";

        if (delta) {
          tokenCount += 1;
          send("token", { token: delta });
          send("metrics", runtimeMetrics(started, finalTokenCount || tokenCount));
        }
      }

      send("done", runtimeMetrics(started, finalTokenCount || tokenCount));
    } finally {
      this.currentAbort = null;
    }
  }

  cancelCurrent(reason = "Generation was cancelled.") {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
    this.status.message = reason;
  }

  shutdown() {
    this.cancelCurrent("Runtime stopped.");
    this.ready = false;
    this.startPromise = null;
    this.status.state = "stopped";
    this.status.message = "llama.cpp server was stopped.";

    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(this.proc.pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 10000,
        });
      } else {
        this.proc.kill();
      }
    }
    this.proc = null;
    this.status.pid = null;
  }

  getStatus() {
    return {
      ...this.status,
      activeRequest: this.currentAbort ? { startedAt: this.status.startedAt } : null,
      external: LLAMA_EXTERNAL,
      cudaPathFound: fs.existsSync(LLAMA_CUDA_BIN),
      serverFound: fs.existsSync(LLAMA_SERVER_BIN),
      modelFound: fs.existsSync(LLAMA_MODEL_PATH),
    };
  }
}

const worker = new TalkieWorker();
const llamaBackend = new LlamaCppBackend();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, getStatus());
    }
    if (req.method === "POST" && url.pathname === "/api/runtime/start") {
      return handleRuntimeStart(res);
    }
    if (req.method === "POST" && url.pathname === "/api/runtime/stop") {
      return handleRuntimeStop(res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(req, res);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res, url.pathname);
    }
    sendJson(res, 405, { error: "Method not allowed." });
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Unexpected server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Talkie web app listening on http://localhost:${PORT}`);
  console.log(`Mode: ${ACTIVE_BACKEND}; model: ${runtimeModelName()}`);
  if (TALKIE_LORA_ADAPTER) console.log(`LoRA adapter: ${TALKIE_LORA_ADAPTER}`);
  if (ACTIVE_BACKEND === "llama") {
    console.log(`llama.cpp: ${LLAMA_BASE_URL}`);
    console.log(`GGUF: ${LLAMA_MODEL_PATH}`);
  }
  if (LLAMA_AUTOSTART && ACTIVE_BACKEND === "llama") {
    llamaBackend.ensureStarted().catch((err) => {
      console.error(`Failed to autostart llama.cpp: ${err.message}`);
    });
  }
});

process.on("SIGINT", () => {
  shutdownActiveBackend();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdownActiveBackend();
  process.exit(0);
});

async function handleChat(req, res) {
  let payload;
  try {
    payload = normalizePayload(await readJsonBody(req));
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  let completed = false;
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
    if (!completed && !MOCK_MODE) {
      cancelActiveGeneration("Client disconnected before generation finished.");
    }
  });
  sendSse(res, "status", { message: MOCK_MODE ? "Mock reply started." : `${ACTIVE_BACKEND} reply started.` });

  try {
    const directReply = payload.grounding && TALKIE_DIRECT_REPLIES
      ? groundedDirectReply(payload.rawMessages)
      : null;
    if (directReply) {
      sendSse(res, "status", { message: "Grounded reply started." });
      await streamDirectReply(directReply, (event, data) => sendSse(res, event, data));
    } else if (MOCK_MODE) {
      await streamMock(payload, (event, data) => sendSse(res, event, data));
    } else if (ACTIVE_BACKEND === "llama") {
      await llamaBackend.streamChat(payload, (event, data) => sendSse(res, event, data));
    } else {
      await worker.streamChat(payload, (event, data) => sendSse(res, event, data));
    }
  } catch (err) {
    if (!clientClosed) {
      sendSse(res, "error", { message: err.message || "Generation failed." });
    }
  } finally {
    completed = true;
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

async function handleRuntimeStart(res) {
  try {
    if (MOCK_MODE) return sendJson(res, 200, getStatus());
    if (ACTIVE_BACKEND === "llama") {
      await llamaBackend.ensureStarted();
    } else {
      await worker.ensureStarted();
    }
    sendJson(res, 200, getStatus());
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Runtime failed to start.", status: getStatus() });
  }
}

function handleRuntimeStop(res) {
  shutdownActiveBackend();
  sendJson(res, 200, getStatus());
}

function normalizePayload(body) {
  if (!body || !Array.isArray(body.messages)) {
    throw new Error("Expected a JSON body with a messages array.");
  }

  const messages = body.messages.map((message) => ({
    role: String(message.role || ""),
    content: String(message.content || ""),
  })).filter((message) => message.content.trim().length > 0);

  const validRoles = new Set(["system", "user", "assistant"]);
  if (!messages.length) throw new Error("At least one message is required.");
  if (messages.some((message) => !validRoles.has(message.role))) {
    throw new Error("Messages may only use system, user, or assistant roles.");
  }
  if (messages.length > 80) throw new Error("Please keep the conversation under 80 messages.");
  if (messages.some((message) => message.content.length > 20000)) {
    throw new Error("A message is too large for this local server.");
  }

  const grounding = body.grounding !== false;

  return {
    messages: grounding ? applyGrounding(messages) : messages,
    rawMessages: messages,
    grounding,
    temperature: clampNumber(body.temperature, 0.0, 2.0, 0.45),
    maxTokens: clampInteger(body.maxTokens, 1, 2048, 256),
    topP: optionalNumber(body.topP, 0.0, 1.0),
    topK: optionalInteger(body.topK, 1, 65536),
    repetitionPenalty: clampNumber(body.repetitionPenalty, 1.0, 2.0, 1.12),
    noRepeatNgramSize: clampInteger(body.noRepeatNgramSize, 0, 12, 3),
  };
}

function applyGrounding(messages) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser || !needsPersonalExperienceGuard(messages, lastUser.content)) {
    return messages;
  }

  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  const systemParts = [GROUNDING_PROMPT, PERSONAL_EXPERIENCE_GUARD];
  systemParts.push(...systemMessages);
  return [{ role: "system", content: systemParts.join(" ") }, ...nonSystemMessages];
}

function asksForPersonalExperience(content) {
  const text = content.toLowerCase();
  return [
    /\b(have|had)\s+you\s+(been|visited|seen|heard|met|remembered|lived|traveled|travelled)\b/,
    /\bdid\s+you\s+(visit|see|hear|meet|remember|live|travel|read|learn)\b/,
    /\b(do|can|could|would)\s+you\s+(remember|hear|see|visit|travel|have\s+(?:a|any\s+)?(?:body|hometown|home town|nationality|birthplace|memories|experiences?|sources?))\b/,
    /\bwhere\s+(are|were)\s+you\s+from\b/,
    /\bwhere\s+in\b/,
    /\byour\s+(hometown|home town|nationality|birthplace|memory|memories|source|sources)\b/,
    /\byou\b.*\b(been|visited|saw|seen|heard|met|remember|born|grew up|lived)\b/,
  ].some((pattern) => pattern.test(text));
}

function needsPersonalExperienceGuard(messages, latestUserContent) {
  if (asksForPersonalExperience(latestUserContent)) return true;
  if (!isEllipticalPersonalFollowup(latestUserContent)) return false;

  const recentText = messages
    .slice(-6)
    .map((message) => message.content.toLowerCase())
    .join(" ");
  return /\b(been|travel|visited|europe|france|paris|scotland|hometown|from|source|heard|newspaper|where to)\b/.test(recentText);
}

function isEllipticalPersonalFollowup(content) {
  const text = content.trim().toLowerCase();
  return [
    /^where\s*(to|in|from)?\??$/,
    /^both times\??$/,
    /^paris\??$/,
    /^how\??$/,
    /^when\??$/,
    /^why\??$/,
    /^what source\??$/,
    /^which one\??$/,
  ].some((pattern) => pattern.test(text));
}

function groundedDirectReply(messages) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser || asksForFictionalRoleplay(lastUser.content)) return null;
  const simpleReply = simpleGroundedReply(messages, lastUser.content);
  if (simpleReply) return simpleReply;
  if (!needsPersonalExperienceGuard(messages, lastUser.content)) return null;

  const text = lastUser.content.trim().toLowerCase();
  const recentText = messages
    .filter((message) => message.role !== "system")
    .slice(-6)
    .map((message) => message.content.toLowerCase())
    .join(" ");

  if (/\b(hear|heard|source|where did you hear|how did you hear|how do you know|where did you learn)\b/.test(text) || /\bheard\b/.test(recentText)) {
    return "I do not hear things firsthand; I can only answer from patterns in the model's training data and the context you provide.";
  }

  if (
    /\b(europe|travel|visited|been|where to|both times|paris|france|trip)\b/.test(text)
    || /\b(europe|travel|visited|been|trip)\b/.test(recentText)
  ) {
    return "No. I do not have real travel experiences or trips to Europe.";
  }

  if (/\b(where|from|scotland|hometown|birthplace|born|nationality)\b/.test(text)) {
    return "I am not from Scotland or any physical place; I am a local language model running on this computer.";
  }

  return "I do not have personal experiences; I am Talkie, a local language model running on this computer.";
}

function simpleGroundedReply(messages, content) {
  const raw = content.trim();
  const text = raw.toLowerCase();
  const recentAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")
    ?.content
    ?.trim();

  if (/^(hi|hello|hey|greetings|good (morning|afternoon|evening))[\s.!?]*$/i.test(raw)) {
    return "Hello. I'm Talkie.";
  }

  if (/^(what|who)\s+(is|are)\s+(talkie|you)\??$/i.test(raw) || /^what\s+are\s+you\??$/i.test(raw)) {
    return "Talkie is this local language model running on your computer.";
  }

  if (
    /\bhow\s+(do|can)\s+you\s+(exist|run|work)\b/i.test(raw)
    || /\bexist\s+on\s+(a\s+)?computer\b/i.test(raw)
    || /\brunning\s+on\s+(this\s+|a\s+)?computer\b/i.test(raw)
  ) {
    return ACTIVE_BACKEND === "llama"
      ? "I run as model weights and code on this computer; the web app sends your messages to a local patched llama.cpp server, which generates text."
      : "I run as model weights and code on this computer; the web app sends your messages to a local Python model worker, which generates text.";
  }

  if (/^(lol,?\s*)?(wat|what)\??$/i.test(raw) || /^what\s+do\s+you\s+mean\??$/i.test(raw)) {
    if (/^useful and interesting\.?$/i.test(recentAssistant || "")) {
      return "That was too terse. I mean: hello, I'm Talkie, and I'm ready to talk.";
    }
    return "I mean: I'm Talkie, the local model running here. Ask me normally and I'll do my best.";
  }

  if (/^(interesting|huh|okay|ok)[\s.!?]*$/i.test(raw)) {
    return "Yes. Tell me what part you want to explore, and I'll dig into it.";
  }

  return null;
}

function asksForFictionalRoleplay(content) {
  return /\b(roleplay|pretend|fiction|imagine|in character|as a character)\b/i.test(content);
}

async function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath;
  if (pathname === "/identity.png") {
    const bundledIdentity = path.join(PUBLIC_DIR, "identity.png");
    filePath = fs.existsSync(bundledIdentity)
      ? bundledIdentity
      : path.join(TALKIE_REPO, "assets", "identity.png");
  } else {
    const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    filePath = path.resolve(PUBLIC_DIR, requested);
    const publicRoot = path.resolve(PUBLIC_DIR);
    if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
      return sendJson(res, 403, { error: "Forbidden." });
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: "Not found." });
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    if (req.method === "HEAD") return res.end();
    res.end(data);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function sendSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function getStatus() {
  const repoReady = fs.existsSync(path.join(TALKIE_REPO, "src", "talkie", "__init__.py"));
  const runtime = ACTIVE_BACKEND === "llama" ? llamaBackend.getStatus() : worker.getStatus();
  const quantization = ACTIVE_BACKEND === "llama"
    ? path.basename(LLAMA_MODEL_PATH).match(/q\d[^.]*|iq\d[^.]*/i)?.[0]?.toLowerCase() || "gguf"
    : TALKIE_QUANTIZATION || null;
  return {
    app: "talkie-web",
    mode: ACTIVE_BACKEND,
    backend: ACTIVE_BACKEND,
    model: runtimeModelName(),
    gpuLayers: TALKIE_GPU_LAYERS || null,
    gpuLayerStrategy: TALKIE_GPU_LAYER_STRATEGY,
    quantization,
    loraAdapter: TALKIE_LORA_ADAPTER || null,
    directReplies: TALKIE_DIRECT_REPLIES,
    port: PORT,
    talkieRepo: TALKIE_REPO,
    python: PYTHON_BIN,
    repoReady,
    worker: runtime,
    runtime,
    llama: {
      baseUrl: LLAMA_BASE_URL,
      serverBin: LLAMA_SERVER_BIN,
      modelPath: LLAMA_MODEL_PATH,
      modelAlias: LLAMA_MODEL_ALIAS,
      nGpuLayers: LLAMA_N_GPU_LAYERS,
      contextSize: Number(LLAMA_CTX_SIZE),
      batchSize: Number(LLAMA_BATCH_SIZE),
      ubatchSize: Number(LLAMA_UBATCH_SIZE),
      threads: Number(LLAMA_THREADS),
      parallel: Number(LLAMA_PARALLEL),
      external: LLAMA_EXTERNAL,
    },
    note: ACTIVE_BACKEND === "llama"
      ? "Using patched llama.cpp for Talkie GGUF inference."
      : "The upstream Talkie README lists >=28 GB VRAM for bfloat16 inference.",
  };
}

function buildLlamaServerArgs() {
  return [
    "--fit", "off",
    "--model", LLAMA_MODEL_PATH,
    "--host", LLAMA_HOST,
    "--port", String(LLAMA_PORT),
    "--alias", LLAMA_MODEL_ALIAS,
    "--ctx-size", String(LLAMA_CTX_SIZE),
    "--batch-size", String(LLAMA_BATCH_SIZE),
    "--ubatch-size", String(LLAMA_UBATCH_SIZE),
    "--threads", String(LLAMA_THREADS),
    "--n-gpu-layers", String(LLAMA_N_GPU_LAYERS),
    "--parallel", String(LLAMA_PARALLEL),
    "--metrics",
    "--slots",
    "--no-warmup",
  ];
}

function buildLlamaChatRequest(payload) {
  const request = {
    model: LLAMA_MODEL_ALIAS,
    messages: payload.messages,
    stream: true,
    temperature: payload.temperature,
    max_tokens: payload.maxTokens,
    repeat_penalty: payload.repetitionPenalty,
    stop: ["<|end|>", "<|endoftext|>"],
  };

  if (payload.topP !== null && payload.topP !== undefined) request.top_p = payload.topP;
  if (payload.topK !== null && payload.topK !== undefined) request.top_k = payload.topK;

  return request;
}

async function* readOpenAiSse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const eventText of events) {
      for (const line of eventText.split("\n")) {
        if (!line.startsWith("data:")) continue;
        yield line.slice(5).trimStart();
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data:")) continue;
      yield line.slice(5).trimStart();
    }
  }
}

function runtimeMetrics(startedMs, tokenCount) {
  const elapsedSeconds = (Date.now() - startedMs) / 1000;
  return {
    tokenCount,
    elapsedSeconds,
    tokensPerSecond: tokenCount / Math.max(elapsedSeconds, 0.001),
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runtimeModelName() {
  if (ACTIVE_BACKEND === "llama") return LLAMA_MODEL_ALIAS;
  return TALKIE_MODEL;
}

function cancelActiveGeneration(reason) {
  if (ACTIVE_BACKEND === "llama") {
    llamaBackend.cancelCurrent(reason);
  } else {
    worker.cancelCurrent(reason);
  }
}

function shutdownActiveBackend() {
  if (ACTIVE_BACKEND === "llama") {
    llamaBackend.shutdown();
  } else {
    worker.shutdown();
  }
}

function formatArg(arg) {
  const text = String(arg);
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

async function streamMock(payload, send) {
  const started = Date.now();
  const lastUser = [...payload.messages].reverse().find((message) => message.role === "user");
  const prompt = lastUser ? lastUser.content.trim() : "your message";
  const reply = [
    "Mock Talkie reply: I have your message queued for the instruction-tuned 1930 model path.",
    `Your last prompt begins: "${prompt.slice(0, 120)}${prompt.length > 120 ? "..." : ""}"`,
    "When the Python worker has the weights loaded, this same chat surface will stream real model tokens here.",
  ].join("\n\n");
  const chunks = reply.match(/\S+\s*/g) || [reply];
  for (let i = 0; i < chunks.length; i++) {
    await delay(28);
    send("token", { token: chunks[i] });
    const elapsedSeconds = (Date.now() - started) / 1000;
    send("metrics", {
      tokenCount: i + 1,
      elapsedSeconds,
      tokensPerSecond: (i + 1) / Math.max(elapsedSeconds, 0.001),
    });
  }
  const elapsedSeconds = (Date.now() - started) / 1000;
  send("done", {
    tokenCount: chunks.length,
    elapsedSeconds,
    tokensPerSecond: chunks.length / Math.max(elapsedSeconds, 0.001),
  });
}

async function streamDirectReply(reply, send) {
  const started = Date.now();
  const chunks = reply.match(/\S+\s*/g) || [reply];
  for (let i = 0; i < chunks.length; i++) {
    await delay(18);
    send("token", { token: chunks[i] });
  }
  const elapsedSeconds = (Date.now() - started) / 1000;
  send("done", {
    tokenCount: chunks.length,
    elapsedSeconds,
    tokensPerSecond: chunks.length / Math.max(elapsedSeconds, 0.001),
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function optionalNumber(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  return clampNumber(value, min, max, null);
}

function optionalInteger(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  return clampInteger(value, min, max, null);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function flagValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}
