const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const downloadValueEl = document.getElementById("downloadValue");
const uploadValueEl = document.getElementById("uploadValue");
const latencyValueEl = document.getElementById("latencyValue");
const jitterValueEl = document.getElementById("jitterValue");

const TEST_CONFIG = {
  pingSamples: 12,
  downloadRounds: 3,
  uploadRounds: 3,
  downloadSizeMb: 20,
  uploadSizeMb: 8
};

let controller = null;
let isRunning = false;

function updateStatus(message) {
  statusEl.textContent = message;
}

function setMetric(element, value, digits = 2) {
  element.textContent = Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function avg(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateJitter(latencies) {
  if (latencies.length < 2) return NaN;
  const deltas = [];
  for (let i = 1; i < latencies.length; i += 1) {
    deltas.push(Math.abs(latencies[i] - latencies[i - 1]));
  }
  return avg(deltas);
}

function toMbps(bytes, durationMs) {
  const seconds = durationMs / 1000;
  return (bytes * 8) / seconds / 1_000_000;
}

async function runPingTest(signal) {
  const latencies = [];
  for (let i = 0; i < TEST_CONFIG.pingSamples; i += 1) {
    updateStatus(`Measuring latency (${i + 1}/${TEST_CONFIG.pingSamples})...`);

    const startedAt = performance.now();
    const response = await fetch(`http://localhost:3000/api/ping?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal
    });
    if (!response.ok) {
      throw new Error("Ping test failed");
    }
    await response.json();
    const endedAt = performance.now();
    latencies.push(endedAt - startedAt);
  }

  return {
    latency: avg(latencies),
    jitter: calculateJitter(latencies)
  };
}

async function runDownloadTest(signal) {
  const speeds = [];
  for (let i = 0; i < TEST_CONFIG.downloadRounds; i += 1) {
    updateStatus(`Measuring download (${i + 1}/${TEST_CONFIG.downloadRounds})...`);

    const startedAt = performance.now();
    const response = await fetch(
      `http://localhost:3000/api/download?sizeMb=${TEST_CONFIG.downloadSizeMb}&t=${Date.now()}-${i}`,
      {
        method: "GET",
        cache: "no-store",
        signal
      }
    );
    if (!response.ok) {
      throw new Error("Download test failed");
    }

    const data = await response.arrayBuffer();
    const endedAt = performance.now();
    speeds.push(toMbps(data.byteLength, endedAt - startedAt));
  }

  return avg(speeds);
}

function createUploadPayload(sizeMb) {
  const bytes = sizeMb * 1024 * 1024;
  const payload = new Uint8Array(bytes);
  payload.fill(97);
  return payload;
}

async function runUploadTest(signal) {
  const speeds = [];
  const payload = createUploadPayload(TEST_CONFIG.uploadSizeMb);

  for (let i = 0; i < TEST_CONFIG.uploadRounds; i += 1) {
    updateStatus(`Measuring upload (${i + 1}/${TEST_CONFIG.uploadRounds})...`);

    const startedAt = performance.now();
    const response = await fetch("http://localhost:3000/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream"
      },
      body: payload,
      cache: "no-store",
      signal
    });
    if (!response.ok) {
      throw new Error("Upload test failed");
    }

    const result = await response.json();
    const endedAt = performance.now();
    speeds.push(toMbps(result.bytesReceived || payload.byteLength, endedAt - startedAt));
  }

  return avg(speeds);
}

function setRunningState(running) {
  isRunning = running;
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

async function runFullTest() {
  controller = new AbortController();
  setRunningState(true);
  updateStatus("Starting network measurement...");

  try {
    const { signal } = controller;
    const ping = await runPingTest(signal);
    setMetric(latencyValueEl, ping.latency);
    setMetric(jitterValueEl, ping.jitter);

    const downloadMbps = await runDownloadTest(signal);
    setMetric(downloadValueEl, downloadMbps);

    const uploadMbps = await runUploadTest(signal);
    setMetric(uploadValueEl, uploadMbps);

    updateStatus("Completed successfully.");
  } catch (error) {
    if (error.name === "AbortError") {
      updateStatus("Test stopped.");
    } else {
      updateStatus(`Error: ${error.message}`);
    }
  } finally {
    controller = null;
    setRunningState(false);
  }
}

startBtn.addEventListener("click", () => {
  if (isRunning) return;
  runFullTest();
});

stopBtn.addEventListener("click", () => {
  if (!controller) return;
  controller.abort();
});
