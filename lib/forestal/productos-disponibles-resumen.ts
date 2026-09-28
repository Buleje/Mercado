/**
 * productos-disponibles-resumen — la madera ASERRADA que queda en la planta, en
 * cifras (pestaña «Productos disponibles», rediseño 2026-09-27).
 *
 * Brandon: «el mismo formato, KPIs, gráficos y otras mejoras… igual como se hizo
 * en Trozas disponibles». Esta es la lógica pura detrás de los indicadores, los
 * gráficos y las tablas por permiso, especie y producto.
 *
 * UN criterio en toda la pantalla (la trampa que cazó la revisión de Trozas):
 *  · las cifras principales son lo DISPONIBLE = libre + apartado. Lo apartado
 *    sigue en la planta y sigue contando (ADR-418), sólo que ya tiene dueño;
 *  · lo MARCADO COMO USADO va SIEMPRE aparte (su columna, su indicador) y nunca
 *    se suma a lo de arriba. Antes el tilde «ver también lo usado» lo metía en
 *    el total y el mismo número cambiaba de significado según un tilde.
 *
 * La unidad es la FILA de la tabla: un paquete, o la corrida entera cuando no
 * tiene paquetes (las viejas). Cada fila trae DOS m³:
 *  · `volumenM3` — el del paquete, lo que dice su etiqueta (la tabla de paquetes);
 *  · `m3Libro` — su parte del SALDO DEL LIBRO (`disponible`, ADR-316). Es la que
 *    suman los indicadores, el pt, las tablas por grupo, los gráficos y el Excel.
 * Coinciden casi siempre. No coinciden cuando salió parte de la corrida: el
 * despacho descuenta de la CORRIDA y los paquetes siguen en la lista (5 de 2 m³
 * con 4 m³ despachados sumaban «10 m³»; el libro dice 6 — revisión 27-09). El
 * libro manda: el saldo se reparte entre sus paquetes en proporción a su m³, y
 * el aviso de «no cuadra» dice cuánto suman los paquetes.
 *
 * pt = `pieTablarDe(m³)` (m³ × 424): el producto YA es aserrado, no el 56 % de
 * rolliza. Es la misma cuenta que la tabla usaba antes; los paquetes cubicados
 * (ADR-429) guardan un pt que coincide con m³ × 424 al centésimo. Se redondea en
 * cada nivel desde sus m³: la suma de filas puede diferir en 1-2 pt, nunca en m³.
 *
 * PURO y client-safe: la hora entra por parámetro.
 */

import { pieTablarDe } from "./lotes-aserrio";
import { claveEspecie } from "./loth-constants";
import { grafiaPreferida } from "./especies-catalogo";
import { productoDelTipoComercial } from "./loctp-catalogos";
import { uidDeFila } from "./despacho-lista";
import { TRAMOS_EDAD, edadEnDias, resumenDeEdad, tramoDeEdad, type ResumenEdad, type TramoEdad } from "./edad-del-patio";
import { plazoDeApartado } from "./plazo-de-apartado";
import { compararDisponibles, type Orden } from "./disponibles-orden";
import {
  valorDeCorrida,
  valorDeFila,
  type ConsumoCosteable,
  type GuiaCosteable,
  type ValorDeCorrida,
} from "./valor-del-patio";

// ── La forma que devuelve `/api/admin/forestal/ctp?disponibles=1` ────────────

/** Una reserva viva: la madera sigue en el patio pero ya tiene dueño (ADR-418). */
export interface ApartadoProducto {
  id: string;
  para: string;
  hasta: string | null;
  nota: string | null;
  creadoAt: string;
}

export interface PaqueteDisponible {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
  /** Reserva viva de ESTE paquete. `null` = libre. */
  apartado: ApartadoProducto | null;
}

export interface CorridaDisponible {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  especieCientifica: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  /** De quién es la madera (ADR-412): "propia" | "tercero" | null. */
  duenoMadera?: string | null;
  titularNombre?: string | null;
  lote: string | null;
  /** `quantity` del asiento — lo que el editor corrige (ADR-401). */
  cantidad: number | null;
  /** `volumeInputM3` del asiento: materia prima que entró a la sierra. */
  volumenConsumidoM3: number | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
  paquetes: PaqueteDisponible[];
  observations: string | null;
  /** N° de Permiso de la madera que alimentó la corrida (la hereda de sus guías). */
  titularOrigen: string[];
  gtfOrigen: string[];
  /** Marcado a mano como «ya usado» (2026-09-01). `null` = disponible. */
  usadoAt: string | null;
  usadoMotivo: string | null;
  /** Reserva viva de la corrida entera (fila sin paquete). */
  apartado?: ApartadoProducto | null;
  rendimientoPct?: number | null;
  costoConsumos?: ConsumoCosteable[];
  costoPorGtf?: GuiaCosteable[];
}

// ── Claves: qué cuenta como «lo mismo» ───────────────────────────────────────

export const SIN_PERMISO = "Sin permiso";
export const SIN_ESPECIE = "Sin especie";
export const SIN_PRODUCTO = "Sin producto";

const sinTildes = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * El producto por su texto normalizado, CON el paréntesis: «MADERA ASERRADA
 * (TABLILLAS)» no es «Madera aserrada». Antes se agrupaba con `claveEspecie`,
 * que borra el paréntesis (ahí va el científico) y juntaba comercial, tablillas
 * y paquetería en una sola opción. «Comercial» suelto = «MADERA ASERRADA
 * (COMERCIAL)»: es el tipo que escribe el cubicador (`productoDelTipoComercial`).
 */
export function claveProducto(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  if (!t) return "";
  return sinTildes(productoDelTipoComercial(t) ?? t);
}

/** Un N° de permiso se tipea con espacios de más, no con tildes. */
export const clavePermiso = (v: string | null | undefined) =>
  (v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/** Los permisos de la corrida en UNA clave: una corrida con dos permisos es una fila, no dos. */
const permisoDeCorrida = (c: Pick<CorridaDisponible, "titularOrigen">): string =>
  [...new Set((c.titularOrigen ?? []).map(clavePermiso).filter(Boolean))].sort().join(" · ");

// ── Filas ────────────────────────────────────────────────────────────────────

export type EstadoProducto = "libre" | "apartado" | "usado";
export const ESTADOS_PRODUCTO: readonly EstadoProducto[] = ["libre", "apartado", "usado"];
export const ETIQUETA_ESTADO_PRODUCTO: Record<EstadoProducto, string> = {
  libre: "Libre",
  apartado: "Apartado",
  usado: "Marcado usado",
};

export interface FilaProducto {
  /** `corridaId:paqueteId` — el mismo uid que espera la guía de despacho. */
  clave: string;
  corrida: CorridaDisponible;
  paquete: PaqueteDisponible | null;
  volumenM3: number;
  piezas: number | null;
  dias: number | null;
  tramo: TramoEdad | null;
  estado: EstadoProducto;
  apartado: ApartadoProducto | null;
  especieClave: string;
  productoClave: string;
  /** Texto del producto tal como está (el del paquete manda sobre el de la corrida). */
  producto: string;
  permisoClave: string;
  /** Su parte del saldo del libro (= `volumenM3` si la corrida cuadra). Es lo que suman las cifras. */
  m3Libro: number;
  /** De la CORRIDA entera: cuánto suman sus paquetes y su saldo del libro. */
  corridaPaquetesM3: number;
  corridaLibroM3: number;
  valorCorrida: ValorDeCorrida;
  valorSoles: number | null;
}

/** Un litro: la tolerancia con la que se validan los paquetes contra la corrida (ADR-349). */
const TOLERANCIA_M3 = 0.001;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
export const ptDe = (m3: number) => pieTablarDe(m3);

/**
 * Una fila por paquete; la corrida sin paquetes, una fila con su saldo (no
 * puede desaparecer producto que existe). `ahora` null = todavía sin montar:
 * la edad queda en blanco en vez de dar un mismatch de hidratación.
 */
export function filasDeProductos(
  corridas: readonly CorridaDisponible[],
  ahora: Date | null,
): FilaProducto[] {
  return corridas.flatMap((c) => {
    const dias = ahora ? edadEnDias(c.fecha, ahora) : null;
    const valorCorrida = valorDeCorrida({
      gtfOrigen: c.gtfOrigen ?? [],
      costoConsumos: c.costoConsumos ?? [],
      costoPorGtf: c.costoPorGtf ?? [],
      rendimientoPct: c.rendimientoPct ?? null,
      producido: c.producido,
      volumenConsumidoM3: c.volumenConsumidoM3,
    });
    const saldo = num(c.disponible);
    const paquetesM3 = c.paquetes.reduce((a, p) => a + num(p.volumenM3), 0);
    const cuadra = c.paquetes.length === 0 || Math.abs(paquetesM3 - saldo) <= TOLERANCIA_M3;
    /* El saldo del libro repartido entre sus paquetes, en proporción a su m³
       (en partes iguales si los paquetes no dicen su m³). */
    const parteDelLibro = (m3: number) =>
      cuadra ? m3 : paquetesM3 > 0 ? (saldo * m3) / paquetesM3 : saldo / c.paquetes.length;
    const base = {
      corrida: c,
      dias,
      tramo: tramoDeEdad(dias),
      especieClave: claveEspecie(c.especie),
      permisoClave: permisoDeCorrida(c),
      corridaPaquetesM3: c.paquetes.length > 0 ? r4(paquetesM3) : saldo,
      corridaLibroM3: saldo,
      valorCorrida,
    };
    const fila = (
      paquete: PaqueteDisponible | null,
      volumenM3: number,
      apartado: ApartadoProducto | null,
    ): FilaProducto => {
      const producto = (paquete?.producto ?? c.producto ?? "").trim();
      return {
        ...base,
        clave: uidDeFila(c.id, paquete?.id ?? null),
        paquete,
        volumenM3,
        m3Libro: paquete ? parteDelLibro(volumenM3) : volumenM3,
        piezas: paquete ? num(paquete.cantidad) : null,
        estado: c.usadoAt ? "usado" : apartado ? "apartado" : "libre",
        apartado,
        producto,
        productoClave: claveProducto(producto),
        valorSoles: valorDeFila(valorCorrida, volumenM3),
      };
    };
    return c.paquetes.length > 0
      ? c.paquetes.map((p) => fila(p, num(p.volumenM3), p.apartado ?? null))
      : [fila(null, num(c.disponible), c.apartado ?? null)];
  });
}

// ── Filtro cruzado ───────────────────────────────────────────────────────────

export interface FiltroProductos {
  texto: string;
  permiso: readonly string[];
  especie: readonly string[];
  producto: readonly string[];
  /** Vacío = todo (las tablas muestran lo usado en su columna aparte). */
  estado: readonly EstadoProducto[];
  tramos: readonly TramoEdad[];
}
export type CampoFiltroProductos = keyof FiltroProductos;

export const FILTRO_PRODUCTOS_VACIO: FiltroProductos = {
  texto: "",
  permiso: [],
  especie: [],
  producto: [],
  estado: [],
  tramos: [],
};

/* Por la clave EXACTA de la fila: elegir «A» no trae la corrida «A · B», que
   es otra fila de «Por permiso» (si no, la cifra filtrada no era la de la fila). */
const coincidePermiso = (f: FilaProducto, valor: string) =>
  valor === SIN_PERMISO ? f.permisoClave === "" : clavePermiso(valor) === f.permisoClave;
const coincideEspecie = (f: FilaProducto, valor: string) =>
  valor === SIN_ESPECIE ? f.especieClave === "" : claveEspecie(valor) === f.especieClave;
const coincideProducto = (f: FilaProducto, valor: string) =>
  valor === SIN_PRODUCTO ? f.productoClave === "" : claveProducto(valor) === f.productoClave;

const sinCaja = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

/**
 * ¿Dos valores de un filtro son el mismo? Por CLAVE: «MADERA ASERRADA
 * (COMERCIAL)» (cabecera) y «Madera aserrada (comercial)» (fila, barra) son lo
 * mismo, o el segundo clic no soltaría el filtro que puso el primero.
 */
export function mismoValorDeFiltro(campo: "permiso" | "especie" | "producto" | "tramos", a: string, b: string): boolean {
  if (a === b) return true;
  if (campo === "permiso") return a !== SIN_PERMISO && b !== SIN_PERMISO && clavePermiso(a) === clavePermiso(b);
  if (campo === "especie") return a !== SIN_ESPECIE && b !== SIN_ESPECIE && claveEspecie(a) === claveEspecie(b);
  if (campo === "producto") return a !== SIN_PRODUCTO && b !== SIN_PRODUCTO && claveProducto(a) === claveProducto(b);
  return false;
}

/**
 * Acota las filas. OR adentro de un campo, AND entre campos. `excepto` deja
 * fuera UN campo: la tabla por permiso se cuenta sin el filtro de permiso, o
 * elegir uno escondería los demás y no se podría cambiar desde la misma tabla.
 */
export function filtrarProductos(
  filas: readonly FilaProducto[],
  f: FiltroProductos,
  excepto?: CampoFiltroProductos,
): FilaProducto[] {
  const usa = <K extends CampoFiltroProductos>(c: K) => (c === excepto ? undefined : f[c]);
  const permiso = usa("permiso") ?? [];
  const especie = usa("especie") ?? [];
  const producto = usa("producto") ?? [];
  const estado = usa("estado") ?? [];
  const tramos = usa("tramos") ?? [];
  const q = sinCaja(usa("texto") ?? "");
  return filas.filter((x) => {
    if (permiso.length > 0 && !permiso.some((v) => coincidePermiso(x, v))) return false;
    if (especie.length > 0 && !especie.some((v) => coincideEspecie(x, v))) return false;
    if (producto.length > 0 && !producto.some((v) => coincideProducto(x, v))) return false;
    if (estado.length > 0 && !estado.includes(x.estado)) return false;
    if (tramos.length > 0 && !(x.tramo && tramos.includes(x.tramo))) return false;
    if (q) {
      const campos = [
        x.corrida.especie,
        x.producto,
        x.corrida.lote,
        x.paquete?.codigo,
        ...(x.corrida.titularOrigen ?? []),
      ];
      if (!campos.some((c) => sinCaja(c).includes(q))) return false;
    }
    return true;
  });
}

/** La tabla de paquetes: lo usado sólo si se pidió (es justo lo que pide la marca). */
export const filasALaVista = (filas: readonly FilaProducto[], estado: readonly EstadoProducto[]) =>
  estado.length > 0 ? [...filas] : filas.filter((f) => f.estado !== "usado");

// ── Resumen (indicadores) ────────────────────────────────────────────────────

export interface VolumenProductos {
  filas: number;
  paquetes: number;
  piezas: number;
  m3: number;
  pt: number;
  corridas: number;
}

export interface ResumenProductos {
  /** DISPONIBLE = libre + apartado: las cifras principales de la página. */
  disponible: VolumenProductos;
  libre: VolumenProductos;
  apartado: VolumenProductos & { vencidos: number; clientes: number };
  /** APARTE: no suma a `disponible` ni a nada de arriba. */
  usado: VolumenProductos;
  /** Todo lo que sigue es de lo DISPONIBLE. */
  sinPaquete: number;
  sinEscuadria: number;
  sinPiezas: number;
  especies: number;
  productos: number;
  permisos: number;
  sinPermiso: { filas: number; m3: number };
  edad: ResumenEdad;
  /** Σ saldo del libro de lo disponible (= `disponible.m3`: las cifras usan el libro). */
  saldoLibroM3: number;
  /**
   * Corridas cuyos paquetes no suman su saldo (tolerancia 1 litro): cuánto
   * suman sus paquetes y cuánto dice el libro. El libro manda.
   */
  descuadre: { corridas: number; paquetesM3: number; libroM3: number };
}

/** Σ m³ del LIBRO de las filas (lo que suman todas las cifras de la página). */
export const m3DelLibro = (filas: readonly FilaProducto[]) => r4(filas.reduce((a, f) => a + f.m3Libro, 0));

const volumen = (filas: readonly FilaProducto[]): VolumenProductos => {
  const m3 = filas.reduce((a, f) => a + f.m3Libro, 0);
  return {
    filas: filas.length,
    paquetes: filas.filter((f) => f.paquete).length,
    piezas: filas.reduce((a, f) => a + (f.piezas ?? 0), 0),
    m3: r4(m3),
    pt: ptDe(m3),
    corridas: new Set(filas.map((f) => f.corrida.id)).size,
  };
};

const tieneEscuadria = (p: PaqueteDisponible) => Boolean(p.espesorCm && p.anchoCm && p.largoM);

export function resumenProductos(filas: readonly FilaProducto[], ahora: Date | null): ResumenProductos {
  const disp = filas.filter((f) => f.estado !== "usado");
  const apartadas = disp.filter((f) => f.estado === "apartado");
  const conDato = (k: (f: FilaProducto) => string) => new Set(disp.map(k).filter(Boolean)).size;
  const sinPermiso = disp.filter((f) => !f.permisoClave);

  /* Por CORRIDA entera (no por las filas a la vista): buscar un paquete no
     puede encender «no cuadra» sólo porque sus hermanos quedaron afuera. */
  const descuadradas = new Map<string, FilaProducto>();
  for (const f of disp)
    if (Math.abs(f.corridaPaquetesM3 - f.corridaLibroM3) > TOLERANCIA_M3) descuadradas.set(f.corrida.id, f);
  const desc = [...descuadradas.values()];

  return {
    disponible: volumen(disp),
    libre: volumen(disp.filter((f) => f.estado === "libre")),
    apartado: {
      ...volumen(apartadas),
      vencidos: ahora
        ? apartadas.filter((f) => f.apartado && plazoDeApartado(f.apartado.hasta, ahora).estado === "vencido").length
        : 0,
      clientes: new Set(apartadas.map((f) => sinCaja(f.apartado?.para)).filter(Boolean)).size,
    },
    usado: volumen(filas.filter((f) => f.estado === "usado")),
    sinPaquete: disp.filter((f) => !f.paquete).length,
    sinEscuadria: disp.filter((f) => f.paquete && !tieneEscuadria(f.paquete)).length,
    sinPiezas: disp.filter((f) => f.paquete && !f.paquete.cantidad).length,
    especies: conDato((f) => f.especieClave),
    productos: conDato((f) => f.productoClave),
    /* Por fila de «Por permiso» (una corrida con dos permisos es una fila): así la tarjeta, el
       contador de la pestaña y el «Total» dicen el mismo número. */
    permisos: conDato((f) => f.permisoClave),
    sinPermiso: { filas: sinPermiso.length, m3: m3DelLibro(sinPermiso) },
    edad: resumenDeEdad(disp.map((f) => ({ dias: f.dias, volumenM3: f.m3Libro }))),
    saldoLibroM3: m3DelLibro(disp),
    descuadre: {
      corridas: desc.length,
      paquetesM3: r4(desc.reduce((a, f) => a + f.corridaPaquetesM3, 0)),
      libroM3: r4(desc.reduce((a, f) => a + f.corridaLibroM3, 0)),
    },
  };
}

// ── Por permiso · por especie · por producto ─────────────────────────────────

export type DimensionProducto = "permiso" | "especie" | "producto";

export interface FilaGrupo {
  /** La clave normalizada («» = no lo declara). */
  clave: string;
  /** Cómo se escribe y el valor que filtra (la grafía más usada, o «Sin …»). */
  etiqueta: string;
  /** DISPONIBLE (libre + apartado). */
  disponible: VolumenProductos;
  /** Cuánto de lo disponible ya tiene dueño (está incluido arriba). */
  apartado: { filas: number; m3: number };
  /** APARTE: no suma a `disponible`. */
  usado: { filas: number; m3: number };
  /** Cuánto del m³ disponible de la tabla es de este grupo (0-100, un decimal). */
  pctM3: number;
  especies: number;
  productos: number;
  permisos: number;
  masViejoDias: number | null;
}

const SIN: Record<DimensionProducto, string> = {
  permiso: SIN_PERMISO,
  especie: SIN_ESPECIE,
  producto: SIN_PRODUCTO,
};

export const claveDe = (f: FilaProducto, dim: DimensionProducto): string =>
  dim === "permiso" ? f.permisoClave : dim === "especie" ? f.especieClave : f.productoClave;

const textoDe = (f: FilaProducto, dim: DimensionProducto): string =>
  dim === "permiso" ? f.permisoClave : dim === "especie" ? (f.corrida.especie ?? "").trim() : f.producto;

/** Una fila por grupo. Más m³ disponible primero; un grupo con TODO usado queda con 0, no desaparece. */
export function porGrupo(filas: readonly FilaProducto[], dim: DimensionProducto): FilaGrupo[] {
  const grupos = new Map<string, FilaProducto[]>();
  for (const f of filas) {
    const k = claveDe(f, dim);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const totalM3 = m3DelLibro(filas.filter((f) => f.estado !== "usado"));
  const suma = (xs: FilaProducto[]) => ({ filas: xs.length, m3: m3DelLibro(xs) });
  return [...grupos.entries()]
    .map(([clave, xs]): FilaGrupo => {
      const disp = xs.filter((f) => f.estado !== "usado");
      const grafias = new Map<string, number>();
      for (const f of xs) {
        const t = textoDe(f, dim);
        if (t) grafias.set(t, (grafias.get(t) ?? 0) + 1);
      }
      const dias = disp.map((f) => f.dias).filter((d): d is number => d != null);
      const distintos = (d: DimensionProducto) => new Set(disp.map((f) => claveDe(f, d)).filter(Boolean)).size;
      const vol = volumen(disp);
      return {
        clave,
        etiqueta: clave
          ? grafiaPreferida([...grafias.entries()].map(([texto, usos]) => ({ texto, usos })))
          : SIN[dim],
        disponible: vol,
        apartado: suma(disp.filter((f) => f.estado === "apartado")),
        usado: suma(xs.filter((f) => f.estado === "usado")),
        pctM3: totalM3 > 0 ? Math.round((vol.m3 / totalM3) * 1000) / 10 : 0,
        especies: distintos("especie"),
        productos: distintos("producto"),
        permisos: distintos("permiso"),
        masViejoDias: dias.length > 0 ? Math.max(...dias) : null,
      };
    })
    .sort(
      (a, b) =>
        b.disponible.m3 - a.disponible.m3 ||
        b.usado.m3 - a.usado.m3 ||
        a.etiqueta.localeCompare(b.etiqueta, "es"),
    );
}

/** Los grupos de `sub` dentro de UN grupo de `dim` (las especies de un permiso…). Suman la fila. */
export function detalleDeGrupo(
  filas: readonly FilaProducto[],
  dim: DimensionProducto,
  clave: string,
  sub: DimensionProducto,
): FilaGrupo[] {
  return porGrupo(
    filas.filter((f) => claveDe(f, dim) === clave),
    sub,
  );
}

/** La fila «Total» de una tabla de grupos: la suma de sus filas, con los mismos redondeos. */
export function totalDeGrupos(grupos: readonly FilaGrupo[]) {
  const m3 = grupos.reduce((a, g) => a + g.disponible.m3, 0);
  return {
    disponible: {
      filas: grupos.reduce((a, g) => a + g.disponible.filas, 0),
      paquetes: grupos.reduce((a, g) => a + g.disponible.paquetes, 0),
      piezas: grupos.reduce((a, g) => a + g.disponible.piezas, 0),
      m3: r4(m3),
      pt: ptDe(m3),
    },
    apartado: { m3: r4(grupos.reduce((a, g) => a + g.apartado.m3, 0)) },
    usado: {
      filas: grupos.reduce((a, g) => a + g.usado.filas, 0),
      m3: r4(grupos.reduce((a, g) => a + g.usado.m3, 0)),
    },
    masViejoDias: grupos.reduce<number | null>(
      (a, g) => (g.masViejoDias != null && (a == null || g.masViejoDias > a) ? g.masViejoDias : a),
      null,
    ),
  };
}

// ── Gráficos ─────────────────────────────────────────────────────────────────

export interface PilaProductoEspecie {
  especies: { clave: string; especie: string }[];
  hayOtras: boolean;
  filas: { producto: string; clave: string; pt: number; porEspecie: Record<string, number>; otras: number }[];
}

/** pt DISPONIBLE de cada producto, partido por especie (las `tope` de más m³; el resto en «Otras»). */
export function pilaProductoEspecie(filas: readonly FilaProducto[], tope = 6): PilaProductoEspecie {
  const disp = filas.filter((f) => f.estado !== "usado");
  const ranking = porGrupo(disp, "especie").filter((g) => g.disponible.m3 > 0);
  const propias = ranking.slice(0, tope);
  const conTramo = new Set(propias.map((e) => e.clave));
  return {
    especies: propias.map((e) => ({ clave: e.clave, especie: e.etiqueta })),
    hayOtras: ranking.length > tope,
    filas: porGrupo(disp, "producto")
      .filter((g) => g.disponible.m3 > 0)
      .map((g) => {
        const m3 = new Map<string, number>();
        let otras = 0;
        for (const f of disp) {
          if (f.productoClave !== g.clave) continue;
          if (conTramo.has(f.especieClave)) m3.set(f.especieClave, (m3.get(f.especieClave) ?? 0) + f.m3Libro);
          else otras += f.m3Libro;
        }
        return {
          producto: g.etiqueta,
          clave: g.clave,
          pt: g.disponible.pt,
          porEspecie: Object.fromEntries([...m3].map(([k, v]) => [k, ptDe(v)])),
          otras: ptDe(otras),
        };
      }),
  };
}

// ── Avisos del stock (los chips que acotan la tabla de paquetes) ─────────────

export type ClaveAvisoProducto = "sin-escuadria" | "sin-piezas" | "viejos" | "apartados";
/** Cómo se nombra cada aviso fuera del chip (hoja «Qué se exportó»). */
export const ETIQUETA_AVISO_PRODUCTO: Record<ClaveAvisoProducto, string> = {
  "sin-escuadria": "sin escuadría",
  "sin-piezas": "sin piezas",
  viejos: "más de 90 días",
  apartados: "apartados",
};

export function cuentaDeAvisos(filas: readonly FilaProducto[]): Record<ClaveAvisoProducto, number> {
  const c: Record<ClaveAvisoProducto, number> = { "sin-escuadria": 0, "sin-piezas": 0, viejos: 0, apartados: 0 };
  const claves = Object.keys(c) as ClaveAvisoProducto[];
  for (const f of filas) for (const k of claves) if (entraEnAviso(f, k)) c[k] += 1;
  return c;
}

export function entraEnAviso(f: FilaProducto, aviso: ClaveAvisoProducto): boolean {
  if (aviso === "sin-escuadria") return Boolean(f.paquete && !tieneEscuadria(f.paquete));
  if (aviso === "sin-piezas") return Boolean(f.paquete && !f.paquete.cantidad);
  if (aviso === "viejos") return f.tramo === "viejo";
  return f.apartado != null;
}

// ── Cuando no hay nada disponible ────────────────────────────────────────────

/**
 * Por qué no hay nada disponible, en palabras — o `null` si hay algo. Con todo
 * marcado usado (Blas, 27-09: 5 corridas de Tornillo) las tarjetas decían
 * «Especies 0 · Sin especie declarada» y «Todo dice su permiso»: afirmaban una
 * ausencia de dato cuando lo que pasa es que no queda nada a la vista.
 */
export function motivoSinDisponible(r: ResumenProductos, hayFiltros = false): string | null {
  if (r.disponible.filas > 0) return null;
  if (r.usado.filas > 0) return "Todo está marcado usado";
  return hayFiltros ? "Nada con estos filtros" : "Nada disponible";
}

// ── Lo que muestra la tabla de paquetes (aviso + orden): la usa también el Excel ─

/** Lo que el orden de la cabecera compara de cada fila (`disponibles-orden`, nulos al final). */
export const claveDeOrden = (f: FilaProducto, etiquetaProducto: (v: string) => string = (v) => v) => ({
  codigo: f.paquete?.codigo ?? "",
  producto: etiquetaProducto(f.producto),
  especie: f.corrida.especie ?? "",
  piezas: f.piezas,
  volumenM3: f.volumenM3,
  pieTablar: ptDe(f.volumenM3),
  saldoCorridaM3: f.corrida.disponible,
  diasParado: f.dias,
  valorSoles: f.valorSoles,
});

/** La tabla de paquetes tal como se ve: acotada por el aviso tildado y en el orden de la cabecera. */
export function paquetesComoSeVen(
  filas: readonly FilaProducto[],
  aviso: ClaveAvisoProducto | null,
  orden: Orden,
  etiquetaProducto?: (v: string) => string,
): FilaProducto[] {
  const acotadas = aviso ? filas.filter((f) => entraEnAviso(f, aviso)) : [...filas];
  return acotadas.sort((a, b) =>
    compararDisponibles(claveDeOrden(a, etiquetaProducto), claveDeOrden(b, etiquetaProducto), orden),
  );
}

// ── Opciones de los autofiltros ──────────────────────────────────────────────

/**
 * Las opciones de cada autofiltro, con su peso (m³ del libro disponibles). Salen
 * de TODO lo leído: si se achicaran con el filtro puesto, no se podría deshacer
 * desde la cabecera.
 */
export function facetasDeProductos(filas: readonly FilaProducto[]) {
  const opciones = (dim: DimensionProducto) =>
    porGrupo(filas, dim)
      .filter((g) => g.disponible.filas > 0 || g.usado.filas > 0)
      .map((g) => ({ value: g.etiqueta, count: g.disponible.filas, peso: g.disponible.m3 }));
  const cuenta = <T extends string>(k: (f: FilaProducto) => T | null, todos: readonly T[]) =>
    todos.map((v) => ({ value: v, count: filas.filter((f) => k(f) === v).length })).filter((o) => o.count > 0);
  return {
    permisos: opciones("permiso"),
    especies: opciones("especie"),
    productos: opciones("producto"),
    estados: cuenta((f) => f.estado, ESTADOS_PRODUCTO),
    tramos: cuenta<TramoEdad>((f) => f.tramo, TRAMOS_EDAD),
  };
}
