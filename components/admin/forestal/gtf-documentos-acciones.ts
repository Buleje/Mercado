/**
 * Lo que se hace con los archivos de «Documentos del permiso» (vista GTF del
 * Libro TH, 08-10): descargar e imprimir por el proxy del Drive (mismo
 * origen, con sesión) y juntar las carpetas del plan con sus archivos.
 */

import type { ArchivoDelPlan, PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";

export const raw = (id: string) => `/api/admin/documents/${encodeURIComponent(id)}/raw`;

/** Descarga por el proxy del Drive (con sesión). Varios: uno tras otro, para que el navegador no los junte. */
export function descargar(docs: readonly ArchivoDelPlan[]) {
  docs.forEach((d, i) =>
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = `${raw(d.documentId)}?download=1`;
      a.download = d.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400),
  );
}

/** Imprime uno: el archivo en un marco oculto (mismo origen) y el diálogo de impresión; vuelve al cerrarlo. */
export function imprimirUno(d: ArchivoDelPlan): Promise<void> {
  return new Promise((resolve) => {
    const marco = document.createElement("iframe");
    marco.setAttribute("aria-hidden", "true");
    marco.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    const fin = () =>
      setTimeout(() => {
        marco.remove();
        resolve();
      }, 500);
    marco.onload = () => {
      const w = marco.contentWindow;
      if (!w) return fin();
      w.addEventListener("afterprint", fin, { once: true });
      try {
        w.focus();
        w.print();
      } catch (err) {
        console.warn("[gtf-documentos] no se pudo imprimir en el marco; se abre aparte", err);
        window.open(raw(d.documentId), "_blank", "noopener");
        fin();
      }
    };
    marco.src = raw(d.documentId);
    document.body.appendChild(marco);
  });
}

export interface CarpetaConArchivos {
  clave: string;
  nombre: string;
  archivos: ArchivoDelPlan[];
}

/** Las carpetas con sus archivos (los de cada casillero y los sueltos), sin repetir. */
export function carpetasConArchivos(v: PlanDocumentosVista): CarpetaConArchivos[] {
  return [...v.carpetas]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => {
      const vistos = new Set<string>();
      const archivos = [...c.casilleros.flatMap((k) => k.archivos), ...c.sueltos].filter(
        (a) => !vistos.has(a.documentId) && vistos.add(a.documentId),
      );
      return { clave: c.clave, nombre: c.nombre, archivos };
    });
}

export const fecha = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
