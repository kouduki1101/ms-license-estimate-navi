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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getPath(object, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), object);
}

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return "TBD";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function formatQuantity(value) {
  if (!Number.isFinite(value)) return "TBD";
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function evaluateRule(input, rule) {
  const usageObject = getPath(input, rule.usage_object_path) ?? {};
  const components = (rule.components ?? []).map((component) => {
    const rawQuantity = numberOrNull(usageObject[component.usage_field]);
    const usageQuantity = rawQuantity ?? numberOrNull(component.default_usage_quantity) ?? 0;
    const unitPriceUsd = numberOrNull(component.unit_price_usd) ?? 0;
    const usageDivisor = numberOrNull(component.usage_divisor) || 1;
    const monthlyUsd = (usageQuantity / usageDivisor) * unitPriceUsd;
    return {
      component_id: component.component_id,
      label: component.label,
      meter_name: component.meter_name,
      usage_field: component.usage_field,
      usage_quantity: usageQuantity,
      usage_unit: component.usage_unit,
      usage_divisor: usageDivisor,
      pricing_unit: rule.pricing_unit,
      unit_price_usd: unitPriceUsd,
      monthly_usd: monthlyUsd,
    };
  });
  return {
    rule_id: rule.rule_id,
    sku_id: rule.sku_id,
    label: rule.label,
    model: rule.model ?? "",
    region: rule.region,
    region_display_name: rule.region_display_name ?? rule.region,
    pricing_unit: rule.pricing_unit,
    aggregate_formula: rule.aggregate_formula,
    components,
    monthly_usd: components.reduce((sum, component) => sum + component.monthly_usd, 0),
  };
}

function summarize(rows) {
  const bySku = new Map();
  for (const row of rows) {
    const current = bySku.get(row.sku_id) ?? {
      sku_id: row.sku_id,
      monthly_usd: 0,
      rules: [],
    };
    current.monthly_usd += row.monthly_usd;
    current.rules.push(row.rule_id);
    bySku.set(row.sku_id, current);
  }
  return {
    total_monthly_usd: rows.reduce((sum, row) => sum + row.monthly_usd, 0),
    by_sku: [...bySku.values()],
  };
}

function renderMarkdown(input, rulesPath, rows, summary) {
  const lines = [];
  lines.push("# Azure従量課金メーター集約レポート");
  lines.push("");
  lines.push(`- 案件: ${input.estimate?.project_name ?? "TBD"}`);
  lines.push(`- 価格基準日時: ${input.estimate?.pricing_as_of ?? "TBD"}`);
  lines.push(`- ルール: ${rulesPath}`);
  lines.push(`- Azure従量課金 月額合計: ${formatUsd(summary.total_monthly_usd)}`);
  lines.push("");
  lines.push("## SKU別サマリー");
  lines.push("");
  lines.push("| SKU ID | 月額USD | 適用ルール |");
  lines.push("|---|---:|---|");
  for (const row of summary.by_sku) {
    lines.push(`| ${escapeMd(row.sku_id)} | ${formatUsd(row.monthly_usd)} | ${escapeMd(row.rules.join(", "))} |`);
  }
  lines.push("");
  lines.push("## メーター別内訳");
  lines.push("");
  lines.push("| SKU ID | Rule | Component | Meter | Usage | Unit price | Monthly USD |");
  lines.push("|---|---|---|---|---:|---:|---:|");
  for (const row of rows) {
    for (const component of row.components) {
      lines.push([
        row.sku_id,
        row.rule_id,
        component.label,
        component.meter_name,
        `${formatQuantity(component.usage_quantity)} ${component.usage_unit}`,
        `${formatUsd(component.unit_price_usd)} / ${row.pricing_unit}`,
        formatUsd(component.monthly_usd),
      ].map(escapeMd).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }
  lines.push("");
  lines.push("## 集約式");
  lines.push("");
  for (const row of rows) {
    lines.push(`- ${row.sku_id}: ${row.aggregate_formula}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input || path.join(ROOT, "sample-input.json"));
  const rulesPath = path.resolve(args.rules || path.join(ROOT, "rules", "azure-meter-aggregation-rules.json"));
  const outputDir = path.resolve(args["out-dir"] || path.join(ROOT, "outputs"));
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = path.resolve(args.out || path.join(outputDir, `azure-meter-estimate-${datePart}.md`));
  const jsonOutPath = path.resolve(args["json-out"] || path.join(outputDir, `azure-meter-estimate-${datePart}.json`));

  const input = await readJson(inputPath);
  const rules = await readJson(rulesPath);
  const rows = (rules.rules ?? []).map((rule) => evaluateRule(input, rule));
  const summary = summarize(rows);
  const markdown = renderMarkdown(input, rulesPath, rows, summary);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, markdown, "utf8");
  await fs.mkdir(path.dirname(jsonOutPath), { recursive: true });
  await fs.writeFile(jsonOutPath, `${JSON.stringify({ inputPath, rulesPath, summary, rows }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    inputPath,
    rulesPath,
    outPath,
    jsonOutPath,
    totalMonthlyUsd: summary.total_monthly_usd,
    ruleCount: rows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
