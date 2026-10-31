/**
 * Imprimir una planilla de campo: la hoja A4 de `htmlDePlanilla` en una
 * ventana propia (patrón de los `*-print` del forestal).
 *
 * La ventana se abre en el MISMO clic, antes de cargar el armador de la hoja:
 * después de un `await` el navegador la trata como pop-up y la bloquea
 * (ADR-436). Se muestra primero con un botón «Imprimir / Guardar como PDF»
 * arriba, que no sale en el papel; no se dispara `print()` solo (en el celular
 * tapaba la vista previa y sorprendía).
 */
import type { PlanillaCampo } from "@/lib/forestal/planillas/tipos";

const ID_BARRA = "planilla-barra-imprimir";

export function ponerBarra(w: Window): void {
  const d = w.document;
  if (!d.body || d.getElementById(ID_BARRA)) return;
  const estilo = d.createElement("style");
  estilo.textContent = `#${ID_BARRA}{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;padding:8px;background:white}
#${ID_BARRA} button{cursor:pointer;border:0;border-radius:10px;padding:12px 18px;font:700 14px system-ui;background:black;color:white}
@media print{#${ID_BARRA}{display:none}}`;
  d.head?.appendChild(estilo);
  const barra = d.createElement("div");
  barra.id = ID_BARRA;
  const boton = d.createElement("button");
  boton.type = "button";
  boton.textContent = "Imprimir / Guardar como PDF";
  boton.addEventListener("click", () => w.print());
  barra.appendChild(boton);
  d.body.insertBefore(barra, d.body.firstChild);
}

export async function imprimirPlanilla(
  planilla: PlanillaCampo,
  opts: { negocio?: string; copias?: number; codigo?: string; lote?: string; ficha?: { etiqueta: string; valor: string }[] } = {},
): Promise<void> {
  const w = window.open("", "_blank", "width=980,height=760");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir la hoja.");
  w.document.write(`<p style="font:16px system-ui;padding:24px">Armando la hoja…</p>`);
  try {
    const { htmlDePlanilla } = await import("@/lib/forestal/planillas/imprimir");
    const html = htmlDePlanilla(planilla, { negocio: opts.negocio || undefined, copias: opts.copias, codigo: opts.codigo, lote: opts.lote, ficha: opts.ficha });
    w.document.open();
    w.document.write(html);
    w.document.close();
    ponerBarra(w);
    w.focus();
  } catch (e) {
    w.close();
    throw e instanceof Error ? e : new Error(String(e));
  }
}
