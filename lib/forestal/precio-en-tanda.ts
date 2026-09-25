/**
 * Poner precio a la madera EN TANDA: un precio por m³ para un proveedor y una
 * especie, aplicado a todas sus guías de una vez.
 *
 * EL HUECO QUE TAPA. Medido en el tenant real el 2026-09-25: **0 de 23**
 * ingresos vivos con precio (135,59 m³ de un solo proveedor, 21 filas en 11
 * especies). La ficha del permiso sumaba «Plata» en S/ 0 y el costo por m³ no
 * existía. El precio se acuerda por proveedor y por especie («S/ 180 el
 * metro»), no guía por guía: cargarlo fila por fila son 21 formularios para
 * un número.
 *
 * Lo que decide acá (y por qué es puro): qué filas se tocan, cuánto queda cada
 * una, cuáles se saltan y por qué, y si el precio huele a dedazo. El servidor
 * lo corre sobre las filas BLOQUEADAS dentro de la transacción; la pantalla, sobre
 * las mismas filas para la vista previa. Una sola regla, dos lugares que la usan.
 *
 * Reglas del libro que respeta (`.claude/rules/forestal-serfor.md`):
 * · sin factura el costo es `null`, nunca 0 — por eso el precio de la tanda es > 0;
 * · un ingreso anulado o rechazado no lleva costo (mismo filtro que `balance()`);
 * · el mes cerrado manda y un costo que ya se congeló en una corrida no se pisa.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { claveEspecie } from "./loth-constants";
import { PT_POR_M3 } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { formatNumber } from "@/lib/format";

/** Lo que cuenta en el balance del permiso: todo menos rechazado y anulado. */
export const ESTADOS_VALORIZABLES = ["pendiente", "validado", "procesado"] as const;
export const esValorizable = (status: string): boolean =>
  (ESTADOS_VALORIZABLES as readonly string[]).includes(status);

/** Por qué una fila con precio pedido no se puede tocar. */
export type BloqueoPrecio =
  | { tipo: "periodo-cerrado"; periodo: string }
  /** Alguna corrida ya congeló su costo al cierre con el precio de esta guía. */
  | { tipo: "congelado" };

/** Un ingreso tal como lo necesita la tanda. */
export interface FilaParaPrecio {
  id: string;
  gtfNumber: string;
  /** ISO. Fecha date-only del libro: se lee en UTC. */
  entryDate: string;
  providerName: string;
  speciesCommonName: string;
  volumeM3: number;
  costoTotal: number | null;
  moneda: string | null;
  status: string;
  /** El código del permiso que ampara la guía, o `null` si no está atada. */
  permiso: string | null;
  bloqueo: BloqueoPrecio | null;
}

// ─── Dinero exacto ──────────────────────────────────────────────────────────

/**
 * `precio × volumen` redondeado al céntimo, sin error de punto flotante.
 *
 * `Math.round(180.15 * 6.0485 * 100) / 100` puede caer del lado equivocado del
 * medio céntimo; acá se multiplica en enteros (céntimos × diezmilésimas de m³,
 * la precisión de `volumeM3`) y se redondea la mitad hacia arriba. Es la misma
 * cuenta que haría la calculadora del contador.
 */
export function costoDe(precioM3: number, volumeM3: number): number {
  const centimos = BigInt(Math.round(precioM3 * 100));
  const diezmilesimas = BigInt(Math.round(volumeM3 * 10_000));
  const producto = centimos * diezmilesimas; // en millonésimas de sol
  const redondeado = (producto + BigInt(5_000)) / BigInt(10_000);
  return Number(redondeado) / 100;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * El precio por m³ más chico que se acepta: un céntimo. Menos que eso se
 * redondea a S/ 0,00 y guardaría «costó 0» — madera regalada — sin que nadie lo
 * haya dicho (revisión 2026-09-25: S/ 0,004 pasaba `> 0` y quedaba en 0).
 * Sin factura el costo es `null`, nunca 0.
 */
export const PRECIO_MINIMO_M3 = 0.01;

/** El precio al céntimo, o `null` si no es un precio que se pueda aplicar. */
export function precioAplicable(precioM3: number | null | undefined): number | null {
  if (precioM3 == null || !Number.isFinite(precioM3)) return null;
  const alCentimo = Math.round(precioM3 * 100) / 100;
  return alCentimo >= PRECIO_MINIMO_M3 ? alCentimo : null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Agrupar ────────────────────────────────────────────────────────────────

/** Cómo se muestra una guía sin proveedor o sin especie (y su clave es la vacía). */
export const SIN_PROVEEDOR = "(sin proveedor)";
export const SIN_ESPECIE = "(sin especie)";

/** El proveedor sin tildes, mayúsculas ni dobles espacios: «Santos  Muñoz» = «SANTOS MUÑOZ». */
export function claveProveedor(nombre: string | null | undefined): string {
  /* El rótulo de «sin proveedor» vuelve como pedido desde la pantalla: tiene
     que caer en el MISMO grupo que la guía de nombre vacío. */
  if ((nombre ?? "").trim() === SIN_PROVEEDOR) return "";
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Identidad del grupo proveedor × especie. */
export const claveGrupo = (proveedor: string | null | undefined, especie: string | null | undefined): string =>
  `${claveProveedor(proveedor)}|${claveEspecie(especie)}`;

export interface GrupoEspecie {
  clave: string;
  proveedor: string;
  especie: string;
  /** Códigos de permiso distintos de sus guías. */
  permisos: string[];
  /** Guías del grupo sin permiso atado. */
  sinPermiso: number;
  filas: number;
  m3: number;
  sinPrecio: number;
  m3SinPrecio: number;
  conPrecio: number;
  /** Filas que la tanda no puede tocar (mes cerrado o costo congelado). */
  bloqueadas: number;
  /** El S/ por m³ que ya tienen las filas con precio en soles (mín–máx). */
  precioActual: { min: number; max: number } | null;
}

export interface GrupoProveedor {
  clave: string;
  proveedor: string;
  especies: GrupoEspecie[];
  permisos: string[];
  filas: number;
  m3: number;
  sinPrecio: number;
  m3SinPrecio: number;
}

/** El nombre que más se repite entre las grafías del grupo (el primero, si empatan). */
function nombreMasUsado(conteo: Map<string, number>): string {
  let mejor = "";
  let n = -1;
  for (const [nombre, c] of conteo) if (c > n) { mejor = nombre; n = c; }
  return mejor;
}

/**
 * Las filas vivas agrupadas por proveedor y, dentro, por especie.
 *
 * Arriba va el proveedor con más m³ SIN precio: es lo que más plata deja sin
 * contar en la ficha del permiso. Las filas no valorizables se ignoran.
 */
export function agruparParaPrecio(filas: readonly FilaParaPrecio[]): GrupoProveedor[] {
  interface Acc extends Omit<GrupoEspecie, "proveedor" | "especie" | "permisos" | "precioActual"> {
    claveProv: string;
    nombresProv: Map<string, number>;
    nombresEsp: Map<string, number>;
    permisos: Set<string>;
    porM3: number[];
  }
  const grupos = new Map<string, Acc>();
  for (const f of filas) {
    if (!esValorizable(f.status)) continue;
    const clave = claveGrupo(f.providerName, f.speciesCommonName);
    const g =
      grupos.get(clave) ??
      ({
        clave,
        claveProv: claveProveedor(f.providerName),
        nombresProv: new Map(),
        nombresEsp: new Map(),
        permisos: new Set(),
        porM3: [] as number[],
        sinPermiso: 0,
        filas: 0,
        m3: 0,
        sinPrecio: 0,
        m3SinPrecio: 0,
        conPrecio: 0,
        bloqueadas: 0,
      } satisfies Acc);
    const prov = (f.providerName ?? "").trim() || SIN_PROVEEDOR;
    const esp = (f.speciesCommonName ?? "").trim() || SIN_ESPECIE;
    g.nombresProv.set(prov, (g.nombresProv.get(prov) ?? 0) + 1);
    g.nombresEsp.set(esp, (g.nombresEsp.get(esp) ?? 0) + 1);
    if (f.permiso) g.permisos.add(f.permiso);
    else g.sinPermiso++;
    g.filas++;
    g.m3 += f.volumeM3;
    if (f.costoTotal == null) {
      g.sinPrecio++;
      g.m3SinPrecio += f.volumeM3;
    } else {
      g.conPrecio++;
      if ((f.moneda ?? "PEN") === "PEN" && f.volumeM3 > 0) g.porM3.push(r2(f.costoTotal / f.volumeM3));
    }
    if (f.bloqueo) g.bloqueadas++;
    grupos.set(clave, g);
  }

  const porProveedor = new Map<string, GrupoProveedor>();
  for (const g of grupos.values()) {
    const especie: GrupoEspecie = {
      clave: g.clave,
      proveedor: nombreMasUsado(g.nombresProv),
      especie: nombreMasUsado(g.nombresEsp),
      permisos: [...g.permisos].sort(),
      sinPermiso: g.sinPermiso,
      filas: g.filas,
      m3: r4(g.m3),
      sinPrecio: g.sinPrecio,
      m3SinPrecio: r4(g.m3SinPrecio),
      conPrecio: g.conPrecio,
      bloqueadas: g.bloqueadas,
      precioActual: g.porM3.length ? { min: Math.min(...g.porM3), max: Math.max(...g.porM3) } : null,
    };
    const cp = g.claveProv;
    const p =
      porProveedor.get(cp) ??
      ({ clave: cp, proveedor: especie.proveedor, especies: [], permisos: [], filas: 0, m3: 0, sinPrecio: 0, m3SinPrecio: 0 } satisfies GrupoProveedor);
    p.especies.push(especie);
    p.filas += especie.filas;
    p.m3 = r4(p.m3 + especie.m3);
    p.sinPrecio += especie.sinPrecio;
    p.m3SinPrecio = r4(p.m3SinPrecio + especie.m3SinPrecio);
    porProveedor.set(cp, p);
  }
  for (const p of porProveedor.values()) {
    p.especies.sort((a, b) => b.m3SinPrecio - a.m3SinPrecio || b.m3 - a.m3 || a.especie.localeCompare(b.especie));
    p.permisos = [...new Set(p.especies.flatMap((e) => e.permisos))].sort();
  }
  return [...porProveedor.values()].sort(
    (a, b) => b.m3SinPrecio - a.m3SinPrecio || b.m3 - a.m3 || a.proveedor.localeCompare(b.proveedor),
  );
}

// ─── Qué filas se tocan ─────────────────────────────────────────────────────

export interface PrecioPedido {
  proveedor: string;
  especie: string;
  precioM3: number;
}

/** Lo que la pantalla le mostró al usuario: sólo eso se escribe, y sólo si sigue igual. */
export interface FilaVista {
  id: string;
  antes: number | null;
}

export type MotivoSalto =
  | "periodo-cerrado"
  | "congelado"
  | "sin-volumen"
  | "ya-tiene-precio"
  | "sin-cambio"
  | "cambio-mientras-tanto"
  | "no-valorizable";

export const TEXTO_MOTIVO: Record<MotivoSalto, string> = {
  "periodo-cerrado": "su mes está cerrado",
  congelado: "su costo ya se congeló en una corrida",
  "sin-volumen": "no declara volumen",
  "ya-tiene-precio": "ya tiene precio",
  "sin-cambio": "ya tenía ese mismo precio",
  "cambio-mientras-tanto": "alguien la cambió mientras mirabas",
  "no-valorizable": "está anulada, rechazada o ya no existe",
};

export interface CambioDePrecio {
  id: string;
  gtfNumber: string;
  proveedor: string;
  especie: string;
  permiso: string | null;
  volumeM3: number;
  precioM3: number;
  antes: number | null;
  monedaAntes: string | null;
  despues: number;
}

export interface FilaSaltada {
  id: string;
  gtfNumber: string;
  proveedor: string;
  especie: string;
  motivo: MotivoSalto;
  /** «mayo de 2026» cuando el motivo es el mes cerrado. */
  detalle: string | null;
}

export interface PlanDePrecio {
  cambios: CambioDePrecio[];
  saltadas: FilaSaltada[];
  totales: {
    filas: number;
    m3: number;
    soles: number;
    /** Cuántas de las que cambian YA tenían precio (se pisan). */
    pisadas: number;
  };
}

/**
 * Qué pasa si se aplican estos precios.
 *
 * · Sólo las filas de los grupos pedidos; con `vistos`, además, sólo las que la
 *   pantalla mostró — y si su costo ya no es el que se mostró, se saltan: el
 *   usuario aprobó un «de cuánto a cuánto» que dejó de ser cierto.
 * · Sin «también las que ya tienen precio», una fila con precio no se toca.
 * · Mes cerrado, costo congelado y sin volumen se saltan y se dicen: multiplicar
 *   por 0 m³ guardaría «costó S/ 0», que es afirmar madera regalada.
 */
export function planDePrecio(
  filas: readonly FilaParaPrecio[],
  pedidos: readonly PrecioPedido[],
  opts: { tambienConPrecio: boolean; vistos?: readonly FilaVista[] },
): PlanDePrecio {
  const precioDe = new Map<string, number>();
  for (const p of pedidos) {
    const precio = precioAplicable(p.precioM3);
    if (precio != null) precioDe.set(claveGrupo(p.proveedor, p.especie), precio);
  }
  const vistos = opts.vistos ? new Map(opts.vistos.map((v) => [v.id, v.antes])) : null;

  const cambios: CambioDePrecio[] = [];
  const saltadas: FilaSaltada[] = [];
  const encontradas = new Set<string>();
  const saltar = (f: FilaParaPrecio, motivo: MotivoSalto, detalle: string | null = null) =>
    saltadas.push({ id: f.id, gtfNumber: f.gtfNumber, proveedor: f.providerName, especie: f.speciesCommonName, motivo, detalle });

  for (const f of filas) {
    const precio = precioDe.get(claveGrupo(f.providerName, f.speciesCommonName));
    if (precio == null) continue;
    if (vistos && !vistos.has(f.id)) continue;
    encontradas.add(f.id);
    if (!esValorizable(f.status)) { saltar(f, "no-valorizable"); continue; }
    if (vistos && (vistos.get(f.id) ?? null) !== f.costoTotal) { saltar(f, "cambio-mientras-tanto"); continue; }
    if (f.costoTotal != null && !opts.tambienConPrecio) { saltar(f, "ya-tiene-precio"); continue; }
    if (f.bloqueo?.tipo === "periodo-cerrado") { saltar(f, "periodo-cerrado", f.bloqueo.periodo); continue; }
    if (f.bloqueo?.tipo === "congelado") { saltar(f, "congelado"); continue; }
    if (!(f.volumeM3 > 0)) { saltar(f, "sin-volumen"); continue; }
    const despues = costoDe(precio, f.volumeM3);
    if (f.costoTotal != null && (f.moneda ?? "PEN") === "PEN" && f.costoTotal === despues) {
      saltar(f, "sin-cambio");
      continue;
    }
    cambios.push({
      id: f.id,
      gtfNumber: f.gtfNumber,
      proveedor: f.providerName,
      especie: f.speciesCommonName,
      permiso: f.permiso,
      volumeM3: f.volumeM3,
      precioM3: precio,
      antes: f.costoTotal,
      monedaAntes: f.costoTotal != null ? (f.moneda ?? "PEN") : null,
      despues,
    });
  }

  /* Lo que la pantalla mostró y ya no está entre las vivas: anulada o borrada
     mientras tanto. Se dice, no se pierde en silencio. */
  if (vistos) {
    const existen = new Set(filas.map((f) => f.id));
    for (const id of vistos.keys()) {
      if (!encontradas.has(id) && !existen.has(id)) {
        saltadas.push({ id, gtfNumber: "", proveedor: "", especie: "", motivo: "no-valorizable", detalle: null });
      }
    }
  }

  let centimos = 0;
  let diezmilesimas = 0;
  for (const c of cambios) {
    centimos += Math.round(c.despues * 100);
    diezmilesimas += Math.round(c.volumeM3 * 10_000);
  }
  return {
    cambios,
    saltadas,
    totales: {
      filas: cambios.length,
      m3: diezmilesimas / 10_000,
      soles: centimos / 100,
      pisadas: cambios.filter((c) => c.antes != null).length,
    },
  };
}

// ─── Detector de dedazos ────────────────────────────────────────────────────

/**
 * Cuánto se aleja un precio de su referencia antes de avisar: **√10 ≈ 3,16**.
 *
 * No es un número redondo elegido a ojo: el dedazo típico es un cero de más o
 * de menos (×10 o ÷10). √10 es el punto medio GEOMÉTRICO entre el precio
 * bueno y su error de un cero: un precio que avisa está más cerca de «la
 * referencia con un cero cambiado» que de la referencia. Y deja pasar sin ruido
 * la diferencia real entre especies de la plaza, que en el patio va de ~×2 a ×3
 * (Tornillo contra Cachimbo) — avisar ahí enseñaría a ignorar el aviso.
 */
export const FACTOR_DEDAZO = Math.sqrt(10);

/** Mediana de una lista (vacía → null). */
function mediana(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : r2((s[m - 1] + s[m]) / 2);
}

/** Las referencias de precio del propio tenant, por especie (clave) y en total. */
export interface ReferenciasDePrecio {
  /** Lo que YA pagó por m³ (filas con precio en soles, > 0). */
  pagado: { porEspecie: Record<string, { mediana: number; casos: number }>; total: { mediana: number; casos: number } | null };
  /** Precio de venta comercial por m³ que declara su plan de manejo, por especie. */
  plan: Record<string, number>;
  /** Valor al Estado Natural (VEN) por m³ que declara el plan, por especie. */
  ven: Record<string, number>;
  /** S/ por pie tablar a los que vende la madera aserrada, por especie. */
  ventaPt: Record<string, number>;
}

export interface EntradasDeReferencia {
  filas: readonly FilaParaPrecio[];
  plan: readonly { especie: string; precioVentaM3: number | null; venM3: number | null }[];
  ventasPt: readonly { especie: string; precioPt: number }[];
}

/** Arma las referencias. Cada lista se reduce a su mediana: un solo antecedente raro no la mueve. */
export function referenciasDesde(e: EntradasDeReferencia): ReferenciasDePrecio {
  const pagadoPor = new Map<string, number[]>();
  const todos: number[] = [];
  for (const f of e.filas) {
    if (!esValorizable(f.status) || f.costoTotal == null || !(f.costoTotal > 0) || !(f.volumeM3 > 0)) continue;
    if ((f.moneda ?? "PEN") !== "PEN") continue;
    const porM3 = r2(f.costoTotal / f.volumeM3);
    const k = claveEspecie(f.speciesCommonName);
    pagadoPor.set(k, [...(pagadoPor.get(k) ?? []), porM3]);
    todos.push(porM3);
  }
  const porEspecie: ReferenciasDePrecio["pagado"]["porEspecie"] = {};
  for (const [k, xs] of pagadoPor) porEspecie[k] = { mediana: mediana(xs) as number, casos: xs.length };

  const juntar = (pares: readonly (readonly [string, number | null])[]): Record<string, number> => {
    const m = new Map<string, number[]>();
    for (const [esp, v] of pares) {
      if (v == null || !(v > 0)) continue;
      const k = claveEspecie(esp);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return Object.fromEntries([...m].map(([k, xs]) => [k, mediana(xs) as number]));
  };

  return {
    pagado: { porEspecie, total: todos.length ? { mediana: mediana(todos) as number, casos: todos.length } : null },
    plan: juntar(e.plan.map((p) => [p.especie, p.precioVentaM3] as const)),
    ven: juntar(e.plan.map((p) => [p.especie, p.venM3] as const)),
    ventaPt: juntar(e.ventasPt.map((v) => [v.especie, v.precioPt] as const)),
  };
}

export type OrigenReferencia = "pagado-especie" | "plan-especie" | "pagado-otras" | "plan-otras";

export interface RangoDePrecio {
  /** El precio contra el que se compara, o null si no hay ninguno. */
  base: number | null;
  origen: OrigenReferencia | null;
  casos: number;
  min: number | null;
  max: number | null;
  /** Piso: el VEN de la especie. Pagar menos que el árbol en pie no es un precio. */
  piso: number | null;
  /** Techo: lo que vale la tabla que sale de 1 m³ (56 % × 424 pt × S/ por pt). */
  techo: number | null;
  ptVenta: number | null;
}

/**
 * Contra qué se compara un precio para esta especie. Prioridad: lo que ya
 * pagaste por ESA especie > lo que dice tu plan de manejo para ella > lo que
 * pagaste por las otras > lo que dice el plan para las otras. `null` si no hay
 * nada: sin referencia no se avisa (la rama muda es obligatoria — un aviso sin
 * base es un falso rojo).
 */
export function rangoDePrecio(especie: string, refs: ReferenciasDePrecio): RangoDePrecio | null {
  const k = claveEspecie(especie);
  const planOtras = mediana(Object.values(refs.plan));
  const elegida: { base: number; origen: OrigenReferencia; casos: number } | null =
    refs.pagado.porEspecie[k]
      ? { base: refs.pagado.porEspecie[k].mediana, origen: "pagado-especie", casos: refs.pagado.porEspecie[k].casos }
      : refs.plan[k] != null
        ? { base: refs.plan[k], origen: "plan-especie", casos: 1 }
        : refs.pagado.total
          ? { base: refs.pagado.total.mediana, origen: "pagado-otras", casos: refs.pagado.total.casos }
          : planOtras != null
            ? { base: planOtras, origen: "plan-otras", casos: Object.keys(refs.plan).length }
            : null;

  const piso = refs.ven[k] ?? null;
  /* El techo usa el pt de la especie; sin él, el de la madera más cara que
     vendes — el techo más generoso, para no avisar de más. */
  const ptsOtras = Object.values(refs.ventaPt);
  const ptVenta = refs.ventaPt[k] ?? (ptsOtras.length ? Math.max(...ptsOtras) : null);
  const techo = ptVenta != null ? r2(RENDIMIENTO_META * PT_POR_M3 * ptVenta) : null;

  if (!elegida && piso == null && techo == null) return null;
  return {
    base: elegida?.base ?? null,
    origen: elegida?.origen ?? null,
    casos: elegida?.casos ?? 0,
    min: elegida ? r2(elegida.base / FACTOR_DEDAZO) : null,
    max: elegida ? r2(elegida.base * FACTOR_DEDAZO) : null,
    piso,
    techo,
    ptVenta,
  };
}

const soles = (n: number) => `S/ ${formatNumber(n, 2)}`;

const TEXTO_ORIGEN: Record<OrigenReferencia, string> = {
  "pagado-especie": "lo que ya pagaste por esta especie",
  "plan-especie": "precio de venta de esta especie en tu plan de manejo",
  "pagado-otras": "lo que pagaste por otras especies",
  "plan-otras": "precios de venta de tu plan de manejo",
};

/** De dónde sale la referencia, en una frase (para el ⓘ del aviso). */
export const textoDeReferencia = (r: RangoDePrecio): string | null =>
  r.base != null && r.origen ? `${soles(r.base)} el m³: ${TEXTO_ORIGEN[r.origen]}` : null;

/**
 * Los avisos de un precio, en palabras del patio. Lista vacía = nada raro (o
 * nada contra qué comparar). Avisar no impide: el libro registra lo que pasó.
 */
export function avisosDePrecio(precioM3: number, rango: RangoDePrecio | null): string[] {
  if (!rango || !(precioM3 > 0)) return [];
  const avisos: string[] = [];
  if (rango.base != null && rango.origen && rango.min != null && rango.max != null) {
    if (precioM3 < rango.min) {
      avisos.push(`${soles(precioM3)} el m³ es menos de un tercio de tu referencia (${soles(rango.base)}: ${TEXTO_ORIGEN[rango.origen]}). ¿Falta un cero?`);
    } else if (precioM3 > rango.max) {
      avisos.push(`${soles(precioM3)} el m³ es más del triple de tu referencia (${soles(rango.base)}: ${TEXTO_ORIGEN[rango.origen]}). ¿Sobra un cero?`);
    }
  }
  if (rango.piso != null && precioM3 < rango.piso) {
    avisos.push(`Es menos que el valor del árbol en pie de tu plan (VEN ${soles(rango.piso)} el m³).`);
  }
  if (rango.techo != null && rango.ptVenta != null && precioM3 > rango.techo) {
    avisos.push(
      `Es más de lo que vale la tabla que sale de 1 m³: ≈ ${soles(rango.techo)} (${Math.round(RENDIMIENTO_META * 100)} % × ${PT_POR_M3} pt × ${soles(rango.ptVenta)} el pt).`,
    );
  }
  return avisos;
}
