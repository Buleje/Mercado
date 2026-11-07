"use client";
/**
 * BorradorModal — el mensaje listo para UNA persona, editable, con su origen.
 *
 * Pie: [Copiar] [Recuérdame] [Abrir WhatsApp]. Nada se envía solo: WhatsApp se
 * abre con el texto y el dueño aprieta enviar. «Recuérdame» pasa a un segundo
 * paso (fecha + cómo irá el siguiente mensaje) antes de crear el recordatorio.
 * El siguiente NO se edita: ese día se redacta de nuevo con el saldo de ese día.
 * Si hay varios borradores, se recorren con ‹ › sin cerrar.
 */
import { useState } from "react";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Copy, Loader2, MessageCircle, Send, Sparkles } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { waLink } from "@/lib/whatsapp-link";
import { ETIQUETA_TIPO, fechaConDia, proximoViernes } from "@/lib/admin/comandos-ia/candidatos";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  cerrarSeguimiento,
  costoTexto,
  crearRecordatorio,
  datoDeFila,
  registrarRecibo,
  textoDeError,
  type Borrador,
  type MotivoSinIa,
} from "./use-mensajes";

export type AccionHecha = "enviado" | "recordado";

// Campo editable: «raised»; el siguiente mensaje (no editable) va en «sunken».
const CAMPO_TEXTO =
  "w-full resize-y rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const FLECHA = "inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40 sm:h-8 sm:w-8";

const MOTIVO: Record<Exclude<MotivoSinIa, null>, string> = {
  "sin-clave": "La IA no está conectada en tu negocio: usé la plantilla de siempre.",
  "no-respondio": "La IA no respondió a tiempo: usé la plantilla de siempre.",
  tope: "Llegaste al tope de IA de tu plan: usé la plantilla de siempre.",
  formato: "La IA devolvió algo que no servía: usé la plantilla de siempre.",
};

export default function BorradorModal({
  borradores, indice, onIndice, hoy, costoIaUsd, motivoSinIa, faltan = 0, onHecho, onCerrar,
}: {
  borradores: Borrador[];
  indice: number;
  onIndice: (n: number) => void;
  hoy: string;
  costoIaUsd: number;
  motivoSinIa: MotivoSinIa;
  /** Elegidos que ya no estaban en la bandeja al redactar (pagaron, se cerraron…). */
  faltan?: number;
  onHecho: (id: string, accion: AccionHecha) => void;
  onCerrar: () => void;
}) {
  const b = borradores[indice];
  const [textos, setTextos] = useState<Record<string, string>>({});
  // Recordatorio ya creado por persona: si el cierre del anterior falla, el
  // reintento no crea otro igual.
  const [creados, setCreados] = useState<Record<string, string>>({});
  // Paso, aviso y «Copiado» van atados a la persona: al pasar a otra con ‹ ›
  // se vuelve al mensaje sin efectos que reseteen estado.
  const [recordarEn, setRecordarEn] = useState<number | null>(null);
  const [copiadoEn, setCopiadoEn] = useState<number | null>(null);
  const [errorEn, setErrorEn] = useState<{ i: number; msg: string } | null>(null);
  const [fecha, setFecha] = useState(() => proximoViernes(hoy));
  const [guardando, setGuardando] = useState(false);

  if (!b) return null;
  const paso = recordarEn === indice ? "recordar" : "mensaje";
  const copiado = copiadoEn === indice;
  const error = errorEn?.i === indice ? errorEn.msg : null;
  const setPaso = (p: "mensaje" | "recordar") => setRecordarEn(p === "recordar" ? indice : null);
  const setError = (msg: string | null) => setErrorEn(msg ? { i: indice, msg } : null);
  const c = b.candidato;
  const texto = textos[b.id] ?? b.texto;
  const siguiente = b.siguiente;
  const enlace = waLink(c.telefono, texto);
  const costoUno = borradores.length > 0 ? costoIaUsd / borradores.length : 0;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoEn(indice);
      window.setTimeout(() => setCopiadoEn((v) => (v === indice ? null : v)), 1800);
    } catch {
      setError("Tu navegador no dejó copiar: selecciona el texto y cópialo a mano.");
    }
  };

  const abrirWhatsApp = () => {
    registrarRecibo({ tipo: "mensajes", resumen: `Mensaje a ${c.nombre} por WhatsApp (${ETIQUETA_TIPO[c.tipo].toLowerCase()})`, filas: 1, costoIaUsd: costoUno });
    onHecho(b.id, "enviado");
  };

  const recordar = async () => {
    setGuardando(true);
    setError(null);
    try {
      let nuevoId = creados[b.id];
      if (!nuevoId) {
        nuevoId = (await crearRecordatorio(c, fecha, siguiente)).id;
        const id = nuevoId;
        setCreados((m) => ({ ...m, [b.id]: id }));
      }
      // Un seguimiento que se reprograma cierra el anterior: queda uno solo vivo.
      if (c.tipo === "seguimiento" && c.recordatorioId) await cerrarSeguimiento(c.recordatorioId);
      registrarRecibo({ tipo: "recordatorio", resumen: `Recordatorio para ${c.nombre} el ${fechaConDia(fecha)}`, filas: 1, refId: nuevoId });
      onHecho(b.id, "recordado");
      setPaso("mensaje");
    } catch (err) {
      setError(textoDeError(err, "No pude crear el recordatorio."));
    } finally {
      setGuardando(false);
    }
  };

  // ‹ 1 de 10 › va en el cuerpo, junto al dato: en el pie (512 px) se comía la flecha «siguiente».
  const navegacion = borradores.length > 1 && (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[var(--text-secondary)]" data-borrador-nav>
      <button type="button" aria-label="Anterior" disabled={indice === 0} onClick={() => onIndice(indice - 1)} className={FLECHA}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="tabular-nums" aria-live="polite">{indice + 1} de {borradores.length}</span>
      <button type="button" aria-label="Siguiente" disabled={indice >= borradores.length - 1} onClick={() => onIndice(indice + 1)} className={FLECHA}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );

  const pie = paso === "mensaje" ? (
    <ModalFooter error={error}>
      <button type="button" onClick={copiar} className={`${BOTON_SECUNDARIO} max-sm:flex-1`}>
        {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copiado ? "Copiado" : "Copiar"}
      </button>
      <button type="button" onClick={() => setPaso("recordar")} className={`${BOTON_SECUNDARIO} max-sm:flex-1`}>
        <CalendarClock className="h-4 w-4" aria-hidden /> Recuérdame
      </button>
      {enlace ? (
        <a href={enlace} target="_blank" rel="noopener noreferrer" onClick={abrirWhatsApp} className={`${BOTON_PRIMARIO} max-sm:w-full`} data-wa-enlace>
          <Send className="h-4 w-4" aria-hidden /> Abrir WhatsApp
        </a>
      ) : (
        <button type="button" disabled className={`${BOTON_PRIMARIO} max-sm:w-full`} title="Agrega el teléfono del cliente para abrir WhatsApp">
          <Send className="h-4 w-4" aria-hidden /> Abrir WhatsApp
        </button>
      )}
    </ModalFooter>
  ) : (
    <ModalFooter error={error}>
      <button type="button" onClick={() => setPaso("mensaje")} className={`${BOTON_SECUNDARIO} max-sm:flex-1`} disabled={guardando}>Volver</button>
      <button type="button" onClick={recordar} className={`${BOTON_PRIMARIO} max-sm:flex-1`} disabled={guardando || !fecha || fecha <= hoy}>
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}
        Crear recordatorio
      </button>
    </ModalFooter>
  );

  return (
    <AdminModal
      open
      onClose={() => { if (!guardando) onCerrar(); }}
      title={paso === "mensaje" ? `Mensaje para ${c.nombre}` : `Recuérdame · ${c.nombre}`}
      icon={paso === "mensaje" ? MessageCircle : CalendarClock}
      footer={pie}
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">{ETIQUETA_TIPO[c.tipo]}</span>
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">{datoDeFila(c)}</span>
          <InfoTip title="De dónde sale cada dato" what={c.origen} affects="Lo leí de tu base al redactar; la IA nunca ve teléfonos ni montos." example="Saldo de hoy del fiado del 20/07 · vence 01/08" side="bottom" />
        </div>

        {paso === "mensaje" ? (
          <>
            {faltan > 0 && (
              <p className="text-xs font-semibold text-[var(--data-warning-ink)]" data-faltan>
                {faltan === 1 ? "1 de los que elegiste cambió" : `${faltan} de los que elegiste cambiaron`} desde que abriste la lista (pagó o se cerró): actualicé la lista.
              </p>
            )}
            {/* Rótulo + ‹ 1 de 10 › en una fila: los botones no van dentro de un <label>. */}
            <div>
              <div className="mb-1 flex min-h-8 items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                {b.conIa ? <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden /> : null}
                <span id="ci-borrador-rotulo">{b.conIa ? `Redactado con IA · ${costoTexto(costoUno)}` : "Plantilla de siempre"}</span>
                {!b.conIa && motivoSinIa ? <InfoTip title="Sin IA" what={MOTIVO[motivoSinIa]} affects="El mensaje lleva los mismos datos; solo cambia la redacción." side="bottom" /> : null}
                {navegacion}
              </div>
              <textarea
                value={texto}
                onChange={(e) => setTextos((t) => ({ ...t, [b.id]: e.target.value }))}
                rows={6}
                maxLength={1000}
                aria-labelledby="ci-borrador-rotulo"
                className={CAMPO_TEXTO}
                data-borrador
              />
            </div>
            {!c.telefono && (
              <p className="text-xs font-semibold text-[var(--data-warning-ink)]">
                Sin teléfono: agrégalo en Clientes para abrir WhatsApp. Igual puedes copiarlo.
              </p>
            )}
          </>
        ) : (
          <>
            <label className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">¿Cuándo?</span>
              <input
                type="date"
                value={fecha}
                min={hoy}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                data-fecha-recordatorio
              />
              {fecha > hoy && <span className="text-xs">{fechaConDia(fecha)}, 9:00</span>}
            </label>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                Ese día te lo dejo listo así
                <InfoTip title="El siguiente mensaje" what="Ese día vuelvo a mirar el saldo: si ya pagó, solo cierras el seguimiento; si no, lo redacto de nuevo con el saldo de ese día." affects="Por eso no se edita aquí: lo corriges ese día, antes de enviarlo." example="Viernes 16/10 · «Hola Rosa, te escribo de nuevo…»" side="bottom" />
              </p>
              <p className="whitespace-pre-line rounded-xl bg-[var(--surface-sunken)] p-3 text-sm leading-relaxed text-[var(--text-secondary)]" data-siguiente>
                {siguiente}
              </p>
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}
