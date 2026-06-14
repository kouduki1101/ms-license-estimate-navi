import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://prices.azure.com/api/retail/prices";

function usage() {
  return [
    "Usage:",
    "  node .\\scripts\\fetch-azure-retail-prices.mjs --service-name <name> [options]",
    "",
    "Options:",
    "  --service-name <name>       Azure serviceName filter, e.g. Azure OpenAI",
    "  --sku-name <name>           Optional skuName filter",
    "  --meter-name <name>         Optional meterName filter",
    "  --product-name-contains <s> Optional productName contains filter",
    "  --sku-name-contains <s>     Optional skuName contains filter",
    "  --meter-name-contains <s>   Optional meterName contains filter",
    "  --arm-region-name <name>    Optional armRegionName filter, e.g. eastus",
    "  --currency-code <code>      Defaults to USD",
    "  --max-pages <n>             Defaults to 2",
    "  --out <csv>                 Defaults to outputs/azure-retail-prices.csv",
    "  --dry-run                   Print request URL without fetching",
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

function odataEscape(value) {
  return String(value).replace(/'/g, "''");
}

function buildUrl(args) {
  const filters = [];
  const currencyCode = args["currency-code"] || "USD";
  if (args["service-name"]) filters.push(`serviceName eq '${odataEscape(args["service-name"])}'`);
  if (args["sku-name"]) filters.push(`skuName eq '${odataEscape(args["sku-name"])}'`);
  if (args["meter-name"]) filters.push(`meterName eq '${odataEscape(args["meter-name"])}'`);
  if (args["product-name-contains"]) filters.push(`contains(productName, '${odataEscape(args["product-name-contains"])}')`);
  if (args["sku-name-contains"]) filters.push(`contains(skuName, '${odataEscape(args["sku-name-contains"])}')`);
  if (args["meter-name-contains"]) filters.push(`contains(meterName, '${odataEscape(args["meter-name-contains"])}')`);
  if (args["arm-region-name"]) filters.push(`armRegionName eq '${odataEscape(args["arm-region-name"])}'`);

  const url = new URL(API_BASE);
  url.searchParams.set("currencyCode", currencyCode);
  if (filters.length > 0) url.searchParams.set("$filter", filters.join(" and "));
  return url;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const headers = [
    "currencyCode",
    "retailPrice",
    "unitPrice",
    "serviceName",
    "productName",
    "skuName",
    "meterName",
    "unitOfMeasure",
    "armRegionName",
    "location",
    "effectiveStartDate",
    "isPrimaryMeterRegion",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n") + "\n";
}

async function fetchPages(firstUrl, maxPages) {
  const rows = [];
  let url = firstUrl.href;
  for (let page = 0; page < maxPages && url; page += 1) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Azure Retail Prices API failed: ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    rows.push(...(payload.Items || []));
    url = payload.NextPageLink || "";
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }
  if (!args["service-name"] && !args["product-name-contains"] && !args["sku-name-contains"] && !args["meter-name-contains"]) {
    throw new Error("Missing filter. Provide --service-name or a contains filter.\n\n" + usage());
  }

  const url = buildUrl(args);
  if (args["dry-run"]) {
    console.log(url.href);
    return;
  }

  const maxPages = Number.parseInt(args["max-pages"] || "2", 10);
  const rows = await fetchPages(url, Number.isFinite(maxPages) ? maxPages : 2);
  const out = path.resolve(args.out || path.join("outputs", "azure-retail-prices.csv"));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, toCsv(rows), "utf8");
  console.log(JSON.stringify({ out, rows: rows.length, requestUrl: url.href }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
