---
name: db-sanity
description: Chequea que las tablas y columnas del Prisma schema realmente existan en la DB de Supabase. Detecta schema drift (lo que destapó el 500 de socio-buleje — tablas escritas en schema pero nunca migradas). Usar cuando toques lib/db/*, cuando aparezca un error P2021/P2022 en runtime, o cuando Brandon diga "chequear DB", "schema drift", "db sanity".
user-invocable: true
model: haiku
allowed-tools: Bash, Read, Write, Grep, Glob
argument-hint: "[model-name | all]"
---

# /db-sanity — Inspector de schema drift

**Qué hace (Feynman):** Llama a la heladera y le pregunta: "¿tenés estas bandejas?". Compara el Prisma schema con la DB real de Supabase. Si una tabla o columna falta, avisa.

## Cuándo dispararse

- Antes de confiar en una query nueva a un modelo que no hayas usado en la sesión
- Cuando un endpoint devuelva 500 con error P2021 (table missing) o P2022 (column missing)
- Cuando cambies `prisma/schema.prisma`
- Despues de `git pull` si tocaron el schema

## Algoritmo

### `/db-sanity all` (~30s)

1. Leer `prisma/schema.prisma` y extraer lista de modelos (`model Foo {`).
2. Por cada modelo, intentar `prisma.<model>.findFirst({ take: 1 })` con tsx.
3. Capturar errores y clasificarlos:
   - `P2021 / TableDoesNotExist` → tabla falta
   - `P2022 / ColumnDoesNotExist` → columna falta
   - OK → tabla y columnas del schema existen
4. Reportar en tabla.

### `/db-sanity <model>` (~5s)

Mismo que `all` pero solo para un modelo específico (ej. `/db-sanity SocioMembership`).

## Script

Crear archivo `_db_sanity.ts` en el root del proyecto:

```ts
import { prisma } from "./lib/prisma";
import { readFileSync } from "node:fs";

const schemaText = readFileSync("prisma/schema.prisma", "utf8");
const MODELS = [...schemaText.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);

const filter = process.argv[2];
const toCheck = filter && filter !== "all"
  ? MODELS.filter((m) => m.toLowerCase() === filter.toLowerCase())
  : MODELS;

const results: Array<{ model: string; status: string; detail: string }> = [];

for (const model of toCheck) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const client = (prisma as unknown as Record<string, { findFirst: () => Promise<unknown> }>)[key];
  if (!client?.findFirst) {
    results.push({ model, status: "SKIP", detail: "no accessor" });
    continue;
  }
  try {
    await client.findFirst();
    results.push({ model, status: "OK", detail: "" });
  } catch (e: unknown) {
    const err = e as { code?: string; meta?: { driverAdapterError?: { cause?: { kind?: string; table?: string; column?: string } } } };
    const cause = err.meta?.driverAdapterError?.cause;
    const kind = cause?.kind ?? err.code ?? "?";
    const loc = cause?.column ? `col ${cause.column}` : cause?.table ?? "?";
    results.push({ model, status: "FAIL", detail: `${kind} ${loc}` });
  }
}

await prisma.$disconnect();

const ok = results.filter((r) => r.status === "OK").length;
const fail = results.filter((r) => r.status === "FAIL").length;
const skip = results.filter((r) => r.status === "SKIP").length;

console.log(`\n=== DB Sanity Report ===`);
console.log(`OK: ${ok} · FAIL: ${fail} · SKIP: ${skip}\n`);

if (fail > 0) {
  console.log("Failures:");
  for (const r of results.filter((r) => r.status === "FAIL")) {
    console.log(`  FAIL ${r.model} — ${r.detail}`);
  }
  process.exit(1);
}
process.exit(0);
```

Correr: `npx tsx -r dotenv/config _db_sanity.ts [model]`

Borrar el archivo al terminar: `cmd //c "del _db_sanity.ts"`.

## Reporte esperado

Tabla Feynman del resultado:

| Modelo | Estado | Detalle | Qué significa |
|---|---|---|---|
| `Store` | OK | — | La cocina tiene la bandeja |
| `SocioMembership` | FAIL | TableDoesNotExist `public.socio_memberships` | Escribiste la receta pero nadie cocinó |
| `Product` | FAIL | ColumnDoesNotExist `weight` | La bandeja existe pero le falta un cajón |

## Acción al detectar drift

1. Si falta tabla: proponer correr `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy`
2. Si DNS falla para DIRECT_URL: aplicar fix defensivo (catch P2021 → null)
3. Actualizar `TECH-DEBT.md` con la tabla pendiente

## Referencias

- Pattern defensivo: `lib/db/subscriptions.db.ts:listForUser` (catch → `[]`)
- Ejemplo de fix: `lib/db/socio-buleje.db.ts:getMembership` (catch P2021 → `null`)
