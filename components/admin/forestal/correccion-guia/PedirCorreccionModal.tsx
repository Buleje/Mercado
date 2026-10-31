"use client";

/**
 * «Pedir corrección» de una guía EMITIDA (ADR-512, opción A de Brandon 23-10):
 * la guía no se edita; el pedido va a la bandeja de soporte del superadmin,
 * que si corresponde la anula y la emite de nuevo.
 *
 * Varios cambios en un pedido (hasta 20): cada uno dice qué casillero o troza,
 * lo que dice hoy y lo que debería decir. Motivo obligatorio y una foto o PDF
 * de evidencia opcional (va a los papeles de la guía). La lógica del pedido es
 * pura (`correccion-form`); el envío, `usePedirCorreccion`.
 */

import { useMemo, useState } from "react";
import { FileWarning, Loader2, Paperclip, Plus, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EntityTypeCorreccion, SolicitudCorreccionDTO } from "@/lib/soporte/correccion-guia";
import { Btn, I, useCierreSeguro } from "../ctp-shared";
import { usePedirCorreccion, validarEvidencia } from "../hooks/use-pedir-correccion";
import CambioFila from "./CambioFila";
import { armarPedido, lineaDeLaClave, lineaVacia, MAX_CAMBIOS, MOTIVO_MAX, type ErroresPedido, type LineaCambio } from "./correccion-form";
import type { OpcionCorregible } from "./opciones-de-la-guia";

export interface GuiaACorregir {
  entityType: EntityTypeCorreccion;
  entityId: string;
  gtfNumber: string;
}

const SIN_ERRORES: ErroresPedido = { lineas: {} };

export default function PedirCorreccionModal({
  guia,
  opciones,
  cargando = false,
  aboveModals = false,
  onClose,
  onEnviada,
}: {
  guia: GuiaACorregir;
  opciones: readonly OpcionCorregible[];
  /** La vista previa de los casilleros todavía se arma (p. ej. falta la carátula). */
  cargando?: boolean;
  /** Se abre desde otro modal («Datos de la GTF»). */
  aboveModals?: boolean;
  onClose: () => void;
  onEnviada: (s: SolicitudCorreccionDTO) => void;
}) {
  const [lineas, setLineas] = useState<LineaCambio[]>(() => [lineaVacia()]);
  const [motivo, setMotivo] = useState("");
  const [evidencia, setEvidencia] = useState<File | null>(null);
  const [errores, setErrores] = useState<ErroresPedido>(SIN_ERRORES);
  const [error, setError] = useState<string | null>(null);
  const { enviar, enviando } = usePedirCorreccion();

  const hayCambios = motivo.trim() !== "" || !!evidencia || lineas.some((l) => l.opcion || l.correcto.trim());
  const cerrar = useCierreSeguro(hayCambios && !enviando, onClose);
  const usadas = useMemo(() => new Set(lineas.map((l) => l.opcion).filter(Boolean)), [lineas]);
  const grupoItems = guia.entityType === "loth_gtf" ? "Trozas" : "Líneas del despacho";

  const cambiar = (l: LineaCambio) => setLineas((ls) => ls.map((x) => (x.id === l.id ? l : x)));
  const quitar = (id: string) => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== id) : ls));

  async function mandar() {
    setError(null);
    const errEvidencia = validarEvidencia(evidencia);
    if (errEvidencia) {
      setError(errEvidencia);
      return;
    }
    const armar = (documentoIds: readonly string[]) => {
      const r = armarPedido({ ...guia, lineas, motivo, opciones, documentoIds });
      setErrores(r.ok ? SIN_ERRORES : r.errores);
      if (!r.ok && r.errores.general) setError(r.errores.general);
      return r.ok ? r.body : null;
    };
    const r = await enviar({ gtfNumber: guia.gtfNumber, evidencia, armar });
    if (!r) return;
    if (r.ok) return onEnviada(r.solicitud);
    const fila = r.clave ? lineaDeLaClave(lineas, r.donde, r.clave) : null;
    if (fila) setErrores({ lineas: { [fila]: { opcion: r.mensaje } } });
    setError(fila ? "Revisa el cambio marcado: la guía no tiene eso." : r.mensaje);
  }

  return (
    <AdminModal
      open
      onClose={() => void cerrar()}
      size="lg"
      aboveModals={aboveModals}
      title={`Pedir corrección de la GTF ${guia.gtfNumber}`}
      icon={FileWarning}
      claveVentana="gtf-pedir-correccion"
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={() => void cerrar()} disabled={enviando}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={() => void mandar()} disabled={enviando || cargando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileWarning className="h-4 w-4" aria-hidden />}
            {enviando ? "Mandando…" : "Mandar pedido"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          Una guía emitida no se edita: la plataforma revisa tu pedido y, si corresponde, la anula y la emite de nuevo.{" "}
          <InfoTip
            title="Pedir corrección"
            ariaLabel="Cómo funciona el pedido de corrección"
            what="Eliges qué casillero o troza está mal y escribes lo que debería decir. Puedes pedir varios cambios a la vez."
            affects="La guía sigue igual mientras tanto. En su fila ves el estado del pedido y, cuando vuelve, la respuesta."
            example="(28) Placa: hoy dice «AHX-812», debería decir «AHX-821». Motivo: el chofer cambió de camión."
          />
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo los casilleros de la guía…
          </p>
        ) : (
          <ol className="space-y-2" aria-label="Cambios que pides">
            {lineas.map((l, i) => (
              <CambioFila
                key={l.id}
                n={i + 1}
                linea={l}
                opciones={opciones}
                usadas={usadas}
                grupoItems={grupoItems}
                error={errores.lineas[l.id]}
                onCambiar={cambiar}
                onQuitar={lineas.length > 1 ? () => quitar(l.id) : undefined}
              />
            ))}
          </ol>
        )}
        <Btn
          variant="secondary"
          onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
          disabled={lineas.length >= MAX_CAMBIOS || cargando}
          title={lineas.length >= MAX_CAMBIOS ? `Hasta ${MAX_CAMBIOS} cambios por pedido` : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden /> Agregar otro cambio
        </Btn>

        <label className="block">
          <span className="block text-sm font-semibold text-[var(--text-secondary)]">Motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={MOTIVO_MAX}
            rows={3}
            aria-invalid={!!errores.motivo}
            placeholder="p. ej. Al emitirla se copió mal la placa; el camión que salió es el AHX-821."
            className={`${I} mt-1 h-auto py-2.5`}
          />
          {errores.motivo && (
            <span className="mt-1 block text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errores.motivo}</span>
          )}
        </label>

        <div>
          <span className="block text-sm font-semibold text-[var(--text-secondary)]">Evidencia (opcional)</span>
          {evidencia ? (
            <span className="mt-1 flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)]">
              <Paperclip className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{evidencia.name}</span>
              <button
                type="button"
                onClick={() => setEvidencia(null)}
                aria-label="Quitar la evidencia"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </span>
          ) : (
            <label className="mt-1 flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--rule-strong)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
              <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
              Adjuntar foto o PDF (se guarda en los papeles de la guía)
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => setEvidencia(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
