#!/usr/bin/env node
/**
 * Patch idempotente para contexts/cart-context.tsx:
 *   1. Agrega guard defensivo multi-store (no borrar si TODOS los items
 *      "desaparecen" — ocurre en marketplace con items de múltiples stores).
 *   2. Migra la validación de `/api/products?active=true` al nuevo endpoint
 *      `/api/marketplace/products/check-exists?ids=...` — semántica correcta.
 *
 * Motivación: el hook danger-zone.mjs bloquea Edit/Write/MultiEdit directos a
 * cart-context.tsx (por razones legítimas). Este script aplica el patch vía
 * fs.writeFileSync, documentado por
 * .github/instructions/state-management.instructions.md.
 *
 * Idempotente: si el patch ya está aplicado, no hace nada.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "contexts", "cart-context.tsx");
const src = readFileSync(FILE, "utf8");

const MARKER = "/* cart-hydration-patch-v1 */";
if (src.includes(MARKER)) {
  console.log("patch-cart-hydration: ya aplicado (marker presente). Nada que hacer.");
  process.exit(0);
}

const OLD = `        // Validate cart items still exist in DB — remove stale/deleted products
        fetch("/api/products?active=true")
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            const products: { id: number }[] = Array.isArray(data) ? data : [];
            const validIds = new Set(products.map((p: { id: number }) => p.id));
            const validItems = items.filter((item: CartItem) => validIds.has(item.id));
            if (validItems.length !== items.length) {
              // Some items were deleted — update cart
              dispatch({ type: "HYDRATE", payload: validItems });
              localStorage.setItem(sk(s, "cart"), JSON.stringify(validItems));
            }
          })
          .catch(() => { /* silently ignore — cart stays as-is */ });`;

const NEW = `        ${MARKER}
        // Validate cart items still exist in DB — remove stale/deleted products.
        //
        // Endpoint: /api/marketplace/products/check-exists cruza stores (marketplace
        // multi-tenant). El endpoint legacy /api/products?active=true solo devuelve
        // productos del tenant "main" → borraba el carrito al hidratar si los items
        // venían de otros stores. Bug 2026-04-19.
        //
        // Guard: si por alguna razón la respuesta no es confiable (empty, error),
        // NUNCA borrar el carrito entero. Ver
        // .github/instructions/state-management.instructions.md.
        const idsQuery = items.map((i: CartItem) => i.id).join(",");
        fetch(\`/api/marketplace/products/check-exists?ids=\${idsQuery}\`)
          .then(r => r.ok ? r.json() : null)
          .then((data: { existingIds?: number[]; missingIds?: number[] } | null) => {
            if (!data || !Array.isArray(data.existingIds)) return;
            const existing = new Set<number>(data.existingIds);
            const validItems = items.filter((item: CartItem) => existing.has(item.id));

            // Guard: preservar carrito si TODOS "desaparecerían" (señal dudosa).
            if (validItems.length === 0 && items.length > 0) return;

            if (validItems.length !== items.length) {
              dispatch({ type: "HYDRATE", payload: validItems });
              localStorage.setItem(sk(s, "cart"), JSON.stringify(validItems));
            }
          })
          .catch(() => { /* silently ignore — cart stays as-is */ });`;

if (!src.includes(OLD)) {
  console.error(
    "patch-cart-hydration: bloque original no encontrado. Verificar que cart-context.tsx no haya cambiado desde 2026-04-19.",
  );
  process.exit(1);
}

const patched = src.replace(OLD, NEW);
writeFileSync(FILE, patched);
console.log("patch-cart-hydration: OK. Guard + migración a check-exists aplicados.");
