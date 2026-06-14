import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${key}`);
    }
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

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function formatDate(value) {
  if (!value) return "TBD";
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatUsd(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTinyUsd(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function formatJpy(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  return `${(value * 100).toFixed(1)}%`;
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

function azureOpenAiReason(input) {
  const assumption = azureOpenAiAssumption(input);
  const tokenText = `入力 ${assumption.inputTokens ?? "TBD"} tokens、出力 ${assumption.outputTokens ?? "TBD"} tokens`;
  const meterText = assumption.inputUnitPriceUsd !== null && assumption.outputUnitPriceUsd !== null
    ? `単価は入力 ${formatTinyUsd(assumption.inputUnitPriceUsd)}/${assumption.pricingUnit}、出力 ${formatTinyUsd(assumption.outputUnitPriceUsd)}/${assumption.pricingUnit}`
    : "単価は価格スナップショットのAzure Retail Prices API取得結果";
  const estimateText = assumption.estimatedMonthlyUsd !== null ? `月額 ${formatUsd(assumption.estimatedMonthlyUsd)}` : "月額は価格スナップショット側で管理";
  return `Azure OpenAIは${assumption.region} / ${assumption.model} を前提に、${tokenText}を月間利用量とした。${meterText}、${estimateText}。`;
}

function capabilityText(requirements) {
  return [
    requirements.business_purpose,
    ...(requirements.required_capabilities ?? []),
  ]
    .join(" ")
    .toLowerCase();
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
  const driver = sku.quantity_driver;
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

  return numberOrNull(values[driver]) ?? 1;
}

function quantityReasonForSku(sku, input) {
  const req = input.requirements;
  const usage = req.monthly_usage_assumptions ?? {};
  const map = {
    user_count: `一般利用者数 ${req.user_count} 名を数量ドライバーとした。`,
    maker_or_app_user_count: `Power Apps / Power Platform作成・利用の中心ユーザーを ${req.maker_count ?? req.user_count} 名と仮定した。`,
    flow_owner_or_premium_user_count: `プレミアムフローを作成・運用する担当者を ${req.maker_count ?? req.user_count} 名と仮定した。`,
    copilot_studio_messages: `Copilot StudioはPoC単位で1テナント/容量枠を置き、月間 ${usage.copilot_studio_messages ?? "TBD"} メッセージを利用量前提とした。`,
    power_bi_user_count: `Power BI利用者数は既存ライセンス数または作成者数をもとに仮置きした。`,
    dataverse_storage_gb: `Dataverse追加容量は ${usage.dataverse_storage_gb ?? "TBD"} GBを前提とした。`,
    azure_openai_tokens: azureOpenAiReason(input),
    log_ingestion_gb: `監視ログ取り込み量は ${usage.log_ingestion_gb ?? "未入力"} GB/月として、未入力の場合は要確認扱いにした。`,
    function_execution_units_10: `Azure Functions実行回数は ${usage.function_executions ?? "未入力"} 回/月として、10実行単位に換算した。`,
    function_executions: `Azure Functions実行回数は ${usage.function_executions ?? "未入力"} 回/月として、未入力の場合は要確認扱いにした。`,
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
    latest.set(skuId, {
      current: sorted[sorted.length - 1],
      previous: sorted.length > 1 ? sorted[sorted.length - 2] : null,
    });
  }
  return latest;
}

function buildEstimateLines(input, skuRows, snapshotMap, skuRules) {
  const existingLicenses = input.existing_licenses ?? [];
  const selectedIds = selectSkuIds(input, skuRules);
  const skuById = new Map(skuRows.filter((sku) => sku.is_active !== "false").map((sku) => [sku.sku_id, sku]));

  return selectedIds
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
      const annualUsd = monthlyUsd === null ? null : monthlyUsd * 12;
      const monthlyJpy = unitPriceJpy === null ? null : unitPriceJpy * additionalQuantity;
      const annualJpy = monthlyJpy === null ? null : monthlyJpy * 12;
      const isAzure = sku.price_source_type === "azure_retail_api";
      const status = additionalQuantity <= 0 ? "既存充足" : isAzure ? "従量課金候補" : "追加購入候補";
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
        isSamplePrice: String(snapshot?.source_type || "").includes("sample") || String(snapshot?.source_url || "").startsWith("local://"),
        priceAsOf: snapshot?.captured_at || input.estimate.pricing_as_of,
        licenseReason: sku.license_rule_summary || `${sku.product_name} ${sku.sku_name} の利用候補。`,
        quantityReason: quantityReasonForSku(sku, input),
      };
    })
    .filter(Boolean);
}

function trendRows(skuRows, snapshotMap) {
  const skuById = new Map(skuRows.map((sku) => [sku.sku_id, sku]));
  return [...snapshotMap.entries()].map(([skuId, pair]) => {
    const sku = skuById.get(skuId);
    const current = pair.current;
    const previous = pair.previous;
    const deltaUsd = previous?.priceUsd !== null && previous?.priceUsd !== undefined && current.priceUsd !== null
      ? current.priceUsd - previous.priceUsd
      : null;
    const deltaUsdPct = deltaUsd !== null && previous.priceUsd ? deltaUsd / previous.priceUsd : null;
    const deltaJpy = previous?.priceJpy !== null && previous?.priceJpy !== undefined && current.priceJpy !== null
      ? current.priceJpy - previous.priceJpy
      : null;
    const deltaJpyPct = deltaJpy !== null && previous.priceJpy ? deltaJpy / previous.priceJpy : null;
    const flag = !previous ? "new" : deltaUsdPct > 0.05 || deltaJpyPct > 0.1 ? "increased" : deltaUsdPct < -0.05 ? "decreased" : "unchanged";
    return {
      sku,
      current,
      previous,
      deltaUsdPct,
      deltaJpyPct,
      flag,
    };
  });
}

function architectureRows(lines) {
  return lines.map((line, index) => ({
    id: `C${String(index + 1).padStart(3, "0")}`,
    component: line.sku.product_name,
    service: line.sku.product_name,
    role: line.sku.license_rule_summary,
    licenseImpact: `${line.sku.sku_name} / ${line.sku.billing_unit}`,
    driver: line.sku.quantity_driver,
  }));
}

function sumKnown(lines, key) {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line[key]) ? line[key] : 0), 0);
}

function renderMarkdown(input, lines, trends) {
  const estimate = input.estimate;
  const req = input.requirements;
  const knownMonthlyUsd = sumKnown(lines, "monthlyUsd");
  const knownAnnualUsd = sumKnown(lines, "annualUsd");
  const knownMonthlyJpy = sumKnown(lines, "monthlyJpy");
  const knownAnnualJpy = sumKnown(lines, "annualJpy");
  const unknownPriceCount = lines.filter((line) => line.unitPriceUsd === null).length;
  const samplePriceCount = lines.filter((line) => line.isSamplePrice).length;
  const architecture = architectureRows(lines);
  const azureOpenAi = azureOpenAiAssumption(input);

  const md = [];
  md.push(`# MSライセンス概算ナビ 試算レポート`);
  md.push("");
  md.push("## 1. サマリー");
  md.push("");
  md.push("| 項目 | 内容 |");
  md.push("|---|---|");
  md.push(`| 案件名 | ${escapeMd(estimate.project_name)} |`);
  md.push(`| 試算目的 | ${escapeMd(estimate.estimate_purpose)} |`);
  md.push(`| 価格基準日時 | ${escapeMd(formatDate(estimate.pricing_as_of))} |`);
  md.push(`| 為替基準日時 | ${escapeMd(formatDate(estimate.fx_as_of))} |`);
  md.push(`| 為替レート | 1 USD = ${estimate.fx_rate_usd_jpy} JPY |`);
  md.push(`| 既知価格ベース月額 | ${formatUsd(knownMonthlyUsd)} / ${formatJpy(knownMonthlyJpy)} |`);
  md.push(`| 既知価格ベース年額 | ${formatUsd(knownAnnualUsd)} / ${formatJpy(knownAnnualJpy)} |`);
  md.push(`| 価格未入力SKU | ${unknownPriceCount} 件 |`);
  md.push(`| 検証用サンプル単価SKU | ${samplePriceCount} 件 |`);
  md.push("");
  md.push("> 価格未入力SKUは `TBD` として表示しています。SKUマスタと価格スナップショットに単価を登録すると、合計金額に反映されます。");
  if (samplePriceCount > 0) {
    md.push("");
    md.push("> 注意: このレポートには `local://sample-pricing` の検証用サンプル単価が含まれます。公式価格ではありません。");
  }
  md.push("");

  md.push("## 2. 前提条件");
  md.push("");
  md.push(`- 業務目的: ${req.business_purpose}`);
  md.push(`- 対象部門: ${(req.target_departments ?? []).join(", ")}`);
  md.push(`- 一般利用者数: ${req.user_count}`);
  md.push(`- 管理者数: ${req.admin_count}`);
  md.push(`- 作成者/メーカー数: ${req.maker_count}`);
  md.push(`- 外部ユーザー数: ${req.external_user_count}`);
  md.push(`- 利用地域: ${req.region}`);
  if (lines.some((line) => line.sku.sku_id === "SKU-AZURE-OPENAI-TOKENS")) {
    md.push("");
    md.push("### Azure OpenAI前提");
    md.push("");
    md.push("| 項目 | 内容 |");
    md.push("|---|---|");
    md.push(`| モデル | ${escapeMd(azureOpenAi.model)} |`);
    md.push(`| リージョン | ${escapeMd(azureOpenAi.region)}${azureOpenAi.regionCode ? ` (${escapeMd(azureOpenAi.regionCode)})` : ""} |`);
    md.push(`| 入力トークン/月 | ${azureOpenAi.inputTokens?.toLocaleString("en-US") ?? "TBD"} |`);
    md.push(`| 出力トークン/月 | ${azureOpenAi.outputTokens?.toLocaleString("en-US") ?? "TBD"} |`);
    md.push(`| 入力メーター | ${escapeMd(azureOpenAi.inputMeterName || "TBD")} |`);
    md.push(`| 出力メーター | ${escapeMd(azureOpenAi.outputMeterName || "TBD")} |`);
    md.push(`| 入力単価 | ${azureOpenAi.inputUnitPriceUsd !== null ? `${formatTinyUsd(azureOpenAi.inputUnitPriceUsd)} / ${escapeMd(azureOpenAi.pricingUnit)}` : "TBD"} |`);
    md.push(`| 出力単価 | ${azureOpenAi.outputUnitPriceUsd !== null ? `${formatTinyUsd(azureOpenAi.outputUnitPriceUsd)} / ${escapeMd(azureOpenAi.pricingUnit)}` : "TBD"} |`);
    md.push(`| 月額概算 | ${formatUsd(azureOpenAi.estimatedMonthlyUsd)} |`);
  }
  md.push("");

  md.push("## 3. 簡易MSアーキテクチャ");
  md.push("");
  md.push("```mermaid");
  md.push("flowchart LR");
  md.push("  User[利用者] --> M365[Microsoft 365 / SharePoint]");
  const hasPowerApps = lines.some((line) => line.sku.sku_id === "SKU-POWERAPPS-PREMIUM");
  const hasPowerAutomate = lines.some((line) => line.sku.sku_id === "SKU-POWERAUTOMATE-PREMIUM");
  const hasCopilotStudio = lines.some((line) => line.sku.sku_id === "SKU-COPILOTSTUDIO-MESSAGES");
  const hasDataverse = lines.some((line) => line.sku.sku_id === "SKU-DATAVERSE-CAPACITY");
  const hasAzureOpenAI = lines.some((line) => line.sku.sku_id === "SKU-AZURE-OPENAI-TOKENS");
  const hasPowerBi = lines.some((line) => line.sku.sku_id === "SKU-POWERBI-PRO");
  const hasMonitor = lines.some((line) => line.sku.sku_id === "SKU-AZURE-MONITOR");
  if (hasPowerApps) md.push("  User --> Apps[Power Apps]");
  if (hasPowerAutomate) md.push("  Apps --> Flow[Power Automate]");
  if (hasCopilotStudio) md.push("  User --> Agent[Copilot Studio]");
  if (hasDataverse) {
    md.push("  Apps --> Data[Dataverse]");
  } else if (hasPowerBi) {
    md.push("  M365 --> Data[SharePoint / Data source]");
  }
  if (hasAzureOpenAI) md.push("  Agent --> AI[Azure OpenAI]");
  if (hasPowerBi) md.push("  Data --> BI[Power BI]");
  if (hasMonitor) md.push(`  ${hasPowerApps ? "Apps" : "M365"} --> Monitor[Azure Monitor]`);
  md.push("```");
  md.push("");
  md.push("| コンポーネント | サービス | ライセンス影響 | 数量ドライバー |");
  md.push("|---|---|---|---|");
  for (const row of architecture) {
    md.push(`| ${escapeMd(row.component)} | ${escapeMd(row.service)} | ${escapeMd(row.licenseImpact)} | ${escapeMd(row.driver)} |`);
  }
  md.push("");

  md.push("## 4. 必要ライセンス一覧");
  md.push("");
  md.push("| 明細 | サービス区分 | 製品 | SKU | 課金単位 | 必要数量 | 既存数量 | 追加数量 | ステータス |");
  md.push("|---|---|---|---|---|---:|---:|---:|---|");
  for (const line of lines) {
    md.push(`| ${line.lineId} | ${escapeMd(line.sku.service_category)} | ${escapeMd(line.sku.product_name)} | ${escapeMd(line.sku.sku_name)} | ${escapeMd(line.sku.billing_unit)} | ${line.requiredQuantity} | ${line.existingQuantity} | ${line.additionalQuantity} | ${line.status} |`);
  }
  md.push("");

  md.push("## 5. 概算費用");
  md.push("");
  md.push("| SKU | USD単価 | 追加数量 | USD月額 | USD年額 | JPY月額 | JPY年額 | 信頼度 |");
  md.push("|---|---:|---:|---:|---:|---:|---:|---|");
  for (const line of lines) {
    md.push(`| ${escapeMd(line.sku.sku_name)} | ${formatUsd(line.unitPriceUsd)} | ${line.additionalQuantity} | ${formatUsd(line.monthlyUsd)} | ${formatUsd(line.annualUsd)} | ${formatJpy(line.monthlyJpy)} | ${formatJpy(line.annualJpy)} | ${line.confidence} |`);
  }
  md.push("");
  md.push(`- 既知価格ベース月額合計: ${formatUsd(knownMonthlyUsd)} / ${formatJpy(knownMonthlyJpy)}`);
  md.push(`- 既知価格ベース年額合計: ${formatUsd(knownAnnualUsd)} / ${formatJpy(knownAnnualJpy)}`);
  md.push("");

  md.push("## 6. 既存ライセンスとの差分");
  md.push("");
  md.push("| 既存ライセンス | 製品 | SKU | 保有数量 | 対象範囲 | 補足 |");
  md.push("|---|---|---|---:|---|---|");
  for (const license of input.existing_licenses ?? []) {
    const applicableServices = Array.isArray(license.applicable_services) ? license.applicable_services.join("; ") : license.applicable_services;
    const notes = [applicableServices, license.notes].filter(Boolean).join(" / ");
    md.push(`| ${escapeMd(license.license_name)} | ${escapeMd(license.product_name)} | ${escapeMd(license.sku_name)} | ${license.quantity} | ${escapeMd(license.assigned_scope)} | ${escapeMd(notes)} |`);
  }
  md.push("");

  md.push("## 7. 数量根拠・補足");
  md.push("");
  for (const line of lines) {
    md.push(`### ${line.sku.product_name} / ${line.sku.sku_name}`);
    md.push("");
    md.push(`- ライセンス根拠: ${line.licenseReason}`);
    md.push(`- 数量根拠: ${line.quantityReason}`);
    md.push(`- 価格ソース: ${line.sourceUrl}`);
    md.push("");
  }

  md.push("## 8. 価格推移・改定影響");
  md.push("");
  md.push("| SKU | 前回USD | 最新USD | USD差分率 | 前回JPY | 最新JPY | JPY差分率 | 判定 |");
  md.push("|---|---:|---:|---:|---:|---:|---:|---|");
  for (const trend of trends) {
    md.push(`| ${escapeMd(trend.sku?.sku_name ?? trend.current.sku_id)} | ${formatUsd(trend.previous?.priceUsd)} | ${formatUsd(trend.current.priceUsd)} | ${pct(trend.deltaUsdPct)} | ${formatJpy(trend.previous?.priceJpy)} | ${formatJpy(trend.current.priceJpy)} | ${pct(trend.deltaJpyPct)} | ${trend.flag} |`);
  }
  md.push("");

  md.push("## 9. 仮定と未確定事項");
  md.push("");
  md.push("| 項目 | 仮定 | 試算影響 |");
  md.push("|---|---|---|");
  for (const item of req.unknown_items ?? []) {
    md.push(`| ${escapeMd(item.item)} | ${escapeMd(item.assumption)} | ${escapeMd(item.impact)} |`);
  }
  md.push("");

  md.push("## 10. ソース・注記");
  md.push("");
  md.push("| 対象SKU | ソース種別 | ソース | 価格基準日時 | 注記 |");
  md.push("|---|---|---|---|---|");
  for (const line of lines) {
    md.push(`| ${escapeMd(line.sku.sku_name)} | ${escapeMd(line.sourceType)} | ${escapeMd(line.sourceUrl)} | ${escapeMd(formatDate(line.priceAsOf))} | ${escapeMd(line.changeNote)} |`);
  }
  md.push("");
  if (samplePriceCount > 0) {
    md.push("本試算には計算検証用のサンプル単価が含まれます。公式価格ベースの概算として利用する前に、SKU価格スナップショットをMicrosoft公式価格情報で更新してください。");
  } else {
    md.push(`本試算は、${formatDate(estimate.pricing_as_of)}時点で取得または管理されているMicrosoft公式価格情報、および${formatDate(estimate.fx_as_of)}時点のUSD/JPY為替レートに基づく概算です。`);
  }
  md.push("正式な見積金額、契約価格、税額、EA/CSP等の個別割引、Microsoftまたは販売代理店による最終ライセンス判断を示すものではありません。");
  md.push("実際の購入前には、Microsoft公式情報、販売代理店、または契約管理者に確認してください。");
  md.push("");

  return md.join("\n");
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

  const markdown = renderMarkdown(input, lines, trends);
  await fs.mkdir(outputDir, { recursive: true });
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outputPath = path.join(outputDir, `ms-license-estimate-${slugify(input.estimate.project_name)}-${datePart}.md`);
  await fs.writeFile(outputPath, markdown, "utf8");

  console.log(JSON.stringify({
    outputPath,
    estimateLines: lines.length,
    skuRulesPath,
    existingLicensesPath,
    knownMonthlyUsd: sumKnown(lines, "monthlyUsd"),
    unknownPriceCount: lines.filter((line) => line.unitPriceUsd === null).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
