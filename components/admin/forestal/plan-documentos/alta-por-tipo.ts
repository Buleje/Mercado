/**
 * El alta de un plan, alineada con los papeles de SU tipo (ADR-517): lo que se
 * ve al crear un PO es lo que se va a ver después de guardarlo —el contrato de
 * concesión con su casillero, el título de propiedad «no aplica»—.
 *
 * No duplica la regla: pasa las carpetas del alta a la forma del servidor,
 * llama a `alinearConElPlan` (la misma de la vista del plan guardado) y las
 * devuelve en la forma de pintar, con lo pendiente marcado como pendiente.
 *
 * Un archivo cargado en un casillero «de la norma» (`norma-<papel>`) viaja como
 * suelto de su carpeta con la etiqueta del papel, igual que lo guarda el
 * servidor: si el tipo lo pide, entra a su casillero; si se cambia a un tipo
 * que no lo pide, queda en «Otros archivos de la carpeta» y no se pierde.
 *
 * PURO: sin React ni fetch.
 */

import { PREFIJO_TAG_PAPEL, papelDeEtiquetas, type PlanParaPapeles } from "@/lib/forestal/loth-plan-papeles";
import { alinearConElPlan, papelDeCasilleroNorma } from "@/lib/forestal/plan-documentos-por-tipo";
import { TIPO_ARCHIVO, formularioDeCarpeta, type ArchivoDelPlan, type CarpetaDelPlan } from "@/lib/forestal/plan-documentos-tipos";
import type { ArchivoVista, CarpetaVista, CasilleroVista } from "./modelo";
import type { PendientesDocumentos } from "./pendientes";

/** `soloParaRegistroId` de un casillero «sólo este plan» cuando el plan todavía no tiene id: basta con que no sea null. */
const PLAN_POR_CREAR = "alta";

type DatosDelPendiente = Map<string, { papel: string | null; orden: number }>;

function aServidor(c: CarpetaVista, pend: DatosDelPendiente): CarpetaDelPlan {
  const archivo = (a: ArchivoVista): ArchivoDelPlan => ({
    documentId: a.key,
    nombre: a.nombre,
    mimeType: a.mimeType,
    size: a.size,
    expiresAt: a.vence,
    /* Sin fecha de subida todavía: el orden de carga («el más nuevo primero»). */
    uploadedAt: String(pend.get(a.key)?.orden ?? 0).padStart(6, "0"),
    campoId: null,
    papel: pend.get(a.key)?.papel ?? null,
  });
  return {
    clave: c.clave,
    nombre: c.nombre,
    folderId: c.folderId,
    plantillaId: c.plantillaId,
    soloEstePlan: c.soloEstePlan,
    orden: c.orden,
    subcarpetas: c.subcarpetas,
    casilleros: c.casilleros.map((k, i) => ({
      campo: {
        id: k.campoId ?? "",
        formulario: formularioDeCarpeta(c.clave),
        clave: k.clave,
        nombre: k.nombre,
        descripcion: k.descripcion,
        tipo: TIPO_ARCHIVO,
        opciones: [],
        soloParaRegistroId: k.soloEstePlan ? PLAN_POR_CREAR : null,
        orden: i,
        activo: true,
      },
      estado: k.estado,
      archivos: k.archivos.map(archivo),
      venceEl: null,
    })),
    sueltos: c.sueltos.map(archivo),
  };
}

/**
 * Las carpetas del alta (`carpetasDelAlta` sin plan) alineadas con los papeles
 * del plan que se está creando. Devuelve copias.
 */
export function alinearAlta(base: readonly CarpetaVista[], pend: PendientesDocumentos, plan: PlanParaPapeles, hoy: string): CarpetaVista[] {
  const datos: DatosDelPendiente = new Map(pend.archivos.map((a, i) => [a.id, { papel: papelDeCasilleroNorma(a.casillero?.clave), orden: i }]));
  const vistaDe = new Map<string, ArchivoVista>();
  for (const c of base) {
    for (const k of c.casilleros) for (const a of k.archivos) vistaDe.set(a.key, a);
    for (const a of c.sueltos) vistaDe.set(a.key, a);
  }
  const devolver = (lista: readonly ArchivoDelPlan[]): ArchivoVista[] =>
    lista.map((a) => vistaDe.get(a.documentId)).filter((x): x is ArchivoVista => x != null);

  /* `alinearConElPlan` no suma ni saca carpetas: cada una vuelve a la suya. */
  return alinearConElPlan(base.map((c) => aServidor(c, datos)), plan, hoy).flatMap((c) => {
    const antes = base.find((x) => x.clave === c.clave);
    if (!antes) return [];
    return {
      ...antes,
      sueltos: devolver(c.sueltos),
      casilleros: c.casilleros.map((k): CasilleroVista => {
        const previo = antes.casilleros.find((x) => x.clave === k.campo.clave);
        const comun = {
          estado: k.estado,
          archivos: devolver(k.archivos),
          ...(k.cuenta ? { cuenta: k.cuenta, papel: papelDeEtiquetas(k.papel ? [`${PREFIJO_TAG_PAPEL}${k.papel}`] : []) } : {}),
        };
        if (previo && !k.porNorma) return { ...previo, ...comun };
        return {
          campoId: null,
          clave: k.campo.clave,
          nombre: k.campo.nombre,
          descripcion: k.campo.descripcion,
          soloEstePlan: false,
          pendiente: false,
          porNorma: true,
          ...comun,
        };
      }),
    };
  });
}

export interface FueraDeSuCasillero {
  archivo: string;
  casillero: string;
  carpeta: string;
}

/**
 * Lo cargado en un casillero que ya no está —el tipo de plan elegido no pide
 * ese papel—: quedó en «Otros archivos» de su carpeta y se guarda ahí.
 */
export function fueraDeSuCasillero(carpetas: readonly CarpetaVista[], pend: PendientesDocumentos): FueraDeSuCasillero[] {
  const fuera: FueraDeSuCasillero[] = [];
  for (const a of pend.archivos) {
    if (!a.casillero) continue;
    const c = carpetas.find((x) => x.clave === a.carpetaClave);
    if (c?.sueltos.some((s) => s.key === a.id)) fuera.push({ archivo: a.file.name, casillero: a.casillero.nombre, carpeta: c.nombre });
  }
  return fuera;
}

/** El aviso de una línea para `fueraDeSuCasillero`, o null si no hay nada. */
export function avisoFueraDeSuCasillero(fuera: readonly FueraDeSuCasillero[]): string | null {
  if (fuera.length === 0) return null;
  if (fuera.length === 1) {
    const [f] = fuera;
    return `«${f.archivo}» quedó en «Otros archivos» de «${f.carpeta}»: este tipo de plan no pide «${f.casillero}». Se guarda igual ahí.`;
  }
  return `${fuera.map((f) => `«${f.archivo}»`).join(", ")} quedaron en «Otros archivos» de su carpeta: este tipo de plan no pide su casillero. Se guardan igual ahí.`;
}
