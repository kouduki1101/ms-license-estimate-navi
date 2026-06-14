import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function readCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUsd(value) {
  const number = numberOrNull(value);
  if (number === null) return "TBD";
  return `$${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function formatDate(value) {
  if (!value) return "TBD";
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function latestSnapshotsBySku(snapshots) {
  const grouped = new Map();
  for (const snapshot of snapshots) {
    if (!grouped.has(snapshot.sku_id)) grouped.set(snapshot.sku_id, []);
    grouped.get(snapshot.sku_id).push(snapshot);
  }

  const latest = new Map();
  for (const [skuId, rows] of grouped.entries()) {
    latest.set(skuId, [...rows].sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at)).at(-1));
  }
  return latest;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || Number.isNaN(fromDate.getTime())) return null;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function classifyPriceSource(sku, snapshot, asOfDate, staleDays) {
  if (!snapshot) {
    return {
      status: "missing_snapshot",
      severity: "High",
      action: "sku_price_snapshot.csvに価格スナップショットを追加する。",
      ageDays: null,
    };
  }

  const sourceType = String(snapshot.source_type ?? "");
  const sourceUrl = String(snapshot.source_url ?? "");
  const confidence = String(snapshot.confidence ?? "");
  const ageDays = daysBetween(new Date(snapshot.captured_at), asOfDate);
  const isSample = sourceType.includes("sample") || sourceUrl.startsWith("local://");
  const isOfficial = ["official_page", "azure_retail_api"].includes(sourceType) && !sourceUrl.startsWith("local://");
  const isStale = ageDays !== null && ageDays > staleDays;

  if (isSample) {
    return {
      status: "sample_price",
      severity: "High",
      action: sku.price_source_type === "azure_retail_api"
        ? "Azure Retail Prices APIから候補CSVを取得し、確認後にスナップショットへ追記する。"
        : "Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。",
      ageDays,
    };
  }

  if (!isOfficial) {
    return {
      status: "unverified_source",
      severity: "Medium",
      action: "source_type/source_url/confidenceを確認し、公式ソースとして扱えるか見直す。",
      ageDays,
    };
  }

  if (confidence.toLowerCase() === "low") {
    return {
      status: "low_confidence",
      severity: "Medium",
      action: "公式ソースの確認結果を再レビューし、confidenceを更新する。",
      ageDays,
    };
  }

  if (isStale) {
    return {
      status: "stale_official_price",
      severity: "Medium",
      action: `${staleDays}日を超えているため、公式価格を再確認してスナップショットを更新する。`,
      ageDays,
    };
  }

  return {
    status: "ready",
    severity: "Low",
    action: "現時点では追加対応不要。",
    ageDays,
  };
}

function buildAuditRows(skuRows, snapshots, asOfDate, staleDays) {
  const latestMap = latestSnapshotsBySku(snapshots);
  return skuRows
    .filter((sku) => sku.is_active !== "false")
    .map((sku) => {
      const snapshot = latestMap.get(sku.sku_id);
      const classification = classifyPriceSource(sku, snapshot, asOfDate, staleDays);
      return {
        sku_id: sku.sku_id,
        service_category: sku.service_category,
        product_name: sku.product_name,
        sku_name: sku.sku_name,
        expected_source_type: sku.price_source_type,
        latest_source_type: snapshot?.source_type ?? "",
        latest_source_url: snapshot?.source_url ?? "",
        latest_captured_at: snapshot?.captured_at ?? "",
        latest_price_usd: snapshot?.price_usd ?? "",
        confidence: snapshot?.confidence ?? "",
        status: classification.status,
        severity: classification.severity,
        age_days: classification.ageDays,
        action: classification.action,
      };
    });
}

function summarize(rows) {
  const counts = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return {
    total: rows.length,
    ready: counts.ready ?? 0,
    needs_action: rows.filter((row) => row.status !== "ready").length,
    by_status: counts,
  };
}

function renderMarkdown(rows, summary, asOfDate, staleDays) {
  const lines = [];
  lines.push("# 価格ソース監査レポート");
  lines.push("");
  lines.push(`- 監査日時: ${formatDate(asOfDate.toISOString())}`);
  lines.push(`- stale判定: 最新スナップショットが${staleDays}日超の場合に要再確認`);
  lines.push(`- 対象SKU: ${summary.total}`);
  lines.push(`- 対応必要: ${summary.needs_action}`);
  lines.push("");
  lines.push("## ステータス集計");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("|---|---:|");
  for (const [status, count] of Object.entries(summary.by_status).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${escapeMd(status)} | ${count} |`);
  }
  lines.push("");
  lines.push("## SKU別監査");
  lines.push("");
  lines.push("| Severity | Status | SKU ID | Product | SKU | Source Type | Captured At | USD | Confidence | Action |");
  lines.push("|---|---|---|---|---|---|---|---:|---|---|");
  for (const row of rows) {
    lines.push([
      row.severity,
      row.status,
      row.sku_id,
      row.product_name,
      row.sku_name,
      row.latest_source_type || "TBD",
      formatDate(row.latest_captured_at),
      formatUsd(row.latest_price_usd),
      row.confidence || "TBD",
      row.action,
    ].map(escapeMd).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  lines.push("## 次アクション");
  lines.push("");
  if (summary.needs_action === 0) {
    lines.push("現時点で価格ソース起因の対応は不要。次回見積時、または価格基準日を更新するタイミングで再監査する。");
  } else {
    lines.push("1. `sample_price` のSKUを公式価格で置き換える。");
    lines.push("2. Azure系SKUは `fetch-azure-retail-prices.mjs` で候補CSVを作り、`append-azure-price-snapshot.mjs` で追記する。");
    lines.push("3. Microsoft 365 / Power Platform / Security系SKUは公式価格ページ確認後、`official_page` として `sku_price_snapshot.csv` に追記する。");
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skuMasterPath = path.resolve(args["sku-master"] || path.join(ROOT, "sku_master.csv"));
  const snapshotPath = path.resolve(args["price-snapshots"] || path.join(ROOT, "sku_price_snapshot.csv"));
  const outPath = args.out ? path.resolve(args.out) : null;
  const jsonOutPath = args["json-out"] ? path.resolve(args["json-out"]) : null;
  const staleDays = numberOrNull(args["stale-days"]) ?? 90;
  const asOfDate = args["as-of"] ? new Date(args["as-of"]) : new Date();
  if (Number.isNaN(asOfDate.getTime())) throw new Error(`Invalid --as-of date: ${args["as-of"]}`);

  const skuRows = await readCsv(skuMasterPath);
  const snapshots = await readCsv(snapshotPath);
  const rows = buildAuditRows(skuRows, snapshots, asOfDate, staleDays);
  const summary = summarize(rows);
  const markdown = renderMarkdown(rows, summary, asOfDate, staleDays);

  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, markdown, "utf8");
  }
  if (jsonOutPath) {
    await fs.mkdir(path.dirname(jsonOutPath), { recursive: true });
    await fs.writeFile(jsonOutPath, JSON.stringify({ summary, rows }, null, 2), "utf8");
  }

  console.log(JSON.stringify({
    skuMasterPath,
    snapshotPath,
    outPath,
    jsonOutPath,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
