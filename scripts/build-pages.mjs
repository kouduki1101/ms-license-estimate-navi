import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "app", "public");
const OUTPUT_DIR = path.join(ROOT, "outputs");
const DOCS_DIR = path.join(ROOT, "docs");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function latestSnapshotsBySku(snapshots, fxRate) {
  const grouped = new Map();
  for (const snapshot of snapshots) {
    if (!grouped.has(snapshot.sku_id)) grouped.set(snapshot.sku_id, []);
    grouped.get(snapshot.sku_id).push(snapshot);
  }

  const latest = new Map();
  for (const [skuId, rows] of grouped.entries()) {
    latest.set(
      skuId,
      rows
        .map((row) => {
          const priceUsd = numberOrNull(row.price_usd);
          const rowFx = numberOrNull(row.fx_rate_usd_jpy) ?? fxRate;
          const priceJpy = numberOrNull(row.price_jpy) ?? (priceUsd === null ? null : priceUsd * rowFx);
          return { ...row, priceUsd, priceJpy };
        })
        .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
        .at(-1)
    );
  }
  return latest;
}

function normalizeExistingLicense(row) {
  return {
    ...row,
    quantity: numberOrNull(row.quantity) ?? 0,
    applicable_services: String(row.applicable_services ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function artifactKind(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith(".xlsx")) return "Excel";
  if (base.endsWith(".pptx")) return "PowerPoint";
  if (base.endsWith(".md")) return base.includes("audit") ? "監査MD" : base.includes("azure-meter") ? "Azure明細MD" : "Markdown";
  if (base.endsWith(".json")) return "JSON";
  return "File";
}

async function copyDir(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function copyOutputs() {
  const copied = [];
  async function walk(sourceDir, relativeDir = "") {
    let entries = [];
    try {
      entries = await fs.readdir(sourceDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "presentations") continue;
      const sourcePath = path.join(sourceDir, entry.name);
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await walk(sourcePath, relativePath);
      } else if (/\.(md|xlsx|pptx|json)$/i.test(entry.name) && !entry.name.startsWith("artifact-build-manifest")) {
        const targetPath = path.join(DOCS_DIR, "outputs", relativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
        copied.push({ sourcePath, relativePath: relativePath.replaceAll(path.sep, "/") });
      }
    }
  }
  await walk(OUTPUT_DIR);
  return copied;
}

async function emptyDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;
    try {
      await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
    } catch {
      // Some managed sandboxes can create files but deny unlink. Existing files are overwritten below.
    }
  }
}

async function buildState(copiedOutputs) {
  const input = await readJson(path.join(ROOT, "sample-input.json"));
  const skuRows = await readCsv(path.join(ROOT, "sku_master.csv"));
  const snapshots = await readCsv(path.join(ROOT, "sku_price_snapshot.csv"));
  const existingLicenses = (await readCsv(path.join(ROOT, "existing_licenses.csv"))).map(normalizeExistingLicense);
  const fxRate = numberOrNull(input.estimate?.fx_rate_usd_jpy) ?? 155.2;
  const snapshotMap = latestSnapshotsBySku(snapshots, fxRate);
  const skuCatalog = skuRows.map((sku) => {
    const snapshot = snapshotMap.get(sku.sku_id);
    return {
      sku_id: sku.sku_id,
      service_category: sku.service_category,
      product_name: sku.product_name,
      sku_name: sku.sku_name,
      billing_unit: sku.billing_unit,
      quantity_driver: sku.quantity_driver,
      price_source_type: sku.price_source_type,
      official_source_url: sku.official_source_url,
      default_currency: sku.default_currency,
      pricing_region: sku.pricing_region,
      unit_price_usd: snapshot?.priceUsd ?? null,
      unit_price_jpy: snapshot?.priceJpy ?? null,
      captured_at: snapshot?.captured_at ?? null,
      confidence: snapshot?.confidence ?? "",
    };
  });

  const outputs = copiedOutputs
    .map(({ sourcePath, relativePath }) => {
      const stat = fsSync.statSync(sourcePath);
      return {
        name: path.basename(sourcePath),
        relative: `outputs/${relativePath}`,
        kind: artifactKind(sourcePath),
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        downloadUrl: `outputs/${relativePath}`,
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

  return {
    estimate: {
      ...input.estimate,
      pricing_as_of_label: "2026-06-14 09:00 +09:00",
      fx_as_of_label: "2026-06-12 09:00 +09:00",
    },
    requirements: input.requirements,
    skuCatalog,
    existingLicenses,
    lines: [],
    metrics: {},
    audit: null,
    azureMeter: null,
    outputs,
    job: {
      status: "static",
      startedAt: null,
      finishedAt: null,
      steps: [],
      error: null,
    },
  };
}

await emptyDir(DOCS_DIR);
await fs.mkdir(path.join(DOCS_DIR, "data"), { recursive: true });
await copyDir(PUBLIC_DIR, DOCS_DIR);
const copiedOutputs = await copyOutputs();
const state = await buildState(copiedOutputs);
await fs.writeFile(path.join(DOCS_DIR, "data", "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(DOCS_DIR, ".nojekyll"), "", "utf8");
console.log(JSON.stringify({
  status: "ok",
  docs: path.relative(ROOT, DOCS_DIR),
  outputs: copiedOutputs.length,
}, null, 2));
