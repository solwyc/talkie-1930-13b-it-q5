#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Transform, Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_URL =
  process.env.TALKIE_MODEL_URL ||
  "https://huggingface.co/sol-wy/talkie-1930-13b-it-q5/resolve/main/talkie-1930-13b-it-q5.gguf?download=true";
const DEFAULT_OUT = path.join(ROOT, "models", "talkie-1930-13b-it-q5.gguf");
const DEFAULT_SHA256 =
  process.env.TALKIE_MODEL_SHA256 ||
  "B6025276018B228CB35CDC76F2D957EB8037EA595F7C9486BC2971ECAFEAD0BA";

main().catch((err) => {
  console.error(`\nModel download failed: ${err.message}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const url = args.url || DEFAULT_URL;
  const outPath = path.resolve(args.out || args.output || DEFAULT_OUT);
  const expectedSha256 = (args.sha256 || DEFAULT_SHA256).toUpperCase();
  const force = Boolean(args.force);
  const verifyExisting = Boolean(args.verifyExisting || args.verify);

  await fsp.mkdir(path.dirname(outPath), { recursive: true });

  if (fs.existsSync(outPath) && !force) {
    if (!verifyExisting) {
      console.log(`Model already exists: ${outPath}`);
      console.log("Use --verify-existing to hash it, or --force to download it again.");
      return;
    }

    const digest = await sha256File(outPath, "Verifying existing model");
    if (digest === expectedSha256) {
      console.log(`\nModel verified: ${outPath}`);
      return;
    }
    throw new Error(
      `Existing model SHA256 mismatch.\nExpected: ${expectedSha256}\nActual:   ${digest}\nUse --force to replace it.`
    );
  }

  const tempPath = `${outPath}.download`;
  if (fs.existsSync(tempPath)) await fsp.rm(tempPath, { force: true });

  console.log(`Downloading Talkie Q5 GGUF`);
  console.log(`From: ${url}`);
  console.log(`To:   ${outPath}`);

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "talkie-1930-13b-it-q5-installer",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const total = Number.parseInt(response.headers.get("content-length") || "0", 10);
  const hash = crypto.createHash("sha256");
  let downloaded = 0;
  let lastPrint = 0;

  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      hash.update(chunk);
      const now = Date.now();
      if (now - lastPrint > 1000) {
        lastPrint = now;
        writeProgress("Downloading", downloaded, total);
      }
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(tempPath));
  writeProgress("Downloading", downloaded, total);

  const digest = hash.digest("hex").toUpperCase();
  if (digest !== expectedSha256) {
    await fsp.rm(tempPath, { force: true });
    throw new Error(`SHA256 mismatch.\nExpected: ${expectedSha256}\nActual:   ${digest}`);
  }

  if (fs.existsSync(outPath)) await fsp.rm(outPath, { force: true });
  await fsp.rename(tempPath, outPath);
  console.log(`\nModel ready: ${outPath}`);
  console.log(`SHA256: ${digest}`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--verify-existing" || arg === "--verify") {
      args.verifyExisting = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

async function sha256File(filePath, label) {
  const stat = await fsp.stat(filePath);
  const total = stat.size;
  const hash = crypto.createHash("sha256");
  let read = 0;
  let lastPrint = 0;

  await pipeline(
    fs.createReadStream(filePath),
    new Transform({
      transform(chunk, _encoding, callback) {
        read += chunk.length;
        hash.update(chunk);
        const now = Date.now();
        if (now - lastPrint > 1000) {
          lastPrint = now;
          writeProgress(label, read, total);
        }
        callback();
      },
    })
  );
  writeProgress(label, read, total);
  return hash.digest("hex").toUpperCase();
}

function writeProgress(label, done, total) {
  const pieces = [`\r${label}: ${formatBytes(done)}`];
  if (total > 0) {
    const pct = Math.min(100, (done / total) * 100);
    pieces.push(` / ${formatBytes(total)} (${pct.toFixed(1)}%)`);
  }
  process.stdout.write(pieces.join(""));
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function printHelp() {
  console.log(`Usage: node scripts/download-model.js [options]

Options:
  --out <path>             Output GGUF path.
  --url <url>              Model download URL.
  --sha256 <hash>          Expected SHA256.
  --verify-existing        Hash an existing output file before skipping.
  --force                  Replace an existing output file.

Defaults download the public Hugging Face GGUF to models/talkie-1930-13b-it-q5.gguf.`);
}
