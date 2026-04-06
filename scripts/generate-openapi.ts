import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { generateOpenAPIDoc } from "../lib/openapi/generator";

const outputDir = join(process.cwd(), "public");
const outputPath = join(outputDir, "openapi.json");

mkdirSync(outputDir, { recursive: true });

const doc = generateOpenAPIDoc();
writeFileSync(outputPath, JSON.stringify(doc, null, 2), "utf-8");

console.log(`OpenAPI spec generado en: ${outputPath}`);
