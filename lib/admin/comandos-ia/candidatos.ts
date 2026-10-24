/**
 * «A quién escribir» (Comandos IA) — reglas PURAS que arman la bandeja del día.
 *
 * Sin base, sin IA, sin fecha del reloj: todo entra por parámetro (`hoy` es la
 * fecha de Lima `YYYY-MM-DD`) para que el test fije los casos. El servidor
 * (`bandeja-servidor.ts`) lee la base y llama a `armarBandeja`.
 *
 * Reglas (diseño 2026-10-09):
 *  - Fiado: por STATUS, nunca por saldo. VENCIDO entra siempre; ACTIVO entra si
 *    vence en ≤ 7 días (o ya pasó la fecha y nadie lo marcó). PAGADO/CANCELADO
 *    no entran aunque tengan saldo (main tiene 6 CANCELADO que suman S/ 350).
 *  - Cliente con ritmo roto: ≥ 3 días distintos de compra y más días sin
 *    comprar que 2 × su intervalo promedio.
 *  - Adelanto abierto con teléfono (solo tenants con libros forestales).
 *  - Seguimiento: recordatorio pago|cliente pendiente con fecha ≤ hoy.
 * Un deudor con un seguimiento todavía por venir NO entra (ya le escribiste);
 * con uno vencido entra UNA vez, como seguimiento.
 */

export type TipoCandidato = "fiado-vencido" | "fiado-por-vencer" | "cliente-ritmo" | "adelanto" | "seguimiento";

export const TIPOS_CANDIDATO: readonly TipoCandidato[] = [
  "seguimiento",
  "fiado-vencido",
  "fiado-por-vencer",
  "adelanto",
  "cliente-ritmo",
];

export const ETIQUETA_TIPO: Record<TipoCandidato, string> = {
  "fiado-vencido": "Fiado vencido",
  "fiado-por-vencer": "Fiado por vencer",
  "cliente-ritmo": "No ha vuelto",
  adelanto: "Adelanto abierto",
  seguimiento: "Seguimiento",
};

export interface DatosCandidato {
  monto?: number;
  /** Días: vencido hace N (fiado vencido), vence en N (por vencer), sin comprar (cliente). */
  dias?: number;
  /** Fecha `YYYY-MM-DD` de origen: fecha del fiado/adelanto o de la última compra. */
  desde?: string;
  /** "PEN" por defecto; los adelantos pueden venir en dólares. */
  moneda?: string;
}

export interface Candidato {
  /** `fiado:<id>` · `cliente:<telefono>` · `adelanto:<id>` · `seg:<recordatorioId>`. */
  id: string;
  tipo: TipoCandidato;
  nombre: string;
  /** Solo para el enlace de WhatsApp en el navegador. NUNCA va al LLM. */
  telefono?: string;
  datos: DatosCandidato;
  /** De dónde sale cada dato, en palabras («saldo del fiado del 12/09»). */
  origen: string;
  /** Seguimiento: el recordatorio que lo trajo (para cerrarlo). */
  recordatorioId?: string;
  /** Seguimiento de un fiado que ya se pagó: solo queda cerrarlo. */
  pagado?: boolean;
  /** Seguimiento: el tipo de lo que se sigue (fiado-vencido, cliente-ritmo…). */
  sigue?: Exclude<TipoCandidato, "seguimiento">;
  /** Seguimiento: a qué apunta, para que el próximo recordatorio siga mirando lo mismo. */
  ref?: RefRecordatorio;
}

// ── Fechas (date-only, aritmética en UTC al mediodía) ─────────────────────────

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

function mediodia(key: string): number {
  return Date.parse(`${key.slice(0, 10)}T12:00:00.000Z`);
}

/** Días de `desde` a `hasta` (positivos si `hasta` es después). */
export function diasEntre(desde: string, hasta: string): number {
  const a = mediodia(desde);
  const b = mediodia(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** «jueves 10/09» (días escritos a mano: Intl cambia con la versión de ICU). */
export function fechaConDia(key: string): string {
  const t = mediodia(key);
  if (!Number.isFinite(t)) return key;
  return `${DIAS_SEMANA[new Date(t).getUTCDay()]} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** «10/09». */
export function fechaCorta(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** El próximo viernes después de `hoy` (si hoy es viernes, el de la otra semana). */
export function proximoViernes(hoy: string): string {
  const t = mediodia(hoy);
  const dia = new Date(t).getUTCDay();
  const faltan = ((5 - dia + 7) % 7) || 7;
  return new Date(t + faltan * 86_400_000).toISOString().slice(0, 10);
}

/** «S/ 1 619,60» — coma decimal y espacio de miles, como lo escribe el dueño. */
export function formatoMonto(monto: number, moneda = "PEN"): string {
  const signo = moneda === "USD" ? "US$" : "S/";
  const [ent, dec] = Math.abs(monto).toFixed(2).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${monto < 0 ? "-" : ""}${signo} ${miles},${dec}`;
}

// ── Reglas por fuente ────────────────────────────────────────────────────────

export interface FiadoEntrada {
  id: string;
  customerId: string;
  customerName?: string;
  saldo: number;
  status: string;
  fechaVence?: string;
  createdAt: string;
}

/** ¿Entra el fiado? Devuelve tipo + días, o null. Solo por status. */
export function reglaFiado(
  f: Pick<FiadoEntrada, "status" | "fechaVence">,
  hoy: string,
): { tipo: "fiado-vencido" | "fiado-por-vencer"; dias: number } | null {
  const vence = f.fechaVence?.slice(0, 10);
  if (f.status === "VENCIDO") return { tipo: "fiado-vencido", dias: vence ? Math.max(0, diasEntre(vence, hoy)) : 0 };
  if (f.status !== "ACTIVO" || !vence) return null;
  const faltan = diasEntre(hoy, vence);
  if (faltan < 0) return { tipo: "fiado-vencido", dias: -faltan };
  if (faltan <= 7) return { tipo: "fiado-por-vencer", dias: faltan };
  return null;
}

/** Ritmo roto: ≥3 días distintos de compra y sin comprar > 2× el intervalo promedio. */
export function reglaRitmo(
  fechas: readonly string[],
  hoy: string,
): { compras: number; intervalo: number; diasSin: number; ultima: string } | null {
  const dias = [...new Set(fechas.map((f) => f.slice(0, 10)))].filter((d) => d <= hoy).sort();
  if (dias.length < 3) return null;
  const primera = dias[0];
  const ultima = dias[dias.length - 1];
  const intervalo = diasEntre(primera, ultima) / (dias.length - 1);
  const diasSin = diasEntre(ultima, hoy);
  if (intervalo <= 0 || diasSin <= 2 * intervalo) return null;
  return { compras: dias.length, intervalo: Math.round(intervalo * 10) / 10, diasSin, ultima };
}

export interface RecordatorioEntrada {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  /** `YYYY-MM-DD` (o ISO). */
  dueDate: string;
}

/** Seguimiento vencido: pago|cliente, pendiente (o ya marcado vencido) y fecha ≤ hoy. */
export function reglaSeguimiento(r: RecordatorioEntrada, hoy: string): boolean {
  if (r.type !== "pago" && r.type !== "cliente") return false;
  if (r.status !== "pendiente" && r.status !== "vencido") return false;
  return r.dueDate.slice(0, 10) <= hoy;
}

// ── Referencia dentro del recordatorio (sin schema: va al final del texto) ────

export type RefRecordatorio = { tipo: "fiado" | "cliente" | "adelanto"; id: string };

// El id de un cliente es su teléfono tal como está guardado: «+51987654321» o
// «51 987 654 321» también tienen que volver (empieza y termina sin espacio).
const RE_REF = /\n*ref:(fiado|cliente|adelanto)\/([\w.+-](?:[\w.+ -]{0,78}[\w.+-])?)\s*$/;

export function conRef(texto: string, ref: RefRecordatorio): string {
  return `${texto.replace(RE_REF, "").trimEnd()}\n\nref:${ref.tipo}/${ref.id}`;
}

export function leerRef(texto: string): { ref: RefRecordatorio | null; texto: string } {
  const m = RE_REF.exec(texto ?? "");
  if (!m) return { ref: null, texto: texto ?? "" };
  return { ref: { tipo: m[1] as RefRecordatorio["tipo"], id: m[2] }, texto: texto.slice(0, m.index).trimEnd() };
}

// ── La bandeja ───────────────────────────────────────────────────────────────

export interface AdelantoEntrada {
  id: string;
  /** Se agrupa por persona y moneda: un solo mensaje aunque tenga 3 adelantos. */
  beneficiarioId: string;
  nombre: string;
  telefono?: string | null;
  saldo: number;
  moneda: string;
  fecha: string;
}

export interface EntradaBandeja {
  hoy: string;
  fiados: readonly FiadoEntrada[];
  /** Teléfono → nombre del cliente (para clientes y fiados sin nombre). */
  nombres: ReadonlyMap<string, string>;
  /** Compras con teléfono del cliente. */
  compras: readonly { telefono: string; fecha: string }[];
  adelantos: readonly AdelantoEntrada[];
  recordatorios: readonly RecordatorioEntrada[];
}

/** Persona + moneda → saldo sumado, fecha del más antiguo. Clave `<beneficiarioId>.<moneda>`. */
export function agruparAdelantos(lista: readonly AdelantoEntrada[]): Map<string, AdelantoEntrada & { cuantos: number }> {
  const grupos = new Map<string, AdelantoEntrada & { cuantos: number }>();
  for (const a of lista) {
    const clave = `${a.beneficiarioId}.${a.moneda}`;
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, { ...a, id: clave, cuantos: 1 });
      continue;
    }
    g.saldo = Math.round((g.saldo + a.saldo) * 100) / 100;
    g.cuantos += 1;
    if (a.fecha < g.fecha) g.fecha = a.fecha;
    if (!g.telefono && a.telefono) g.telefono = a.telefono;
  }
  return grupos;
}

function nombreDe(telefono: string, nombres: ReadonlyMap<string, string>, alterno?: string): string {
  return (alterno || nombres.get(telefono) || `Cliente ${telefono.slice(-4)}`).trim();
}

export function armarBandeja(e: EntradaBandeja): Candidato[] {
  const { hoy } = e;
  const fiadoPorId = new Map(e.fiados.map((f) => [f.id, f]));
  const adelantoPorId = agruparAdelantos(e.adelantos);
  const ocupados = new Set<string>(); // `fiado:<id>`… ya cubiertos por un recordatorio
  const out: Candidato[] = [];

  for (const r of e.recordatorios) {
    if (r.status !== "pendiente" && r.status !== "vencido") continue;
    const { ref } = leerRef(r.description);
    if (ref) ocupados.add(`${ref.tipo}:${ref.id}`);
    if (!reglaSeguimiento(r, hoy)) continue;
    const base = { id: `seg:${r.id}`, tipo: "seguimiento" as const, recordatorioId: r.id, ...(ref && { ref }) };
    const due = r.dueDate.slice(0, 10);
    if (ref?.tipo === "fiado") {
      const f = fiadoPorId.get(ref.id);
      const pagado = !f || f.status === "PAGADO" || f.status === "CANCELADO";
      out.push({
        ...base,
        nombre: f ? nombreDe(f.customerId, e.nombres, f.customerName) : r.title,
        telefono: f?.customerId,
        datos: pagado ? { desde: due } : { monto: f.saldo, desde: f.createdAt.slice(0, 10), dias: diasEntre(due, hoy) },
        origen: pagado
          ? `Recordatorio del ${fechaCorta(due)} · el fiado ya está ${f ? f.status.toLowerCase() : "cerrado"}`
          : `Recordatorio del ${fechaCorta(due)} · saldo de hoy del fiado del ${fechaCorta(f.createdAt.slice(0, 10))}`,
        pagado,
        sigue: "fiado-vencido",
      });
      continue;
    }
    if (ref?.tipo === "adelanto") {
      const a = adelantoPorId.get(ref.id);
      const pagado = !a || a.saldo <= 0;
      out.push({
        ...base,
        nombre: a?.nombre ?? r.title,
        telefono: a?.telefono ?? undefined,
        datos: pagado ? { desde: due } : { monto: a.saldo, moneda: a.moneda, desde: a.fecha.slice(0, 10) },
        origen: pagado
          ? `Recordatorio del ${fechaCorta(due)} · el adelanto ya no tiene saldo`
          : `Recordatorio del ${fechaCorta(due)} · saldo de hoy del adelanto del ${fechaCorta(a.fecha.slice(0, 10))}`,
        pagado,
        sigue: "adelanto",
      });
      continue;
    }
    // Sin referencia es un recordatorio del dueño («pagar la luz»), no alguien
    // a quien escribirle: se queda en Recordatorios.
    if (ref?.tipo !== "cliente") continue;
    out.push({
      ...base,
      nombre: nombreDe(ref.id, e.nombres),
      telefono: ref.id,
      datos: { desde: due },
      origen: `Recordatorio del ${fechaCorta(due)}`,
      sigue: "cliente-ritmo",
    });
  }

  for (const f of e.fiados) {
    if (ocupados.has(`fiado:${f.id}`)) continue;
    const regla = reglaFiado(f, hoy);
    if (!regla) continue;
    const vence = f.fechaVence?.slice(0, 10);
    const del = fechaCorta(f.createdAt.slice(0, 10));
    out.push({
      id: `fiado:${f.id}`,
      tipo: regla.tipo,
      nombre: nombreDe(f.customerId, e.nombres, f.customerName),
      telefono: f.customerId,
      datos: { monto: f.saldo, dias: regla.dias, desde: f.createdAt.slice(0, 10) },
      origen: `Saldo de hoy del fiado del ${del}${vence ? ` · vence ${fechaCorta(vence)}` : ""}`,
    });
  }

  for (const [clave, a] of adelantoPorId) {
    if (!a.telefono || a.saldo <= 0 || ocupados.has(`adelanto:${clave}`)) continue;
    out.push({
      id: `adelanto:${clave}`,
      tipo: "adelanto",
      nombre: a.nombre,
      telefono: a.telefono,
      datos: { monto: a.saldo, moneda: a.moneda, desde: a.fecha.slice(0, 10), dias: Math.max(0, diasEntre(a.fecha, hoy)) },
      origen: a.cuantos > 1
        ? `Saldo de hoy de sus ${a.cuantos} adelantos abiertos · el primero del ${fechaCorta(a.fecha.slice(0, 10))}`
        : `Saldo de hoy del adelanto del ${fechaCorta(a.fecha.slice(0, 10))}`,
    });
  }

  const porTelefono = new Map<string, string[]>();
  for (const c of e.compras) {
    const lista = porTelefono.get(c.telefono) ?? [];
    lista.push(c.fecha);
    porTelefono.set(c.telefono, lista);
  }
  const conDeuda = new Set(out.map((c) => c.telefono).filter(Boolean));
  for (const [tel, fechas] of porTelefono) {
    if (conDeuda.has(tel) || ocupados.has(`cliente:${tel}`)) continue;
    const ritmo = reglaRitmo(fechas, hoy);
    if (!ritmo) continue;
    out.push({
      id: `cliente:${tel}`,
      tipo: "cliente-ritmo",
      nombre: nombreDe(tel, e.nombres),
      telefono: tel,
      datos: { dias: ritmo.diasSin, desde: ritmo.ultima },
      origen: `${ritmo.compras} compras · venía cada ${String(ritmo.intervalo).replace(".", ",")} días · última el ${fechaCorta(ritmo.ultima)}`,
    });
  }

  const orden = new Map(TIPOS_CANDIDATO.map((t, i) => [t, i]));
  return out.sort(
    (a, b) =>
      (orden.get(a.tipo) ?? 9) - (orden.get(b.tipo) ?? 9) ||
      (b.datos.monto ?? 0) - (a.datos.monto ?? 0) ||
      (b.datos.dias ?? 0) - (a.datos.dias ?? 0),
  );
}

/** Tipo de recordatorio que acepta `/api/reminders` según lo que se sigue. */
export function tipoRecordatorio(c: Pick<Candidato, "tipo" | "sigue">): "pago" | "cliente" {
  const t = c.tipo === "seguimiento" ? c.sigue : c.tipo;
  return t === "cliente-ritmo" || t === undefined ? "cliente" : "pago";
}

/** La referencia que se guarda en el recordatorio para volver a mirar el dato. */
export function refDeCandidato(c: Pick<Candidato, "id" | "tipo" | "ref">): RefRecordatorio | null {
  if (c.tipo === "seguimiento") return c.ref ?? null;
  const [pre, ...resto] = c.id.split(":");
  const id = resto.join(":");
  if (pre === "fiado" || pre === "cliente" || pre === "adelanto") return { tipo: pre, id };
  return null;
}
