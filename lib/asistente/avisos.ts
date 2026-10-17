import "server-only";

/**
 * lib/asistente/avisos.ts
 *
 * Lo que el asistente te contaría hoy sin que le preguntes.
 *
 * ── Qué entra acá y qué no ───────────────────────────────────────────────────
 * Un aviso tiene que ser **accionable y no obvio**. «Vendiste S/ 2.400 ayer» no
 * es un aviso: es un número que ya está en la pantalla de inicio. «El camión N12
 * lleva 40 % más de combustible que el mes pasado» sí: nadie lo estaba mirando,
 * y si es cierto hay algo que revisar.
 *
 * Por eso NO se repite lo que ya tiene su propio cron (recordatorios al deudor,
 * vencimiento de documentos, alertas de stock a la tienda). Esto es el resumen
 * PARA EL DUEÑO, y llega por donde el dueño esté: la campana del panel, el bot
 * de Telegram, o un flujo de n8n.
 *
 * ── La regla que gobierna cada texto ─────────────────────────────────────────
 * Un derivado se declara derivado. «Gastó 40 % más» es una comparación entre dos
 * períodos, no una acusación: el texto dice los dos números para que la persona
 * saque su propia conclusión. Un aviso que exagera enseña a ignorar la lista
 * entera, y una lista ignorada no sirve para nada.
 */

import { AssetsDB } from "@/lib/db/assets.db";
import { ForestFleteDB } from "@/lib/db/forest-flete.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { FiadosDB } from "@/lib/db/fiados.db";
import { logger } from "@/lib/logger";

export type Severidad = "HIGH" | "MEDIUM" | "LOW";

export interface Aviso {
  /** Estable por tipo + entidad: es lo que evita repetir el mismo aviso a diario. */
  clave: string;
  severidad: Severidad;
  titulo: string;
  /** El texto tal como se lee, con los dos números cuando es una comparación. */
  cuerpo: string;
  /** Dónde se resuelve. Se usa para el enlace del panel y para el texto del bot. */
  pantalla: string;
  url: string;
}

const soles = (n: number) =>
  `S/ ${(Math.round(n * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DIA = 86_400_000;

/** Inicio del mes de una fecha, en hora local del negocio. */
function inicioDeMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ── Los chequeos ─────────────────────────────────────────────────────────────

/**
 * Combustible por máquina: este mes contra el anterior.
 *
 * Se compara **el mismo tramo de mes**: a día 8, los 8 primeros días de cada
 * uno. Comparar un mes incompleto contra uno entero diría «gastás la mitad»
 * todos los días 15, que es una alarma al revés.
 *
 * Sólo avisa con al menos 3 cargas en el mes anterior: con una sola carga de
 * referencia, cualquier variación es ruido.
 */
async function combustibleDisparado(tenantId: string, ahora: Date): Promise<Aviso[]> {
  const activos = await AssetsDB.listWithStats(tenantId);
  if (activos.length === 0) return [];

  const inicioEste = inicioDeMes(ahora);
  const inicioPrevio = new Date(inicioEste.getFullYear(), inicioEste.getMonth() - 1, 1);
  const diaDelMes = ahora.getDate();
  const finPrevioComparable = new Date(inicioPrevio.getFullYear(), inicioPrevio.getMonth(), diaDelMes, 23, 59, 59);

  const avisos: Aviso[] = [];
  for (const a of activos) {
    const movs = await AssetsDB.listMovements(tenantId, a.id, 400);
    const combustible = movs.expenses.filter((e) => e.category === "combustible");
    const enRango = (desde: Date, hasta: Date) =>
      combustible.filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= desde.getTime() && t <= hasta.getTime();
      });

    const esteMes = enRango(inicioEste, ahora);
    const mesPrevio = enRango(inicioPrevio, finPrevioComparable);
    if (mesPrevio.length < 3 || esteMes.length === 0) continue;

    const gastoAhora = esteMes.reduce((s, e) => s + e.amount, 0);
    const gastoAntes = mesPrevio.reduce((s, e) => s + e.amount, 0);
    if (gastoAntes <= 0) continue;

    const variacion = (gastoAhora - gastoAntes) / gastoAntes;
    if (variacion < 0.3) continue;

    avisos.push({
      clave: `combustible-arriba:${a.id}:${inicioEste.toISOString().slice(0, 7)}`,
      severidad: variacion >= 0.6 ? "HIGH" : "MEDIUM",
      titulo: `${a.name} está gastando más combustible`,
      cuerpo:
        `En lo que va del mes lleva ${soles(gastoAhora)} en ${esteMes.length} cargas. ` +
        `A esta misma altura del mes pasado llevaba ${soles(gastoAntes)} en ${mesPrevio.length}. ` +
        `Son ${Math.round(variacion * 100)} % más. Puede ser más trabajo, o puede ser una fuga o una carga mal anotada.`,
      pantalla: "Mi Plata › Reportes › Activos",
      url: "/admin?tab=plata&vista=activos",
    });
  }
  return avisos;
}

/**
 * Fletes que ya viajaron y nadie pagó.
 *
 * Un flete impago no le duele a nadie hasta que el transportista deja de venir.
 * Se agrupa en UN aviso: doce avisos de un flete cada uno son doce avisos que
 * no se leen.
 */
async function fletesImpagos(tenantId: string, ahora: Date): Promise<Aviso[]> {
  const desde = new Date(ahora.getTime() - 120 * DIA);
  const fletes = await ForestFleteDB.listar(tenantId, { desde, hasta: ahora });
  /**
   * Sólo los que llevan una semana sin pagarse.
   *
   * Un flete anotado ayer y todavía impago no es una alerta: es un flete
   * normal. Avisar de eso convierte cada registro en una notificación al día
   * siguiente, y una lista que avisa de todo deja de avisar de nada.
   */
  const corte = ahora.getTime() - 7 * DIA;
  const impagos = fletes.filter(
    (f) =>
      f.estadoPago === "pendiente" &&
      f.pagaQuien === "ctp" &&
      f.monto != null &&
      new Date(f.fecha).getTime() <= corte,
  );
  if (impagos.length === 0) return [];

  const total = impagos.reduce((s, f) => s + (f.monto ?? 0), 0);
  const masViejo = impagos.reduce((v, f) => (new Date(f.fecha) < new Date(v.fecha) ? f : v));
  const dias = Math.floor((ahora.getTime() - new Date(masViejo.fecha).getTime()) / DIA);
  if (total < 100) return [];

  return [
    {
      clave: `fletes-impagos:${ahora.toISOString().slice(0, 10)}`,
      severidad: dias > 30 ? "MEDIUM" : "LOW",
      titulo: `${impagos.length} ${impagos.length === 1 ? "flete" : "fletes"} sin pagar`,
      cuerpo:
        `Suman ${soles(total)} que paga el CTP. El más viejo es del ${String(masViejo.fecha).slice(0, 10)}` +
        `${masViejo.placa ? ` (placa ${masViejo.placa})` : ""}, hace ${dias} días.`,
      pantalla: "Forestal › Herramientas › Fletes",
      url: "/admin?tab=forestal-herramientas&vista=fletes",
    },
  ];
}

/**
 * Adelantos que pasaron su fecha de devolución.
 *
 * Distinto de la antigüedad: un adelanto viejo sin fecha pactada no incumplió
 * nada. Sólo cuenta el que tenía fecha y la pasó (ADR-332).
 */
async function adelantosVencidos(tenantId: string, ahora: Date): Promise<Aviso[]> {
  const abiertos = await AdelantosDB.list(tenantId, { status: "ABIERTO" });
  const vencidos = abiertos.filter(
    (a) => a.fechaVencimiento && new Date(a.fechaVencimiento) < ahora && Number(a.saldoPendiente ?? 0) > 0,
  );
  if (vencidos.length === 0) return [];

  const total = vencidos.reduce((s, a) => s + Number(a.saldoPendiente ?? 0), 0);
  const nombres = vencidos
    .slice(0, 3)
    .map((a) => a.beneficiario?.nombre ?? "—")
    .join(", ");

  return [
    {
      clave: `adelantos-vencidos:${ahora.toISOString().slice(0, 10)}`,
      severidad: "MEDIUM",
      titulo: `${vencidos.length} ${vencidos.length === 1 ? "adelanto vencido" : "adelantos vencidos"}`,
      cuerpo:
        `${soles(total)} que ya se tenían que haber devuelto. ${nombres}` +
        `${vencidos.length > 3 ? ` y ${vencidos.length - 3} más` : ""}.`,
      pantalla: "Mi Plata › Por cobrar › Adelantos",
      url: "/admin?tab=plata&vista=adelantos",
    },
  ];
}

/**
 * Fiados de más de 30 días.
 *
 * Los primeros 30 días son el fiado normal de bodega. Pasado eso deja de ser
 * crédito y empieza a ser plata que se pierde, y el número que importa no es
 * cuántos son sino cuánto suman.
 */
async function fiadosViejos(tenantId: string, ahora: Date): Promise<Aviso[]> {
  const lista = (await FiadosDB.list(tenantId)).filter(
    (f) => (f.status === "ACTIVO" || f.status === "VENCIDO") && Number(f.saldo ?? 0) > 0,
  );
  const viejos = lista.filter((f) => f.createdAt && ahora.getTime() - new Date(f.createdAt).getTime() > 30 * DIA);
  if (viejos.length === 0) return [];

  const total = viejos.reduce((s, f) => s + Number(f.saldo ?? 0), 0);
  if (total < 50) return [];
  const peor = viejos.reduce((v, f) => (Number(f.saldo) > Number(v.saldo) ? f : v));

  return [
    {
      clave: `fiados-viejos:${ahora.toISOString().slice(0, 10)}`,
      severidad: total > 1000 ? "HIGH" : "MEDIUM",
      titulo: `${soles(total)} fiados hace más de un mes`,
      cuerpo:
        `Son ${viejos.length} ${viejos.length === 1 ? "cuenta" : "cuentas"}. La más grande es de ` +
        `${peor.customerName || peor.customerId} por ${soles(Number(peor.saldo ?? 0))}.`,
      pantalla: "Mi Plata › Por cobrar › Fiados",
      url: "/admin?tab=plata&vista=fiados",
    },
  ];
}

/**
 * Máquinas paradas o en mantenimiento.
 *
 * Una máquina parada no genera y sí cuesta. Es el aviso más barato de todos y
 * el que más rápido se olvida cuando el equipo está en el taller hace semanas.
 */
async function maquinasQuietas(tenantId: string): Promise<Aviso[]> {
  const activos = await AssetsDB.listWithStats(tenantId);
  const quietas = activos.filter((a) => a.status === "parado" || a.status === "mantenimiento");
  if (quietas.length === 0) return [];

  return [
    {
      clave: `maquinas-quietas:${quietas.map((a) => a.id).sort().join(",")}`,
      severidad: "LOW",
      titulo: `${quietas.length} ${quietas.length === 1 ? "máquina no está operativa" : "máquinas no están operativas"}`,
      cuerpo: quietas.map((a) => `${a.name} (${a.status})`).join(" · ") + ". Mientras están así no generan y siguen costando.",
      pantalla: "Mi Plata › Reportes › Activos",
      url: "/admin?tab=plata&vista=activos",
    },
  ];
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Todo lo que vale la pena contar hoy, ordenado por urgencia.
 *
 * Cada chequeo se aísla: uno que falle —una tabla que no existe en un tenant
 * que no usa ese módulo— no puede dejar sin avisos a los demás. Es la
 * diferencia entre un resumen incompleto y ningún resumen.
 */
export async function calcularAvisos(tenantId: string, ahora = new Date()): Promise<Aviso[]> {
  const chequeos: Array<[string, Promise<Aviso[]>]> = [
    ["combustible", combustibleDisparado(tenantId, ahora)],
    ["fletes", fletesImpagos(tenantId, ahora)],
    ["adelantos", adelantosVencidos(tenantId, ahora)],
    ["fiados", fiadosViejos(tenantId, ahora)],
    ["maquinas", maquinasQuietas(tenantId)],
  ];

  const resultados = await Promise.allSettled(chequeos.map(([, p]) => p));
  const avisos: Aviso[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") avisos.push(...r.value);
    else logger.warn("[avisos] un chequeo falló", { tenantId, chequeo: chequeos[i][0], error: String(r.reason) });
  });

  const peso: Record<Severidad, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return avisos.sort((a, b) => peso[a.severidad] - peso[b.severidad]);
}

/** Los avisos como los diría el bot: un mensaje corto, sin markdown de panel. */
export function comoTexto(avisos: Aviso[]): string {
  if (avisos.length === 0) return "Todo tranquilo por acá: no encontré nada que necesite tu atención hoy.";
  const icono: Record<Severidad, string> = { HIGH: "🔴", MEDIUM: "🟡", LOW: "🔵" };
  return avisos
    .map((a) => `${icono[a.severidad]} <b>${a.titulo}</b>\n${a.cuerpo}\n<i>${a.pantalla}</i>`)
    .join("\n\n");
}
