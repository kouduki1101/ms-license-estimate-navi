import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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
  return String(value || "estimate")
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "estimate";
}

function formatDate(value) {
  if (!value) return "TBD";
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function displayUsd(value) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayJpy(value) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function azureOpenAiAssumption(input) {
  const usage = input.requirements?.monthly_usage_assumptions ?? {};
  const azureOpenAi = usage.azure_openai ?? {};
  return {
    model: azureOpenAi.model ?? "TBD",
    region: azureOpenAi.region_display_name ?? azureOpenAi.region ?? "TBD",
    regionCode: azureOpenAi.region ?? "",
    inputTokens: numberOrNull(azureOpenAi.input_tokens) ?? numberOrNull(usage.azure_openai_input_tokens),
    outputTokens: numberOrNull(azureOpenAi.output_tokens) ?? numberOrNull(usage.azure_openai_output_tokens),
    pricingUnit: azureOpenAi.pricing_unit ?? "TBD",
    inputMeterName: azureOpenAi.input_meter_name ?? "",
    outputMeterName: azureOpenAi.output_meter_name ?? "",
    inputUnitPriceUsd: numberOrNull(azureOpenAi.input_unit_price_usd_per_1k_tokens),
    outputUnitPriceUsd: numberOrNull(azureOpenAi.output_unit_price_usd_per_1k_tokens),
    estimatedMonthlyUsd: numberOrNull(azureOpenAi.estimated_monthly_usd),
  };
}

function displayTinyUsd(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function azureOpenAiReason(input) {
  const assumption = azureOpenAiAssumption(input);
  const tokenText = `入力 ${assumption.inputTokens ?? "TBD"} tokens、出力 ${assumption.outputTokens ?? "TBD"} tokens`;
  const meterText = assumption.inputUnitPriceUsd !== null && assumption.outputUnitPriceUsd !== null
    ? `単価は入力 ${displayTinyUsd(assumption.inputUnitPriceUsd)}/${assumption.pricingUnit}、出力 ${displayTinyUsd(assumption.outputUnitPriceUsd)}/${assumption.pricingUnit}`
    : "単価は価格スナップショットのAzure Retail Prices API取得結果";
  const estimateText = assumption.estimatedMonthlyUsd !== null ? `月額 ${displayTinyUsd(assumption.estimatedMonthlyUsd)}` : "月額は価格スナップショット側で管理";
  return `Azure OpenAIは${assumption.region} / ${assumption.model} を前提に、${tokenText}を月間利用量とした。${meterText}、${estimateText}。`;
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
  const rules = Array.isArray(skuRules?.rules) ? skuRules.rules : [];

  for (const rule of rules) {
    if (!rule.sku_id) continue;
    if (Array.isArray(rule.exclude_any) && matchesAny(text, rule.exclude_any)) continue;
    const anyOk = !Array.isArray(rule.match_any) || rule.match_any.length === 0 || matchesAny(text, rule.match_any);
    const allOk = !Array.isArray(rule.match_all) || rule.match_all.length === 0 || matchesAll(text, rule.match_all);
    if (anyOk && allOk) selected.add(rule.sku_id);
  }

  return [...selected];
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
    function_executions: usage.function_executions ?? 1,
  };
  return numberOrNull(values[sku.quantity_driver]) ?? 1;
}

function quantityReasonForSku(sku, input) {
  const req = input.requirements;
  const usage = req.monthly_usage_assumptions ?? {};
  const map = {
    user_count: `一般利用者数 ${req.user_count} 名を数量ドライバーとした。`,
    maker_or_app_user_count: `Power Apps / Power Platform作成・利用の中心ユーザーを ${req.maker_count ?? req.user_count} 名と仮定した。`,
    flow_owner_or_premium_user_count: `プレミアムフローを作成・運用する担当者を ${req.maker_count ?? req.user_count} 名と仮定した。`,
    copilot_studio_messages: `PoC単位で1テナント/容量枠、月間 ${usage.copilot_studio_messages ?? "TBD"} メッセージを前提とした。`,
    power_bi_user_count: "Power BI利用者数は既存ライセンス数または作成者数をもとに仮置きした。",
    dataverse_storage_gb: `Dataverse追加容量は ${usage.dataverse_storage_gb ?? "TBD"} GBを前提とした。`,
    azure_openai_tokens: azureOpenAiReason(input),
    log_ingestion_gb: `監視ログ取り込み量は ${usage.log_ingestion_gb ?? "未入力"} GB/月として扱った。`,
    function_execution_units_10: `Azure Functions実行回数は ${usage.function_executions ?? "未入力"} 回/月として、10実行単位に換算した。`,
    function_executions: `Azure Functions実行回数は ${usage.function_executions ?? "未入力"} 回/月として扱った。`,
  };
  return map[sku.quantity_driver] ?? `${sku.quantity_driver} を数量ドライバーとした。`;
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
    latest.set(skuId, { current: sorted[sorted.length - 1], previous: sorted.length > 1 ? sorted[sorted.length - 2] : null });
  }
  return latest;
}

function buildEstimateLines(input, skuRows, snapshotMap, skuRules) {
  const existingLicenses = input.existing_licenses ?? [];
  const skuById = new Map(skuRows.filter((sku) => sku.is_active !== "false").map((sku) => [sku.sku_id, sku]));
  return selectSkuIds(input, skuRules).map((skuId, index) => {
    const sku = skuById.get(skuId);
    if (!sku) return null;
    const requiredQuantity = quantityForSku(sku, input, existingLicenses);
    const existingQuantity = matchingExistingQuantity(sku, existingLicenses);
    const additionalQuantity = Math.max(requiredQuantity - existingQuantity, 0);
    const snapshot = snapshotMap.get(skuId)?.current;
    const unitPriceUsd = snapshot?.priceUsd ?? null;
    const unitPriceJpy = snapshot?.priceJpy ?? null;
    const monthlyUsd = unitPriceUsd === null ? null : unitPriceUsd * additionalQuantity;
    const annualUsd = monthlyUsd === null ? null : monthlyUsd * 12;
    const monthlyJpy = unitPriceJpy === null ? null : unitPriceJpy * additionalQuantity;
    const annualJpy = monthlyJpy === null ? null : monthlyJpy * 12;
    const status = additionalQuantity <= 0 ? "既存充足" : sku.price_source_type === "azure_retail_api" ? "従量課金候補" : "追加購入候補";
    return {
      lineId: `L${String(index + 1).padStart(3, "0")}`,
      sku,
      requiredQuantity,
      existingQuantity,
      additionalQuantity,
      unitPriceUsd,
      unitPriceJpy,
      monthlyUsd,
      annualUsd,
      monthlyJpy,
      annualJpy,
      status,
      confidence: snapshot?.confidence || (sku.price_source_type === "azure_retail_api" ? "High" : "Medium"),
      sourceType: snapshot?.source_type || sku.price_source_type,
      sourceUrl: snapshot?.source_url || sku.official_source_url,
      changeNote: snapshot?.change_note || "",
      priceAsOf: snapshot?.captured_at || input.estimate.pricing_as_of,
      licenseReason: sku.license_rule_summary || `${sku.product_name} ${sku.sku_name} の利用候補。`,
      quantityReason: quantityReasonForSku(sku, input),
    };
  }).filter(Boolean);
}

function trendRows(skuRows, snapshotMap) {
  const skuById = new Map(skuRows.map((sku) => [sku.sku_id, sku]));
  return [...snapshotMap.entries()].map(([skuId, pair]) => {
    const sku = skuById.get(skuId);
    const current = pair.current;
    const previous = pair.previous;
    const deltaUsdPct = previous?.priceUsd && current.priceUsd !== null ? (current.priceUsd - previous.priceUsd) / previous.priceUsd : null;
    const deltaJpyPct = previous?.priceJpy && current.priceJpy !== null ? (current.priceJpy - previous.priceJpy) / previous.priceJpy : null;
    const flag = !previous ? "new" : deltaUsdPct > 0.05 || deltaJpyPct > 0.1 ? "increased" : deltaUsdPct < -0.05 ? "decreased" : "unchanged";
    return {
      skuId,
      productName: sku?.product_name ?? "",
      skuName: sku?.sku_name ?? skuId,
      capturedAt: current?.captured_at ?? "",
      previousUsd: previous?.priceUsd ?? null,
      currentUsd: current?.priceUsd ?? null,
      deltaUsdPct,
      previousJpy: previous?.priceJpy ?? null,
      currentJpy: current?.priceJpy ?? null,
      deltaJpyPct,
      flag,
      sourceUrl: current?.source_url ?? "",
    };
  });
}

function sumKnown(lines, key) {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line[key]) ? line[key] : 0), 0);
}

function setHeader(range) {
  range.format = {
    fill: "#152238",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
}

function setTitle(range) {
  range.format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF", size: 16 },
  };
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getCell(0, index).format.columnWidthPx = width;
  });
}

function addTableIfPossible(sheet, range, name) {
  try {
    const table = sheet.tables.add(range, true, name);
    table.showFilterButton = true;
    table.showBandedColumns = false;
    return table;
  } catch {
    return undefined;
  }
}

async function buildWorkbook(input, lines, trends, outputPath) {
  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Summary");
  const licenseSheet = workbook.worksheets.add("License Estimate");
  const trendSheet = workbook.worksheets.add("Price Trend");
  const sourceSheet = workbook.worksheets.add("Source Notes");

  for (const sheet of [summary, licenseSheet, trendSheet, sourceSheet]) {
    sheet.showGridLines = false;
  }

  const knownMonthlyUsd = sumKnown(lines, "monthlyUsd");
  const knownAnnualUsd = sumKnown(lines, "annualUsd");
  const knownMonthlyJpy = sumKnown(lines, "monthlyJpy");
  const knownAnnualJpy = sumKnown(lines, "annualJpy");
  const samplePriceCount = lines.filter((line) => line.sourceType?.includes("sample") || line.sourceUrl?.startsWith("local://")).length;

  summary.getRange("A1:F1").merge();
  summary.getRange("A1").values = [["MSライセンス概算ナビ 試算サマリー"]];
  setTitle(summary.getRange("A1:F1"));
  summary.getRange("A3:B13").values = [
    ["案件名", input.estimate.project_name],
    ["試算目的", input.estimate.estimate_purpose],
    ["価格基準日時", formatDate(input.estimate.pricing_as_of)],
    ["為替基準日時", formatDate(input.estimate.fx_as_of)],
    ["為替レート", `1 USD = ${input.estimate.fx_rate_usd_jpy} JPY`],
    ["一般利用者数", input.requirements.user_count],
    ["管理者数", input.requirements.admin_count],
    ["作成者/メーカー数", input.requirements.maker_count],
    ["既知価格ベース月額 USD", displayUsd(knownMonthlyUsd)],
    ["既知価格ベース月額 JPY", displayJpy(knownMonthlyJpy)],
    ["検証用サンプル単価SKU", samplePriceCount],
  ];
  summary.getRange("A3:A13").format = { font: { bold: true }, fill: "#E6F4F1" };
  summary.getRange("D3:E7").values = [
    ["区分", "金額"],
    ["月額 USD", displayUsd(knownMonthlyUsd)],
    ["年額 USD", displayUsd(knownAnnualUsd)],
    ["月額 JPY", displayJpy(knownMonthlyJpy)],
    ["年額 JPY", displayJpy(knownAnnualJpy)],
  ];
  setHeader(summary.getRange("D3:E3"));
  summary.getRange("A15:F18").merge(true);
  summary.getRange("A15").values = [[
    samplePriceCount > 0
      ? "注意: このブックには検証用サンプル単価が含まれます。公式価格ベースの概算として利用する前に、sku_price_snapshot.csvをMicrosoft公式価格情報で更新してください。"
      : "注記: このブックはsku_price_snapshot.csvに登録されたMicrosoft公式価格ページおよびAzure Retail Prices API由来の価格スナップショットに基づく概算です。税、EA/CSP割引、契約条件、リージョン差分は別途確認してください。",
  ]];
  summary.getRange("A15:F18").format = { fill: "#FFF4CE", font: { color: "#5F3B00" }, wrapText: true };
  setWidths(summary, [170, 300, 24, 160, 190, 24]);

  const licenseRows = [
    ["Line ID", "Service Category", "Product", "SKU", "Billing Unit", "Required Qty", "Existing Qty", "Additional Qty", "USD Unit", "USD Monthly", "USD Annual", "JPY Monthly", "JPY Annual", "Status", "Confidence", "Source Type", "License Reason", "Quantity Reason"],
    ...lines.map((line) => [
      line.lineId,
      line.sku.service_category,
      line.sku.product_name,
      line.sku.sku_name,
      line.sku.billing_unit,
      line.requiredQuantity,
      line.existingQuantity,
      line.additionalQuantity,
      line.unitPriceUsd,
      line.monthlyUsd,
      line.annualUsd,
      line.monthlyJpy,
      line.annualJpy,
      line.status,
      line.confidence,
      line.sourceType,
      line.licenseReason,
      line.quantityReason,
    ]),
  ];
  licenseSheet.getRangeByIndexes(0, 0, licenseRows.length, licenseRows[0].length).values = licenseRows;
  setHeader(licenseSheet.getRangeByIndexes(0, 0, 1, licenseRows[0].length));
  licenseSheet.freezePanes.freezeRows(1);
  licenseSheet.getRange(`I2:M${licenseRows.length}`).format.numberFormat = [
    ...Array.from({ length: licenseRows.length - 1 }, () => ["$#,##0.00", "$#,##0.00", "$#,##0.00", "#,##0", "#,##0"]),
  ];
  addTableIfPossible(licenseSheet, `A1:R${licenseRows.length}`, "LicenseEstimateTable");
  setWidths(licenseSheet, [72, 130, 160, 170, 120, 90, 90, 90, 90, 100, 100, 110, 110, 110, 90, 110, 360, 360]);
  licenseSheet.getRange(`Q2:R${licenseRows.length}`).format = { wrapText: true };

  const trendRowsMatrix = [
    ["SKU ID", "Product", "SKU", "Captured At", "Previous USD", "Current USD", "USD Delta %", "Previous JPY", "Current JPY", "JPY Delta %", "Flag", "Source"],
    ...trends.map((row) => [
      row.skuId,
      row.productName,
      row.skuName,
      formatDate(row.capturedAt),
      row.previousUsd,
      row.currentUsd,
      row.deltaUsdPct,
      row.previousJpy,
      row.currentJpy,
      row.deltaJpyPct,
      row.flag,
      row.sourceUrl,
    ]),
  ];
  trendSheet.getRangeByIndexes(0, 0, trendRowsMatrix.length, trendRowsMatrix[0].length).values = trendRowsMatrix;
  setHeader(trendSheet.getRangeByIndexes(0, 0, 1, trendRowsMatrix[0].length));
  trendSheet.freezePanes.freezeRows(1);
  trendSheet.getRange(`E2:F${trendRowsMatrix.length}`).format.numberFormat = "$#,##0.00";
  trendSheet.getRange(`G2:G${trendRowsMatrix.length}`).format.numberFormat = "0.0%";
  trendSheet.getRange(`H2:I${trendRowsMatrix.length}`).format.numberFormat = "#,##0";
  trendSheet.getRange(`J2:J${trendRowsMatrix.length}`).format.numberFormat = "0.0%";
  addTableIfPossible(trendSheet, `A1:L${trendRowsMatrix.length}`, "PriceTrendTable");
  setWidths(trendSheet, [230, 150, 170, 190, 105, 105, 95, 105, 105, 95, 100, 300]);

  const chartDataStart = trendRowsMatrix.length + 3;
  trendSheet.getRangeByIndexes(chartDataStart - 1, 0, 1, 2).values = [["SKU", "JPY Delta %"]];
  trendSheet.getRangeByIndexes(chartDataStart, 0, trends.length, 2).values = trends.map((row) => [row.skuName, row.deltaJpyPct ?? 0]);
  setHeader(trendSheet.getRangeByIndexes(chartDataStart - 1, 0, 1, 2));
  trendSheet.getRangeByIndexes(chartDataStart, 1, trends.length, 1).format.numberFormat = "0.0%";
  try {
    const chart = trendSheet.charts.add("bar", trendSheet.getRangeByIndexes(chartDataStart - 1, 0, trends.length + 1, 2));
    chart.title = "JPY Unit Price Delta by SKU";
    chart.hasLegend = false;
    chart.xAxis = { axisType: "textAxis" };
    chart.yAxis = { numberFormatCode: "0.0%" };
    chart.setPosition("N2", "U20");
  } catch {
    // Chart creation is non-blocking; table data remains the source of truth.
  }

  const sourceRows = [
    ["SKU", "Source Type", "Source URL", "Price As Of", "Confidence", "Note"],
    ...lines.map((line) => [
      line.sku.sku_name,
      line.sourceType,
      line.sourceUrl,
      formatDate(line.priceAsOf),
      line.confidence,
      line.changeNote,
    ]),
  ];
  sourceSheet.getRangeByIndexes(0, 0, sourceRows.length, sourceRows[0].length).values = sourceRows;
  setHeader(sourceSheet.getRangeByIndexes(0, 0, 1, sourceRows[0].length));
  sourceSheet.freezePanes.freezeRows(1);
  addTableIfPossible(sourceSheet, `A1:F${sourceRows.length}`, "SourceNotesTable");
  setWidths(sourceSheet, [170, 130, 520, 190, 100, 520]);
  sourceSheet.getRange(`F2:F${sourceRows.length}`).format = { wrapText: true };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
  return workbook;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input || path.join(ROOT, "sample-input.json"));
  const skuMasterPath = path.resolve(args["sku-master"] || path.join(ROOT, "sku_master.csv"));
  const snapshotPath = path.resolve(args["price-snapshots"] || path.join(ROOT, "sku_price_snapshot.csv"));
  const skuRulesPath = path.resolve(args["sku-rules"] || path.join(ROOT, "rules", "sku-selection-rules.json"));
  const existingLicensesPath = args["existing-licenses"] ? path.resolve(args["existing-licenses"]) : null;
  const outputDir = path.resolve(args["out-dir"] || path.join(ROOT, "outputs"));
  let input = await readJson(inputPath);
  if (existingLicensesPath) {
    input = {
      ...input,
      existing_licenses: (await readCsv(existingLicensesPath)).map(normalizeExistingLicense),
    };
  }
  const skuRules = await readJson(skuRulesPath);
  const skuRows = await readCsv(skuMasterPath);
  const snapshots = await readCsv(snapshotPath);
  const fxRate = numberOrNull(input.estimate.fx_rate_usd_jpy) ?? 1;
  const snapshotMap = latestSnapshotsBySku(snapshots, fxRate);
  const lines = buildEstimateLines(input, skuRows, snapshotMap, skuRules);
  const trends = trendRows(skuRows, snapshotMap);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outputPath = path.join(outputDir, `ms-license-estimate-${slugify(input.estimate.project_name)}-${datePart}.xlsx`);
  const workbook = await buildWorkbook(input, lines, trends, outputPath);

  const inspect = await workbook.inspect({
    kind: "sheet,table",
    maxChars: 4000,
    tableMaxRows: 4,
    tableMaxCols: 8,
  });
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 50 },
    summary: "formula error scan",
  });

  console.log(JSON.stringify({
    outputPath,
    estimateLines: lines.length,
    trendRows: trends.length,
    skuRulesPath,
    existingLicensesPath,
    knownMonthlyUsd: sumKnown(lines, "monthlyUsd"),
    sheetsAndTables: inspect.ndjson,
    formulaErrors: errors.ndjson,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
