/**
 * Lo puro de la pantalla de inspección (fase 3 de «Plantas forestales», 17-10):
 * armar el borrador desde lo que mandó el servidor, convertir una incoherencia
 * en hallazgo, leer lo que el inspector tipea y guardar el conteo en el equipo.
 *
 * Sin React ni fetch: lo usan el hook y los componentes, y tiene test.
 */
import type {
  ConteoAserrada,
  GravedadIncoherencia,
  HallazgoInspeccion,
  IncoherenciaPlanta,
  InspeccionPlanta,
} from "@/lib/superadmin/plantas-forestales/tipos";
import { leerConteoGuardado, nuevoConteo, type ConteoPatio } from "@/lib/forestal/conteo-patio";

/**
 * Lo que el GET/PATCH devuelve. Además de `InspeccionPlanta`, la DB class manda
 * `notas`/`motivoAnulacion`/`anuladaAt`; `conteoPatio` y `planta` se leen si
 * llegan (para retomar el conteo en otro equipo y nombrar la planta).
 */
export type InspeccionDeLaPantalla = InspeccionPlanta & {
  notas?: string | null;
  motivoAnulacion?: string | null;
  anuladaAt?: string | null;
  conteoPatio?: ConteoPatio | null;
  planta?: { nombre: string; slug?: string } | null;
  plantaNombre?: string | null;
};

/** Lo que el inspector edita (el conteo de trozas va aparte: vive también en el equipo). */
export interface Borrador {
  hallazgos: HallazgoInspeccion[];
  aserrada: ConteoAserrada[];
  conclusion: string;
  responsablePlanta: string;
}

export type CampoGuardable = keyof Borrador | "conteoPatio";

export const CATEGORIAS: { clave: HallazgoInspeccion["categoria"]; rotulo: string }[] = [
  { clave: "volumen", rotulo: "Volumen" },
  { clave: "documentos", rotulo: "Documentos" },
  { clave: "trazabilidad", rotulo: "Trazabilidad" },
  { clave: "seguridad", rotulo: "Seguridad" },
  { clave: "otro", rotulo: "Otro" },
];

export const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.clave, c.rotulo])) as Record<
  HallazgoInspeccion["categoria"],
  string
>;

export const REFERENCIAS: { clave: NonNullable<HallazgoInspeccion["referencia"]>["tipo"]; rotulo: string }[] = [
  { clave: "guia", rotulo: "Guía" },
  { clave: "especie", rotulo: "Especie" },
  { clave: "corrida", rotulo: "Corrida" },
  { clave: "lote", rotulo: "Lote" },
  { clave: "troza", rotulo: "Troza" },
];

export const ROTULO_REFERENCIA = Object.fromEntries(REFERENCIAS.map((r) => [r.clave, r.rotulo])) as Record<
  NonNullable<HallazgoInspeccion["referencia"]>["tipo"],
  string
>;

const claveAserrada = (r: Pick<ConteoAserrada, "producto" | "especie">) => `${r.producto}|${r.especie ?? ""}`;

/**
 * Las filas de aserrada: lo ya guardado manda; los productos del libro congelado
 * que todavía no tienen fila se agregan sin contar. `libroPiezas` queda `null`:
 * el libro lleva paquetes y m³, no piezas (nunca un 0 inventado).
 */
export function aserradaInicial(i: Pick<InspeccionPlanta, "aserrada" | "libro">): ConteoAserrada[] {
  const filas = [...i.aserrada];
  const ya = new Set(filas.map(claveAserrada));
  for (const p of i.libro.aserrada?.porProducto ?? []) {
    const fila: ConteoAserrada = {
      producto: p.producto,
      especie: p.especie,
      libroM3: p.m3,
      contadoM3: null,
      libroPiezas: null,
      contadoPiezas: null,
    };
    if (!ya.has(claveAserrada(fila))) {
      ya.add(claveAserrada(fila));
      filas.push(fila);
    }
  }
  return filas;
}

export function borradorDe(i: InspeccionPlanta): Borrador {
  return {
    hallazgos: i.hallazgosDetalle,
    aserrada: aserradaInicial(i),
    conclusion: i.conclusion ?? "",
    responsablePlanta: i.responsablePlanta ?? "",
  };
}

/** Contado − libro, en m³. `null` si todavía no se contó (no es «0 de diferencia»). */
export function diferenciaM3(r: Pick<ConteoAserrada, "libroM3" | "contadoM3">): number | null {
  return r.contadoM3 == null ? null : r.contadoM3 - r.libroM3;
}

/** Tolerancia en la unidad del negocio: menos de 1 dm³ no es diferencia. */
export const TOLERANCIA_M3 = 0.001;

export function filasConDiferencia(filas: readonly ConteoAserrada[]): number {
  return filas.filter((r) => {
    const d = diferenciaM3(r);
    return d != null && Math.abs(d) >= TOLERANCIA_M3;
  }).length;
}

/**
 * Lo que tipea el inspector. Acepta «12.5» y también «12,5» (el teclado del
 * celular a veces sólo trae coma): una sola coma sin punto es la decimal.
 * Vacío = `null` (no contado). Texto que no es número = `NaN` (el campo avisa).
 */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  const normal = !t.includes(".") && (t.match(/,/g) ?? []).length === 1 ? t.replace(",", ".") : t.replace(/,/g, "");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normal)) return Number.NaN;
  return Number(normal);
}

/** Id corto y único para un hallazgo (el schema acepta hasta 40). */
export function idNuevo(ahora = Date.now(), azar = Math.random()): string {
  return `h-${ahora.toString(36)}-${Math.floor(azar * 36 ** 5).toString(36)}`;
}

/** Hash chico y estable (djb2): el id de la incoherencia puede pasar de 40 letras. */
function hashCorto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** El hallazgo que nace de una incoherencia tiene id fijo: convertirla dos veces no la duplica. */
export function idDeIncoherencia(inc: Pick<IncoherenciaPlanta, "id">): string {
  return `inc-${hashCorto(inc.id)}`;
}

const CATEGORIA_DE_ORIGEN: Record<IncoherenciaPlanta["origen"], HallazgoInspeccion["categoria"]> = {
  saldo: "volumen",
  cuadre_ingreso: "volumen",
  rendimiento: "volumen",
  pendiente: "documentos",
  inspeccion: "otro",
};

export function hallazgoDeIncoherencia(inc: IncoherenciaPlanta): HallazgoInspeccion {
  const texto = inc.detalle ? `${inc.titulo}. ${inc.detalle}` : inc.titulo;
  return {
    id: idDeIncoherencia(inc),
    gravedad: inc.gravedad,
    categoria: CATEGORIA_DE_ORIGEN[inc.origen],
    texto: texto.slice(0, 2000),
    /* El hallazgo pide m³ ≥ 0: un saldo de −21,755 m³ son 21,755 m³ en juego. */
    m3: inc.m3EnJuego == null ? null : Math.abs(inc.m3EnJuego),
    fotos: [],
    referencia: inc.referencia ? { tipo: inc.referencia.tipo, valor: inc.referencia.valor.slice(0, 80) } : null,
  };
}

export function contarPorGravedad(hs: readonly Pick<HallazgoInspeccion, "gravedad">[]): Record<GravedadIncoherencia, number> {
  const c: Record<GravedadIncoherencia, number> = { error: 0, warning: 0, info: 0 };
  for (const h of hs) c[h.gravedad]++;
  return c;
}

// ── Conteo de trozas guardado en el equipo ───────────────────────────────────

/** Una clave por inspección: dos inspecciones (o la planta contando lo suyo) no se mezclan. */
export const claveConteoLocal = (inspeccionId: string) => `inspeccion-planta:conteo:${inspeccionId}`;

/** El conteo para retomar: el del equipo, si no el que mandó el servidor, si no ninguno. */
export function conteoParaRetomar(guardado: string | null, i: InspeccionDeLaPantalla): ConteoPatio | null {
  return leerConteoGuardado(guardado) ?? i.conteoPatio ?? null;
}

/**
 * El conteo nuevo se cuenta contra las trozas del libro CONGELADO, no contra el
 * patio de hoy. Nace con `iniciadoEn = libro.tomadaEn`, como lo clava el
 * servidor (`conteoDeLaInspeccion`): una inspección tiene UN conteo.
 */
export function conteoNuevo(i: Pick<InspeccionPlanta, "fecha" | "inspector" | "libro">): ConteoPatio {
  return nuevoConteo({
    fecha: i.fecha,
    quien: i.inspector.slice(0, 120),
    trozas: i.libro.trozasDelPatio ?? [],
    ahora: i.libro.tomadaEn,
    truncado: Boolean(i.libro.trozasDelPatioTruncado),
  });
}

/** «Sin conexión», «409 cerrada» o un error del servidor: qué se le dice al inspector. */
export type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "sin-conexion" | "error" | "bloqueada";
