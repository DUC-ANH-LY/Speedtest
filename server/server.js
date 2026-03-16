const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_DOWNLOAD_MB = 200;
const DEFAULT_DOWNLOAD_MB = 20;

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

app.get("/api/ping", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ now: Date.now() });
});

app.get("/api/download", async (req, res) => {
  const requestedSizeMb = Number(req.query.sizeMb) || DEFAULT_DOWNLOAD_MB;
  const sizeMb = Math.min(Math.max(requestedSizeMb, 1), MAX_DOWNLOAD_MB);
  const totalBytes = sizeMb * 1024 * 1024;
  const chunk = Buffer.alloc(64 * 1024, 97);

  res.set({ 
    "Content-Type": "application/octet-stream",
    "Content-Length": String(totalBytes),
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="download-${sizeMb}mb.bin"`
  });

  let sentBytes = 0;
  while (sentBytes < totalBytes) {
    const remainingBytes = totalBytes - sentBytes;
    const chunkToSend = remainingBytes >= chunk.length ? chunk : chunk.subarray(0, remainingBytes);
    const canContinue = res.write(chunkToSend);
    sentBytes += chunkToSend.length;

    if (!canContinue) {
      await new Promise((resolve) => res.once("drain", resolve));
    }
  }

  res.end();
});

app.post(
  "/api/upload",
  express.raw({
    type: "application/octet-stream",
    limit: "512mb"
  }),
  (req, res) => {
    const bytesReceived = req.body?.length || 0;
    res.set("Cache-Control", "no-store");
    res.json({ bytesReceived, now: Date.now() });
  }
);

app.listen(PORT, () => {
  console.log(`Speed test server listening on http://localhost:${PORT}`);
});
