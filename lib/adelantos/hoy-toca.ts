/**
 * ¿Qué toca hacer hoy con los adelantos? — el «Hoy toca» del Resumen y el
 * aviso de cada lunes al dueño (25-10).
 *
 * EL CASO QUE LO PIDIÓ (Blas, 25-10). Cinco adelantos abiertos por S/ 25,690:
 * Quispe con S/ 17,000 dados el 03/08 y ni una entrega en 83 días, ninguno con
 * fecha de cobro, ninguno firmado, nadie con celular. El Resumen decía «12
 * adelantos sin control · S/ 4,506.34» y debajo repetía la pestaña Personas: no
 * decía QUÉ hacer. Esto lo dice en cuatro tareas, cada una con su botón:
 *
 *   1. Cobrar — por persona: lo abierto que lleva ≥ 30 días sin moverse
 *      (moverse = una entrega viva en ESE adelanto o una gestión de cobranza a
 *      la persona; si no hubo ninguna, se cuenta desde que se dio) o lo
 *      vencido que nadie gestionó desde que venció.
 *   2. Poner fecha de cobro — lo abierto sin fecha de devolución ni cuota
 *      pactada pendiente con fecha (la misma regla que `sin-control.ts` (b)).
 *   3. Firmar — lo abierto sin firma ni huella (`filtro-recibos.ts`).
 *   4. Anotar el celular — las personas con saldo y la ficha sin teléfono.
 *
 * Todo es lo DADO y ABIERTO con saldo (ADR-448: lo recibido lo debe el
 * negocio; no se le cobra a nadie). Los días son días de Lima.
 *
 * Puro (sin base, sin React): lo usan la ruta del Resumen y el aviso semanal,
 * así los dos dicen exactamente lo mismo.
 */

import { formatCurrency, limaDateKey } from "@/lib/utils";
import { DIAS_SIN_ENTREGA } from "@/lib/adelantos/sin-control";

/** Días sin moverse a partir de los cuales hay que ir a cobrar (el mismo umbral del aviso «sin control»). */
export const DIAS_QUIETO = DIAS_SIN_ENTREGA;

type Fecha = string | Date;
/** Plata por moneda (ADR-118): `{ PEN: 120, USD: 40 }` — nunca sumada cruzada. */
export type PorMoneda = Record<string, number>;

export type TipoTarea = "cobrar" | "poner-fecha" | "firmar" | "telefono";

/** Un adelanto DADO, ABIERTO y con saldo, con lo que la regla mira. */
export interface AdelantoHoyToca {
  id: string;
  codigoOperacion?: string | null;
  beneficiarioId: string;
  saldoPendiente: number;
  moneda?: string | null;
  fechaAdelanto: Fecha;
  fechaVencimiento?: Fecha | null;
  /** La última entrega viva (no anulada) de ESTE adelanto. */
  ultimaEntrega?: Fecha | null;
  /** Las fechas de las cuotas pactadas que siguen sin cumplirse. */
  cuotasPendientes?: readonly Fecha[] | null;
  /** Tiene firma o huella (con una de las dos, el recibo está respaldado). */
  firmado: boolean;
}

export interface PersonaHoyToca {
  id: string;
  nombre: string;
  telefono?: string | null;
  /** La última gestión de cobranza anotada (llamada, recordatorio, promesa). */
  ultimaGestion?: Fecha | null;
}

export interface DatosHoyToca {
  adelantos: readonly AdelantoHoyToca[];
  personas: readonly PersonaHoyToca[];
}

export interface TareaHoy {
  /** Estable: `cobrar:<beneficiarioId>`, `poner-fecha`, `firmar`, `telefono`. */
  id: string;
  tipo: TipoTarea;
  /** Lo que hay que hacer, en una línea: «Cobrar a Blas Quispe». */
  titulo: string;
  /** El porqué con el dato: «S/ 17,000.00 sin moverse hace 83 días». */
  detalle: string;
  /** La plata en juego, por moneda. */
  monto?: PorMoneda;
  /** Cuántos adelantos (o personas, en «telefono») abarca. */
  cantidad: number;
  /** El texto del botón. */
  boton: string;
  /** Dónde se resuelve, dentro del panel (`/admin?…`). */
  href: string;
  /** Sólo «cobrar»: el adelanto de más saldo de esa persona, para abrir su ficha ahí mismo. */
  adelantoId?: string;
}

const BASE = "/admin?tab=plata&vista=adelantos";

/** Los destinos (contrato entre carriles del 25-10: Cobranza, Personas y la hoja de firmas los leen). */
export const DESTINOS_HOY_TOCA = {
  resumen: `${BASE}&sub=resumen`,
  ponerFecha: `${BASE}&sub=cobranza&filtro=sin-fecha`,
  firmar: `${BASE}&sub=lista&accion=hoja-de-firmas`,
  telefono: `${BASE}&sub=personas&filtro=sin-telefono`,
  adelanto: (ref: string) => `${BASE}&sub=lista&adelanto=${encodeURIComponent(ref)}`,
} as const;

const DIA = 86_400_000;

function msDeClave(clave: string): number {
  const [y, m, d] = clave.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Días entre dos claves de día (b − a). */
const diasEntre = (a: string, b: string): number => Math.round((msDeClave(b) - msDeClave(a)) / DIA);

/** La clave de día de Lima, o "" si no hay fecha válida. */
const clave = (v: Fecha | null | undefined): string => (v ? limaDateKey(v) : "");

/** «2026-08-03» → «03/08/2026». A mano: `Intl` cambia según la versión de ICU. */
function diaCorto(k: string): string {
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const redondear = (n: number) => Math.round(n * 100) / 100;

function sumar(m: PorMoneda, moneda: string | null | undefined, n: number): void {
  const k = moneda || "PEN";
  m[k] = redondear((m[k] ?? 0) + n);
}

/** «S/ 1,200.00 · $ 300.00» — soles primero. Sin `Intl` de moneda: el mismo formato del panel. */
export function textoMonto(m: PorMoneda): string {
  const claves = Object.keys(m)
    .filter((k) => m[k] !== 0)
    .sort((a, b) => (a === "PEN" ? -1 : b === "PEN" ? 1 : a.localeCompare(b)));
  if (claves.length === 0) return formatCurrency(0);
  return claves
    .map((k) =>
      k === "PEN" ? formatCurrency(m[k]) : `${k === "USD" ? "$" : k} ${m[k].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    )
    .join(" · ");
}

/** Para ordenar: la suma cruda (sólo decide quién va primero, nunca se muestra). */
const peso = (m: PorMoneda) => Object.values(m).reduce((s, v) => s + v, 0);

/** «Wasaco 3, Quispe 1 y Mama de Alex 1» — los que más tienen primero, tres a la vista. */
function quienes(conteo: Map<string, number>, nombreDe: (id: string) => string, conNumero: boolean): string {
  const orden = [...conteo.entries()].sort((a, b) => b[1] - a[1] || nombreDe(a[0]).localeCompare(nombreDe(b[0])));
  const partes = orden.slice(0, 3).map(([id, n]) => (conNumero ? `${nombreDe(id)} ${n}` : nombreDe(id)));
  const resto = orden.length - partes.length;
  if (resto > 0) return `${partes.join(", ")} y ${resto} más`;
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

interface Cobro {
  monto: PorMoneda;
  cantidad: number;
  /** Los días sin moverse del más quieto (0 si sólo está por vencido). */
  quieto: number;
  /** El compromiso vencido más viejo sin gestión desde entonces, si hay. */
  vencidoDesde: string;
  mayor: { id: string; ref: string; saldo: number };
}

/**
 * Las tareas de hoy, en el orden en que conviene hacerlas: primero cobrar (de
 * la persona con más plata quieta a la de menos), después poner fechas, firmar
 * y anotar celulares. Vacío = todo bajo control.
 *
 * @param ahora inyectable para probar sin depender del día.
 */
export function queHacerHoy(datos: DatosHoyToca, ahora: Date = new Date()): TareaHoy[] {
  const hoy = limaDateKey(ahora);
  const personas = new Map(datos.personas.map((p) => [p.id, p]));
  /* «Quispe Galindo  Victor» (doble espacio en la ficha de Blas) se lee de corrido. */
  const nombreDe = (id: string) => personas.get(id)?.nombre?.replace(/\s+/g, " ").trim() || "Sin nombre";

  const cobros = new Map<string, Cobro>();
  const sinFecha = new Map<string, number>();
  const sinFirma = new Map<string, number>();
  const montoSinFecha: PorMoneda = {};
  const montoSinFirma: PorMoneda = {};
  const conSaldo = new Set<string>();
  let nSinFecha = 0;
  let nSinFirma = 0;

  for (const a of datos.adelantos) {
    if (!(a.saldoPendiente > 0)) continue;
    conSaldo.add(a.beneficiarioId);
    const gestion = clave(personas.get(a.beneficiarioId)?.ultimaGestion);

    /* 1 · ¿Se movió? La última entrega de este adelanto, la última gestión a la
       persona o, si no hubo ninguna, el día en que se dio. */
    const movido = [clave(a.fechaAdelanto), clave(a.ultimaEntrega), gestion].filter(Boolean).sort().at(-1) ?? "";
    const quieto = movido ? diasEntre(movido, hoy) : 0;

    /* Los compromisos: la fecha de devolución y las cuotas pendientes. Vence
       HOY todavía no es vencido. */
    const compromisos = [clave(a.fechaVencimiento), ...(a.cuotasPendientes ?? []).map(clave)].filter(Boolean);
    const vencido = compromisos.filter((k) => k < hoy).sort()[0] ?? "";
    /* Lo vencido que ya se gestionó desde que venció está en manos de alguien. */
    const vencidoSinGestion = vencido && (!gestion || gestion < vencido) ? vencido : "";

    if (quieto >= DIAS_QUIETO || vencidoSinGestion) {
      const c = cobros.get(a.beneficiarioId) ?? {
        monto: {},
        cantidad: 0,
        quieto: 0,
        vencidoDesde: "",
        mayor: { id: a.id, ref: a.codigoOperacion?.trim() || a.id, saldo: -1 },
      };
      sumar(c.monto, a.moneda, a.saldoPendiente);
      c.cantidad += 1;
      if (quieto >= DIAS_QUIETO) c.quieto = Math.max(c.quieto, quieto);
      if (vencidoSinGestion && (!c.vencidoDesde || vencidoSinGestion < c.vencidoDesde)) c.vencidoDesde = vencidoSinGestion;
      if (a.saldoPendiente > c.mayor.saldo) c.mayor = { id: a.id, ref: a.codigoOperacion?.trim() || a.id, saldo: a.saldoPendiente };
      cobros.set(a.beneficiarioId, c);
    }

    /* 2 · Sin fecha de cobro. */
    if (compromisos.length === 0) {
      nSinFecha += 1;
      sinFecha.set(a.beneficiarioId, (sinFecha.get(a.beneficiarioId) ?? 0) + 1);
      sumar(montoSinFecha, a.moneda, a.saldoPendiente);
    }

    /* 3 · Sin firma ni huella. */
    if (!a.firmado) {
      nSinFirma += 1;
      sinFirma.set(a.beneficiarioId, (sinFirma.get(a.beneficiarioId) ?? 0) + 1);
      sumar(montoSinFirma, a.moneda, a.saldoPendiente);
    }
  }

  const tareas: TareaHoy[] = [];

  const ordenCobros = [...cobros.entries()].sort((x, y) => peso(y[1].monto) - peso(x[1].monto) || y[1].quieto - x[1].quieto);
  for (const [beneficiarioId, c] of ordenCobros) {
    const porque: string[] = [];
    if (c.quieto >= DIAS_QUIETO) porque.push(`sin moverse hace ${c.quieto} días`);
    if (c.vencidoDesde) {
      const d = diasEntre(c.vencidoDesde, hoy);
      porque.push(`venció hace ${d} ${plural(d, "día", "días")} (el ${diaCorto(c.vencidoDesde)})`);
    }
    const cuantos = c.cantidad > 1 ? ` en ${c.cantidad} adelantos` : "";
    tareas.push({
      id: `cobrar:${beneficiarioId}`,
      tipo: "cobrar",
      titulo: `Cobrar a ${nombreDe(beneficiarioId)}`,
      detalle: `${textoMonto(c.monto)}${cuantos} ${porque.join(" y ")}`,
      monto: c.monto,
      cantidad: c.cantidad,
      boton: "Cobrar",
      href: DESTINOS_HOY_TOCA.adelanto(c.mayor.ref),
      adelantoId: c.mayor.id,
    });
  }

  if (nSinFecha > 0) {
    tareas.push({
      id: "poner-fecha",
      tipo: "poner-fecha",
      titulo: `Poner fecha de cobro a ${nSinFecha} ${plural(nSinFecha, "adelanto", "adelantos")}`,
      detalle: `Sin fecha: ${quienes(sinFecha, nombreDe, true)} · ${textoMonto(montoSinFecha)}`,
      monto: montoSinFecha,
      cantidad: nSinFecha,
      boton: "Poner fechas",
      href: DESTINOS_HOY_TOCA.ponerFecha,
    });
  }

  if (nSinFirma > 0) {
    tareas.push({
      id: "firmar",
      tipo: "firmar",
      titulo: `Firmar ${nSinFirma} ${plural(nSinFirma, "recibo", "recibos")}`,
      detalle: `Sin firma ni huella: ${quienes(sinFirma, nombreDe, true)} · ${textoMonto(montoSinFirma)}`,
      monto: montoSinFirma,
      cantidad: nSinFirma,
      boton: "Firmar",
      href: DESTINOS_HOY_TOCA.firmar,
    });
  }

  const sinTelefono = [...conSaldo].filter((id) => !(personas.get(id)?.telefono ?? "").trim());
  if (sinTelefono.length > 0) {
    const n = sinTelefono.length;
    tareas.push({
      id: "telefono",
      tipo: "telefono",
      titulo: `Anotar el celular de ${n} ${plural(n, "persona", "personas")}`,
      detalle: `Te deben y no tienen celular: ${quienes(new Map(sinTelefono.map((id) => [id, 1])), nombreDe, false)}`,
      cantidad: n,
      boton: "Completar",
      href: DESTINOS_HOY_TOCA.telefono,
    });
  }

  return tareas;
}

/** La plata por cobrar quieta o vencida: la suma de las tareas «cobrar». */
export function montoPorCobrar(tareas: readonly TareaHoy[]): { monto: PorMoneda; personas: number } {
  const monto: PorMoneda = {};
  let personas = 0;
  for (const t of tareas) {
    if (t.tipo !== "cobrar" || !t.monto) continue;
    personas += 1;
    for (const [k, v] of Object.entries(t.monto)) sumar(monto, k, v);
  }
  return { monto, personas };
}

/**
 * Lo que entra de cada fila de la cuenta por persona (`CuentaPersona` de
 * `cuenta-unificada.ts`): el neto en soles (adelantos + madera) y los adelantos
 * en otras monedas, con su signo (+ te debe, − le debes).
 */
export interface CuentaParaTotales {
  beneficiarioId?: string | null;
  neto: number;
  otrasMonedas?: Record<string, number> | null;
}

export interface TotalesDeCuentas {
  teDeben: PorMoneda;
  leDebes: PorMoneda;
  personasTeDeben: number;
  personasLeDebes: number;
}

const CENTAVO = 0.005;

/**
 * «Te deben» y «Le debes» de arriba del Resumen, con la MISMA cuenta que la
 * lista «Cuenta por persona» de abajo (25-10): persona por persona, adelantos y
 * madera juntos, y después se suma. Antes «Le debes» miraba sólo adelantos y
 * decía S/ 0.00 mientras la lista, en la misma pantalla, decía «Le debes
 * S/ 4,479.60 a Comunidad Nativa…» por madera.
 *
 * En soles es la cuenta de la cabecera de `CuentasPorPersona` (Σ neto > 0 y
 * Σ |neto < 0|); las otras monedas van aparte, también por persona (ADR-118).
 */
export function totalesDeCuentas(cuentas: readonly CuentaParaTotales[]): TotalesDeCuentas {
  const teDeben: PorMoneda = {};
  const leDebes: PorMoneda = {};
  let personasTeDeben = 0;
  let personasLeDebes = 0;
  for (const c of cuentas) {
    let debe = false;
    let leDebe = false;
    const montos: [string, number][] = [["PEN", c.neto], ...Object.entries(c.otrasMonedas ?? {})];
    for (const [moneda, v] of montos) {
      if (v > CENTAVO) {
        sumar(teDeben, moneda, v);
        debe = true;
      } else if (v < -CENTAVO) {
        sumar(leDebes, moneda, -v);
        leDebe = true;
      }
    }
    if (debe) personasTeDeben += 1;
    if (leDebe) personasLeDebes += 1;
  }
  return { teDeben, leDebes, personasTeDeben, personasLeDebes };
}

/**
 * «Sin moverse o vencido» nunca pasa de lo que la persona te debe en su cuenta
 * entera: si le diste S/ 1,000 que no se mueven pero le debes S/ 300 de madera,
 * por cobrar quedan S/ 700 (lo demás se liquida). Sin este tope la cifra podía
 * ser más grande que «Te deben», que está al lado.
 *
 * Una persona sin fila en la cuenta no se topea: se cobra lo de sus adelantos.
 */
export function porCobrarConCuentas(
  tareas: readonly TareaHoy[],
  cuentas: readonly CuentaParaTotales[],
): { monto: PorMoneda; personas: number } {
  const porBeneficiario = new Map(cuentas.filter((c) => c.beneficiarioId).map((c) => [c.beneficiarioId as string, c]));
  const monto: PorMoneda = {};
  let personas = 0;
  for (const t of tareas) {
    if (t.tipo !== "cobrar" || !t.monto) continue;
    const cuenta = porBeneficiario.get(t.id.slice("cobrar:".length));
    let suma = false;
    for (const [moneda, v] of Object.entries(t.monto)) {
      const enCuenta = cuenta ? (moneda === "PEN" ? cuenta.neto : (cuenta.otrasMonedas?.[moneda] ?? 0)) : v;
      const tope = Math.min(v, Math.max(0, enCuenta));
      if (tope > CENTAVO) {
        sumar(monto, moneda, tope);
        suma = true;
      }
    }
    if (suma) personas += 1;
  }
  return { monto, personas };
}

/** El lunes de la semana de Lima de `ahora` («2026-10-26»): la clave del aviso semanal. */
export function lunesDeLaSemana(ahora: Date = new Date()): string {
  const hoy = limaDateKey(ahora);
  const ms = msDeClave(hoy);
  const dow = new Date(ms).getUTCDay(); // 0 = domingo
  const atras = dow === 0 ? 6 : dow - 1;
  return new Date(ms - atras * DIA).toISOString().slice(0, 10);
}

/** El primer instante del mes de Lima de `ahora` (Lima = UTC−5 todo el año, sin horario de verano). */
export function inicioDelMesLima(ahora: Date = new Date()): Date {
  const [y, m] = limaDateKey(ahora).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 5));
}

/** Tareas que entran en el aviso por WhatsApp: más que esto ya no se lee en el celular. */
export const TOPE_AVISO = 6;

export interface AvisoSemanal {
  /** Una línea: «Esta semana toca: cobrar a 2 personas, 5 sin fecha, 5 sin firmar». */
  titulo: string;
  /** El mensaje entero, listo para WhatsApp/Telegram (texto plano, con enlaces). */
  texto: string;
  /** Las tareas que entraron (hasta `TOPE_AVISO`), para armar el correo y la campana. */
  tareas: TareaHoy[];
  /** Las que no entraron (están en el panel). */
  resto: number;
}

/** El titular corto: lo que se ve en la campana y en el asunto del correo. */
function titular(tareas: readonly TareaHoy[]): string {
  const partes: string[] = [];
  const cobrar = tareas.filter((t) => t.tipo === "cobrar").length;
  if (cobrar > 0) partes.push(`cobrar a ${cobrar} ${plural(cobrar, "persona", "personas")}`);
  for (const t of tareas) {
    if (t.tipo === "poner-fecha") partes.push(`${t.cantidad} sin fecha`);
    if (t.tipo === "firmar") partes.push(`${t.cantidad} sin firmar`);
    if (t.tipo === "telefono") partes.push(`${t.cantidad} sin celular`);
  }
  return partes.length === 0 ? "Adelantos: todo bajo control" : `Adelantos, esta semana toca: ${partes.join(", ")}`;
}

/**
 * El aviso del lunes: las mismas tareas del Resumen, con el enlace a cada una.
 * `base` = el dominio del panel («https://buleje.pe»); vacío = enlaces relativos.
 */
export function avisoSemanal(tareas: readonly TareaHoy[], opts: { negocio?: string | null; base?: string } = {}): AvisoSemanal {
  const base = (opts.base ?? "").replace(/\/+$/, "");
  const van = tareas.slice(0, TOPE_AVISO);
  const resto = tareas.length - van.length;
  const titulo = titular(tareas);
  const cabeza = `${opts.negocio?.trim() ? `${opts.negocio.trim()} · ` : ""}${titulo}`;
  if (van.length === 0) return { titulo, texto: `${cabeza}.`, tareas: [], resto: 0 };
  const lineas = van.map((t) => `• ${t.titulo}: ${t.detalle}\n  ${base}${t.href}`);
  const pie = resto > 0 ? `\n\nY ${resto} ${plural(resto, "cosa", "cosas")} más en el Resumen: ${base}${DESTINOS_HOY_TOCA.resumen}` : "";
  return { titulo, texto: `${cabeza}\n\n${lineas.join("\n")}${pie}`, tareas: van, resto };
}
