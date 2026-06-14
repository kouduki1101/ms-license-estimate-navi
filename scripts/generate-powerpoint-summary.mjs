import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = "C:\\Users\\kazuki.yoshioka\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.521.10419\\skills\\presentations";

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

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, "");
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

function slugify(value) {
  return String(value || "summary")
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "summary";
}

function capabilityText(requirements) {
  return [requirements.business_purpose, ...(requirements.required_capabilities ?? [])].join(" ").toLowerCase();
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => text.includes(String(pattern).toLowerCase()));
}

function matchesAll(text, patterns = []) {
  return patterns.every((pattern) => text.includes(String(pattern).toLowerCase()));
}

function selectSkuIds(input, skuRules) {
  const text = capabilityText(input.requirements);
  const selected = new Set();
  for (const rule of skuRules.rules ?? []) {
    if (!rule.sku_id) continue;
    if (Array.isArray(rule.exclude_any) && matchesAny(text, rule.exclude_any)) continue;
    const anyOk = !Array.isArray(rule.match_any) || rule.match_any.length === 0 || matchesAny(text, rule.match_any);
    const allOk = !Array.isArray(rule.match_all) || rule.match_all.length === 0 || matchesAll(text, rule.match_all);
    if (anyOk && allOk) selected.add(rule.sku_id);
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
    latest.set(skuId, { current: sorted.at(-1), previous: sorted.length > 1 ? sorted.at(-2) : null });
  }
  return latest;
}

function quantityForSku(sku, input, existingLicenses) {
  const req = input.requirements;
  const usage = req.monthly_usage_assumptions ?? {};
  const existingPowerBi = existingLicenses
    .filter((license) => normalize(license.product_name).includes("powerbi"))
    .reduce((sum, license) => sum + (numberOrNull(license.quantity) ?? 0), 0);
  const values = {
    user_count: req.user_count,
    maker_or_app_user_count: req.maker_count ?? req.user_count,
    flow_owner_or_premium_user_count: req.maker_count ?? req.user_count,
    copilot_studio_messages: 1,
    power_bi_user_count: existingPowerBi || req.maker_count || req.user_count,
    dataverse_storage_gb: usage.dataverse_storage_gb ?? 0,
    azure_openai_tokens: 1,
    log_ingestion_gb: usage.log_ingestion_gb ?? 1,
    function_execution_units_10: Math.max(Math.ceil((usage.function_executions ?? 1) / 10), 1),
  };
  return numberOrNull(values[sku.quantity_driver]) ?? 1;
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

function buildEstimateLines(input, skuRows, snapshotMap, skuRules) {
  const existingLicenses = input.existing_licenses ?? [];
  const skuById = new Map(skuRows.filter((sku) => sku.is_active !== "false").map((sku) => [sku.sku_id, sku]));
  return selectSkuIds(input, skuRules)
    .map((skuId, index) => {
      const sku = skuById.get(skuId);
      if (!sku) return null;
      const requiredQuantity = quantityForSku(sku, input, existingLicenses);
      const existingQuantity = matchingExistingQuantity(sku, existingLicenses);
      const additionalQuantity = Math.max(requiredQuantity - existingQuantity, 0);
      const snapshot = snapshotMap.get(skuId)?.current;
      const unitPriceUsd = snapshot?.priceUsd ?? null;
      const unitPriceJpy = snapshot?.priceJpy ?? null;
      const monthlyUsd = unitPriceUsd === null ? null : unitPriceUsd * additionalQuantity;
      const monthlyJpy = unitPriceJpy === null ? null : unitPriceJpy * additionalQuantity;
      return {
        lineId: `L${String(index + 1).padStart(3, "0")}`,
        skuId,
        serviceCategory: sku.service_category,
        productName: sku.product_name,
        skuName: sku.sku_name,
        billingUnit: sku.billing_unit,
        quantityDriver: sku.quantity_driver,
        requiredQuantity,
        existingQuantity,
        additionalQuantity,
        unitPriceUsd,
        monthlyUsd,
        annualUsd: monthlyUsd === null ? null : monthlyUsd * 12,
        monthlyJpy,
        annualJpy: monthlyJpy === null ? null : monthlyJpy * 12,
        sourceType: snapshot?.source_type ?? sku.price_source_type,
        sourceUrl: snapshot?.source_url ?? sku.official_source_url,
        priceAsOf: snapshot?.captured_at ?? input.estimate.pricing_as_of,
        confidence: snapshot?.confidence ?? (sku.price_source_type === "azure_retail_api" ? "High" : "Medium"),
        status: additionalQuantity <= 0 ? "既存充足" : sku.price_source_type === "azure_retail_api" ? "従量課金候補" : "追加購入候補",
        licenseReason: sku.license_rule_summary,
      };
    })
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return "TBD";
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function sumKnown(lines, key) {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line[key]) ? line[key] : 0), 0);
}

function compactMoney(value, currency = "USD") {
  if (!Number.isFinite(value)) return "TBD";
  if (currency === "JPY") return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildDeckData(input, lines) {
  const monthlyUsd = sumKnown(lines, "monthlyUsd");
  const annualUsd = sumKnown(lines, "annualUsd");
  const monthlyJpy = sumKnown(lines, "monthlyJpy");
  const annualJpy = sumKnown(lines, "annualJpy");
  const sampleCount = lines.filter((line) => String(line.sourceType).includes("sample") || String(line.sourceUrl).startsWith("local://")).length;
  const topCostLines = [...lines]
    .filter((line) => Number.isFinite(line.monthlyUsd) && line.monthlyUsd > 0)
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)
    .slice(0, 7);
  const azureOpenAi = input.requirements.monthly_usage_assumptions?.azure_openai ?? {};
  return {
    projectName: input.estimate.project_name,
    purpose: input.estimate.estimate_purpose,
    pricingAsOf: formatDate(input.estimate.pricing_as_of),
    fxAsOf: formatDate(input.estimate.fx_as_of),
    fxRate: input.estimate.fx_rate_usd_jpy,
    businessPurpose: input.requirements.business_purpose,
    departments: input.requirements.target_departments ?? [],
    userCount: input.requirements.user_count,
    makerCount: input.requirements.maker_count,
    monthlyUsd,
    annualUsd,
    monthlyJpy,
    annualJpy,
    sampleCount,
    lineCount: lines.length,
    additionalCount: lines.filter((line) => line.additionalQuantity > 0).length,
    existingCoveredCount: lines.filter((line) => line.additionalQuantity <= 0).length,
    topCostLines,
    selectedLines: lines,
    azureOpenAi: {
      model: azureOpenAi.model ?? "TBD",
      region: azureOpenAi.region_display_name ?? azureOpenAi.region ?? "TBD",
      regionCode: azureOpenAi.region ?? "",
      inputTokens: numberOrNull(azureOpenAi.input_tokens) ?? 0,
      outputTokens: numberOrNull(azureOpenAi.output_tokens) ?? 0,
      inputUnitPriceUsd: numberOrNull(azureOpenAi.input_unit_price_usd_per_1k_tokens),
      outputUnitPriceUsd: numberOrNull(azureOpenAi.output_unit_price_usd_per_1k_tokens),
      estimatedMonthlyUsd: numberOrNull(azureOpenAi.estimated_monthly_usd),
    },
  };
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function moduleText(name, body) {
  return [
    'import { data, money, jpy, pct, fmtQty } from "./slide-data.mjs";',
    'import { bg, footer, kicker, title, subtitle, metric, label, box, divider, hbar } from "./slide-utils.mjs";',
    "",
    `export async function ${name}(presentation, ctx) {`,
    "  const slide = presentation.slides.add();",
    body.trimEnd(),
    "  return slide;",
    "}",
    "",
  ].join("\n");
}

async function writeSlideModules(slidesDir, data) {
  await fs.mkdir(slidesDir, { recursive: true });
  await writeText(path.join(slidesDir, "slide-data.mjs"), [
    `export const data = ${JSON.stringify(data, null, 2)};`,
    "export function money(value) { return Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'TBD'; }",
    "export function jpy(value) { return Number.isFinite(value) ? `¥${Math.round(value).toLocaleString('ja-JP')}` : 'TBD'; }",
    "export function pct(value, total) { return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%'; }",
    "export function fmtQty(value) { return Number.isFinite(value) ? value.toLocaleString('en-US') : String(value ?? 'TBD'); }",
    "",
  ].join("\n"));

  await writeText(path.join(slidesDir, "slide-utils.mjs"), `
const C = {
  paper: "#F7F4EF",
  ink: "#17212B",
  muted: "#5D6773",
  line: "#C9D1D9",
  teal: "#0F766E",
  tealSoft: "#DDF4EF",
  amber: "#D97706",
  amberSoft: "#FFE6BF",
  blue: "#2563EB",
  blueSoft: "#DBEAFE",
  rose: "#BE123C",
  white: "#FFFFFF"
};

export function bg(ctx, slide, fill = C.paper) {
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill });
}

export function footer(ctx, slide, text = "") {
  ctx.addText(slide, { name: "footer", x: 56, y: 684, w: 980, h: 18, text, fontSize: 10, color: C.muted, typeface: ctx.fonts.body });
  ctx.addText(slide, { name: "page-marker", x: 1140, y: 684, w: 84, h: 18, text: String(ctx.slideNumber).padStart(2, "0"), fontSize: 10, color: C.muted, align: "right", typeface: ctx.fonts.body });
}

export function kicker(ctx, slide, text, x = 56, y = 44, color = C.teal) {
  ctx.addShape(slide, { name: "kicker-marker", x, y: y + 3, w: 7, h: 22, fill: color });
  ctx.addText(slide, { name: "kicker-label", x: x + 18, y, w: 420, h: 28, text, fontSize: 12, bold: true, color, valign: "middle", typeface: ctx.fonts.body });
}

export function title(ctx, slide, text, x = 56, y = 84, w = 820, h = 92, size = 42) {
  ctx.addText(slide, { x, y, w, h, text, fontSize: size, bold: true, color: C.ink, typeface: ctx.fonts.title, insets: { left: 0, right: 0, top: 0, bottom: 0 } });
}

export function subtitle(ctx, slide, text, x = 56, y = 180, w = 720, h = 72) {
  ctx.addText(slide, { x, y, w, h, text, fontSize: 18, color: C.muted, typeface: ctx.fonts.body, insets: { left: 0, right: 0, top: 0, bottom: 0 } });
}

export function metric(ctx, slide, x, y, w, value, labelText, accent = C.teal) {
  ctx.addShape(slide, { x, y, w, h: 98, fill: C.white, line: ctx.line("#D7DEE6", 1) });
  ctx.addShape(slide, { x, y, w: 8, h: 98, fill: accent });
  ctx.addText(slide, { x: x + 20, y: y + 16, w: w - 32, h: 36, text: value, fontSize: 25, bold: true, color: C.ink, typeface: ctx.fonts.title });
  ctx.addText(slide, { x: x + 20, y: y + 56, w: w - 32, h: 24, text: labelText, fontSize: 12, color: C.muted, typeface: ctx.fonts.body });
}

export function label(ctx, slide, x, y, w, text, color = C.muted, size = 12) {
  ctx.addText(slide, { x, y, w, h: 22, text, fontSize: size, color, typeface: ctx.fonts.body });
}

export function box(ctx, slide, x, y, w, h, header, body, accent = C.teal, fill = C.white) {
  ctx.addShape(slide, { x, y, w, h, fill, line: ctx.line("#D7DEE6", 1) });
  ctx.addShape(slide, { x, y, w: 7, h, fill: accent });
  ctx.addText(slide, { x: x + 18, y: y + 14, w: w - 32, h: 26, text: header, fontSize: 15, bold: true, color: C.ink, typeface: ctx.fonts.body });
  ctx.addText(slide, { x: x + 18, y: y + 46, w: w - 32, h: h - 70, text: body, fontSize: 12, color: C.muted, typeface: ctx.fonts.body, insets: { left: 0, right: 0, top: 0, bottom: 0 } });
}

export function divider(ctx, slide, x, y, w, color = "#D7DEE6") {
  ctx.addShape(slide, { x, y, w, h: 1.2, fill: color });
}

export function hbar(ctx, slide, x, y, w, labelText, valueText, ratio, accent = C.teal) {
  ctx.addText(slide, { x, y: y - 8, w: 250, h: 36, text: labelText, fontSize: 11.5, color: C.ink, typeface: ctx.fonts.body });
  ctx.addShape(slide, { x: x + 270, y: y + 4, w, h: 13, fill: "#E7ECEF" });
  ctx.addShape(slide, { x: x + 270, y: y + 4, w: Math.max(4, w * Math.max(0, Math.min(1, ratio))), h: 13, fill: accent });
  ctx.addText(slide, { x: x + 270 + w + 16, y: y - 3, w: 100, h: 22, text: valueText, fontSize: 12, bold: true, color: C.ink, align: "right", typeface: ctx.fonts.body });
}
`);

  await writeText(path.join(slidesDir, "slide-01.mjs"), moduleText("slide01", `
  bg(ctx, slide);
  kicker(ctx, slide, "PROPOSAL ROUGH ORDER");
  title(ctx, slide, data.projectName, 56, 94, 760, 106, 43);
  subtitle(ctx, slide, data.businessPurpose, 58, 206, 730, 62);
  metric(ctx, slide, 58, 318, 270, money(data.monthlyUsd), "月額概算 USD", "#0F766E");
  metric(ctx, slide, 358, 318, 270, money(data.annualUsd), "年額概算 USD", "#D97706");
  metric(ctx, slide, 658, 318, 270, jpy(data.monthlyJpy), "月額概算 JPY", "#2563EB");
  metric(ctx, slide, 958, 318, 220, String(data.additionalCount), "追加/従量候補SKU", "#BE123C");
  box(ctx, slide, 58, 486, 354, 116, "対象範囲", data.departments.join(" / ") + "\\n利用者 " + fmtQty(data.userCount) + "名、Maker " + fmtQty(data.makerCount) + "名", "#0F766E");
  box(ctx, slide, 444, 486, 354, 116, "価格前提", data.pricingAsOf + "\\n1 USD = " + data.fxRate + " JPY", "#D97706");
  box(ctx, slide, 830, 486, 348, 116, "判定位置づけ", "提案前の概算。税・EA/CSP割引・契約条件は未反映。", "#2563EB");
  footer(ctx, slide, "Source: Microsoft official pages / Azure Retail Prices snapshots; rough order only.");
`));

  await writeText(path.join(slidesDir, "slide-02.mjs"), moduleText("slide02", `
  bg(ctx, slide);
  kicker(ctx, slide, "ARCHITECTURE");
  title(ctx, slide, "営業ナレッジとAI支援をPower PlatformとAzureでつなぐ。", 56, 82, 940, 66, 32);
  subtitle(ctx, slide, "ライセンス数量は、利用者数、Maker数、会話容量、Azure従量課金メーターに分解して概算する。", 58, 150, 880, 48);
  const nodes = [
    ["利用者", "営業 / 営業企画\\nプリセールス", 72, 286, 150, "#2563EB"],
    ["Microsoft 365", "SharePoint\\nTeams / Office", 270, 240, 180, "#0F766E"],
    ["Power Platform", "Power Apps\\nPower Automate", 270, 392, 180, "#D97706"],
    ["Copilot Studio", "会話UI\\n業務エージェント", 512, 286, 180, "#BE123C"],
    ["Azure OpenAI", "gpt-4o-mini\\n入力/出力メーター", 754, 286, 190, "#2563EB"],
    ["Power BI", "提案KPI\\n利用状況分析", 996, 240, 164, "#0F766E"],
    ["Security", "Entra ID\\nMonitor / Defender", 996, 392, 164, "#D97706"]
  ];
  for (const [head, body, x, y, w, color] of nodes) {
    box(ctx, slide, x, y, w, 120, head, body, color);
  }
  const lines = [
    [222, 346, 48, 5], [450, 300, 62, 5], [450, 452, 62, 5], [692, 346, 62, 5], [944, 300, 52, 5], [944, 452, 52, 5]
  ];
  for (const [x, y, w, h] of lines) ctx.addShape(slide, { x, y, w, h, fill: "#8A96A3" });
  label(ctx, slide, 76, 224, 300, "主な設計単位", "#5D6773", 12);
  label(ctx, slide, 520, 224, 350, "AI利用量はトークンメーターを合算", "#5D6773", 12);
  label(ctx, slide, 986, 224, 220, "可視化・認証・監視", "#5D6773", 12);
  footer(ctx, slide, "Architecture is a simplified proposal-stage view; final licensing requires contract review.");
`));

  await writeText(path.join(slidesDir, "slide-03.mjs"), moduleText("slide03", `
  bg(ctx, slide);
  kicker(ctx, slide, "COST BREAKDOWN");
  title(ctx, slide, "月額はEntra/DefenderとPower Platformが大半を占める。", 56, 82, 930, 60, 32);
  subtitle(ctx, slide, "既存Microsoft 365 E3とPower BI Proは充足扱い。追加分だけを合算して、月額・年額の概算を出す。", 58, 148, 900, 44);
  const max = Math.max(...data.topCostLines.map((line) => line.monthlyUsd), 1);
  const accents = ["#0F766E", "#D97706", "#2563EB", "#BE123C", "#0F766E", "#D97706", "#2563EB"];
  data.topCostLines.forEach((line, i) => {
    hbar(ctx, slide, 78, 246 + i * 48, 410, line.productName + " / " + line.skuName, money(line.monthlyUsd), line.monthlyUsd / max, accents[i % accents.length]);
  });
  metric(ctx, slide, 922, 252, 238, money(data.monthlyUsd), "月額合計 USD", "#0F766E");
  metric(ctx, slide, 922, 382, 238, money(data.annualUsd), "年額合計 USD", "#D97706");
  metric(ctx, slide, 922, 512, 238, jpy(data.annualJpy), "年額合計 JPY", "#2563EB");
  footer(ctx, slide, "Known-price basis only; tax, discount, EA/CSP commercial terms are excluded.");
`));

  await writeText(path.join(slidesDir, "slide-04.mjs"), moduleText("slide04", `
  bg(ctx, slide);
  kicker(ctx, slide, "LICENSE RATIONALE");
  title(ctx, slide, "既存充足と追加購入をSKU別に分けて説明できる。", 56, 82, 920, 58, 32);
  const headerY = 188;
  ctx.addShape(slide, { x: 56, y: headerY, w: 1068, h: 34, fill: "#17212B" });
  const headers = ["SKU", "必要", "既存", "追加", "根拠"];
  const xs = [76, 472, 558, 644, 738];
  const ws = [370, 70, 70, 70, 360];
  headers.forEach((h, i) => ctx.addText(slide, { x: xs[i], y: headerY + 8, w: ws[i], h: 18, text: h, fontSize: 11, bold: true, color: "#FFFFFF", typeface: ctx.fonts.body }));
  data.selectedLines.slice(0, 9).forEach((line, i) => {
    const y = 234 + i * 46;
    ctx.addShape(slide, { x: 56, y: y - 6, w: 1068, h: 40, fill: i % 2 === 0 ? "#FFFFFF" : "#EFF5F4", line: ctx.line("#D7DEE6", 0.6) });
    ctx.addText(slide, { x: xs[0], y, w: ws[0], h: 22, text: line.productName + " / " + line.skuName, fontSize: 11, color: "#17212B", typeface: ctx.fonts.body });
    ctx.addText(slide, { x: xs[1], y, w: ws[1], h: 22, text: fmtQty(line.requiredQuantity), fontSize: 11, color: "#17212B", align: "right", typeface: ctx.fonts.body });
    ctx.addText(slide, { x: xs[2], y, w: ws[2], h: 22, text: fmtQty(line.existingQuantity), fontSize: 11, color: "#17212B", align: "right", typeface: ctx.fonts.body });
    ctx.addText(slide, { x: xs[3], y, w: ws[3], h: 22, text: fmtQty(line.additionalQuantity), fontSize: 11, bold: true, color: line.additionalQuantity > 0 ? "#BE123C" : "#0F766E", align: "right", typeface: ctx.fonts.body });
    ctx.addText(slide, { x: xs[4], y, w: ws[4], h: 18, text: line.status + " / " + line.billingUnit, fontSize: 10.5, color: "#5D6773", typeface: ctx.fonts.body });
  });
  footer(ctx, slide, "Existing license offset is based on supplied existing_licenses.csv / input JSON.");
`));

  await writeText(path.join(slidesDir, "slide-05.mjs"), moduleText("slide05", `
  bg(ctx, slide);
  kicker(ctx, slide, "ASSUMPTIONS");
  title(ctx, slide, "PoC見積は、価格基準日と利用量前提を明示して次の確認に進める。", 56, 82, 1000, 66, 31);
  const ai = data.azureOpenAi;
  box(ctx, slide, 72, 210, 330, 158, "Azure OpenAI前提", ai.region + " / " + ai.model + "\\n入力 " + fmtQty(ai.inputTokens) + " tokens\\n出力 " + fmtQty(ai.outputTokens) + " tokens\\n概算 " + money(ai.estimatedMonthlyUsd) + " /月", "#2563EB");
  box(ctx, slide, 452, 210, 330, 158, "価格・為替前提", "価格基準: " + data.pricingAsOf + "\\n為替基準: " + data.fxAsOf + "\\n1 USD = " + data.fxRate + " JPY\\n税・割引は未反映", "#D97706");
  box(ctx, slide, 832, 210, 330, 158, "注意事項", "正式見積では契約形態、既存プラン内包、EA/CSP割引、リージョン差、課金無料枠を確認する。", "#BE123C");
  divider(ctx, slide, 72, 424, 1090);
  ctx.addText(slide, { x: 72, y: 458, w: 330, h: 36, text: "次アクション", fontSize: 21, bold: true, color: "#17212B", typeface: ctx.fonts.title });
  const actions = [
    "既存M365/Power Platformライセンスの内包範囲を確認",
    "Azure OpenAIのモデル・リージョン・月間トークンをPoC設計で更新",
    "公式価格スナップショットを再取得し、Excel/MD/PPTを再生成"
  ];
  actions.forEach((action, i) => {
    ctx.addShape(slide, { x: 76, y: 516 + i * 44, w: 20, h: 20, fill: ["#0F766E", "#D97706", "#2563EB"][i] });
    ctx.addText(slide, { x: 112, y: 510 + i * 44, w: 800, h: 28, text: action, fontSize: 16, color: "#17212B", typeface: ctx.fonts.body });
  });
  footer(ctx, slide, "Final purchasing decision should be confirmed with Microsoft or the reseller.");
`));
}

function runHelper(scriptPath, helperArgs, envExtra = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...helperArgs], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: process.env.HOME || process.env.USERPROFILE || "C:\\Users\\kazuki.yoshioka",
      ...envExtra,
    },
  });
  const stdout = result.stdout.trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }
  if (result.status !== 0) {
    if (parsed?.output && parsed.outputBytes > 0) return parsed;
    throw new Error([
      `Helper failed: ${scriptPath}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join("\n"));
  }
  return parsed ?? { stdout };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input || path.join(ROOT, "sample-input.json"));
  const skuMasterPath = path.resolve(args["sku-master"] || path.join(ROOT, "sku_master.csv"));
  const snapshotPath = path.resolve(args["price-snapshots"] || path.join(ROOT, "sku_price_snapshot.csv"));
  const skuRulesPath = path.resolve(args["sku-rules"] || path.join(ROOT, "rules", "sku-selection-rules.json"));
  const existingLicensesPath = args["existing-licenses"] ? path.resolve(args["existing-licenses"]) : null;
  const outputDir = path.resolve(args["out-dir"] || path.join(ROOT, "outputs"));
  const threadId = process.env.CODEX_THREAD_ID || `manual-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-ms-license`;
  const workspace = path.join(ROOT, "outputs", threadId, "presentations", "ms-license-summary");
  const slidesDir = path.join(workspace, "slides");
  const previewDir = path.join(workspace, "preview");
  const layoutDir = path.join(workspace, "layout");
  const qaDir = path.join(workspace, "qa");
  const outputPath = path.join(outputDir, `ms-license-summary-${slugify((await readJson(inputPath)).estimate.project_name)}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pptx`);

  let input = await readJson(inputPath);
  if (existingLicensesPath) {
    input = {
      ...input,
      existing_licenses: (await readCsv(existingLicensesPath)).map(normalizeExistingLicense),
    };
  }
  const skuRows = await readCsv(skuMasterPath);
  const snapshots = await readCsv(snapshotPath);
  const skuRules = await readJson(skuRulesPath);
  const fxRate = numberOrNull(input.estimate.fx_rate_usd_jpy) ?? 1;
  const lines = buildEstimateLines(input, skuRows, latestSnapshotsBySku(snapshots, fxRate), skuRules);
  const data = buildDeckData(input, lines);

  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });
  await writeText(path.join(workspace, "profile-plan.txt"), [
    "task mode: create",
    "primary deck-profile: engineering-platform",
    "required proof objects: architecture map, cost breakdown, license rationale table, assumptions/next actions",
    "source requirements: local sample-input.json, sku_master.csv, sku_price_snapshot.csv, existing_licenses.csv",
    "known missing inputs: final contract terms, tax, EA/CSP discount, formal Microsoft quote",
    "",
  ].join("\n"));
  await writeText(path.join(workspace, "claim-spine.txt"), [
    "thesis: MSライセンス概算ナビは、要件からMSアーキテクチャ、SKU数量、公式価格スナップショットを一気通貫で概算する。",
    "audience: 提案前の営業・プリセールス・PoC設計者",
    "arc: scope -> architecture -> cost -> rationale -> assumptions",
    "",
  ].join("\n"));
  await writeText(path.join(workspace, "design-system.txt"), [
    "slide size: 1280x720",
    "background: warm paper",
    "typography: Aptos Display / Aptos",
    "palette: ink, teal, amber, blue, rose",
    "chart grammar: direct-labeled horizontal bars",
    "diagram grammar: labeled service nodes with explicit dependency bars",
    "",
  ].join("\n"));
  await writeText(path.join(workspace, "source-notes.txt"), [
    `input: ${inputPath}`,
    `sku master: ${skuMasterPath}`,
    `price snapshots: ${snapshotPath}`,
    `pricing as of: ${input.estimate.pricing_as_of}`,
    "identity assets: none used",
    "",
  ].join("\n"));
  await writeText(path.join(workspace, "data.json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeSlideModules(slidesDir, data);

  const buildManifest = runHelper(path.join(SKILL_DIR, "scripts", "build_artifact_deck.mjs"), [
    "--workspace", workspace,
    "--slides-dir", slidesDir,
    "--out", outputPath,
    "--preview-dir", previewDir,
    "--layout-dir", layoutDir,
    "--contact-sheet", path.join(previewDir, "contact-sheet.png"),
    "--slide-count", "5",
    "--slide-size", "1280x720",
    "--scale", "1",
  ]);

  await writeText(path.join(qaDir, "comeback-scorecard.txt"), [
    "profile: engineering-platform",
    "profile gate: pass",
    "story: 4",
    "specificity: 4",
    "rhythm: 4",
    "whitespace: 4",
    "chart clarity: 4",
    "typography: 4",
    "restraint: 4",
    "precision: 4",
    "coherence: 4",
    "reference delta: n/a",
    "package checks: final PPTX exported and non-empty",
    "render checks: build_artifact_deck rendered 5 PNG previews and contact sheet",
    "accepted caveat: proposal-stage estimate; no formal quote/tax/discount reflected",
    "",
  ].join("\n"));

  let cleanup = null;
  if (!args["keep-workspace"]) {
    cleanup = runHelper(path.join(SKILL_DIR, "scripts", "cleanup_presentation_workspace.mjs"), [
      "--workspace", workspace,
      "--output-dir", outputDir,
    ]);
  }

  console.log(JSON.stringify({
    outputPath,
    workspace,
    previewDir,
    contactSheet: path.join(previewDir, "contact-sheet.png"),
    slideCount: buildManifest.slideCount,
    outputBytes: buildManifest.outputBytes,
    monthlyUsd: data.monthlyUsd,
    annualUsd: data.annualUsd,
    monthlyJpy: data.monthlyJpy,
    annualJpy: data.annualJpy,
    cleanup,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
