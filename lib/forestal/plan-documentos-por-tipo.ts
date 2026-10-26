/**
 * lib/forestal/plan-documentos-por-tipo.ts — las carpetas del plan alineadas
 * con los papeles que la norma pide para SU tipo de plan (ADR-517, enmienda
 * el «lo que falta» de ADR-467).
 *
 * La plantilla de carpetas es UNA por negocio y se sembró pensando en una
 * plantación; los papeles cambian por tipo (`loth-plan-papeles.ts`). En un PO
 * el contrato de concesión no tenía casillero y el «Título de propiedad» que
 * no pide contaba como faltante: «1 de 4 papeles» arriba, «0 de 5 documentos»
 * abajo. Esto las junta AL LEER, sin escribir nada en la base:
 *
 *  · cada papel que se sube tiene su casillero: el de la plantilla que ya lo
 *    representa o, si no hay, uno «de la norma» en su carpeta, que junta los
 *    archivos sueltos de esa carpeta con la etiqueta `papel:<clave>`;
 *  · el casillero de un papel obligatorio toma el estado del papel: la cuenta
 *    de las carpetas ES la de los papeles;
 *  · lo de la semilla que este tipo no pide queda «no aplica» y no cuenta; lo
 *    que agregó el negocio sigue contando como siempre.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import {
  PREFIJO_TAG_PAPEL,
  archivosDeVista,
  papelDeEtiquetas,
  papelesDePlan,
  type ClavePapel,
  type PapelDelPlan,
  type PlanParaPapeles,
} from "@/lib/forestal/loth-plan-papeles";
import { filasDeSemilla } from "@/lib/forestal/plan-documentos-semilla";
import {
  TIPO_ARCHIVO,
  formularioDeCarpeta,
  type ArchivoConCandado,
  type ArchivoDelPlan,
  type CarpetaDelPlan,
  type CasilleroArchivo,
  type CuentaCasillero,
  type EstadoCasillero,
} from "@/lib/forestal/plan-documentos-tipos";

/** Clave del casillero «de la norma» de un papel (no existe en la base). */
export const PREFIJO_CASILLERO_NORMA = "norma-";
export const claveCasilleroNorma = (papel: string): string => `${PREFIJO_CASILLERO_NORMA}${papel}`;

/** El papel de un casillero «de la norma» por su clave (`norma-titulo` → `titulo`), o null si no es uno. */
export function papelDeCasilleroNorma(clave: string | null | undefined): ClavePapel | null {
  if (!clave?.startsWith(PREFIJO_CASILLERO_NORMA)) return null;
  return papelDeEtiquetas([`${PREFIJO_TAG_PAPEL}${clave.slice(PREFIJO_CASILLERO_NORMA.length)}`]);
}

/** Los casilleros `archivo` de la semilla, `formulario|clave`: los únicos que pueden quedar «no aplica». */
const CASILLEROS_DE_LA_SEMILLA: ReadonlySet<string> = new Set(
  filasDeSemilla()
    .filter((f) => f.tipo === TIPO_ARCHIVO)
    .map((f) => `${f.formulario}|${f.clave}`),
);

/** El orden dentro de una carpeta: lo que se pide primero, lo que no aplica al final. */
const RANGO: Record<CuentaCasillero, number> = { obligatorio: 0, propio: 1, si_aplica: 2, no_aplica: 3 };

/** El estado del papel, en el idioma del casillero. */
const ESTADO_DEL_PAPEL: Record<PapelDelPlan["estado"], EstadoCasillero> = {
  presente: "cargado",
  vence_pronto: "vence_pronto",
  vencido: "vencido",
  falta: "falta",
  segun_caso: "falta",
};

type PapelParaCarpetas = Pick<PapelDelPlan, "clave" | "nombre" | "ayuda" | "exigencia" | "carpeta" | "casilleros" | "subible" | "estado" | "vence">;

const nuevoPrimero = (a: { uploadedAt: string }, b: { uploadedAt: string }) => b.uploadedAt.localeCompare(a.uploadedAt);

function casilleroDeLaNorma(carpeta: CarpetaDelPlan, p: PapelParaCarpetas): CasilleroArchivo {
  return {
    campo: {
      id: "",
      formulario: formularioDeCarpeta(carpeta.clave),
      clave: claveCasilleroNorma(p.clave),
      nombre: p.nombre,
      descripcion: p.ayuda,
      tipo: TIPO_ARCHIVO,
      opciones: [],
      soloParaRegistroId: null,
      orden: 0,
      activo: true,
    },
    estado: "falta",
    archivos: [],
    venceEl: null,
    porNorma: true,
  };
}

/**
 * Las carpetas de `armarCarpetas`, anotadas con el papel y la cuenta de cada
 * casillero según los papeles del plan (`papelesDePlan` sobre ESTAS mismas
 * carpetas). Devuelve copias: no toca la entrada.
 */
export function alinearConPapeles(carpetas: readonly CarpetaDelPlan[], papeles: readonly PapelParaCarpetas[]): CarpetaDelPlan[] {
  const fuera: CarpetaDelPlan[] = carpetas.map((c) => ({
    ...c,
    casilleros: c.casilleros.map((k) => ({ ...k })),
    sueltos: [...c.sueltos],
    ...(c.sueltosConCandado ? { sueltosConCandado: [...c.sueltosConCandado] } : {}),
  }));
  if (fuera.length === 0) return fuera;

  for (const p of papeles) {
    if (!p.subible) continue;
    const casa = fuera.find((c) => c.clave === p.carpeta) ?? fuera.find((c) => c.plantillaId != null) ?? fuera[0];

    /* Los casilleros de la plantilla que representan este papel, en cualquier carpeta. */
    const suyos = fuera.flatMap((c) => c.casilleros.filter((k) => k.papel == null && p.casilleros.includes(k.campo.clave)).map((k) => ({ c, k })));
    for (const { k } of suyos) {
      k.papel = p.clave;
      k.cuenta = "si_aplica";
    }
    const enCasa = suyos.find((x) => x.c === casa) ?? suyos[0];
    const carpeta = enCasa?.c ?? casa;
    let home = enCasa?.k;
    if (!home) {
      home = casilleroDeLaNorma(carpeta, p);
      home.papel = p.clave;
      carpeta.casilleros.push(home);
    }

    /* Los sueltos de esa carpeta con la etiqueta del papel entran a su casillero. */
    const esDelPapel = (a: Pick<ArchivoDelPlan, "papel">) => a.papel === p.clave;
    const sueltos = carpeta.sueltos.filter(esDelPapel);
    const sueltosCandado = (carpeta.sueltosConCandado ?? []).filter(esDelPapel);
    if (sueltos.length > 0 || sueltosCandado.length > 0) {
      carpeta.sueltos = carpeta.sueltos.filter((a) => !esDelPapel(a));
      if (carpeta.sueltosConCandado) {
        const quedan = carpeta.sueltosConCandado.filter((a) => !esDelPapel(a));
        if (quedan.length > 0) carpeta.sueltosConCandado = quedan;
        else delete carpeta.sueltosConCandado;
      }
      home.archivos = [...home.archivos, ...sueltos].sort(nuevoPrimero);
      const candado: ArchivoConCandado[] = [...(home.conCandado ?? []), ...sueltosCandado].sort(nuevoPrimero);
      if (candado.length > 0) home.conCandado = candado;
      const fechas = [...home.archivos, ...candado]
        .map((a) => a.expiresAt)
        .filter((x): x is string => Boolean(x))
        .sort();
      home.venceEl = fechas[0] ?? null;
    }

    /* El obligatorio dice lo mismo que el papel (estado y fecha, aunque la fecha
       salga de la vigencia del plan o del plazo de la norma). */
    if (p.exigencia === "siempre") {
      home.cuenta = "obligatorio";
      home.estado = ESTADO_DEL_PAPEL[p.estado];
      home.venceEl = p.vence ?? home.venceEl;
    } else {
      home.cuenta = "si_aplica";
      if (home.porNorma) home.estado = home.archivos.length + (home.conCandado?.length ?? 0) > 0 ? ESTADO_DEL_PAPEL[p.estado] : "falta";
    }
  }

  for (const c of fuera) {
    for (const k of c.casilleros) {
      if (k.cuenta) continue;
      k.papel = null;
      k.cuenta =
        k.campo.soloParaRegistroId == null && CASILLEROS_DE_LA_SEMILLA.has(`${k.campo.formulario}|${k.campo.clave}`) ? "no_aplica" : "propio";
    }
    c.casilleros = c.casilleros
      .map((k, i) => ({ k, i }))
      .sort((a, b) => RANGO[a.k.cuenta ?? "propio"] - RANGO[b.k.cuenta ?? "propio"] || a.i - b.i)
      .map((x) => x.k);
  }
  return fuera;
}

/**
 * Las carpetas alineadas con los papeles de ESTE plan: la vista del servidor
 * (plan guardado) y el alta (plan por guardar, ADR-517) llaman a esto mismo,
 * así lo que se ve al crear es lo que se ve después de guardar.
 */
export function alinearConElPlan(carpetas: readonly CarpetaDelPlan[], plan: PlanParaPapeles, hoy: string): CarpetaDelPlan[] {
  return alinearConPapeles(carpetas, papelesDePlan(plan, archivosDeVista({ carpetas: [...carpetas] }), hoy).lista);
}
