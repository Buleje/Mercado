/**
 * Revisión ENTRE archivos antes de importar el libro (Brandon 19-10, ADR-503).
 *
 * Con un archivo por sección, los choques se veían recién en el servidor; con
 * VARIOS archivos por sección aparecen choques que ningún archivo tiene solo:
 *
 * - el mismo **código de planta** en dos inventarios de rolliza: el índice
 *   único de la planta rechaza la guía ENTERA del segundo (422) y se pierden
 *   sus otras trozas;
 * - la misma **GTF** en dos archivos: el importador es insert-only por guía, así
 *   que entra una vez y con el permiso del PRIMERO, aunque el segundo diga otro;
 * - el mismo **paquete** (`produccionKey`) en dos archivos: el segundo se toma
 *   como ya cargado;
 * - una GTF cuyas trozas traen **dos contratos**: la guía guarda uno solo (el
 *   de la primera troza) — el otro se anota, pero hay que saberlo antes.
 *
 * PURO: recibe lo leído y devuelve avisos; no sabe de fetch ni de DOM. Los
 * avisos no frenan el import —el operador decide—, pero salen ANTES del botón.
 */

import { produccionKey } from "./ctp-claves-import";
import type { FilaParseada, FormatoCtp } from "./ctp-formatos-serfor";
import { aCuerpoDelLibro, contratosDeLaGuia, estaEnStock } from "./ctp-serfor-a-libro";

/**
 * Las secciones a las que se les asigna permiso por archivo. Consumos,
 * Retrozado y Salidas no: su origen se hereda de lo que consumen o despachan.
 */
export const FORMATOS_CON_PERMISO: ReadonlySet<FormatoCtp> = new Set<FormatoCtp>([
  "ingresos",
  "inventarioTrozas",
  "inventarioAserrada",
  "produccion",
]);

export const llevaPermiso = (f: FormatoCtp): boolean => FORMATOS_CON_PERMISO.has(f);

export interface ArchivoARevisar {
  id: string;
  nombre: string;
  formato: FormatoCtp;
  parseadas: readonly FilaParseada[];
  /** El permiso elegido para el archivo (código para el mensaje), o `null`. */
  permiso: { id: string; codigo: string } | null;
}

export type TipoAvisoEntreArchivos =
  | "planta-repetida"
  | "gtf-dos-permisos"
  | "gtf-repetida"
  | "paquete-repetido"
  | "gtf-dos-contratos";

export interface AvisoEntreArchivos {
  tipo: TipoAvisoEntreArchivos;
  nivel: "error" | "aviso";
  mensaje: string;
  /** Los ids de los archivos involucrados. */
  ids: string[];
}

/** «-», «--» y «S/L» son cómo el formato escribe «no tiene». */
const limpio = (v: unknown): string => {
  const s = v == null ? "" : String(v).trim().replace(/\s+/g, " ");
  return s === "-" || s === "--" || s.toUpperCase() === "S/L" ? "" : s;
};
const clave = (v: unknown): string => limpio(v).toUpperCase();

/** Los primeros `n` de una lista, con «y N más». */
function algunos(lista: readonly string[], n = 3): string {
  const vistos = lista.slice(0, n).join(", ");
  return lista.length > n ? `${vistos} y ${lista.length - n} más` : vistos;
}

/**
 * Valor → archivos donde aparece. Sólo cuenta archivos DISTINTOS: lo repetido
 * dentro de un mismo archivo lo resuelve (o lo avisa) el servidor.
 */
type Indice = Map<string, { visto: string; ids: string[] }>;

function anotar(indice: Indice, valor: string, visto: string, id: string) {
  const previo = indice.get(valor);
  if (!previo) indice.set(valor, { visto, ids: [id] });
  else if (!previo.ids.includes(id)) previo.ids.push(id);
}

/** Agrupa los valores repetidos por el PAR (o grupo) de archivos que los comparten. */
function porGrupoDeArchivos(indice: Indice): { ids: string[]; valores: string[] }[] {
  const grupos = new Map<string, { ids: string[]; valores: string[] }>();
  for (const { visto, ids } of indice.values()) {
    if (ids.length < 2) continue;
    const k = [...ids].sort().join("|");
    const g = grupos.get(k) ?? { ids, valores: [] };
    g.valores.push(visto);
    grupos.set(k, g);
  }
  return [...grupos.values()];
}

export function revisarEntreArchivos(archivos: readonly ArchivoARevisar[]): AvisoEntreArchivos[] {
  const nombre = new Map(archivos.map((a) => [a.id, a.nombre]));
  const permisoDe = new Map(archivos.map((a) => [a.id, a.permiso]));
  const nombres = (ids: readonly string[]) => ids.map((id) => `«${nombre.get(id) ?? id}»`).join(" y ");
  const avisos: AvisoEntreArchivos[] = [];

  const plantas: Indice = new Map();
  const guias: Indice = new Map();
  const paquetes: Indice = new Map();

  for (const a of archivos) {
    const listas = a.parseadas.filter((f) => f.problemas.length === 0);

    if (a.formato === "inventarioTrozas") {
      const enStock = listas.filter(estaEnStock);
      const porGuia = new Map<string, FilaParseada[]>();
      for (const f of enStock) {
        const planta = clave(f.datos.codigoPlanta);
        if (planta) anotar(plantas, planta, limpio(f.datos.codigoPlanta), a.id);
        const gtf = clave(f.datos.numeroDocumento);
        if (gtf) porGuia.set(gtf, [...(porGuia.get(gtf) ?? []), f]);
      }
      for (const [gtf, trozas] of porGuia) {
        anotar(guias, gtf, limpio(trozas[0].datos.numeroDocumento), a.id);
        const contratos = contratosDeLaGuia(trozas);
        if (contratos.length > 1) {
          avisos.push({
            tipo: "gtf-dos-contratos",
            nivel: "aviso",
            mensaje: `En «${a.nombre}», la GTF ${limpio(trozas[0].datos.numeroDocumento)} trae ${contratos.length} contratos (${contratos.join(", ")}): la guía guarda ${limpio(trozas[0].datos.contrato) || "el primero"} y anota los otros en sus notas.`,
            ids: [a.id],
          });
        }
      }
    }

    if (a.formato === "ingresos") {
      for (const f of listas) {
        const gtf = clave(f.datos.numeroDocumento);
        if (gtf) anotar(guias, gtf, limpio(f.datos.numeroDocumento), a.id);
      }
    }

    if (a.formato === "produccion" || a.formato === "inventarioAserrada") {
      /* La clave sale del MISMO cuerpo que se envía: si se armara desde las
         columnas crudas, una especie escrita distinto no coincidiría con la
         que el servidor compara. */
      for (const c of aCuerpoDelLibro(a.formato, a.parseadas)) {
        const k = produccionKey(
          (c.entryDate as string | null) ?? "",
          (c.productType as string | null) ?? null,
          (c.speciesCommon as string | null) ?? null,
          c.quantity,
          (c.codigoProducto as string | null | undefined) ?? null,
          (c.materiaPrimaRef as string | null | undefined) ?? null,
        );
        const visto = [c.codigoProducto, c.speciesCommon, `${Number(c.quantity) || 0} m³`].filter(Boolean).join(" ");
        anotar(paquetes, k, visto, a.id);
      }
    }
  }

  for (const g of porGrupoDeArchivos(plantas)) {
    avisos.push({
      tipo: "planta-repetida",
      nivel: "error",
      mensaje: `${nombres(g.ids)} comparten ${g.valores.length === 1 ? "el código de planta" : `${g.valores.length} códigos de planta`} ${algunos(g.valores)}: el libro rechazaría la guía entera del segundo. Quítalos de uno.`,
      ids: g.ids,
    });
  }

  for (const g of porGrupoDeArchivos(guias)) {
    const permisos = new Set(g.ids.map((id) => permisoDe.get(id)?.id ?? ""));
    const cuales = g.ids.map((id) => permisoDe.get(id)?.codigo ?? "sin permiso").join(" y ");
    const distintos = permisos.size > 1;
    avisos.push({
      tipo: distintos ? "gtf-dos-permisos" : "gtf-repetida",
      nivel: distintos ? "error" : "aviso",
      mensaje: distintos
        ? `${nombres(g.ids)} traen ${g.valores.length === 1 ? "la GTF" : `${g.valores.length} GTF iguales:`} ${algunos(g.valores)} con permisos distintos (${cuales}): la guía entra una sola vez, con el permiso del primero.`
        : `${nombres(g.ids)} traen ${g.valores.length === 1 ? "la GTF" : `${g.valores.length} GTF iguales:`} ${algunos(g.valores)}: la guía entra una sola vez; lo del segundo se toma como ya cargado.`,
      ids: g.ids,
    });
  }

  for (const g of porGrupoDeArchivos(paquetes)) {
    avisos.push({
      tipo: "paquete-repetido",
      nivel: "aviso",
      mensaje: `${nombres(g.ids)} traen ${g.valores.length === 1 ? "el mismo paquete" : `${g.valores.length} paquetes iguales`} (${algunos(g.valores)}): misma fecha, producto, especie y volumen; el segundo se toma como ya cargado.`,
      ids: g.ids,
    });
  }

  /* Lo que rechaza filas primero; después lo que sólo hay que saber. */
  return avisos.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === "error" ? -1 : 1));
}
