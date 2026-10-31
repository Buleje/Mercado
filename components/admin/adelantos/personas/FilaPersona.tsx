"use client";

/**
 * Una persona = una fila (patrón del panel, 11-10). Era una tarjeta de ~280 px
 * de alto en una grilla de tres, con cinco botones de 32-36 px (editar,
 * eliminar, adelanto, WhatsApp, teléfono): 12 personas = 1,96 pantallas y 42
 * botones bajos. La fila dice lo mismo —adelantado, te debe, cumplimiento,
 * tope, abiertos y el último— con UNA acción a la vista (Entregar, ADR-491) y
 * el resto en «⋯». Tocar el nombre abre su ficha, como antes la tarjeta.
 *
 * 30-10 (Brandon: «mejorar el diseño de Personas, mismo formato y
 * compactación»): la fila medía 93 px porque el aviso «Falta DNI/RUC» iba en
 * una píldora de 32 px debajo del nombre y el tope ocupaba tres renglones.
 * Ahora cada celda tiene una línea principal y, como mucho, una chica: el aviso
 * va al lado del documento, el monto del tope junto al %, y a quien te debe y
 * tiene teléfono se le recuerda por WhatsApp desde la fila (antes, en «⋯»).
 */

import { AlertTriangle, CheckCircle, Eye, HandCoins, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { estadoDeCredito, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { cumplimientoDe } from "@/lib/adelantos/saldo-persona";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { cuentaDePersona, hayDeuda } from "@/lib/adelantos/modos-alta";
import { queFalta } from "@/lib/adelantos/datos-persona";
import { textoDeTope } from "@/lib/adelantos/tope";
import { MontosEnLineas, fmtMonedas } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

/** Hace cuánto, en la unidad en que uno lo diría en voz alta. */
function hace(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}

/** Chip de estado: el mismo tamaño que los de Adelantos › Lista. */
const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-bold";
/** Toque de 44 px para lo chico de la fila sin agrandar la fila (memoria panel-celular-toque-44). */
const TOQUE = "relative after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']";

export default function FilaPersona({
  persona: b,
  onVerFicha,
  onEditar,
  onEliminar,
  onAdelanto,
  onEntregar,
  onCompletar,
}: {
  persona: BeneficiarioConSaldo;
  onVerFicha: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  /** El formulario completo (plan de cuotas, lo que te adelantan a ti). */
  onAdelanto: () => void;
  /** «Entregar» (ADR-491) con la persona ya elegida; sin él, la acción es el formulario. */
  onEntregar?: () => void;
  /** Abre el mini-modal para escribir el teléfono y el DNI/RUC que faltan. */
  onCompletar?: () => void;
}) {
  /* `saldoPendiente` es lo DADO abierto: gobierna el tope, la cobranza y el
     recordatorio. «Te debe» / «Le debes» son las dos direcciones (ADR-448). */
  const debe = Object.values(b.saldoPendiente).some((v) => v > 0);
  const cuenta = cuentaDePersona(b);
  const leDebes = hayDeuda(cuenta.leDebes);
  const credito = estadoDeCredito(b.limiteCredito, saldoParaLimite(b.saldoPendiente));
  const cumplimiento = cumplimientoDe(b);
  const topeTxt = textoDeTope(credito);
  /* «Puede pedir S/ 266.66 más · tope S/ 1,000» en dos piezas: el tope va al
     lado del % y lo que le queda abajo, en un renglón (eran tres). */
  const [topeQueda, topeMonto] = topeTxt ? topeTxt.texto.split(" · ") : [];
  const falta = queFalta(b);
  const contacto = [b.documento, b.telefono].filter(Boolean).join(" · ");
  /* Sólo lo DADO: a quien te pagó antes no se le recuerda «tu saldo pendiente». */
  const wa = enlaceWhatsAppConTexto(
    b.telefono,
    debe
      ? `Hola ${b.nombre}, te recuerdo que tienes un saldo pendiente de ${fmtMonedas(b.saldoPendiente)} por liquidar. ¡Gracias!`
      : `Hola ${b.nombre}, ¿cómo estás?`,
  );
  const abrirWa = () => {
    if (wa) window.open(wa, "_blank", "noopener,noreferrer");
  };

  const acciones: MenuAccion[] = [
    { id: "ficha", label: "Ver su ficha", hint: "Sus adelantos, entregas y firmas", icon: Eye, onSelect: onVerFicha },
    ...(onEntregar ? [{ id: "nuevo", label: "Nuevo adelanto (formulario)", hint: "Plan de cuotas, permiso o lo que te adelantan a ti", icon: Plus, onSelect: onAdelanto }] : []),
    ...(wa ? [{ id: "wa", label: debe ? "Recordarle el saldo" : "Escribirle", hint: `WhatsApp · ${b.telefono}`, icon: MessageCircle, onSelect: abrirWa }] : []),
    ...(onCompletar && falta.length > 0
      ? [{ id: "completar", label: "Completar datos", hint: `Falta: ${falta.join(" y ")}`, icon: Phone, onSelect: onCompletar }]
      : []),
    { id: "editar", label: "Editar", hint: "Nombre, documento, teléfono, tope", icon: Pencil, onSelect: onEditar },
    { id: "eliminar", label: "Eliminar", icon: Trash2, onSelect: onEliminar },
  ];

  return (
    <tr data-persona-id={b.id}>
      <td>
        {/* Sin el círculo con la inicial (30-10): como en Adelantos › Lista, y
            con él la tabla no entraba a 1280 px (el «⋯» quedaba cortado). */}
        <div className="min-w-0">
          <button
            type="button"
            onClick={onVerFicha}
            title={`${b.nombre} · ver su ficha completa`}
            className="block max-w-[14rem] truncate text-left font-bold text-[var(--text-primary)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            {b.nombre}
          </button>
          {(contacto || (falta.length > 0 && onCompletar)) && (
            <span className="flex min-w-0 max-w-[14rem] items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              {contacto && <span className="truncate tabular-nums">{contacto}</span>}
              {/* Sin teléfono no hay WhatsApp ni recordatorios: se completa acá mismo. */}
              {falta.length > 0 && onCompletar && (
                <button
                  type="button"
                  onClick={onCompletar}
                  title={`Escribir lo que falta: ${falta.join(" y ")}`}
                  data-completar-datos
                  className={`${TOQUE} inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--data-warning)]/15 px-1.5 font-bold text-[var(--data-warning-ink)] hover:bg-[var(--data-warning)]/25`}
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden /> {falta.length > 1 ? `Faltan ${falta.length} datos` : `Falta ${falta[0]}`}
                </button>
              )}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap text-right font-semibold tabular-nums">
        <MontosEnLineas map={b.totalAdelantado} />
      </td>
      <td className="whitespace-nowrap text-right">
        <span className={`block font-extrabold tabular-nums ${hayDeuda(cuenta.teDebe) ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]"}`}>
          <MontosEnLineas map={cuenta.teDebe} />
        </span>
        {/* Lo que le debes: lo que te entregó de más + lo que te pagó antes o te prestó. */}
        {leDebes && (
          <span className="block text-xs font-semibold tabular-nums text-[var(--data-info-ink)]">
            Le debes <MontosEnLineas map={cuenta.leDebes} />
          </span>
        )}
      </td>
      <td className="whitespace-nowrap">
        {/* Cuánto de lo que sacó ya devolvió, y lo que QUEDA de su tope: lo que
            decide si conviene volver a darle plata. */}
        <span className="flex items-center gap-2">
          {cumplimiento != null ? (
            <>
              <span className="h-2 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]" aria-hidden>
                <span
                  className={`block h-full rounded-full ${cumplimiento >= 70 ? "bg-[var(--data-success)]" : cumplimiento >= 30 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]"}`}
                  style={{ width: `${cumplimiento}%` }}
                />
              </span>
              <span className="font-bold tabular-nums text-[var(--text-secondary)]">{cumplimiento}%</span>
            </>
          ) : (
            <span className="text-[var(--text-tertiary)]">—</span>
          )}
          {topeMonto && <span className="text-xs tabular-nums text-[var(--text-tertiary)]">· {topeMonto}</span>}
        </span>
        {topeTxt && (
          <span
            title={topeTxt.detalle}
            className={`block text-xs font-semibold tabular-nums ${topeTxt.tono === "atencion" ? "text-[var(--data-error-ink)]" : "text-[var(--text-tertiary)]"}`}
          >
            {topeQueda}
          </span>
        )}
      </td>
      <td>
        {debe ? (
          <span className="flex items-center gap-1.5">
            <span className={`${CHIP} bg-[var(--data-warning)]/15 text-[var(--data-warning-ink)]`}>
              {b.adelantosAbiertos} abierto{b.adelantosAbiertos === 1 ? "" : "s"}
            </span>
            {/* Cobrar en un toque, al lado de lo que debe (antes, dentro de «⋯»). En
                la columna de acciones sumaba 54 px y la tabla no entraba a 1280. */}
            {wa && (
              <button
                type="button"
                onClick={abrirWa}
                title={`Recordarle el saldo por WhatsApp · ${b.telefono}`}
                aria-label={`Recordarle el saldo a ${b.nombre} por WhatsApp`}
                data-recordar-wa
                className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--data-success)]/12 text-[var(--data-success-ink)] transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-[var(--data-success)]/25"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
              </button>
            )}
          </span>
        ) : leDebes ? (
          <span className={`${CHIP} bg-[var(--data-info-500)]/12 text-[var(--data-info-ink)]`}>Le debes</span>
        ) : (
          <span className={`${CHIP} bg-[var(--data-success)]/15 text-[var(--data-success-ink)]`}>
            <CheckCircle className="h-4 w-4" aria-hidden /> Al día
          </span>
        )}
        {b.ultimoAdelanto && <span className="block whitespace-nowrap text-xs text-[var(--text-tertiary)]">Último {hace(b.ultimoAdelanto)}</span>}
      </td>
      <td>
        <span className="flex items-center justify-end gap-1.5">
          {/* Con el rótulo sólo donde entra (≥1536 px); a 1280 el ícono con su nombre en el tooltip. */}
          <button
            type="button"
            onClick={onEntregar ?? onAdelanto}
            title="Entregar un adelanto"
            aria-label={`Entregarle un adelanto a ${b.nombre}`}
            className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl px-3 max-2xl:w-12 max-2xl:px-0" })}
          >
            <HandCoins className="h-4 w-4" aria-hidden /> <span className="max-2xl:sr-only">Entregar</span>
          </button>
          <ActionMenu label={`Más sobre ${b.nombre}`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" />
        </span>
      </td>
    </tr>
  );
}
