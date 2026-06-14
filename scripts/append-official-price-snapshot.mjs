import fs from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_HEADERS = [
  "snapshot_id",
  "sku_id",
  "captured_at",
  "price_usd",
  "fx_rate_usd_jpy",
  "price_jpy",
  "source_type",
  "source_url",
  "confidence",
  "effective_start_date",
  "change_note",
];

function usage() {
  return [
    "Usage:",
    "  node .\\scripts\\append-official-price-snapshot.mjs --sku-id <sku> --price-usd <price> --fx-rate <rate> --source-url <url> [options]",
    "",
    "Options:",
    "  --sku-id <sku>              Target sku_id in sku_price_snapshot.csv",
    "  --price-usd <price>         Official USD unit price",
    "  --fx-rate <rate>            USD/JPY conversion rate",
    "  --source-url <url>          Official Microsoft pricing page URL",
    "  --sku-master <csv>          Defaults to sku_master.csv",
    "  --snapshot-csv <csv>        Defaults to sku_price_snapshot.csv",
    "  --captured-at <datetime>    Defaults to current UTC ISO timestamp",
    "  --snapshot-id <id>          Defaults to OFFICIAL-SNAP-{timestamp}-{sku}",
    "  --source-type <type>        Defaults to official_page",
    "  --confidence <value>        Defaults to Medium",
    "  --effective-start-date <d>  Optional effective_start_date",
    "  --note <text>               Optional change_note",
    "  --dry-run                   Print row but do not write",
    "",
    "Notes:",
    "  This script assumes the price was checked manually from an official Microsoft pricing source.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected positional argument: ${key}`);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = next;
      i += 1;
    }
  }
  return args;
}

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

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowToCsv(row) {
  return SNAPSHOT_HEADERS.map((header) => csvCell(row[header])).join(",");
}

function numberValue(value, field) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric ${field}: ${value}`);
  return parsed;
}

function compactIdPart(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function defaultSnapshotId(skuId, capturedAt) {
  const datePart = capturedAt.replace(/[^0-9]/g, "").slice(0, 14);
  return `OFFICIAL-SNAP-${datePart}-${compactIdPart(skuId)}`;
}

async function readSku(skuMasterPath, skuId) {
  const rows = parseCsv(await fs.readFile(skuMasterPath, "utf8"));
  const sku = rows.find((row) => row.sku_id === skuId);
  if (!sku) throw new Error(`SKU not found in ${skuMasterPath}: ${skuId}`);
  return sku;
}

function buildSnapshotRow(args, sku) {
  const capturedAt = args["captured-at"] || new Date().toISOString();
  const priceUsd = numberValue(args["price-usd"], "price-usd");
  const fxRate = numberValue(args["fx-rate"], "fx-rate");
  const priceJpy = priceUsd * fxRate;
  const sourceType = args["source-type"] || "official_page";
  const note = args.note || `Official price snapshot for ${sku.product_name} / ${sku.sku_name}. Confirm contract terms, tax, discounts, and regional availability separately.`;

  return {
    snapshot_id: args["snapshot-id"] || defaultSnapshotId(args["sku-id"], capturedAt),
    sku_id: args["sku-id"],
    captured_at: capturedAt,
    price_usd: priceUsd.toFixed(6).replace(/\.?0+$/, ""),
    fx_rate_usd_jpy: fxRate.toString(),
    price_jpy: priceJpy.toFixed(6).replace(/\.?0+$/, ""),
    source_type: sourceType,
    source_url: args["source-url"],
    confidence: args.confidence || "Medium",
    effective_start_date: args["effective-start-date"] || "",
    change_note: note,
  };
}

async function appendSnapshot(snapshotCsv, row) {
  let existing = "";
  try {
    existing = await fs.readFile(snapshotCsv, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const needsHeader = existing.trim().length === 0;
  const prefix = needsHeader ? `${SNAPSHOT_HEADERS.join(",")}\n` : existing.endsWith("\n") ? "" : "\n";
  await fs.mkdir(path.dirname(snapshotCsv), { recursive: true });
  await fs.appendFile(snapshotCsv, `${prefix}${rowToCsv(row)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }
  for (const required of ["sku-id", "price-usd", "fx-rate", "source-url"]) {
    if (!args[required]) throw new Error(`Missing required --${required}.\n\n${usage()}`);
  }

  const skuMasterPath = path.resolve(args["sku-master"] || "sku_master.csv");
  const snapshotCsv = path.resolve(args["snapshot-csv"] || "sku_price_snapshot.csv");
  const sku = await readSku(skuMasterPath, args["sku-id"]);
  const snapshotRow = buildSnapshotRow(args, sku);

  if (!args["dry-run"]) {
    await appendSnapshot(snapshotCsv, snapshotRow);
  }

  console.log(JSON.stringify({
    dryRun: Boolean(args["dry-run"]),
    skuMasterPath,
    snapshotCsv,
    sku: {
      sku_id: sku.sku_id,
      product_name: sku.product_name,
      sku_name: sku.sku_name,
      expected_source_type: sku.price_source_type,
    },
    snapshotRow,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
