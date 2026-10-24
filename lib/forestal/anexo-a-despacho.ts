/**
 * anexo-a-despacho — del ANEXO N° 04 guardado a las líneas de Despacho del
 * libro (ADR-446). PURO y client-safe: lo usan la capa de datos, que registra,
 * y la pantalla, que muestra la propuesta y deja cambiar el origen.
 *
 * Qué problema tapa: en Blas 99 m³ de 9 guías vivían sólo como Anexo 04
 * guardado. El libro decía «0 salidas» y 9 corridas estaban marcadas «usado»
 * como atajo de lo que ya se había ido. Registrarlas a mano eran 242 filas.
 *
 * ── Cómo se arma una guía ───────────────────────────────────────────────────
 * 1. Las piezas del anexo se agrupan por especie × tipo (el mismo tipo que
 *    imprime el anexo: `tipoDePieza`).
 * 2. Cada grupo se cubre con la producción de ESA especie y ESE tipo, fechada
 *    el día de la guía o antes, con `≤`: lo que no alcanza queda «sin
 *    atribuir» en una línea propia, nunca se fuerza (I4).
 * 3. De dónde sale un tipo dentro de una corrida (las «fuentes»):
 *    · **montón** — un paquete de 0 piezas y sin medidas: la pila de un tipo.
 *      La línea lo nombra y, si sale una parte, se PARTE (decisión 10): lo que
 *      salió queda con el código y el resto pasa a un paquete nuevo.
 *    · **corrida** — paquetes con piezas del mismo tipo que la corrida, o la
 *      corrida sin paquetes. La línea va a nivel corrida, sin paquete.
 *    · **paquete** — un bulto físico de un tipo distinto al de su corrida (en
 *      Blas, paquetes «COMERCIAL» colgados de una corrida «TABLA»). El
 *      servidor sólo acepta esa salida nombrando el paquete y hasta lo que
 *      mide (ADR-444), así que sale entero y en su propia línea.
 * 4. Una línea por especie × tipo × corrida (× paquete, cuando la regla del
 *    paquete lo exige).
 *
 * «Mejor ajuste»: la guía que se registra primero es la más vieja; dentro de
 * un grupo manda la fuente que lo cubre justo, después la más chica que lo
 * cubre entero (menos líneas y menos restos), después la más grande. El total
 * atribuido no depende de ese orden —cualquier corrida que sirve a una guía
 * vieja sirve también a las siguientes—; sí el número de líneas.
 *
 * I3 (el stock del producto) se mide igual que el alta: por especie, sin
 * distinguir tipo. Una especie sin producción suficiente BLOQUEA la guía —el
 * alta la rechazaría—, y la propuesta lo dice antes (decisión 2: Azúcar huayo
 * de la 064).
 */
import type { PiezaCubicada } from "./cubicacion";
import { ORDEN_TIPO, ordenTipo, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import { productoDelTipoComercial, tipoComercialDelProducto } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { TOLERANCIA_ATRIBUCION } from "./atribucion-despacho";
import { mismoNumeroGtf } from "./gtf-talonario";
import { fmtM3 } from "./cubicacion-formato";

/**
 * Un resto de montón más chico que esto no se guarda como paquete: 5 litros no
 * son una pila, son la diferencia entre el redondeo del anexo (4 decimales por
 * fila) y el del inventario (3). El montón sale entero y ese resto queda como
 * saldo de la corrida, sin bulto que ofrecer.
 */
export const TOL_RESTO_M3 = 0.005;

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** «2026-09-25» → «25/09/2026» sin depender del ICU (el servidor y el navegador dicen lo mismo). */
export const fechaCorta = (f: string): string => {
  const [y, m, d] = f.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : f;
};

/** El anexo tal como se lee del registro guardado (sin los datos del firmante). */
export interface AnexoParaDespacho {
  id: string;
  numero: string;
  gtf: string;
  /** Fecha de emisión, date-only AAAA-MM-DD: es la fecha de la salida. */
  fecha: string;
  createdAt: string;
  totalM3: number;
  totalManualM3?: number | null;
  especieGlobal?: string;
  piezas: readonly PiezaCubicada[];
  /** El despacho del que se emitió, si salió desde el libro. */
  ctpEntryId?: string;
  /** Las líneas de Despacho que ya lo registraron (ADR-446). */
  despachoIds?: readonly string[];
  /** Otro anexo de la misma guía que lo reemplazó: no se registra. */
  reemplazadoPor?: string | null;
}

export interface PaqueteOrigen {
  id: string;
  codigo: string;
  /** Producto del paquete; `null` = el de su corrida. */
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  /** Tiene espesor, ancho y largo cargados. */
  conMedidas: boolean;
  /** Ya viaja en una guía vigente (ADR-444): no se ofrece. */
  despachado: boolean;
  /** Apartado a nombre de alguien (ADR-418): no se ofrece. */
  apartado: boolean;
}

export interface CorridaOrigen {
  id: string;
  lineNo: number;
  /** date-only AAAA-MM-DD. */
  fecha: string;
  especie: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  /** Saldo real de la corrida (`saldosDeCorridas`): producido − despachado − reprocesado. */
  disponibleM3: number;
  /** Marcada «ya usado» (sale de Disponibles, no toca saldos). */
  usado: boolean;
  /** Sin volumen de entrada ni consumos: no dice de qué madera salió. */
  sinOrigen: boolean;
  duenoMadera: string | null;
  titularNombre: string | null;
  paquetes: readonly PaqueteOrigen[];
  /** Lo que ya salió de ESTA corrida en despachos que no nombran uno de sus paquetes, por producto del despacho. */
  salidoSinPaquete: readonly { producto: string | null; m3: number }[];
}

export interface EstadoDelLibro {
  corridas: readonly CorridaOrigen[];
  /** I3: lo que queda sin despachar, por la clave de `claveStock` (producto + especie). */
  stock: Readonly<Record<string, number>>;
}

/**
 * La clave de I3 (`productKey` de `forest-ctp.db`): producto y especie por
 * `claveEspecie`, que quita lo que va entre paréntesis — todos los «MADERA
 * ASERRADA (…)» de una especie son UN stock. La capa de datos pasa la suya;
 * ésta es la misma fórmula, para la pantalla y los tests.
 */
export const claveStockPorDefecto = (producto: string | null | undefined, especie: string | null | undefined): string =>
  `${claveEspecie(producto) || "—"}|${claveEspecie(especie) || "—"}`;

/** El tipo del cubicador que nombra un producto del libro, o `null`. */
export function tipoDelProducto(producto: string | null | undefined): TipoComercial | null {
  const t = tipoComercialDelProducto(producto);
  return t && (ORDEN_TIPO as readonly string[]).includes(t) ? (t as TipoComercial) : null;
}

// ── Grupos del anexo ──────────────────────────────────────────────────────

export interface GrupoDelAnexo {
  /** `claveEspecie|tipo`: la identidad del grupo (lo que el cliente elige). */
  clave: string;
  especie: string;
  claveEspecie: string;
  tipo: TipoComercial;
  /** «MADERA ASERRADA (COMERCIAL)»; `null` para «Otro» (el libro no tiene ese producto). */
  producto: string | null;
  m3: number;
  piezas: number;
  pt: number;
}

export const claveDeGrupo = (especie: string, tipo: string): string => `${claveEspecie(especie)}|${tipo}`;

/** Lo que dice el anexo que salió, por especie × tipo, en el orden del papel. */
export function gruposDelAnexo(anexo: Pick<AnexoParaDespacho, "piezas" | "especieGlobal">): GrupoDelAnexo[] {
  const ordenEspecie = new Map<string, number>();
  const grupos = new Map<string, GrupoDelAnexo>();
  for (const p of anexo.piezas) {
    const especie = (p.especie ?? anexo.especieGlobal ?? "").trim();
    const ce = claveEspecie(especie);
    const tipo = tipoDePieza(p);
    const clave = `${ce}|${tipo}`;
    if (!ordenEspecie.has(ce)) ordenEspecie.set(ce, ordenEspecie.size);
    const g = grupos.get(clave) ?? {
      clave,
      especie,
      claveEspecie: ce,
      tipo,
      producto: productoDelTipoComercial(tipo),
      m3: 0,
      piezas: 0,
      pt: 0,
    };
    g.m3 += Number(p.m3) || 0;
    g.piezas += Number(p.cantidad) || 0;
    g.pt += Number(p.pieTablar) || 0;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, m3: r4(g.m3), pt: r2(g.pt) }))
    .filter((g) => g.m3 > 0)
    .sort(
      (a, b) =>
        (ordenEspecie.get(a.claveEspecie) ?? 0) - (ordenEspecie.get(b.claveEspecie) ?? 0) ||
        ordenTipo(a.tipo) - ordenTipo(b.tipo),
    );
}

// ── Fuentes de una corrida ────────────────────────────────────────────────

export type ClaseFuente = "monton" | "corrida" | "paquete";

interface Fuente {
  clase: ClaseFuente;
  corridaId: string;
  tipo: TipoComercial;
  /** Lo que queda en esta fuente. */
  m3: number;
  paqueteId: string | null;
  codigo: string | null;
  presentacion: string | null;
}

/** Un paquete de montón: sin piezas y sin medidas. Es la pila de un tipo, no un bulto. */
export const esMonton = (p: Pick<PaqueteOrigen, "cantidad" | "conMedidas">): boolean =>
  p.cantidad === 0 && !p.conMedidas;

function fuentesDeCorrida(c: CorridaOrigen): Fuente[] {
  if ((c.unidad ?? "m3").trim().toLowerCase() !== "m3") return [];
  const tipoCorrida = tipoDelProducto(c.producto);
  const base = { corridaId: c.id, paqueteId: null, codigo: null } as const;
  if (c.paquetes.length === 0) {
    return tipoCorrida && c.disponibleM3 > 0
      ? [{ ...base, clase: "corrida", tipo: tipoCorrida, m3: r4(c.disponibleM3), presentacion: c.presentacion }]
      : [];
  }
  const fuentes: Fuente[] = [];
  const nivelCorrida = new Map<TipoComercial, number>();
  for (const p of c.paquetes) {
    if (p.despachado || p.apartado || !(p.volumenM3 > 0)) continue;
    const tipo = tipoDelProducto(p.producto ?? c.producto);
    if (!tipo) continue;
    if (esMonton(p)) {
      fuentes.push({
        clase: "monton", corridaId: c.id, tipo, m3: r4(p.volumenM3),
        paqueteId: p.id, codigo: p.codigo, presentacion: p.presentacion ?? c.presentacion,
      });
    } else if (tipo === tipoCorrida) {
      nivelCorrida.set(tipo, (nivelCorrida.get(tipo) ?? 0) + p.volumenM3);
    } else {
      fuentes.push({
        clase: "paquete", corridaId: c.id, tipo, m3: r4(p.volumenM3),
        paqueteId: p.id, codigo: p.codigo, presentacion: p.presentacion ?? c.presentacion,
      });
    }
  }
  /* Lo que ya salió a nivel corrida se descuenta de los bultos de su tipo: no
     se sabe cuáles fueron, pero sí cuánto. */
  for (const s of c.salidoSinPaquete) {
    const tipo = tipoDelProducto(s.producto);
    if (tipo && nivelCorrida.has(tipo)) nivelCorrida.set(tipo, Math.max(0, nivelCorrida.get(tipo)! - s.m3));
  }
  for (const [tipo, m3] of nivelCorrida) {
    if (r4(m3) > 0) fuentes.push({ ...base, clase: "corrida", tipo, m3: r4(m3), presentacion: c.presentacion });
  }
  return fuentes;
}

// ── Estado de trabajo (se copia por guía: una guía bloqueada no consume) ──

interface CorridaEnTrabajo {
  c: CorridaOrigen;
  saldo: number;
  fuentes: Fuente[];
}

interface Trabajo {
  corridas: Map<string, CorridaEnTrabajo>;
  stock: Map<string, number>;
}

function trabajoDe(estado: EstadoDelLibro): Trabajo {
  return {
    corridas: new Map(
      estado.corridas.map((c) => [c.id, { c, saldo: r4(Math.max(0, c.disponibleM3)), fuentes: fuentesDeCorrida(c) }]),
    ),
    stock: new Map(Object.entries(estado.stock)),
  };
}

function copiar(t: Trabajo): Trabajo {
  return {
    corridas: new Map([...t.corridas].map(([id, x]) => [id, { c: x.c, saldo: x.saldo, fuentes: x.fuentes.map((f) => ({ ...f })) }])),
    stock: new Map(t.stock),
  };
}

// ── La propuesta ──────────────────────────────────────────────────────────

/** Lo que el operador puede cambiar: de qué corridas sale un grupo, en orden. `[]` = sin origen. */
export interface EleccionDeOrigen {
  especie: string;
  tipo: TipoComercial;
  corridas: readonly string[];
}

export interface OrigenDeLinea {
  corridaId: string;
  lineNo: number;
  fecha: string;
  usado: boolean;
  sinOrigen: boolean;
  clase: ClaseFuente;
  paqueteId: string | null;
  codigo: string | null;
  presentacion: string | null;
  /** Montón que se parte: lo que queda en un paquete nuevo. 0 = sale entero. */
  restoM3: number;
  duenoMadera: string | null;
  titularNombre: string | null;
}

export interface LineaPropuesta {
  grupo: string;
  especie: string;
  tipo: TipoComercial;
  producto: string;
  /** Lo que declara la línea (casillero de cantidad). */
  m3: number;
  /** Lo atribuido a su corrida: `≤ m3`. */
  origenM3: number;
  /** Piezas del grupo repartidas entre sus líneas en proporción al volumen. */
  piezas: number;
  origen: OrigenDeLinea | null;
}

export interface CandidataDeOrigen {
  corridaId: string;
  lineNo: number;
  fecha: string;
  /** Lo que tiene de ESE tipo antes de esta guía. */
  disponibleM3: number;
  usado: boolean;
  sinOrigen: boolean;
}

export interface GrupoPropuesto extends GrupoDelAnexo {
  atribuidoM3: number;
  sinAtribuirM3: number;
  /** Las corridas de las que sale, en orden. */
  corridas: string[];
  /** Todas las que podrían: para que la pantalla deje cambiar el origen. */
  candidatas: CandidataDeOrigen[];
}

export type CodigoBloqueo = "SIN_STOCK_DE_LA_ESPECIE" | "TIPO_SIN_PRODUCTO" | "SIN_ESPECIE" | "ORIGEN_INVALIDO";

export interface BloqueoDeGuia {
  codigo: CodigoBloqueo;
  mensaje: string;
  especie?: string;
  tipo?: TipoComercial;
  m3?: number;
  piezas?: number;
  stockM3?: number;
  corridaId?: string;
  /** SIN_STOCK: la producción que falta tiene que estar fechada este día o antes (AAAA-MM-DD). */
  fechaTope?: string;
}

export interface PropuestaDeGuia {
  anexoId: string;
  numero: string;
  gtf: string;
  fecha: string;
  totalM3: number;
  totalManualM3: number | null;
  atribuidoM3: number;
  sinAtribuirM3: number;
  grupos: GrupoPropuesto[];
  lineas: LineaPropuesta[];
  bloqueos: BloqueoDeGuia[];
  /** Sin bloqueos: el alta la aceptaría. */
  registrable: boolean;
  /** Montones que se parten al registrar. */
  partidos: number;
  /** Corridas marcadas «usado» que esta guía toma como origen. */
  usadasComoOrigen: { corridaId: string; lineNo: number }[];
}

export interface OpcionesDePropuesta {
  elecciones?: readonly EleccionDeOrigen[];
  claveStock?: (producto: string | null, especie: string | null) => string;
}

interface Toma {
  fuente: Fuente;
  q: number;
  restoM3: number;
}

/** Cuánto se puede sacar de una fuente sin pasar el saldo de su corrida. */
const alcance = (t: Trabajo, f: Fuente): number => {
  const saldo = t.corridas.get(f.corridaId)?.saldo ?? 0;
  return r4(Math.max(0, Math.min(f.m3, saldo)));
};

function sacar(t: Trabajo, f: Fuente, falta: number): Toma | null {
  const cabe = alcance(t, f);
  if (cabe <= 0) return null;
  const corrida = t.corridas.get(f.corridaId)!;
  if (f.clase === "paquete") {
    /* Un bulto físico sale entero o no sale: partirlo sería declarar una
       salida que su etiqueta no dice. Si mide un poco más que lo que falta
       (dentro del redondeo), sale entero declarando lo que dice el anexo. */
    if (f.m3 > falta + TOL_RESTO_M3 || cabe < f.m3 - TOL_RESTO_M3) return null;
    /* Tope en el saldo de la corrida (`cabe`): el bulto sale entero, pero la
       corrida no puede atribuir más de lo que le queda (I5 del alta). */
    const q = r4(Math.min(f.m3, falta, cabe));
    f.m3 = 0;
    corrida.saldo = r4(Math.max(0, corrida.saldo - q));
    return { fuente: { ...f }, q, restoM3: 0 };
  }
  const q = r4(Math.min(cabe, falta));
  if (q <= 0) return null;
  let restoM3 = 0;
  if (f.clase === "monton") {
    const queda = r4(f.m3 - q);
    /* Un resto de menos de 5 litros no es una pila: el montón sale entero. */
    restoM3 = queda >= TOL_RESTO_M3 ? queda : 0;
    const antes = { ...f };
    f.m3 = restoM3;
    corrida.saldo = r4(Math.max(0, corrida.saldo - q));
    return { fuente: antes, q, restoM3 };
  }
  f.m3 = r4(f.m3 - q);
  corrida.saldo = r4(Math.max(0, corrida.saldo - q));
  return { fuente: { ...f }, q, restoM3: 0 };
}

/** Las fuentes que sirven a un grupo en esa fecha, sin elegir todavía. */
function fuentesDelGrupo(t: Trabajo, grupo: GrupoDelAnexo, fecha: string, corridaId?: string): Fuente[] {
  const out: Fuente[] = [];
  for (const x of corridaId ? [t.corridas.get(corridaId)].filter(Boolean) as CorridaEnTrabajo[] : t.corridas.values()) {
    if (claveEspecie(x.c.especie) !== grupo.claveEspecie || x.c.fecha > fecha || x.saldo <= 0) continue;
    for (const f of x.fuentes) if (f.tipo === grupo.tipo && f.m3 > 0) out.push(f);
  }
  return out;
}

const ORDEN_CLASE: Record<ClaseFuente, number> = { monton: 0, corrida: 1, paquete: 2 };

/**
 * Qué bultos enteros suman lo más cerca posible de `objetivo` sin pasarse (más
 * el redondeo): una mochila 0/1 en décimas de litro. Con 17 bultos de Cachimbo
 * para cubrir 0,818 m³, «del más grande al más chico» dejaba 23 litros sin
 * origen; la mochila encuentra la combinación que más se acerca. Si el caso es
 * enorme, vuelve a la voraz (que nunca se pasa).
 */
function elegirBultos(bultos: readonly Fuente[], objetivo: number): Fuente[] {
  const voraz = () => {
    const out: Fuente[] = [];
    let queda = objetivo + TOL_RESTO_M3;
    for (const f of [...bultos].sort((a, b) => b.m3 - a.m3)) {
      if (f.m3 <= queda + 1e-9) {
        out.push(f);
        queda -= f.m3;
      }
    }
    return out;
  };
  const cap = Math.round((objetivo + TOL_RESTO_M3) * 10000);
  const pesos = bultos.map((f) => Math.round(f.m3 * 10000));
  const n = pesos.length;
  if (n === 0 || cap <= 0) return [];
  if ((n + 1) * (cap + 1) > 4_000_000) return voraz();
  const ancho = cap + 1;
  const llega = new Uint8Array((n + 1) * ancho);
  llega[0] = 1;
  for (let i = 1; i <= n; i++) {
    const w = pesos[i - 1];
    const fila = i * ancho;
    const previa = (i - 1) * ancho;
    for (let s = 0; s <= cap; s++) {
      llega[fila + s] = llega[previa + s] || (s >= w && llega[previa + s - w]) ? 1 : 0;
    }
  }
  let mejor = cap;
  while (mejor > 0 && !llega[n * ancho + mejor]) mejor--;
  const out: Fuente[] = [];
  for (let i = n, s = mejor; i > 0 && s > 0; i--) {
    if (!llega[(i - 1) * ancho + s]) {
      out.push(bultos[i - 1]);
      s -= pesos[i - 1];
    }
  }
  return out.sort((a, b) => b.m3 - a.m3);
}

/**
 * Mejor ajuste automático para un grupo.
 *
 * Una corrida marcada «usado» se prefiere cuando SOLA cubre el grupo: la marca
 * es la forma en que el libro dijo «esto ya salió sin guía» (en Blas, el
 * inventario del 1/08 marcado el 08/09), y la guía que ahora aparece es la
 * explicación más probable. Si no lo cubre sola, no se la persigue: una guía
 * de septiembre que salió de la cubicación de ese mes no se reparte entre los
 * restos del inventario de agosto.
 */
function cubrirAuto(t: Trabajo, grupo: GrupoDelAnexo, fecha: string): Toma[] {
  const tomas: Toma[] = [];
  let falta = grupo.m3;
  const corridaDe = (f: Fuente) => t.corridas.get(f.corridaId)!.c;
  const desempate = (a: Fuente, b: Fuente) =>
    Number(corridaDe(b).usado) - Number(corridaDe(a).usado) ||
    ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase] ||
    corridaDe(a).fecha.localeCompare(corridaDe(b).fecha) ||
    corridaDe(a).lineNo - corridaDe(b).lineNo;
  const menorPrimero = (a: Fuente, b: Fuente) => alcance(t, a) - alcance(t, b) || desempate(a, b);
  for (let vuelta = 0; vuelta < 500 && falta > TOLERANCIA_ATRIBUCION; vuelta++) {
    const flex = fuentesDelGrupo(t, grupo, fecha).filter((f) => f.clase !== "paquete" && alcance(t, f) > 0);
    if (flex.length === 0) break;
    /* 1) la que lo cubre justo; 2) una «usado» que lo cubre sola; 3) la más
       chica que lo cubre entera; 4) la más grande. */
    const justa = flex.filter((f) => Math.abs(alcance(t, f) - falta) < TOL_RESTO_M3).sort(desempate)[0];
    const cubren = flex.filter((f) => alcance(t, f) >= falta);
    const cubreUsada = cubren.filter((f) => corridaDe(f).usado).sort(menorPrimero)[0];
    const cubre = [...cubren].sort(menorPrimero)[0];
    const grande = [...flex].sort((a, b) => alcance(t, b) - alcance(t, a) || desempate(a, b))[0];
    const toma = sacar(t, justa ?? cubreUsada ?? cubre ?? grande, falta);
    if (!toma) break;
    tomas.push(toma);
    falta = r4(falta - toma.q);
  }
  if (falta > TOLERANCIA_ATRIBUCION) {
    /* Los bultos de otro tipo que su corrida: enteros, la combinación que más
       se acerca a lo que falta sin pasarse. */
    const bultos = fuentesDelGrupo(t, grupo, fecha).filter((f) => f.clase === "paquete" && alcance(t, f) >= f.m3 - TOL_RESTO_M3);
    for (const f of elegirBultos(bultos, falta)) {
      if (falta <= TOLERANCIA_ATRIBUCION) break;
      const toma = sacar(t, f, falta);
      if (toma) {
        tomas.push(toma);
        falta = r4(falta - toma.q);
      }
    }
  }
  return tomas;
}

/** El grupo sale de las corridas que eligió el operador, en su orden. */
function cubrirElegido(
  t: Trabajo,
  grupo: GrupoDelAnexo,
  fecha: string,
  corridas: readonly string[],
  bloqueos: BloqueoDeGuia[],
): Toma[] {
  const tomas: Toma[] = [];
  let falta = grupo.m3;
  for (const id of corridas) {
    const x = t.corridas.get(id);
    const motivo = !x
      ? "no existe, está anulada o es de otra tienda"
      : claveEspecie(x.c.especie) !== grupo.claveEspecie
        ? `es de ${x.c.especie ?? "otra especie"}`
        : x.c.fecha > fecha
          ? `se produjo el ${x.c.fecha}, después de la guía`
          : fuentesDelGrupo(t, grupo, fecha, id).length === 0
            ? `no le queda ${grupo.tipo.toLowerCase()}`
            : null;
    if (motivo) {
      bloqueos.push({
        codigo: "ORIGEN_INVALIDO",
        mensaje: `${grupo.especie} ${grupo.tipo.toLowerCase()}: la corrida ${x ? `N° ${x.c.lineNo}` : "elegida"} ${motivo}.`,
        especie: grupo.especie,
        tipo: grupo.tipo,
        corridaId: id,
      });
      continue;
    }
    const fuentes = fuentesDelGrupo(t, grupo, fecha, id).sort(
      (a, b) => ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase] || b.m3 - a.m3,
    );
    for (const f of fuentes) {
      if (falta <= TOLERANCIA_ATRIBUCION) break;
      const toma = sacar(t, f, falta);
      if (toma) {
        tomas.push(toma);
        falta = r4(falta - toma.q);
      }
    }
  }
  return tomas;
}

/** Reparte `total` en enteros proporcionales a `pesos` sin perder ninguno (mayor resto). */
export function repartirPiezas(total: number, pesos: readonly number[]): number[] {
  const suma = pesos.reduce((a, p) => a + p, 0);
  if (pesos.length === 0) return [];
  if (!(suma > 0) || total <= 0) return pesos.map((_, i) => (i === 0 ? Math.max(0, total) : 0));
  const crudo = pesos.map((p) => (total * p) / suma);
  const base = crudo.map(Math.floor);
  let faltan = total - base.reduce((a, b) => a + b, 0);
  const orden = crudo.map((c, i) => ({ i, resto: c - Math.floor(c) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of orden) {
    if (faltan <= 0) break;
    base[i]++;
    faltan--;
  }
  return base;
}

function candidatasDe(t: Trabajo, grupo: GrupoDelAnexo, fecha: string): CandidataDeOrigen[] {
  const por = new Map<string, number>();
  for (const f of fuentesDelGrupo(t, grupo, fecha)) por.set(f.corridaId, r4((por.get(f.corridaId) ?? 0) + alcance(t, f)));
  return [...por]
    .map(([id, m3]) => {
      const c = t.corridas.get(id)!.c;
      return { corridaId: id, lineNo: c.lineNo, fecha: c.fecha, disponibleM3: m3, usado: c.usado, sinOrigen: c.sinOrigen };
    })
    .filter((c) => c.disponibleM3 > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.lineNo - b.lineNo);
}

function proponerEn(
  t: Trabajo,
  anexo: AnexoParaDespacho,
  opts: OpcionesDePropuesta,
): PropuestaDeGuia {
  const claveStock = opts.claveStock ?? claveStockPorDefecto;
  const fecha = anexo.fecha.slice(0, 10);
  const grupos = gruposDelAnexo(anexo);
  const bloqueos: BloqueoDeGuia[] = [];
  const elegidas = new Map((opts.elecciones ?? []).map((e) => [claveDeGrupo(e.especie, e.tipo), e.corridas]));

  /* I3 antes que nada: una especie sin producción suficiente hace rechazar el
     alta, y es lo primero que hay que resolver (se anota la producción). */
  const pedidoPorStock = new Map<string, { m3: number; piezas: number; especie: string }>();
  for (const g of grupos) {
    if (!g.claveEspecie) {
      bloqueos.push({ codigo: "SIN_ESPECIE", mensaje: `Hay ${fmtM3(g.m3)} m³ sin especie en el anexo: complétala en el anexo antes de registrar.`, m3: g.m3, piezas: g.piezas });
      continue;
    }
    if (!g.producto) {
      bloqueos.push({
        codigo: "TIPO_SIN_PRODUCTO",
        mensaje: `${g.especie}: ${g.piezas} piezas de tipo «${g.tipo}» (${fmtM3(g.m3)} m³) no tienen producto en el libro. Corrige la medida o el tipo en el anexo.`,
        especie: g.especie, tipo: g.tipo, m3: g.m3, piezas: g.piezas,
      });
      continue;
    }
    const k = claveStock(g.producto, g.especie);
    const prev = pedidoPorStock.get(k) ?? { m3: 0, piezas: 0, especie: g.especie };
    pedidoPorStock.set(k, { m3: r4(prev.m3 + g.m3), piezas: prev.piezas + g.piezas, especie: g.especie });
  }
  /* Con la MISMA comparación que el alta (`assertStockDisponible`:
     `r4(pedido) > stock`, sin tolerancia): con una propuesta más blanda, 0,9199
     pedidos contra 0,919 de stock salían «registrable» y el alta los rechazaba. */
  const fechaTope = fechaCorta(fecha);
  const conFecha = `Anótala con fecha del ${fechaTope} o antes: con una fecha posterior la guía entra, pero esa madera queda sin origen.`;
  for (const [k, p] of pedidoPorStock) {
    const stock = r4(t.stock.get(k) ?? 0);
    if (r4(p.m3) > stock) {
      bloqueos.push({
        codigo: "SIN_STOCK_DE_LA_ESPECIE",
        mensaje:
          stock <= 0
            ? `Falta la producción de ${p.especie}: la guía lleva ${fmtM3(p.m3)} m³ en ${p.piezas} piezas y el libro no tiene producción de esa especie sin despachar. Sin ella la guía no se registra. ${conFecha}`
            : `De ${p.especie} quedan ${fmtM3(stock)} m³ sin despachar y la guía lleva ${fmtM3(p.m3)} m³. Anota la producción que falta antes de registrarla. ${conFecha}`,
        especie: p.especie, m3: p.m3, piezas: p.piezas, stockM3: stock, fechaTope: fecha,
      });
    }
  }

  const gruposPropuestos: GrupoPropuesto[] = [];
  const lineas: LineaPropuesta[] = [];
  for (const g of grupos) {
    const candidatas = g.claveEspecie && g.producto ? candidatasDe(t, g, fecha) : [];
    const elegido = elegidas.get(g.clave);
    const tomas = !g.claveEspecie || !g.producto
      ? []
      : elegido
        ? cubrirElegido(t, g, fecha, elegido, bloqueos)
        : cubrirAuto(t, g, fecha);
    const atribuido = r4(tomas.reduce((a, x) => a + x.q, 0));
    let sinAtribuir = r4(Math.max(0, g.m3 - atribuido));
    const delGrupo: LineaPropuesta[] = tomas.map((x) => {
      const c = t.corridas.get(x.fuente.corridaId)!.c;
      return {
        grupo: g.clave,
        especie: g.especie,
        tipo: g.tipo,
        producto: g.producto!,
        m3: x.q,
        origenM3: x.q,
        piezas: 0,
        origen: {
          corridaId: c.id,
          lineNo: c.lineNo,
          fecha: c.fecha,
          usado: c.usado,
          sinOrigen: c.sinOrigen,
          clase: x.fuente.clase,
          paqueteId: x.fuente.clase === "corrida" ? null : x.fuente.paqueteId,
          codigo: x.fuente.clase === "corrida" ? null : x.fuente.codigo,
          presentacion: x.fuente.presentacion,
          restoM3: x.restoM3,
          duenoMadera: c.duenoMadera,
          titularNombre: c.titularNombre,
        },
      };
    });
    if (g.producto && sinAtribuir > 0) {
      if (sinAtribuir < TOLERANCIA_ATRIBUCION && delGrupo.length > 0) {
        /* Menos de un litro: es redondeo, no madera sin origen. La línea
           declara lo del anexo y atribuye lo que su corrida tenía. */
        const ultima = delGrupo[delGrupo.length - 1];
        ultima.m3 = r4(ultima.m3 + sinAtribuir);
      } else {
        delGrupo.push({
          grupo: g.clave, especie: g.especie, tipo: g.tipo, producto: g.producto,
          m3: sinAtribuir, origenM3: 0, piezas: 0, origen: null,
        });
      }
    } else if (!g.producto) {
      sinAtribuir = g.m3;
    }
    const piezas = repartirPiezas(g.piezas, delGrupo.map((l) => l.m3));
    delGrupo.forEach((l, i) => (l.piezas = piezas[i]));
    lineas.push(...delGrupo);
    gruposPropuestos.push({
      ...g,
      atribuidoM3: atribuido,
      sinAtribuirM3: sinAtribuir,
      corridas: [...new Set(tomas.map((x) => x.fuente.corridaId))],
      candidatas,
    });
  }

  /* Lo que la guía saca del stock de I3, para la siguiente de la tanda. */
  for (const [k, p] of pedidoPorStock) t.stock.set(k, r4((t.stock.get(k) ?? 0) - p.m3));

  const totalM3 = r4(grupos.reduce((a, g) => a + g.m3, 0));
  const atribuidoM3 = r4(lineas.reduce((a, l) => a + l.origenM3, 0));
  const usadas = new Map<string, number>();
  for (const l of lineas) if (l.origen?.usado) usadas.set(l.origen.corridaId, l.origen.lineNo);
  return {
    anexoId: anexo.id,
    numero: anexo.numero,
    gtf: anexo.gtf,
    fecha,
    totalM3,
    totalManualM3: anexo.totalManualM3 ?? null,
    atribuidoM3,
    sinAtribuirM3: r4(totalM3 - atribuidoM3),
    grupos: gruposPropuestos,
    lineas,
    bloqueos,
    registrable: bloqueos.length === 0,
    partidos: lineas.filter((l) => (l.origen?.restoM3 ?? 0) > 0).length,
    usadasComoOrigen: [...usadas].map(([corridaId, lineNo]) => ({ corridaId, lineNo })),
  };
}

/** La propuesta de UNA guía contra el libro de hoy (lo que pasaría si se registra ahora). */
export function proponerDespachoDeAnexo(
  anexo: AnexoParaDespacho,
  estado: EstadoDelLibro,
  opts: OpcionesDePropuesta = {},
): PropuestaDeGuia {
  return proponerEn(trabajoDe(estado), anexo, opts);
}

// ── Pendientes y tanda ────────────────────────────────────────────────────

/** El correlativo de la guía (último tramo numérico), para ordenar la tanda. */
const correlativo = (gtf: string): number => Number(/(\d+)\D*$/.exec(gtf ?? "")?.[1] ?? Number.NaN);

/** ¿Este anexo ya está en el libro? Por sus despachos vigentes, o por el despacho del que se emitió. */
export function anexoRegistrado(a: AnexoParaDespacho, vigentes: ReadonlySet<string>): boolean {
  return (a.despachoIds ?? []).some((id) => vigentes.has(id)) || (a.ctpEntryId != null && vigentes.has(a.ctpEntryId));
}

export interface AnexoReemplazado {
  anexoId: string;
  numero: string;
  gtf: string;
  /** El anexo de la misma guía que vale. */
  por: string;
  porNumero: string;
  /** Ya está marcado en el registro (no es sólo la propuesta). */
  marcado: boolean;
}

export interface ClasificacionDeAnexos {
  /** Los que faltan registrar, en el orden de la tanda (el más viejo primero). */
  pendientes: AnexoParaDespacho[];
  reemplazados: AnexoReemplazado[];
  registrados: AnexoParaDespacho[];
  /** Sin N° de guía: no hay salida que registrar. */
  sinGuia: AnexoParaDespacho[];
}

/**
 * Qué anexos faltan registrar. Dos anexos de la MISMA guía (por tramos:
 * `019-001-…` ≡ `19-001-…`) son el mismo papel emitido dos veces: vale el que
 * ya está registrado o, si ninguno, el más reciente (decisión 1: la 064 viajó
 * con el de 256 piezas). El otro queda «reemplazado» — no se borra.
 */
export function clasificarAnexos(
  anexos: readonly AnexoParaDespacho[],
  vigentes: ReadonlySet<string>,
): ClasificacionDeAnexos {
  const registrados: AnexoParaDespacho[] = [];
  const sinGuia: AnexoParaDespacho[] = [];
  const reemplazados: AnexoReemplazado[] = [];
  const conGuia = anexos.filter((a) => {
    if (!a.gtf?.trim()) {
      sinGuia.push(a);
      return false;
    }
    return true;
  });
  const porId = new Map(anexos.map((a) => [a.id, a]));
  const pendientes: AnexoParaDespacho[] = [];
  const vistos = new Set<string>();
  for (const a of conGuia) {
    if (vistos.has(a.id)) continue;
    const misma = conGuia.filter((b) => !vistos.has(b.id) && mismoNumeroGtf(a.gtf, b.gtf));
    misma.forEach((b) => vistos.add(b.id));
    const registrado = misma.find((b) => anexoRegistrado(b, vigentes));
    const vivos = misma.filter((b) => !b.reemplazadoPor || !porId.has(b.reemplazadoPor));
    const vale =
      registrado ??
      [...(vivos.length ? vivos : misma)].sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""))[0];
    for (const b of misma) {
      if (b.id === vale.id) continue;
      if (anexoRegistrado(b, vigentes)) {
        registrados.push(b);
        continue;
      }
      reemplazados.push({
        anexoId: b.id, numero: b.numero, gtf: b.gtf, por: vale.id, porNumero: vale.numero,
        marcado: b.reemplazadoPor === vale.id,
      });
    }
    (registrado ? registrados : pendientes).push(vale);
  }
  pendientes.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      (correlativo(a.gtf) || 0) - (correlativo(b.gtf) || 0) ||
      (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  return { pendientes, reemplazados, registrados, sinGuia };
}

export interface PropuestaDeTanda {
  guias: PropuestaDeGuia[];
  resumen: {
    guias: number;
    registrables: number;
    totalM3: number;
    atribuidoM3: number;
    sinAtribuirM3: number;
    lineas: number;
    partidos: number;
  };
  /**
   * Corridas «usado» que la tanda toma como origen y a las que les queda
   * saldo: al registrar, ese resto vuelve a Productos disponibles (decisión 6).
   */
  usadasConResto: { corridaId: string; lineNo: number; restoM3: number }[];
  /**
   * Corridas «usado» con saldo que NINGUNA guía de la tanda explica. No se
   * tocan solas (decisión 4): pueden ser un ajuste o una merma. La pantalla
   * las muestra para que el dueño decida si también vuelven al patio.
   */
  usadasSinGuia: { corridaId: string; lineNo: number; restoM3: number }[];
}

/**
 * La tanda: guía por guía, la más vieja primero, cada una sobre lo que dejó la
 * anterior — igual que se van a registrar. Una guía bloqueada no consume nada.
 */
export function proponerTanda(
  anexos: readonly AnexoParaDespacho[],
  estado: EstadoDelLibro,
  opts: { elecciones?: Readonly<Record<string, readonly EleccionDeOrigen[]>>; claveStock?: OpcionesDePropuesta["claveStock"] } = {},
): PropuestaDeTanda {
  let t = trabajoDe(estado);
  const guias: PropuestaDeGuia[] = [];
  const usadasTocadas = new Set<string>();
  for (const a of anexos) {
    const prueba = copiar(t);
    const p = proponerEn(prueba, a, { elecciones: opts.elecciones?.[a.id], claveStock: opts.claveStock });
    guias.push(p);
    if (p.registrable) {
      t = prueba;
      p.usadasComoOrigen.forEach((u) => usadasTocadas.add(u.corridaId));
    }
  }
  const usadasConResto = [...usadasTocadas]
    .map((id) => {
      const x = t.corridas.get(id)!;
      return { corridaId: id, lineNo: x.c.lineNo, restoM3: x.saldo };
    })
    .filter((u) => u.restoM3 > 0)
    .sort((a, b) => a.lineNo - b.lineNo);
  const usadasSinGuia = [...t.corridas.values()]
    .filter((x) => x.c.usado && !usadasTocadas.has(x.c.id) && x.saldo > 0)
    .map((x) => ({ corridaId: x.c.id, lineNo: x.c.lineNo, restoM3: x.saldo }))
    .sort((a, b) => a.lineNo - b.lineNo);
  const suma = (f: (g: PropuestaDeGuia) => number) => r4(guias.reduce((a, g) => a + f(g), 0));
  return {
    guias,
    resumen: {
      guias: guias.length,
      registrables: guias.filter((g) => g.registrable).length,
      totalM3: suma((g) => g.totalM3),
      atribuidoM3: suma((g) => g.atribuidoM3),
      sinAtribuirM3: suma((g) => g.sinAtribuirM3),
      lineas: guias.reduce((a, g) => a + g.lineas.length, 0),
      partidos: guias.reduce((a, g) => a + g.partidos, 0),
    },
    usadasConResto,
    usadasSinGuia,
  };
}
