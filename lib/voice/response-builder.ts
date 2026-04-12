import type { DraftOrder } from "./order-extractor";

/**
 * Construye el mensaje de confirmación que se enviará al cliente por WhatsApp.
 * Usa texto plano con formato WhatsApp (*negrita*, _itálica_).
 * No usa botones interactivos — compatibilidad máxima con todos los planes de Meta.
 */
export function buildConfirmationMessage(
  draft: DraftOrder,
  storeName: string,
): string {
  const lines: string[] = [];

  lines.push(`*${storeName}* — Resumen de tu pedido de voz 🎙️`);
  lines.push("");

  // ── Items detectados y resueltos ────────────────────────────────────────────
  if (draft.items.length > 0) {
    lines.push("*Productos detectados:*");
    for (const item of draft.items) {
      const unitStr = item.unit ? ` ${item.unit}` : "";
      const name = item.matchedName ?? item.nameGuess;
      lines.push(`  • ${item.quantity}${unitStr} de ${name}`);
    }
    lines.push("");
  }

  // ── Items no resueltos ──────────────────────────────────────────────────────
  if (draft.unresolved.length > 0) {
    lines.push("⚠️ *No encontré estos productos en el catálogo:*");
    for (const item of draft.unresolved) {
      const unitStr = item.unit ? ` ${item.unit}` : "";
      lines.push(`  • ${item.quantity}${unitStr} de _${item.nameGuess}_`);
    }
    lines.push("");
  }

  // ── Nota adicional ──────────────────────────────────────────────────────────
  if (draft.notes) {
    lines.push(`📝 *Nota:* ${draft.notes}`);
    lines.push("");
  }

  // ── Total de items (solo si hay resueltos) ──────────────────────────────────
  const totalItems = draft.items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalItems > 0) {
    lines.push(`_Total: ${totalItems} unidad(es) en ${draft.items.length} producto(s)_`);
    lines.push("");
  }

  // ── Opciones de respuesta ───────────────────────────────────────────────────
  if (draft.items.length === 0 && draft.unresolved.length === 0) {
    lines.push("No pude identificar productos en tu mensaje. ¿Puedes escribirme qué deseas?");
    return lines.join("\n");
  }

  lines.push("¿Confirmamos el pedido?");
  lines.push("");
  lines.push("Responde:");
  lines.push("  ✅ *1* — Confirmar");
  lines.push("  ✏️ *2* — Editar (escríbeme los cambios)");
  lines.push("  ❌ *3* — Cancelar");

  return lines.join("\n");
}

/**
 * Mensaje simple cuando no se detectaron intenciones de pedido.
 */
export function buildFallbackMessage(storeName: string): string {
  return [
    `*${storeName}* — No entendí bien tu mensaje de voz.`,
    "",
    "¿Puedes escribirme lo que necesitas? Por ejemplo:",
    '_"Quiero 2 kg de arroz y 1 litro de aceite"_',
  ].join("\n");
}
