import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "app", "public");
const OUTPUT_DIR = path.join(ROOT, "outputs");
const DEFAULT_PORT = Number(process.env.PORT || 4317);

const EXISTING_LICENSE_HEADERS = [
  "existing_license_id",
  "license_name",
  "product_name",
  "sku_name",
  "quantity",
  "assigned_scope",
  "applicable_services",
  "notes",
];

const HARD_CODED_RULES = [
  {
    sku_id: "SKU-M365-E3",
    keywords: ["microsoft 365", "m365", "sharepoint", "teams", "office", "document", "文書", "ナレッジ", "portal"],
  },
  {
    sku_id: "SKU-POWERAPPS-PREMIUM",
    keywords: ["power apps", "dataverse", "business app", "業務アプリ", "フォーム", "入力画面", "申請"],
  },
  {
    sku_id: "SKU-POWERAUTOMATE-PREMIUM",
    keywords: ["power automate", "workflow", "flow", "承認", "ワークフロー", "自動化", "通知", "連携"],
  },
  {
    sku_id: "SKU-COPILOTSTUDIO-MESSAGES",
    keywords: ["copilot studio", "agent", "bot", "chat", "エージェント", "チャット", "対話"],
  },
  {
    sku_id: "SKU-POWERBI-PRO",
    keywords: ["power bi", "report", "dashboard", "bi", "レポート", "ダッシュボード", "可視化", "kpi"],
  },
  {
    sku_id: "SKU-DATAVERSE-CAPACITY",
    keywords: ["dataverse", "database", "データベース", "構造化データ"],
  },
  {
    sku_id: "SKU-AZURE-OPENAI-TOKENS",
    keywords: ["azure openai", "openai", "summarization", "生成ai", "ai", "要約", "rag", "検索", "ドラフト"],
  },
  {
    sku_id: "SKU-AZURE-FUNCTIONS",
    keywords: ["azure functions", "functions", "api", "batch", "job", "外部連携", "バッチ", "ジョブ"],
  },
  {
    sku_id: "SKU-AZURE-MONITOR",
    keywords: ["azure monitor", "monitoring", "audit", "log", "監査", "監視", "ログ", "アラート"],
  },
  {
    sku_id: "SKU-ENTRA-ID-P1",
    keywords: ["entra", "authentication", "sso", "認証", "条件付きアクセス", "id管理"],
  },
  {
    sku_id: "SKU-DEFENDER-BUSINESS",
    keywords: ["defender", "endpoint", "security", "セキュリティ", "端末", "脅威対策"],
  },
];

let lastJob = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  steps: [],
  error: null,
};

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = csvText.replace(/^\uFEFF/, "");

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

function csvCell(value) {
  const raw = Array.isArray(value) ? value.join(";") : String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function stringifyCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n") + "\n";
}

async function writeExistingLicenses(licenses) {
  const rows = (licenses ?? []).map((license, index) => ({
    existing_license_id: license.existing_license_id || `EL-${String(index + 1).padStart(3, "0")}`,
    license_name: license.license_name ?? "",
    product_name: license.product_name ?? "",
    sku_name: license.sku_name ?? "",
    quantity: numberOrNull(license.quantity) ?? 0,
    assigned_scope: license.assigned_scope ?? "",
    applicable_services: Array.isArray(license.applicable_services)
      ? license.applicable_services.join(";")
      : license.applicable_services ?? "",
    notes: license.notes ?? "",
  }));
  await fs.writeFile(
    path.join(ROOT, "existing_licenses.csv"),
    stringifyCsv(EXISTING_LICENSE_HEADERS, rows),
    "utf8"
  );
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, "");
}

function capabilityText(requirements) {
  return [
    requirements.business_purpose,
    requirements.proposal_intent,
    ...(requirements.required_capabilities ?? []),
  ].join(" ").toLowerCase();
}

function matchesAny(textValue, patterns = []) {
  return patterns.some((pattern) => textValue.includes(String(pattern).toLowerCase()));
}

function matchesAll(textValue, patterns = []) {
  return patterns.every((pattern) => textValue.includes(String(pattern).toLowerCase()));
}

function selectSkuIds(input, skuRules) {
  const textValue = capabilityText(input.requirements ?? {});
  const selected = new Set();

  for (const rule of skuRules.rules ?? []) {
    if (!rule.sku_id) continue;
    if (Array.isArray(rule.exclude_any) && matchesAny(textValue, rule.exclude_any)) continue;
    const anyOk = !Array.isArray(rule.match_any) || rule.match_any.length === 0 || matchesAny(textValue, rule.match_any);
    const allOk = !Array.isArray(rule.match_all) || rule.match_all.length === 0 || matchesAll(textValue, rule.match_all);
    if (anyOk && allOk) selected.add(rule.sku_id);
  }

  for (const rule of HARD_CODED_RULES) {
    if (matchesAny(textValue, rule.keywords)) selected.add(rule.sku_id);
  }

  if (selected.size === 0) {
    selected.add("SKU-M365-E3");
    selected.add("SKU-COPILOTSTUDIO-MESSAGES");
    selected.add("SKU-AZURE-OPENAI-TOKENS");
    selected.add("SKU-AZURE-MONITOR");
  }

  return [...selected];
}

function latestSnapshotsBySku(snapshots, fxRate) {
  const grouped = new Map();
  for (const snapshot of snapshots) {
    if (!grouped.has(snapshot.sku_id)) grouped.set(snapshot.sku_id, []);
    grouped.get(snapshot.sku_id).push(snapshot);
  }
  const latest = new Map();
  for (const [skuId, rows] of grouped.entries()) {
    const sorted = rows
      .map((row) => {
        const priceUsd = numberOrNull(row.price_usd);
        const rowFx = numberOrNull(row.fx_rate_usd_jpy) ?? fxRate;
        const priceJpy = numberOrNull(row.price_jpy) ?? (priceUsd === null ? null : priceUsd * rowFx);
        return { ...row, priceUsd, fxRate: rowFx, priceJpy };
      })
      .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
    latest.set(skuId, sorted.at(-1));
  }
  return latest;
}

function normalizeExistingLicense(row) {
  const applicableServices = Array.isArray(row.applicable_services)
    ? row.applicable_services
    : String(row.applicable_services ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean);
  return {
    ...row,
    quantity: numberOrNull(row.quantity) ?? row.quantity,
    applicable_services: applicableServices,
  };
}

function matchingExistingQuantity(sku, existingLicenses) {
  const product = normalize(sku.product_name);
  const skuName = normalize(sku.sku_name);
  return existingLicenses.reduce((sum, license) => {
    const licenseProduct = normalize(license.product_name);
    const licenseSku = normalize(license.sku_name);
    const licenseName = normalize(license.license_name);
    const productMatches = product && (licenseProduct.includes(product) || product.includes(licenseProduct));
    const skuMatches = skuName && (licenseSku === skuName || licenseName.includes(skuName));
    return productMatches && skuMatches ? sum + (numberOrNull(license.quantity) ?? 0) : sum;
  }, 0);
}

function quantityForSku(sku, input, existingLicenses) {
  const req = input.requirements ?? {};
  const usage = req.monthly_usage_assumptions ?? {};
  const existingPowerBi = existingLicenses
    .filter((license) => normalize(license.product_name).includes("powerbi"))
    .reduce((sum, license) => sum + (numberOrNull(license.quantity) ?? 0), 0);
  const values = {
    user_count: req.user_count,
    maker_or_app_user_count: req.user_count ?? req.maker_count,
    flow_owner_or_premium_user_count: Math.max(req.maker_count ?? 0, req.admin_count ?? 0, 1),
    copilot_studio_messages: Math.max(Math.ceil((usage.copilot_studio_messages ?? 25000) / 25000), 1),
    power_bi_user_count: (req.power_bi_viewer_count ?? existingPowerBi) || req.maker_count || req.user_count,
    dataverse_storage_gb: usage.dataverse_storage_gb ?? 0,
    azure_openai_tokens: 1,
    log_ingestion_gb: usage.log_ingestion_gb ?? 1,
    function_execution_units_10: Math.max(Math.ceil((usage.function_executions ?? 30000) / 10), 1),
  };
  return numberOrNull(values[sku.quantity_driver]) ?? 1;
}

function azureOpenAiMonthlyUsd(input) {
  const usage = input.requirements?.monthly_usage_assumptions ?? {};
  const azure = usage.azure_openai ?? {};
  const inputTokens = numberOrNull(azure.input_tokens ?? usage.azure_openai_input_tokens) ?? 0;
  const outputTokens = numberOrNull(azure.output_tokens ?? usage.azure_openai_output_tokens) ?? 0;
  const inputUnit = numberOrNull(azure.input_unit_price_usd_per_1k_tokens) ?? 0.00015;
  const outputUnit = numberOrNull(azure.output_unit_price_usd_per_1k_tokens) ?? 0.0006;
  return (inputTokens / 1000) * inputUnit + (outputTokens / 1000) * outputUnit;
}

function buildEstimateLines(input, skuRows, snapshots, skuRules, existingLicenses) {
  const fxRate = numberOrNull(input.estimate?.fx_rate_usd_jpy) ?? 1;
  const snapshotMap = latestSnapshotsBySku(snapshots, fxRate);
  const skuById = new Map(skuRows.filter((sku) => sku.is_active !== "false").map((sku) => [sku.sku_id, sku]));

  return selectSkuIds(input, skuRules)
    .map((skuId) => {
      const sku = skuById.get(skuId);
      if (!sku) return null;
      const requiredQuantity = quantityForSku(sku, input, existingLicenses);
      const existingQuantity = matchingExistingQuantity(sku, existingLicenses);
      const additionalQuantity = Math.max(requiredQuantity - existingQuantity, 0);
      const snapshot = snapshotMap.get(skuId);

      let unitPriceUsd = snapshot?.priceUsd ?? null;
      let monthlyUsd = unitPriceUsd === null ? null : unitPriceUsd * additionalQuantity;
      let status = additionalQuantity <= 0 ? "既存で充足" : sku.price_source_type === "azure_retail_api" ? "従量課金見込み" : "追加購入見込み";

      if (skuId === "SKU-AZURE-OPENAI-TOKENS") {
        unitPriceUsd = azureOpenAiMonthlyUsd(input);
        monthlyUsd = unitPriceUsd;
        status = "従量課金見込み";
      }

      if (skuId === "SKU-ENTRA-ID-P1") {
        const m365Covered = Math.max(
          matchingExistingQuantity({ product_name: "Microsoft 365", sku_name: "E3" }, existingLicenses),
          selectSkuIds(input, skuRules).includes("SKU-M365-E3") ? input.requirements?.user_count ?? 0 : 0
        );
        if (m365Covered >= requiredQuantity) {
          monthlyUsd = 0;
          status = "M365 E3に含む前提";
        }
      }

      const monthlyJpy = monthlyUsd === null ? null : monthlyUsd * fxRate;
      return {
        sku_id: skuId,
        service_category: sku.service_category,
        product_name: sku.product_name,
        sku_name: sku.sku_name,
        billing_unit: sku.billing_unit,
        required_quantity: requiredQuantity,
        existing_quantity: existingQuantity,
        additional_quantity: monthlyUsd === 0 ? 0 : additionalQuantity,
        unit_price_usd: unitPriceUsd,
        monthly_usd: monthlyUsd,
        annual_usd: monthlyUsd === null ? null : monthlyUsd * 12,
        monthly_jpy: monthlyJpy,
        annual_jpy: monthlyJpy === null ? null : monthlyJpy * 12,
        source_type: snapshot?.source_type ?? sku.price_source_type,
        confidence: snapshot?.confidence ?? "",
        status,
      };
    })
    .filter(Boolean);
}

function buildSkuCatalog(input, skuRows, snapshots) {
  const fxRate = numberOrNull(input.estimate?.fx_rate_usd_jpy) ?? 1;
  const snapshotMap = latestSnapshotsBySku(snapshots, fxRate);
  return skuRows
    .filter((sku) => sku.is_active !== "false")
    .map((sku) => {
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
}

function sumKnown(lines, key) {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line[key]) ? line[key] : 0), 0);
}

function formatDate(value) {
  if (!value) return "";
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  return raw;
}

async function listFilesRecursive(dir) {
  const results = [];
  async function walk(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!["presentations"].includes(entry.name)) await walk(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results;
}

function artifactKind(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith(".xlsx")) return "Excel";
  if (base.endsWith(".pptx")) return "PowerPoint";
  if (base.endsWith(".md")) return base.includes("audit") ? "監査MD" : base.includes("azure-meter") ? "Azure明細MD" : "Markdown";
  if (base.endsWith(".json")) return "JSON";
  if (base.endsWith(".csv")) return "CSV";
  return "File";
}

async function outputsList() {
  const files = await listFilesRecursive(OUTPUT_DIR);
  return files
    .filter((filePath) => /\.(md|xlsx|pptx|json)$/i.test(filePath))
    .filter((filePath) => !path.basename(filePath).startsWith("artifact-build-manifest"))
    .map((filePath) => {
      const stat = fsSync.statSync(filePath);
      const relative = path.relative(ROOT, filePath).replaceAll(path.sep, "/");
      return {
        name: path.basename(filePath),
        relative,
        kind: artifactKind(filePath),
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        downloadUrl: `/download?file=${encodeURIComponent(relative)}`,
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

async function statePayload() {
  const input = await readJson(path.join(ROOT, "sample-input.json"));
  const skuRows = await readCsv(path.join(ROOT, "sku_master.csv"));
  const snapshots = await readCsv(path.join(ROOT, "sku_price_snapshot.csv"));
  const skuRules = await readJson(path.join(ROOT, "rules", "sku-selection-rules.json"));
  const existingLicenses = (await readCsv(path.join(ROOT, "existing_licenses.csv")))
    .map(normalizeExistingLicense)
    .filter((license) => license.product_name || license.license_name);
  const lines = buildEstimateLines(input, skuRows, snapshots, skuRules, existingLicenses);
  const audit = await readJsonSafe(path.join(OUTPUT_DIR, "price-source-audit-20260614.json"), { summary: null });
  const azureMeter = await readJsonSafe(path.join(OUTPUT_DIR, "azure-meter-estimate-20260614.json"), { summary: null });

  return {
    estimate: {
      ...input.estimate,
      pricing_as_of_label: formatDate(input.estimate?.pricing_as_of),
      fx_as_of_label: formatDate(input.estimate?.fx_as_of),
    },
    requirements: input.requirements,
    skuCatalog: buildSkuCatalog(input, skuRows, snapshots),
    existingLicenses,
    metrics: {
      monthly_usd: sumKnown(lines, "monthly_usd"),
      annual_usd: sumKnown(lines, "annual_usd"),
      monthly_jpy: sumKnown(lines, "monthly_jpy"),
      annual_jpy: sumKnown(lines, "annual_jpy"),
      selected_sku_count: lines.length,
      additional_sku_count: lines.filter((line) => line.additional_quantity > 0 && line.monthly_usd > 0).length,
      sample_price_count: lines.filter((line) => String(line.source_type).includes("sample")).length,
      ready_price_sources: audit?.summary?.ready ?? null,
      azure_meter_monthly_usd: azureMeter?.summary?.total_monthly_usd ?? null,
    },
    lines,
    audit: audit?.summary ?? null,
    azureMeter: azureMeter?.summary ?? null,
    outputs: await outputsList(),
    job: lastJob,
  };
}

function runStep(label, script, args = [], envExtra = {}) {
  const startedAt = new Date().toISOString();
  const command = ["node", script, ...args].join(" ");
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: process.env.HOME || process.env.USERPROFILE || "C:\\Users\\kazuki.yoshioka",
      ...envExtra,
    },
  });
  const step = {
    label,
    command,
    status: result.status === 0 ? "ok" : "failed",
    startedAt,
    finishedAt: new Date().toISOString(),
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  lastJob.steps.push(step);
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  return step;
}

async function generateArtifacts(options = {}) {
  const formats = new Set(options.formats ?? ["markdown", "excel", "pptx", "azureMeter", "audit"]);
  lastJob = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [],
    error: null,
  };

  try {
    const existingArgs = ["--existing-licenses", path.join(ROOT, "existing_licenses.csv")];
    if (formats.has("markdown")) runStep("Markdownレポート", "scripts/generate-report.mjs", existingArgs);
    if (formats.has("excel")) runStep("Excelブック", "scripts/generate-excel.mjs", existingArgs);
    if (formats.has("pptx")) runStep("PowerPointサマリー", "scripts/generate-powerpoint-summary.mjs", existingArgs);
    if (formats.has("azureMeter")) runStep("Azure明細評価", "scripts/evaluate-azure-meter-rules.mjs");
    if (formats.has("audit")) {
      runStep("価格ソース監査", "scripts/audit-price-sources.mjs", [
        "--out", path.join(OUTPUT_DIR, "price-source-audit-20260614.md"),
        "--json-out", path.join(OUTPUT_DIR, "price-source-audit-20260614.json"),
        "--as-of", "2026-06-14T09:30:00+09:00",
      ]);
    }
    if (formats.has("batch")) runStep("バッチ生成", "scripts/generate-batch.mjs", existingArgs);
    lastJob.status = "ok";
  } catch (error) {
    lastJob.status = "failed";
    lastJob.error = error.message || String(error);
  } finally {
    lastJob.finishedAt = new Date().toISOString();
  }
  return lastJob;
}

async function updateInput(payload) {
  const inputPath = path.join(ROOT, "sample-input.json");
  const input = await readJson(inputPath);
  const req = input.requirements ?? {};
  const usage = req.monthly_usage_assumptions ?? {};
  const azureOpenAi = usage.azure_openai ?? {};
  const now = new Date().toISOString();

  const next = {
    ...input,
    estimate: {
      ...input.estimate,
      project_name: payload.project_name ?? input.estimate?.project_name,
      estimate_purpose: payload.estimate_purpose ?? input.estimate?.estimate_purpose ?? "提案前概算",
      fx_rate_usd_jpy: numberOrNull(payload.fx_rate_usd_jpy) ?? input.estimate?.fx_rate_usd_jpy,
      status: "draft",
      updated_at: now,
    },
    requirements: {
      ...req,
      business_purpose: payload.business_purpose ?? req.business_purpose,
      proposal_intent: payload.proposal_intent ?? req.proposal_intent,
      user_count: numberOrNull(payload.user_count) ?? req.user_count,
      maker_count: numberOrNull(payload.maker_count) ?? req.maker_count,
      admin_count: numberOrNull(payload.admin_count) ?? req.admin_count,
      power_bi_viewer_count: numberOrNull(payload.power_bi_viewer_count) ?? req.power_bi_viewer_count,
      architecture: payload.architecture ?? req.architecture,
      assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : req.assumptions,
      nfr: Array.isArray(payload.nfr) ? payload.nfr : req.nfr,
      required_capabilities: Array.isArray(payload.required_capabilities)
        ? payload.required_capabilities.map((item) => String(item).trim()).filter(Boolean)
        : req.required_capabilities,
      monthly_usage_assumptions: {
        ...usage,
        copilot_studio_messages: numberOrNull(payload.copilot_studio_messages) ?? usage.copilot_studio_messages,
        dataverse_storage_gb: numberOrNull(payload.dataverse_storage_gb) ?? usage.dataverse_storage_gb,
        log_ingestion_gb: numberOrNull(payload.log_ingestion_gb) ?? usage.log_ingestion_gb,
        azure_openai: {
          ...azureOpenAi,
          input_tokens: numberOrNull(payload.azure_openai_input_tokens) ?? azureOpenAi.input_tokens,
          output_tokens: numberOrNull(payload.azure_openai_output_tokens) ?? azureOpenAi.output_tokens,
          estimated_monthly_usd: azureOpenAiMonthlyUsd({
            requirements: {
              monthly_usage_assumptions: {
                azure_openai: {
                  ...azureOpenAi,
                  input_tokens: numberOrNull(payload.azure_openai_input_tokens) ?? azureOpenAi.input_tokens,
                  output_tokens: numberOrNull(payload.azure_openai_output_tokens) ?? azureOpenAi.output_tokens,
                },
              },
            },
          }),
        },
        azure_openai_input_tokens: numberOrNull(payload.azure_openai_input_tokens) ?? usage.azure_openai_input_tokens,
        azure_openai_output_tokens: numberOrNull(payload.azure_openai_output_tokens) ?? usage.azure_openai_output_tokens,
      },
    },
  };

  await fs.writeFile(inputPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  if (Array.isArray(payload.existing_licenses)) await writeExistingLicenses(payload.existing_licenses);
  return next;
}

function safeOutputPath(relative) {
  const decoded = String(relative || "");
  const absolute = path.resolve(ROOT, decoded);
  if (!absolute.startsWith(OUTPUT_DIR + path.sep)) {
    throw new Error("Download path must stay inside outputs.");
  }
  return absolute;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }[ext] ?? "application/octet-stream";
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    text(res, 403, "Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(body);
  } catch {
    text(res, 404, "Not found");
  }
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      json(res, 200, await statePayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/input") {
      const payload = await readRequestJson(req);
      await updateInput(payload);
      json(res, 200, await statePayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const payload = await readRequestJson(req);
      const job = await generateArtifacts(payload);
      json(res, job.status === "ok" ? 200 : 500, { job, state: await statePayload() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/download") {
      const filePath = safeOutputPath(url.searchParams.get("file"));
      const fileName = path.basename(filePath);
      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        "content-type": contentType(filePath),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      });
      res.end(body);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(req, res, url.pathname);
      return;
    }
    text(res, 405, "Method not allowed");
  } catch (error) {
    json(res, 500, { error: error.message || String(error) });
  }
}

function listenWithRetry(server, port, maxPort) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < maxPort) {
      listenWithRetry(server, port + 1, maxPort);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    console.log(JSON.stringify({
      status: "listening",
      url: `http://127.0.0.1:${address.port}`,
      root: ROOT,
    }, null, 2));
  });
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const server = http.createServer((req, res) => {
  handle(req, res);
});
listenWithRetry(server, DEFAULT_PORT, DEFAULT_PORT + 10);
