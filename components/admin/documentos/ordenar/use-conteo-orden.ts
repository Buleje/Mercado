import { useCallback, useEffect, useState } from "react";
import type { PlanOrden, TipoPropuesta } from "@/lib/documentos/ordenar-archivo";
import { pedirOrden } from "./pedir-orden";

/**
 * Cuánto hay para ordenar, para la línea discreta del Archivo. Abrir el Archivo
 * NO pide el plan cada vez (22-10: el arranque se está adelgazando): la línea
 * sale del último conteo guardado y sólo se vuelve a pedir si es viejo, cuando
 * el navegador está libre y con la versión barata (sin comparar repetidos).
 * Abrir el modal, aplicar o deshacer lo refrescan.
 */

/** Lo que cuenta la línea: la IA tiene su propia pastilla y los repetidos se miran en el modal. */
const TIPOS: readonly TipoPropuesta[] = ["nombre", "basura", "carpeta"];
/** Un conteo más nuevo que esto se usa sin preguntar. */
const VIGENCIA_MS = 6 * 3600_000;
const EVENTO = "doc-ordenar-conteo";

export interface ConteoOrden {
  partes: { tipo: TipoPropuesta; n: number }[];
  total: number;
}
interface Guardado extends ConteoOrden {
  en: number;
}

function slug(): string {
  try {
    return localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    return "main";
  }
}
const claveOculto = () => `doc-ordenar-oculto-${slug()}`;
const claveConteo = () => `doc-ordenar-conteo-${slug()}`;

function leerGuardado(): Guardado | null {
  try {
    const g = JSON.parse(localStorage.getItem(claveConteo()) ?? "null") as Guardado | null;
    return g && Array.isArray(g.partes) && typeof g.en === "number" ? g : null;
  } catch {
    return null;
  }
}

/** Lo llama también el modal al traer el plan completo: la línea queda al día sin otro pedido. */
export function guardarConteo(p: PlanOrden): void {
  const partes = TIPOS.map((tipo) => ({ tipo, n: p.conteo[tipo] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const g: Guardado = { partes, total: partes.reduce((s, x) => s + x.n, 0), en: Date.now() };
  try {
    localStorage.setItem(claveConteo(), JSON.stringify(g));
  } catch {
    /* cuota: igual avisa en esta pestaña */
  }
  window.dispatchEvent(new CustomEvent<Guardado>(EVENTO, { detail: g }));
}

/** Cuando el navegador está libre (la lista del Archivo ya se pidió y se dibujó). */
function cuandoEsteLibre(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 8000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = window.setTimeout(fn, 3000);
  return () => window.clearTimeout(t);
}

export function useConteoOrden(activo: boolean, version: number) {
  const [conteo, setConteo] = useState<ConteoOrden | null>(null);
  const [oculto, setOculto] = useState<string | null>(null);

  // Lo guardado, al montar; y lo que guarde el modal mientras tanto.
  useEffect(() => {
    try { setOculto(localStorage.getItem(claveOculto())); } catch { /* sin almacenamiento */ }
    setConteo(leerGuardado());
    const alGuardar = (e: Event) => setConteo((e as CustomEvent<Guardado>).detail);
    window.addEventListener(EVENTO, alGuardar);
    return () => window.removeEventListener(EVENTO, alGuardar);
  }, []);

  useEffect(() => {
    if (!activo) return;
    const g = leerGuardado();
    // Al abrir: sólo si no hay conteo o es viejo. Tras aplicar o deshacer (version > 0): siempre.
    if (version === 0 && g && Date.now() - g.en < VIGENCIA_MS) return;
    const ctrl = new AbortController();
    const pedir = () =>
      pedirOrden<PlanOrden>({ modo: "plan", duplicados: false }, ctrl.signal)
        .then(guardarConteo)
        // Es un aviso de cortesía: si falla, simplemente no sale (o queda el último).
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) console.warn("[documentos] conteo de ordenar", err);
        });
    const cancelar = version === 0 ? cuandoEsteLibre(() => void pedir()) : (void pedir(), () => undefined);
    return () => {
      cancelar();
      ctrl.abort();
    };
  }, [activo, version]);

  /** Firma de lo que hay: si aparece algo nuevo, la línea vuelve a salir. */
  const firma = conteo ? conteo.partes.map((x) => `${x.tipo}${x.n}`).join("-") : "";
  const ocultar = useCallback(() => {
    setOculto(firma);
    try { localStorage.setItem(claveOculto(), firma); } catch { /* cuota */ }
  }, [firma]);

  const visible = !!conteo && conteo.total > 0 && oculto !== firma;
  return { conteo: visible ? conteo : null, ocultar };
}
