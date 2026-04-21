/**
 * scripts/generate-openapi.ts
 *
 * Genera openapi.json en la raíz del proyecto.
 *
 * Uso:
 *   npm run openapi:gen
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { generateOpenAPIDoc } from "../lib/openapi/generator";

const rootDir    = process.cwd();
const outputPath = join(rootDir, "openapi.json");

const doc = generateOpenAPIDoc();
const json = JSON.stringify(doc, null, 2);

writeFileSync(outputPath, json, "utf-8");

const sizeKB = (Buffer.byteLength(json, "utf-8") / 1024).toFixed(1);
console.log(`OpenAPI 3.1 spec generado en: ${outputPath} (${sizeKB} KB)`);
console.log(`Paths registrados: ${Object.keys(doc.paths ?? {}).length}`);
