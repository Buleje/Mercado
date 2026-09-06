---
name: db-class-scaffold
description: |
  Genera una clase `lib/db/<modelo>.db.ts` conforme al rubric
  `.claude/rubrics/db-class.json`: tenantId como 1er parámetro, caché + audit +
  invalidate, sin fallback "main", sin interpolación en raw SQL. Usar cuando
  Brandon diga "nueva DB class", "clase de DB para X", "acceso a datos de X".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
argument-hint: "[modelo Prisma, ej: Product]"
---

# /db-class-scaffold — clase de acceso a datos conforme

Única vía de acceso a Prisma (CLAUDE.md regla 1). Leer `.claude/rubrics/db-class.json`
y un par de clases existentes (`Grep "class .*DB" lib/db`) como plantilla viva.

## Reglas críticas (rubric db-class.json)
1. **`tenantId` SIEMPRE es el 1er parámetro** de cada método. Sin fallback `"main"`.
2. Acceso a Prisma encapsulado: el resto del código jamás llama `prisma.*` directo.
3. **Caché**: lecturas con `cache`/`"use cache"` + `cacheTag`; **invalidar** tras
   cada write (`invalidate(key)` / `invalidateByPrefix(prefix)`).
4. **Audit**: registrar writes en el audit log (Ley 29733).
5. **Raw SQL** (si hace falta): solo placeholders `$1 $2 $3`, nunca interpolación.
6. Sufijo `DB` en el nombre de la clase; archivo `lib/db/<modelo>.db.ts`.

## Esqueleto base
```ts
import { prisma } from "@/lib/prisma";
import { cacheTag, invalidateByPrefix } from "@/lib/cache";
import { audit } from "@/lib/audit";

export class XxxDB {
  static async list(tenantId: string, opts?: { take?: number }) {
    "use cache";
    cacheTag(`xxx:${tenantId}`);
    return prisma.xxx.findMany({ where: { tenantId }, take: opts?.take ?? 50 });
  }

  static async getById(tenantId: string, id: string) {
    return prisma.xxx.findFirst({ where: { id, tenantId } });
  }

  static async create(tenantId: string, data: XxxCreateInput) {
    const row = await prisma.xxx.create({ data: { ...data, tenantId } });
    await invalidateByPrefix(`xxx:${tenantId}`);
    await audit(tenantId, "xxx.create", row.id);
    return row;
  }
}
```
Verificar nombres reales de `cache`/`audit`/`prisma` en el repo antes de escribir
(no asumir las firmas — `Grep` los helpers). Cerrar con `npx tsc --noEmit`.
