/**
 * lib/caja/constancia-cierre.ts — lo que queda pendiente ANTES de cerrar la caja
 * y la constancia que sale DESPUÉS (auditoría 15-10, M30).
 *
 * Antes: «Confirmar cierre» cerraba sin decir que 1 venta no había pasado por
 * la caja, que el esperado era negativo o que el último arqueo ya daba
 * diferencia; y después no quedaba ningún papel con quién cerró, cuánto contó
 * y qué salió del cajón. Ahora el modal lista los pendientes y, cerrada la
 * caja, imprime una constancia con las cifras DEL SERVIDOR (lo que devolvió el
 * cierre: esperado, contado y diferencia no se recalculan acá).
 *
 * El HTML se abre con `document.write` en el origen del panel: todo lo que
 * viene de la base va escapado (mismo criterio que `reporte-impreso.ts`).
 *
 * PURO y client-safe.
 */
import { escapeHtml } from "@/lib/email/escape-html";
import { ARQUEO_LABEL, veredictoArqueo } from "@/lib/caja/arqueo-veredicto";
import { fechaCortaLima, diasCalendarioLima } from "@/lib/caja/caja-abierta";
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import type { ConciliacionConVentas } from "@/lib/caja/parte-del-dia";

export interface MovimientoParaCierre {
  type: string;
  amount: number;
  method?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

/** Adónde lleva el pendiente dentro de la caja (`?sub=`). */
export type DestinoPendiente = "hoy" | "movimientos" | "cuadrar";

export interface PendienteDeCierre {
  clave: "sin-caja" | "esperado-negativo" | "arqueo-con-diferencia" | "varios-dias";
  texto: string;
  /** Qué pasa si se cierra igual (va en la ⓘ). */
  detalle: string;
  ir: DestinoPendiente;
  /** Cambia la plata del cuadre (rojo); si no, es un aviso. */
  grave: boolean;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * «Diferencia: S/ -2.90» (lo que escriben los arqueos: `formatCurrency` pone el
 * signo después de «S/») o «Diferencia: −S/ 2.90» → −2.9.
 */
export function diferenciaDeArqueo(descripcion: string | null | undefined): number | null {
  const m = /Diferencia:\s*([+−-]?)\s*S\/\s*([+−-]?)\s*([\d.,]+)/.exec(descripcion ?? "");
  if (!m) return null;
  const n = Number(m[3].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const menos = (s: string) => s === "−" || s === "-";
  return menos(m[1]) || menos(m[2]) ? -n : n;
}

export function pendientesDelCierre(
  e: {
    ahora: Date;
    abiertaEn: string;
    /** Esperado en el cajón (el mismo del cierre). */
    esperado: number;
    movimientos: ReadonlyArray<MovimientoParaCierre>;
    /** Cuadre con ventas del parte del servidor; `null` mientras carga. */
    conciliacion?: ConciliacionConVentas | null;
    /**
     * Cierre a ciegas: quien cuenta no puede ver el esperado. Los pendientes
     * salen sin montos de efectivo y sin el arqueo (su diferencia lo delata).
     */
    aCiegas?: boolean;
  },
  formato: (n: number) => string,
): PendienteDeCierre[] {
  const out: PendienteDeCierre[] = [];
  const ciego = e.aCiegas === true;
  const sinCaja = e.conciliacion?.sinCaja;
  if (sinCaja && sinCaja.n > 0) {
    out.push({
      clave: "sin-caja",
      texto: `${plural(sinCaja.n, "venta no pasó", "ventas no pasaron")} por la caja${ciego ? "" : ` (${formato(sinCaja.total)})`}`,
      detalle: ciego
        ? "Si alguna se cobró en efectivo, esa plata está en el cajón sin estar en el cuadre: avisa a quien revisa."
        : sinCaja.efectivo > 0
          ? `${formato(sinCaja.efectivo)} se cobraron en efectivo: esa plata puede estar en el cajón sin estar en el esperado, y el conteo saldría con sobrante.`
          : "Se cobraron por otro medio: no cambian el efectivo, pero no figuran en este cuadre.",
      ir: "hoy",
      grave: sinCaja.efectivo > 0,
    });
  }
  if (e.esperado < 0) {
    out.push({
      clave: "esperado-negativo",
      texto: ciego ? "El cuadre tiene un egreso que no cuadra" : `El esperado es negativo (${formato(e.esperado)})`,
      detalle: "Salió más efectivo del que entró: falta anotar una venta o un egreso salió de otra plata. Cerrar así deja un cuadre imposible.",
      ir: "movimientos",
      grave: true,
    });
  }
  const ultimoArqueo = [...e.movimientos]
    .filter((m) => m.type === "arqueo")
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
  const difArqueo = diferenciaDeArqueo(ultimoArqueo?.description);
  if (!ciego && difArqueo != null && Math.abs(difArqueo) >= 0.01) {
    out.push({
      clave: "arqueo-con-diferencia",
      texto: `El último arqueo dio ${difArqueo > 0 ? "un sobrante" : "un faltante"} de ${formato(Math.abs(difArqueo))}`,
      detalle: "Si no se aclaró, el cierre va a mostrar la misma diferencia (o más).",
      ir: "cuadrar",
      grave: false,
    });
  }
  const dias = diasCalendarioLima(e.abiertaEn, e.ahora) ?? 0;
  if (dias > 0) {
    out.push({
      clave: "varios-dias",
      texto: `Esta caja junta ${plural(dias + 1, "día", "días")} (desde el ${fechaCortaLima(e.abiertaEn)})`,
      detalle: "El conteo tiene que cubrir todo lo que entró y salió desde la apertura, no sólo lo de hoy.",
      ir: "hoy",
      grave: false,
    });
  }
  return out;
}

/** La caja tal como la devolvió el cierre (`PATCH …/[id]` action close). */
export interface CajaCerradaParaConstancia {
  id: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  notes?: string | null;
  movements: ReadonlyArray<MovimientoParaCierre>;
}

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });
const fechaYHora = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${fechaCortaLima(d)} ${HORA.format(d)}`;
};

export function htmlConstanciaDeCierre(
  caja: CajaCerradaParaConstancia,
  extra: {
    negocio: string;
    /** Quién cerró (la sesión que confirmó el cierre). */
    responsable: string | null;
    tolerancia: number;
    pendientes: ReadonlyArray<PendienteDeCierre>;
    /** El cierre se reintentó y la caja ya estaba cerrada: la constancia es la del primer cierre. */
    yaEstabaCerrada?: boolean;
  },
  formato: (n: number) => string,
): string {
  const e = escapeHtml;
  const f = (n: number) => e(formato(n));
  const contado = Number(caja.closingAmount ?? 0);
  const esperado = Number(caja.expectedAmount ?? 0);
  const diferencia = Number(caja.difference ?? contado - esperado);
  const estado = veredictoArqueo(
    { expectedAmount: esperado, countedAmount: contado, difference: diferencia, notes: caja.notes, closedAt: caja.closedAt ?? null },
    extra.tolerancia > 0 ? extra.tolerancia : 0.01,
  );
  const porMedio = new Map<string, { n: number; total: number }>();
  for (const m of caja.movements) {
    if (m.type !== "venta") continue;
    const medio = medioDeMovimiento(m.method);
    const v = porMedio.get(medio) ?? { n: 0, total: 0 };
    porMedio.set(medio, { n: v.n + 1, total: v.total + m.amount });
  }
  const ventas = [...porMedio].map(([medio, v]) => `  ${e(medio.charAt(0).toUpperCase() + medio.slice(1))}: ${f(v.total)} (${v.n})`).join("\n");
  const egresos = caja.movements.filter((m) => m.type === "egreso");
  const lineasEgresos = egresos
    .slice(0, 12)
    .map((m) => `  ${f(m.amount)} ${e(medioDeMovimiento(m.method))} · ${e((m.description || "Sin detalle").slice(0, 60))}`)
    .join("\n");
  const ingresos = caja.movements.filter((m) => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
  const pendientes = extra.pendientes.map((p) => `<li>${e(p.texto)}</li>`).join("");
  const signo = diferencia > 0 ? "+" : diferencia < 0 ? "-" : "";

  return `
<html><head><title>Constancia de cierre de caja</title>
<style>body{font-family:monospace;font-size:12px;max-width:380px;margin:0 auto;padding:20px}h1{font-size:14px;text-align:center;margin:0}p{margin:4px 0}pre{margin:2px 0;white-space:pre-wrap}ul{margin:4px 0;padding-left:18px}.sep{border-top:1px dashed #999;margin:8px 0}.center{text-align:center}.bold{font-weight:bold}</style>
</head><body>
<h1>CONSTANCIA DE CIERRE DE CAJA</h1>
<p class="center bold">${e(extra.negocio || "Buleje")}</p>
<p class="center">Caja #${e(caja.id.slice(-8))}</p>
${extra.yaEstabaCerrada ? `<p class="center">(Ya estaba cerrada: es el primer cierre, no uno nuevo)</p>` : ""}
<div class="sep"></div>
<p>Abierta: ${e(fechaYHora(caja.openedAt))}</p>
<p>Cerrada: ${e(fechaYHora(caja.closedAt))}</p>
<p>Cerró: ${e(extra.responsable || "—")}</p>
<div class="sep"></div>
<p class="bold">VENTAS POR MEDIO</p>
<pre>${ventas || "  Sin ventas"}</pre>
<p>Ingresos a mano: ${f(ingresos)}</p>
<p class="bold">EGRESOS (${egresos.length})</p>
<pre>${lineasEgresos || "  Sin egresos"}${egresos.length > 12 ? `\n  y ${egresos.length - 12} más` : ""}</pre>
<div class="sep"></div>
<p class="bold">CONTEO DEL EFECTIVO</p>
<p>Apertura: ${f(caja.openingAmount)}</p>
<p>Esperado: ${f(esperado)}</p>
<p>Contado: ${f(contado)}</p>
<p class="bold">Diferencia: ${signo}${f(Math.abs(diferencia))} · ${e(ARQUEO_LABEL[estado])}${estado === "conforme" && signo ? ` (dentro de la tolerancia de ${f(extra.tolerancia)})` : ""}</p>
${caja.notes ? `<p>Notas: ${e(caja.notes)}</p>` : ""}
${pendientes ? `<div class="sep"></div><p class="bold">PENDIENTES AL CERRAR</p><ul>${pendientes}</ul>` : ""}
<div class="sep"></div>
<p style="margin-top:30px">Firma de quien cerró: ______________</p>
<p>Firma supervisor: _______________</p>
</body></html>`;
}
