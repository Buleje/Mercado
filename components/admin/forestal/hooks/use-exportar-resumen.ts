"use client";

/**
 * Exportar los Resúmenes del cubicador: imprimir (la vista que se ve o todas)
 * y bajar el CSV de especie × tipo. Va en el menú «Exportar» de la cabecera.
 *
 * «Imprimir no hace nada» (Brandon, 20-10): el botón SÍ llamaba a
 * `window.print()`, pero la hoja salía en blanco. El `@media print` de
 * `globals.css` pone `body * { visibility: hidden !important }` y la regla de
 * esta pantalla que volvía visible el resumen no llevaba `!important`: perdía
 * siempre (medido: PDF de 5 hojas sin una letra). En oscuro, además, el texto
 * claro sobre papel blanco no se ve: se imprime en claro (`imprimirEnClaro`).
 */
import { useEffect, useMemo, useState } from "react";
import { Download, FileStack, Printer } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { imprimirEnClaro } from "@/components/admin/OrdersTab/imprimir-pedidos";
import type { ResumenLote, resumenPorEspecie } from "@/lib/forestal/cubicacion-resumen";
import { limaDateKey } from "@/lib/utils";

/** Id de la raíz que va al papel: lo usan la CSS de abajo y `CubicacionResumenes`. */
export const ID_RESUMEN_LOTE = "resumen-lote";

/**
 * La hoja: sólo el resumen, sin el panel alrededor y con colores de papel.
 * `:has()` apaga todo lo que no es el resumen ni lo contiene: sin eso el panel
 * escondido seguía ocupando su alto y salían hojas en blanco al final.
 */
export const CSS_IMPRESION_RESUMEN = `@media print {
  html, body { overflow: visible !important; height: auto !important; background: white !important; }
  body *:not(:has(#${ID_RESUMEN_LOTE})):not(#${ID_RESUMEN_LOTE}):not(#${ID_RESUMEN_LOTE} *) { display: none !important; }
  #${ID_RESUMEN_LOTE}, #${ID_RESUMEN_LOTE} * { visibility: visible !important; }
  #${ID_RESUMEN_LOTE} { position: absolute !important; left: 0; top: 0; width: 100%; color-scheme: light; color: black;
    --text-primary: black; --text-secondary: dimgray; --text-tertiary: gray;
    --rule-base: silver; --rule-soft: gainsboro; --rule-strong: gray; --color-border: silver; --color-input: silver;
    --surface-raised: transparent; --surface-sunken: transparent; --surface-canvas: transparent; }
  /* Ctrl+P en oscuro no pasa por imprimirEnClaro: el panel oscuro pinta estos bordes
     con un gris fijo y !important (globals.css), y el id gana por especificidad. */
  #${ID_RESUMEN_LOTE} .border-\\[var\\(--rule-base\\)\\], #${ID_RESUMEN_LOTE} .border-\\[var\\(--rule-soft\\)\\] { border-color: silver !important; }
  #${ID_RESUMEN_LOTE} .bg-\\[var\\(--surface-sunken\\)\\], #${ID_RESUMEN_LOTE} .bg-\\[var\\(--surface-canvas\\)\\] { background-color: transparent !important; }
  #${ID_RESUMEN_LOTE} section { break-inside: avoid; }
  @page { size: A4 portrait; margin: 12mm; }
}`;

export type ModoImpresion = "vista" | "todo";

export function useExportarResumen({ bloques, total, conValor, vistaLabel }: {
  bloques: ReturnType<typeof resumenPorEspecie>;
  total: ResumenLote["total"];
  conValor: boolean;
  /** Rótulo de la vista abierta («Distribución»): va en el menú. */
  vistaLabel: string;
}): { imprimiendo: ModoImpresion | null; acciones: MenuAccion[] } {
  /* `n` cambia en cada pedido: si el diálogo se cerró sin `afterprint` (pasa en
     algún Android), el mismo modo dos veces seguidas igual vuelve a imprimir. */
  const [pedido, setPedido] = useState<{ modo: ModoImpresion; n: number } | null>(null);

  /* Dos `requestAnimationFrame` porque `print()` fotografía lo que YA está
     pintado, no lo que React acaba de agendar («todo» monta las cinco vistas). */
  useEffect(() => {
    if (!pedido) return;
    let cancelado = false;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cancelado) return;
      imprimirEnClaro(`resumen-cubicacion-${limaDateKey(new Date())}`, () => setPedido(null));
    }));
    return () => { cancelado = true; cancelAnimationFrame(id); };
  }, [pedido]);

  const acciones = useMemo<MenuAccion[]>(() => {
    /**
     * El CSV baja con la precisión COMPLETA aunque la pantalla redondee: es el
     * archivo con el que el contador recalcula, y ahí el centésimo de pie sí
     * importa. `Number(...)` porque el lote viene de localStorage — un string
     * colado rompería el `.toFixed` sin avisar.
     */
    const bajarCSV = () => {
      const lineas: string[] = ["Especie,Tipo,Piezas,PieTablar,m3" + (conValor ? ",ValorS/" : "")];
      for (const b of bloques) {
        for (const t of b.tipos) {
          lineas.push([b.especie, t.label, t.cantidad, Number(t.pieTablar).toFixed(2), Number(t.m3).toFixed(4), ...(conValor ? [Number(t.valor).toFixed(2)] : [])].join(","));
        }
      }
      lineas.push(["TOTAL", "", total.cantidad, Number(total.pieTablar).toFixed(2), Number(total.m3).toFixed(4), ...(conValor ? [Number(total.valor).toFixed(2)] : [])].join(","));
      const url = URL.createObjectURL(new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url; a.download = `resumenes-cubicacion-${limaDateKey(new Date())}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    return [
      { id: "imprimir-vista", label: `Imprimir «${vistaLabel}»`, hint: "Sólo la vista que tienes abierta, en A4 y en claro", icon: Printer, onSelect: () => setPedido({ modo: "vista", n: Date.now() }) },
      { id: "imprimir-todo", label: "Imprimir todo el resumen", hint: "Las cinco vistas, una debajo de otra", icon: FileStack, onSelect: () => setPedido({ modo: "todo", n: Date.now() }) },
      { id: "csv", label: "Bajar CSV", hint: "Especie × tipo con todos los decimales, para el contador", icon: Download, onSelect: bajarCSV },
    ];
  }, [bloques, total, conValor, vistaLabel]);

  return { imprimiendo: pedido?.modo ?? null, acciones };
}
