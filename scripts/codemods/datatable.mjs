#!/usr/bin/env node
/**
 * datatable — `<table className="…">…</table>` en JSX pasa a
 * `<DataTable className="…">…</DataTable>` del DS (ADR-489), con `thead`,
 * `tbody`, filas y celdas INTACTOS: cambia la etiqueta, no el contenido.
 *
 * - Sólo archivos .tsx donde TODA `<table` es JSX (lleva `className=`): si el
 *   archivo además arma HTML de impresión en texto (`<table class=…>` en un
 *   template), queda «a revisar» — no se puede saber qué `</table>` es de cuál.
 * - DataTable trae su propia caja con scroll y borde. Si la tabla ya estaba
 *   dentro de un `overflow-x-auto`, se le pasa `wrapperClassName` para no
 *   dibujar dos cajas (una sola caja de scroll: ver DataTable `wrapperProps`).
 *
 *   node scripts/codemods/datatable.mjs --seco [--carpeta components/admin/inventario] [--muestra 3]
 */
import { asegurarImport, correr, esPrincipal, nombreOcupado } from "./_comun.mjs";

const SIN_CAJA = ' wrapperClassName="overflow-visible rounded-none border-0"';

export function transformar(texto, rel = "x.tsx") {
  if (!rel.endsWith(".tsx")) return { texto, cambios: 0, revisar: 0 };
  const jsx = (texto.match(/<table\s+className=/g) || []).length;
  if (!jsx) return { texto, cambios: 0, revisar: 0 };
  const todas = (texto.match(/<table\b/g) || []).length;
  const cierres = (texto.match(/<\/table>/g) || []).length;
  if (todas !== jsx || cierres !== jsx) return { texto, cambios: 0, revisar: jsx };
  /* DataTable no reenvía ref a su <table>: esas, a mano. */
  if (/<table\b[^<>]*\bref=/.test(texto)) return { texto, cambios: 0, revisar: jsx };
  /* Con un `DataTable` propio, su <table> pasaría a llamarse a sí misma: a mano. */
  if (nombreOcupado(texto, "DataTable", "@buleje/design-system")) return { texto, cambios: 0, revisar: jsx };

  const ejemplos = [];
  let nuevo = texto.replace(/<table\s+className=/g, (todo, i) => {
    const previo = texto.slice(Math.max(0, i - 240), i);
    const dentroDeScroll = /<div\b[^<>]*overflow-x-auto[^<>]*>\s*$/.test(previo);
    const salida = `<DataTable${dentroDeScroll ? SIN_CAJA : ""} className=`;
    if (ejemplos.length < 2) ejemplos.push([todo, salida]);
    return salida;
  });
  nuevo = nuevo.replace(/<\/table>/g, "</DataTable>");
  return { texto: asegurarImport(nuevo, "DataTable", "@buleje/design-system"), cambios: jsx, revisar: 0, ejemplos };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "datatable", que: "<table> en JSX → <DataTable> (thead/tbody intactos)", transformar }));
}
