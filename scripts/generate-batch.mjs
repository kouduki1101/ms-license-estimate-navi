import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
      const name = key.slice(2);
      if (name === "input") {
        args.input = [...(args.input ?? []), next];
      } else {
        args[name] = next;
      }
      i += 1;
    }
  }
  return args;
}

function splitFormats(value) {
  return String(value || "md,xlsx")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function discoverInputs(args) {
  const explicitInputs = args.input ?? [];
  if (explicitInputs.length > 0) return explicitInputs.map((input) => path.resolve(input));

  const inputDir = path.resolve(args["input-dir"] || path.join(ROOT, "samples", "batch-inputs"));
  const entries = await fs.readdir(inputDir);
  return entries
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => path.join(inputDir, entry));
}

function runNodeScript(scriptPath, scriptArgs) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: process.env.HOME || process.env.USERPROFILE || "C:\\Users\\kazuki.yoshioka",
    },
  });

  if (result.status !== 0) {
    throw new Error([
      `Command failed: node ${scriptPath}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join("\n"));
  }

  const stdout = result.stdout.trim();
  try {
    return JSON.parse(stdout);
  } catch {
    return { stdout };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputs = await discoverInputs(args);
  const formats = splitFormats(args.formats);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outDir = path.resolve(args["out-dir"] || path.join(ROOT, "outputs", `batch-${datePart}`));
  const skuMaster = path.resolve(args["sku-master"] || path.join(ROOT, "sku_master.csv"));
  const priceSnapshots = path.resolve(args["price-snapshots"] || path.join(ROOT, "sku_price_snapshot.csv"));
  const skuRules = path.resolve(args["sku-rules"] || path.join(ROOT, "rules", "sku-selection-rules.json"));
  const existingLicenses = args["existing-licenses"] ? path.resolve(args["existing-licenses"]) : null;

  if (inputs.length === 0) {
    throw new Error("No input JSON files found. Use --input <file> or --input-dir <dir>.");
  }

  await fs.mkdir(outDir, { recursive: true });

  const results = [];
  for (const inputPath of inputs) {
    const baseArgs = [
      "--input", inputPath,
      "--sku-master", skuMaster,
      "--price-snapshots", priceSnapshots,
      "--sku-rules", skuRules,
      "--out-dir", outDir,
    ];
    if (existingLicenses) baseArgs.push("--existing-licenses", existingLicenses);

    const item = { inputPath, outputs: {} };
    if (formats.includes("md") || formats.includes("markdown")) {
      item.outputs.markdown = runNodeScript(path.join(ROOT, "scripts", "generate-report.mjs"), baseArgs);
    }
    if (formats.includes("xlsx") || formats.includes("excel")) {
      item.outputs.excel = runNodeScript(path.join(ROOT, "scripts", "generate-excel.mjs"), baseArgs);
    }
    results.push(item);
  }

  const manifestPath = path.join(outDir, "batch-manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    formats,
    inputCount: inputs.length,
    outDir,
    results,
  }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    inputCount: inputs.length,
    formats,
    outDir,
    manifestPath,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
