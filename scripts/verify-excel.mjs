import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

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

function safeName(name) {
  return String(name).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) throw new Error("Missing --input <xlsx>");
  const inputPath = path.resolve(args.input);
  const outDir = path.resolve(args["out-dir"] || path.join(path.dirname(inputPath), "excel-previews"));
  const input = await FileBlob.load(inputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheets = ["Summary", "License Estimate", "Price Trend", "Source Notes"];

  await fs.mkdir(outDir, { recursive: true });
  const outputs = [];
  for (const sheetName of sheets) {
    const blob = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const outputPath = path.join(outDir, `${safeName(sheetName)}.png`);
    await fs.writeFile(outputPath, bytes);
    outputs.push({ sheetName, outputPath, bytes: bytes.byteLength });
  }

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 50 },
    summary: "formula error scan",
  });

  console.log(JSON.stringify({ inputPath, outputs, formulaErrors: errors.ndjson }, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
