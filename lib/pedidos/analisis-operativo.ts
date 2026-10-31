/**
 * Análisis operativo de pedidos (N06, 17-10): cuánto tarda cada etapa, qué se
 * atasca, por qué se cancela, quién entrega y dónde se pide.
 *
 * Todo sale de datos guardados, nada estimado:
 *  - las etapas, de `OrderStatusHistory` (la PRIMERA vez que el pedido entró
 *    a cada estado); un pedido que se saltó una etapa no cuenta en ella;
 *  - el motivo de cancelación, de `Order.cancelReason` o de la nota del
 *    historial al cancelar;
 *  - el repartidor, del reparto asignado (`DeliveryAssignment`) o del nombre
 *    anotado en el pedido; el costo de reparto, de la tarifa de la asignación
 *    (lo REGISTRADO: sin asignación no hay costo, no se inventa);
 *  - la zona es la única cifra derivada: el nombre de una zona de Ajustes ›
 *    Delivery, o de uno de sus barrios, escrito en la dirección. Se dice así
 *    en la pantalla.
 *
 * Cada grupo trae los ids de sus pedidos (hasta `MAX_IDS`): toda cifra lleva a
 * su base. Con poca muestra se dice la muestra, no se promete un promedio.
 * Sin React, sin `window` y sin base: se prueba sola.
 */

export const MAX_IDS = 100;
/** Menos de esto: «muestra chica», la mediana se muestra con su n al lado. */
export const MUESTRA_MINIMA = 5;
/** Lo mismo que el tablero llama «tarde» (`OrdersTab/tiempo-en-estado.ts`). */
export const UMBRAL_ATASCO_MS = 2 * 3_600_000;

export interface EventoEstado {
  de: string | null;
  a: string;
  cuando: string;
  nota: string | null;
}

export interface PedidoAnalisis {
  id: string;
  cliente: string;
  estado: string;
  origen: string;
  total: number;
  creado: string;
  motivo: string | null;
  repartidor: string | null;
  costoReparto: number | null;
  direccion: string;
  historial: EventoEstado[];
}

export interface PedidoActivo {
  id: string;
  cliente: string;
  estado: string;
  /** Último cambio de estado (historial) o `updatedAt`. */
  enEstadoDesde: string;
}

export interface Muestra {
  n: number;
  medianaMs: number | null;
  promedioMs: number | null;
  p90Ms: number | null;
  /** Del más lento al más rápido. */
  ids: string[];
}

export interface Grupo {
  clave: string;
  rotulo: string;
  pedidos: number;
  ids: string[];
}

export interface Etapa {
  clave: "confirmar" | "empezar" | "salir" | "llevar";
  rotulo: string;
  de: string;
  a: string;
  muestra: Muestra;
}

export interface Cancelacion {
  motivo: string;
  pedidos: number;
  monto: number;
  /** En qué estado estaba cuando se canceló. */
  desde: Record<string, number>;
  ids: string[];
}

export interface FilaRepartidor {
  nombre: string;
  entregados: number;
  /** De «en camino» a «entregado». */
  enCamino: Muestra;
  /** Suma de tarifas registradas de sus entregados (null si ninguno tiene tarifa). */
  costo: number | null;
  ids: string[];
}

export interface FilaZona {
  zona: string;
  pedidos: number;
  entregados: number;
  cancelados: number;
  ids: string[];
}

export interface Atascado {
  id: string;
  cliente: string;
  estado: string;
  desde: string;
  ms: number;
}

export interface AnalisisOperativo {
  volumen: { pedidos: number; entregados: number; cancelados: number; enMarcha: number; montoEntregado: number };
  etapas: Etapa[];
  hastaEntregar: Muestra;
  atascados: Atascado[];
  cancelados: Cancelacion[];
  repartidores: FilaRepartidor[];
  costoReparto: { total: number; entregadosConTarifa: number; entregados: number };
  zonas: FilaZona[];
  zonasConfiguradas: number;
  franjas: Grupo[];
  dias: Grupo[];
  origenes: Grupo[];
}

const ETAPAS: readonly Omit<Etapa, "muestra">[] = [
  { clave: "confirmar", rotulo: "Confirmar", de: "pendiente", a: "confirmado" },
  { clave: "empezar", rotulo: "Empezar a preparar", de: "confirmado", a: "preparando" },
  { clave: "salir", rotulo: "Preparar y despachar", de: "preparando", a: "en_camino" },
  { clave: "llevar", rotulo: "Llevar al cliente", de: "en_camino", a: "entregado" },
];

const EN_MARCHA = new Set(["pendiente", "confirmado", "preparando", "en_camino"]);
const LIMA_MS = 5 * 3_600_000;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Las franjas de la tienda (8-12, 12-17, 17-20) y lo que queda fuera. */
const FRANJAS_DEMANDA: readonly { clave: string; rotulo: string; hasta: number }[] = [
  { clave: "temprano", rotulo: "Antes de las 8", hasta: 8 },
  { clave: "manana", rotulo: "Mañana (8 a 12)", hasta: 12 },
  { clave: "tarde", rotulo: "Tarde (12 a 17)", hasta: 17 },
  { clave: "noche", rotulo: "Noche (17 a 20)", hasta: 20 },
  { clave: "tarde-noche", rotulo: "Después de las 20", hasta: 24 },
];

const ORIGEN: Readonly<Record<string, string>> = { direct: "Tu tienda", marketplace: "Marketplace", wholesale: "Mayorista" };

/** Mediana, promedio y p90 (rango más cercano) de duraciones en ms. */
export function muestraDe(pares: readonly { id: string; ms: number }[]): Muestra {
  const orden = [...pares].filter((p) => Number.isFinite(p.ms) && p.ms >= 0).sort((a, b) => b.ms - a.ms);
  const n = orden.length;
  if (n === 0) return { n: 0, medianaMs: null, promedioMs: null, p90Ms: null, ids: [] };
  const asc = orden.map((p) => p.ms).reverse();
  const mitad = Math.floor(n / 2);
  const mediana = n % 2 ? asc[mitad] : (asc[mitad - 1] + asc[mitad]) / 2;
  const promedio = asc.reduce((s, v) => s + v, 0) / n;
  const p90 = asc[Math.min(n - 1, Math.ceil(0.9 * n) - 1)];
  return { n, medianaMs: mediana, promedioMs: promedio, p90Ms: p90, ids: orden.slice(0, MAX_IDS).map((p) => p.id) };
}

/** La primera vez que entró a cada estado (el pendiente = cuando se creó). */
export function entradas(p: Pick<PedidoAnalisis, "creado" | "historial">): Record<string, number> {
  const t: Record<string, number> = { pendiente: Date.parse(p.creado) };
  const hist = [...p.historial].sort((a, b) => a.cuando.localeCompare(b.cuando));
  for (const h of hist) if (t[h.a] == null) t[h.a] = Date.parse(h.cuando);
  return t;
}

/** Sin tildes ni mayúsculas, para comparar textos escritos a mano. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface ZonaConfigurada {
  nombre: string;
  barrios: readonly string[];
}

/**
 * La zona cuyo nombre o uno de sus barrios aparece escrito en la dirección.
 * Gana el texto más largo: «Yarinacocha Norte» antes que «Yarinacocha».
 */
export function zonaDeDireccion(direccion: string, zonas: readonly ZonaConfigurada[]): string | null {
  const dir = normalizar(direccion);
  if (!dir) return null;
  let mejor: { zona: string; largo: number } | null = null;
  for (const z of zonas) {
    for (const texto of [z.nombre, ...z.barrios]) {
      const t = normalizar(texto);
      if (t.length >= 3 && dir.includes(t) && (!mejor || t.length > mejor.largo)) mejor = { zona: z.nombre, largo: t.length };
    }
  }
  return mejor?.zona ?? null;
}

function agrupar<T>(items: readonly T[], clave: (x: T) => string, id: (x: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const x of items) {
    const k = clave(x);
    (m.get(k) ?? m.set(k, []).get(k)!).push(id(x));
  }
  return m;
}

const recortar = (ids: string[]) => ids.slice(0, MAX_IDS);

/** Los pedidos en marcha que llevan más del umbral en su estado, el que más espera primero. */
export function atascadosDe(activos: readonly PedidoActivo[], ahora: Date, umbralMs = UMBRAL_ATASCO_MS): Atascado[] {
  return activos
    .filter((a) => EN_MARCHA.has(a.estado))
    .map((a) => ({ id: a.id, cliente: a.cliente, estado: a.estado, desde: a.enEstadoDesde, ms: Math.max(0, ahora.getTime() - Date.parse(a.enEstadoDesde)) }))
    .filter((a) => a.ms >= umbralMs)
    .sort((x, y) => y.ms - x.ms);
}

export function analizarPedidos(
  pedidos: readonly PedidoAnalisis[],
  activos: readonly PedidoActivo[],
  zonasConfiguradas: readonly ZonaConfigurada[],
  ahora: Date,
): AnalisisOperativo {
  const entregados = pedidos.filter((p) => p.estado === "entregado");
  const cancelados = pedidos.filter((p) => p.estado === "cancelado");
  const tiempos = new Map(pedidos.map((p) => [p.id, entradas(p)]));

  const etapas: Etapa[] = ETAPAS.map((e) => ({
    ...e,
    muestra: muestraDe(
      pedidos.flatMap((p) => {
        const t = tiempos.get(p.id)!;
        return t[e.de] != null && t[e.a] != null ? [{ id: p.id, ms: t[e.a] - t[e.de] }] : [];
      }),
    ),
  }));
  const hastaEntregar = muestraDe(
    entregados.flatMap((p) => {
      const t = tiempos.get(p.id)!;
      return t.entregado != null ? [{ id: p.id, ms: t.entregado - t.pendiente }] : [];
    }),
  );

  // Cancelados por motivo (el texto como lo escribieron, agrupado sin tildes ni mayúsculas).
  const porMotivo = new Map<string, Cancelacion>();
  for (const p of cancelados) {
    const alCancelar = [...p.historial].reverse().find((h) => h.a === "cancelado");
    const texto = (p.motivo ?? alCancelar?.nota ?? "").trim();
    const motivo = texto || "Sin motivo anotado";
    const k = normalizar(motivo);
    const fila = porMotivo.get(k) ?? { motivo, pedidos: 0, monto: 0, desde: {}, ids: [] };
    fila.pedidos += 1;
    fila.monto += p.total;
    const desde = alCancelar?.de ?? "sin historial";
    fila.desde[desde] = (fila.desde[desde] ?? 0) + 1;
    if (fila.ids.length < MAX_IDS) fila.ids.push(p.id);
    porMotivo.set(k, fila);
  }

  // Repartidores: sólo entregados (lo que hizo, no lo que tiene asignado).
  const porRepartidor = new Map<string, PedidoAnalisis[]>();
  for (const p of entregados) {
    const k = p.repartidor?.trim() || "Sin repartidor anotado";
    (porRepartidor.get(k) ?? porRepartidor.set(k, []).get(k)!).push(p);
  }
  const repartidores: FilaRepartidor[] = [...porRepartidor.entries()]
    .map(([nombre, lista]) => {
      const conTarifa = lista.filter((p) => p.costoReparto != null);
      return {
        nombre,
        entregados: lista.length,
        enCamino: muestraDe(
          lista.flatMap((p) => {
            const t = tiempos.get(p.id)!;
            return t.en_camino != null && t.entregado != null ? [{ id: p.id, ms: t.entregado - t.en_camino }] : [];
          }),
        ),
        costo: conTarifa.length ? conTarifa.reduce((s, p) => s + (p.costoReparto ?? 0), 0) : null,
        ids: recortar(lista.map((p) => p.id)),
      };
    })
    .sort((a, b) => b.entregados - a.entregados || a.nombre.localeCompare(b.nombre, "es"));
  const conTarifa = entregados.filter((p) => p.costoReparto != null);

  // Zonas (derivado: el nombre de la zona escrito en la dirección).
  const porZona = new Map<string, FilaZona>();
  if (zonasConfiguradas.length > 0) {
    for (const p of pedidos) {
      const zona = zonaDeDireccion(p.direccion, zonasConfiguradas) ?? "Sin zona reconocida";
      const fila = porZona.get(zona) ?? { zona, pedidos: 0, entregados: 0, cancelados: 0, ids: [] };
      fila.pedidos += 1;
      if (p.estado === "entregado") fila.entregados += 1;
      if (p.estado === "cancelado") fila.cancelados += 1;
      if (fila.ids.length < MAX_IDS) fila.ids.push(p.id);
      porZona.set(zona, fila);
    }
  }

  // Demanda: hora y día de Lima en que entró el pedido, y por dónde entró.
  const lima = (p: PedidoAnalisis) => new Date(Date.parse(p.creado) - LIMA_MS);
  const franjas = agrupar(pedidos, (p) => FRANJAS_DEMANDA.find((f) => lima(p).getUTCHours() < f.hasta)!.clave, (p) => p.id);
  const dias = agrupar(pedidos, (p) => String(lima(p).getUTCDay()), (p) => p.id);
  const origenes = agrupar(pedidos, (p) => p.origen || "direct", (p) => p.id);
  const aGrupos = (m: Map<string, string[]>, rotulo: (k: string) => string, orden?: readonly string[]): Grupo[] => {
    const claves = orden ? orden.filter((k) => m.has(k)) : [...m.keys()].sort((a, b) => m.get(b)!.length - m.get(a)!.length);
    return claves.map((k) => ({ clave: k, rotulo: rotulo(k), pedidos: m.get(k)!.length, ids: recortar(m.get(k)!) }));
  };

  return {
    volumen: {
      pedidos: pedidos.length,
      entregados: entregados.length,
      cancelados: cancelados.length,
      enMarcha: pedidos.filter((p) => EN_MARCHA.has(p.estado)).length,
      montoEntregado: entregados.reduce((s, p) => s + p.total, 0),
    },
    etapas,
    hastaEntregar,
    atascados: atascadosDe(activos, ahora),
    cancelados: [...porMotivo.values()].sort((a, b) => b.pedidos - a.pedidos || b.monto - a.monto),
    repartidores,
    costoReparto: {
      total: conTarifa.reduce((s, p) => s + (p.costoReparto ?? 0), 0),
      entregadosConTarifa: conTarifa.length,
      entregados: entregados.length,
    },
    zonas: [...porZona.values()].sort((a, b) => b.pedidos - a.pedidos),
    zonasConfiguradas: zonasConfiguradas.length,
    franjas: aGrupos(franjas, (k) => FRANJAS_DEMANDA.find((f) => f.clave === k)!.rotulo, FRANJAS_DEMANDA.map((f) => f.clave)),
    dias: aGrupos(dias, (k) => DIAS[Number(k)], ["1", "2", "3", "4", "5", "6", "0"]),
    origenes: aGrupos(origenes, (k) => ORIGEN[k] ?? k),
  };
}

/** «12 min» · «3 h 20 min» · «2 días» (duraciones de etapa, no fechas). */
export function textoDuracion(ms: number | null): string {
  if (ms == null) return "Sin datos";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) {
    const resto = min % 60;
    return resto ? `${h} h ${resto} min` : `${h} h`;
  }
  return `${Math.round(h / 24)} días`;
}

export const ROTULO_ESTADO: Readonly<Record<string, string>> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
  "sin historial": "Sin historial",
};

export type PeriodoAnalisis = "7" | "30" | "90" | "todo";
export const PERIODOS_ANALISIS: readonly { clave: PeriodoAnalisis; rotulo: string }[] = [
  { clave: "7", rotulo: "7 días" },
  { clave: "30", rotulo: "30 días" },
  { clave: "90", rotulo: "90 días" },
  { clave: "todo", rotulo: "Todo" },
];

export function esPeriodoAnalisis(v: unknown): v is PeriodoAnalisis {
  return v === "7" || v === "30" || v === "90" || v === "todo";
}

/** Desde cuándo cuenta el período (null = desde el inicio). */
export function desdeDelPeriodo(p: PeriodoAnalisis, ahora: Date): Date | null {
  return p === "todo" ? null : new Date(ahora.getTime() - Number(p) * 86_400_000);
}
