"use client";

/**
 * «Entregar adelanto» (ADR-491): persona + monto + firma (+ huella) en un solo
 * paso, para registrar la plata en el momento en que sale del cajón. Antes, en
 * Blas, 0 de 8 adelantos tenían firma y se cargaban 3-11 días tarde; el cajero
 * que la entregaba recibía 403.
 *
 * Un solo scroll (persona → cuánto → firma) y el botón «Entregar S/ X» fijo al
 * pie, que dice qué falta si se aprieta antes de tiempo. En el celular es una
 * hoja que sube desde abajo (`AdminModal`). Se abre desde Adelantos (botón y
 * `?accion=nuevo`) y desde Caja › Caja de hoy.
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, FileSignature, HandCoins, Loader2, MessageCircle, Plus, RefreshCw, AlertTriangle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { montoConMoneda } from "@/lib/adelantos/comprobante";
import type { EntregarRespuesta, PersonaEntregar } from "@/lib/adelantos/entregar-tipos";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { logger } from "@/lib/logger";
import FirmaYHuella from "./FirmaYHuella";
import PasoPersona from "./PasoPersona";
import TecladoMonto from "./TecladoMonto";
import { useEntregarAdelanto, type EntregaAdelanto, type ExistenteConClave } from "./use-entregar-adelanto";

/** Caja › Caja de hoy: donde se abre la caja. */
export const HREF_CAJA_DE_HOY = hrefDeDestino({ tab: "ventas-caja", params: { vista: "caja-registradora", sub: "hoy" } });

const PRINCIPAL = button({
  variant: "primary",
  size: "xl",
  fullWidth: true,
  className: "h-14 rounded-xl aria-disabled:opacity-60 aria-disabled:cursor-not-allowed",
});
const SECUNDARIO = button({ variant: "secondary", size: "xl", fullWidth: true, className: "rounded-xl" });

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? n;

function AvisoCaja({ onIr }: { onIr: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl bg-[var(--data-warning-500)]/12 px-3 py-3" data-aviso-sin-caja>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
        Abre la caja primero: la plata sale del cajón.{" "}
        <EnlacePanel href={HREF_CAJA_DE_HOY} onClick={onIr} className="whitespace-nowrap font-bold">
          Ir a la caja
        </EnlacePanel>
      </p>
    </div>
  );
}

/** Ya entregado: qué quedó, la firma y el enlace (si se mandó a firmar). */
function Hecho({ e, r }: { e: EntregaAdelanto; r: EntregarRespuesta }) {
  const copiar = (url: string) =>
    void navigator.clipboard?.writeText(url).catch((err: unknown) => logger.warn("[adelantos] no se pudo copiar el enlace", { error: String(err) }));
  return (
    <div className="space-y-3" data-entrega-hecha>
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-[var(--data-success-500)]/12 px-4 py-4">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            {r.adelanto.codigoOperacion ? `${r.adelanto.codigoOperacion} · ` : ""}
            {/* «S/ 120.00» partido en dos renglones no se lee como plata. */}
            <span className="whitespace-nowrap">{montoConMoneda(r.adelanto.monto, r.adelanto.moneda)}</span> entregados a {primerNombre(r.adelanto.persona)}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {/* Repetido: la caja la movió la 1.ª vez; sólo se dice si la respuesta lo trae. */}
            {r.repetido
              ? `Ya estaba registrado: no se entregó dos veces.${r.caja && "movimientoId" in r.caja ? " Salió de la caja de hoy." : ""}`
              : r.caja && "movimientoId" in r.caja
                ? "Salió de la caja de hoy."
                : "No movió la caja."}
          </p>
        </div>
      </div>

      {e.firmaPendiente ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--data-warning-500)]/12 px-4 py-3" data-firma-no-guardada>
          <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
            La plata quedó registrada, pero la firma no se guardó.
          </p>
          <button type="button" onClick={() => void e.reintentarFirma()} aria-disabled={e.reintentando} className={button({ variant: "primary", className: "rounded-xl" })} data-reintentar-firma>
            {e.reintentando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Reintentar firma
          </button>
        </div>
      ) : e.huellaPerdida ? (
        <p role="alert" className="text-sm font-semibold text-[var(--data-warning-ink)]">
          La firma quedó guardada, pero la huella no: agrégala desde la ficha del adelanto.
        </p>
      ) : r.firma?.guardada ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <FileSignature className="h-4 w-4 shrink-0" aria-hidden />
          Firma guardada{r.huella?.guardada ? " con su huella" : ""} en el registro del adelanto.
        </p>
      ) : null}

      {e.enlace && (
        <div className="space-y-2 rounded-2xl border border-[var(--rule-base)] px-4 py-3" data-enlace-firma>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Enlace para firmar listo: vale 48 horas y un solo uso.</p>
          <div className="flex flex-wrap gap-2">
            {e.enlace.whatsapp && (
              <a href={e.enlace.whatsapp} target="_blank" rel="noopener noreferrer" className={button({ variant: "primary", className: "rounded-xl" })}>
                <MessageCircle className="h-4 w-4" aria-hidden /> Mandar por WhatsApp
              </a>
            )}
            <button type="button" onClick={() => copiar(e.enlace?.url ?? "")} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <Copy className="h-4 w-4" aria-hidden /> Copiar enlace
            </button>
          </div>
        </div>
      )}
      {e.avisoEnlace && <p role="alert" className="text-sm font-semibold text-[var(--data-warning-ink)]">{e.avisoEnlace}</p>}
    </div>
  );
}

/** Cerrar con algo anotado (un toque afuera, Escape, la X): se pregunta en el pie, que siempre se ve. */
function ConfirmarSalida({ onSeguir, onSalir }: { onSeguir: () => void; onSalir: () => void }) {
  const seguir = useRef<HTMLButtonElement>(null);
  useEffect(() => seguir.current?.focus(), []);
  return (
    <div role="alertdialog" aria-labelledby="entregar-salir-texto" className="space-y-2" data-confirmar-salida>
      <p id="entregar-salir-texto" className="text-sm font-semibold text-[var(--text-primary)]">
        ¿Salir sin entregar? Se pierde lo que anotaste (y la firma).
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={onSalir} className={SECUNDARIO}>
          Salir sin entregar
        </button>
        <button ref={seguir} type="button" onClick={onSeguir} className={button({ variant: "primary", size: "xl", fullWidth: true, className: "rounded-xl" })}>
          Seguir aquí
        </button>
      </div>
    </div>
  );
}

/** 422 `idempotencia_distinta`: esta clave ya tiene un adelanto. Se muestra cuál; otra clave, sólo a propósito. */
function YaRegistrado({ x }: { x: ExistenteConClave | null }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl bg-[var(--data-warning-500)]/12 px-4 py-4" data-ya-registrado>
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-base font-extrabold text-[var(--text-primary)]">
          {x ? (
            <>
              Ya se registró {x.codigoOperacion ? `${x.codigoOperacion} · ` : ""}
              <span className="whitespace-nowrap">{montoConMoneda(x.monto, x.moneda)}</span> a {primerNombre(x.persona)}
            </>
          ) : (
            "Ya se registró una entrega desde esta pantalla"
          )}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          La respuesta anterior se cortó, pero esa entrega quedó. Si es la misma plata, ya está: no la entregues de nuevo.
        </p>
      </div>
    </div>
  );
}

function Pie({ e, onCerrar }: { e: EntregaAdelanto; onCerrar: () => void }) {
  if (e.fase === "existente") {
    return (
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={e.esOtraEntrega} className={SECUNDARIO} data-es-otra-entrega>
          Es otra entrega
        </button>
        <button type="button" onClick={onCerrar} className={button({ variant: "primary", size: "xl", fullWidth: true, className: "rounded-xl" })}>
          <CheckCircle2 className="h-5 w-5" aria-hidden /> Listo, es la misma
        </button>
      </div>
    );
  }
  if (e.fase === "hecho") {
    return (
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={() => void e.bajarRecibo()} className={SECUNDARIO} data-bajar-recibo>
          <Download className="h-5 w-5" aria-hidden /> Bajar recibo
        </button>
        <button type="button" onClick={e.otro} className={button({ variant: "primary", size: "xl", fullWidth: true, className: "rounded-xl" })} data-otro-adelanto>
          <Plus className="h-5 w-5" aria-hidden /> Otro adelanto
        </button>
      </div>
    );
  }
  const guardando = e.fase === "guardando";
  const etiqueta = e.incierto ? `Reintentar entrega de ${montoConMoneda(e.monto)}` : e.monto > 0 ? `Entregar ${montoConMoneda(e.monto)}` : "Entregar";
  /* «Mandar a firmar» sólo para quien gestiona Adelantos, sin firma en pantalla. */
  const puedeMandar = !!e.ctx && !e.ctx.restringido && !e.firmaObligatoria && !e.hayFirma && !e.huella && !e.incierto;
  return (
    <div className="space-y-2">
      {e.mostrarFalta && (
        <p role="status" className="text-sm font-semibold text-[var(--data-warning-ink)]" data-falta>
          {e.mostrarFalta}
        </p>
      )}
      <button
        type="button"
        onClick={() => void e.entregar()}
        aria-disabled={guardando || !!e.falta}
        aria-busy={guardando}
        className={PRINCIPAL}
        data-entregar
      >
        {guardando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : e.incierto ? <RefreshCw className="h-5 w-5" aria-hidden /> : <HandCoins className="h-5 w-5" aria-hidden />}
        {guardando ? "Entregando…" : etiqueta}
      </button>
      {e.incierto && !guardando && (
        <button type="button" onClick={e.descartarPendiente} className={SECUNDARIO} title="Sólo si estás seguro de que la plata no salió del cajón" data-descartar-pendiente>
          No la entregué: descartar
        </button>
      )}
      {puedeMandar && (
        <button
          type="button"
          onClick={() => void e.entregar({ mandarAFirmar: true })}
          aria-disabled={guardando || !!e.faltaPlata}
          className={`${SECUNDARIO} aria-disabled:opacity-60`}
          data-entregar-y-mandar
        >
          <MessageCircle className="h-5 w-5" aria-hidden /> Entregar y mandar a firmar por WhatsApp
        </button>
      )}
    </div>
  );
}

export default function EntregarAdelantoModal({
  onClose,
  personaInicial = null,
  onEntregado,
}: {
  onClose: () => void;
  personaInicial?: PersonaEntregar | null;
  onEntregado?: (r: EntregarRespuesta | null) => void;
}) {
  const e = useEntregarAdelanto({ personaInicial, onEntregado });
  const [preguntando, setPreguntando] = useState(false);
  /* Un toque afuera con la firma a medio hacer la perdía: con algo anotado, primero se pregunta. */
  /* Sin confirmar no se pierde nada al cerrar: queda recordada y se retoma al volver a abrir. */
  const anotado = e.fase === "armando" && !e.incierto && (e.trazos.length > 0 || e.monto > 0 || e.huella != null);
  const cerrar = () => {
    if (e.fase === "guardando") return;
    if (anotado && !preguntando) return setPreguntando(true);
    onClose();
  };
  const sinCaja = (!!e.ctx?.restringido && !e.ctx.cajaAbierta) || e.error?.codigo === "sin_caja";

  return (
    <AdminModal open onClose={cerrar} title="Entregar adelanto" icon={HandCoins} footer={preguntando && anotado ? <ConfirmarSalida onSeguir={() => setPreguntando(false)} onSalir={onClose} /> : <Pie e={e} onCerrar={onClose} />} claveVentana="entregar-adelanto">
      <div className={`${MODAL_BODY} space-y-6`} data-entregar-adelanto>
        {e.fase === "existente" ? (
          <YaRegistrado x={e.existente} />
        ) : e.fase === "hecho" && e.respuesta ? (
          <Hecho e={e} r={e.respuesta} />
        ) : (
          <>
            {sinCaja && <AvisoCaja onIr={onClose} />}
            <PasoPersona e={e} />
            <TecladoMonto e={e} />
            {e.persona && <FirmaYHuella e={e} />}
          </>
        )}
        {e.error && e.error.codigo !== "sin_caja" && (
          <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]" data-error-entrega>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e.error.texto}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
