"use client";

/**
 * Bloque 5 del alta: con qué queda respaldada la plata — recibo de papel,
 * motivo, foto, permiso, pies tablares y las preguntas propias del negocio.
 *
 * Plegable y recordado (regla de la casa: plegar no esconde el dato — plegado
 * dice en una línea qué quedó cargado). La foto va arriba y a la vista: en el
 * modal viejo el comprobante estaba escondido al fondo de la tercera columna.
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { SeccionForm } from "@/components/admin/shared/SeccionForm";
import CamposPersonalizados from "@/components/admin/shared/CamposPersonalizados";
import SelectorContrato from "@/components/admin/forestal/SelectorContrato";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { tenantCacheKey } from "@/lib/tenant-cache";
import CapturaFoto from "../CapturaFoto";
import { FORMULARIO_ADELANTO, type AltaAdelanto } from "../hooks/use-alta-adelanto";
import { cn } from "@/lib/utils";
import { Field, fmtPt, inputCls } from "../shared";
import { Comprobante, NotasRapidas, PiesTablares } from "./campos-respaldo";
import { CLASE_BLOQUE } from "./piezas";

/**
 * Los motivos que se repiten, a un toque. En el navegador porque son de quien
 * atiende, no del negocio — pero con `tenantCacheKey`: un superadmin que pasa
 * de un negocio a otro en la misma pestaña no ve las notas del primero.
 */
const NOTAS_KEY = "buleje:adelantos-notas-rapidas";
const NOTAS_POR_DEFECTO = ["Adelanto de sueldo", "Compra de insumos", "Emergencia familiar", "Adelanto por cosecha", "Pago de flete"];

function leerNotasRapidas(): string[] {
  if (typeof window === "undefined") return NOTAS_POR_DEFECTO;
  try {
    const arr: unknown = JSON.parse(window.localStorage.getItem(tenantCacheKey(NOTAS_KEY)) ?? "null");
    return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : NOTAS_POR_DEFECTO;
  } catch {
    return NOTAS_POR_DEFECTO;
  }
}

export default function BloqueRespaldo({
  alta,
  firmar = false,
  onFirmar,
}: {
  alta: AltaAdelanto;
  /** «Firmar el recibo en la pantalla al guardar» (08-10): lo recuerda el modal del alta. */
  firmar?: boolean;
  onFirmar?: (v: boolean) => void;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>("buleje:adelantos-alta-respaldo-abierto", true);
  const [notasRapidas, setNotasRapidas] = useState<string[]>(leerNotasRapidas);
  const [conCamara, setConCamara] = useState(false);
  const { modo } = alta;
  const creaAdelanto = modo !== "abono";

  const cargado = [
    alta.reciboManual.trim() && `Recibo ${alta.reciboManual.trim()}`,
    alta.notas.trim() && "Motivo",
    alta.comprobante && !(modo === "abono" && alta.abono.sinFoto) && "Foto",
    creaAdelanto && alta.contratoId && "Permiso",
    creaAdelanto && firmar && onFirmar && "Firma al guardar",
    modo === "dar" && Number(alta.piesTablares) > 0 && fmtPt(Number(alta.piesTablares)),
  ].filter(Boolean) as string[];

  const guardarOpciones = (nuevas: string[]) => {
    setNotasRapidas(nuevas);
    try {
      window.localStorage.setItem(tenantCacheKey(NOTAS_KEY), JSON.stringify(nuevas));
    } catch {
      // sin persistencia, sin bug: la sesión igual las usa
    }
  };

  return (
    <SeccionForm
      numero={5}
      titulo="Respaldo"
      titular="tarjeta"
      columnas="libre"
      className={CLASE_BLOQUE}
      info={{
        what: "El papel y la foto que prueban la entrega, el motivo y, si corresponde, el permiso.",
        affects: "El N° de recibo se busca igual que el código ADL. La foto queda en la ficha del adelanto.",
        example: "Firmó el recibo 001-04578: escribes el número y le tomas la foto al papel.",
      }}
      accion={
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          {abierto ? "Plegar" : "Mostrar"}
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </button>
      }
    >
      {!abierto ? (
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{cargado.length ? cargado.join(" · ") : "Nada cargado todavía."}</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="N° de recibo de papel (opcional)">
                <input
                  value={alta.reciboManual}
                  onChange={(e) => alta.setReciboManual(e.target.value)}
                  maxLength={60}
                  placeholder="Ej. 001-04578"
                  className={`${inputCls} tabular-nums`}
                />
              </Field>
              <Field label="Motivo o notas (opcional)">
                <textarea
                  value={alta.notas}
                  onChange={(e) => alta.setNotas(e.target.value)}
                  /* El reparto va por Liquidar, que guarda hasta 500 letras (ADR-413). */
                  maxLength={alta.abono.sinFoto && modo === "abono" ? 500 : 1000}
                  rows={2}
                  placeholder={modo === "dar" ? "Para qué es la plata…" : modo === "servicio" ? "Ej. aserrío de 3 462 pt a 0,50" : "Qué se acordó…"}
                  className={cn(inputCls, "h-auto py-3")}
                />
              </Field>
              {modo === "dar" && (
                <NotasRapidas
                  opciones={notasRapidas}
                  onElegir={(t) => alta.setNotas((n) => (n.trim() ? `${n.trim()} · ${t}` : t))}
                  onCambiarOpciones={guardarOpciones}
                />
              )}
            </div>
            <div className="space-y-3">
              {modo === "abono" && alta.abono.sinFoto ? (
                /* Repartido entre varios va por Liquidar, que no guarda esta foto:
                   se dice en vez de perderla callada (revisión 28-09). */
                <p className="rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-secondary)]">
                  Repartido entre varios, la foto no se guarda: elige «Elegir uno» si quieres adjuntarla.
                </p>
              ) : (
                <Field label="Foto del recibo o comprobante (opcional)" grupo>
                  <Comprobante url={alta.comprobante} onChange={alta.setComprobante} onAbrirCamara={() => setConCamara(true)} />
                </Field>
              )}
              {creaAdelanto && onFirmar && (
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={firmar}
                    onChange={(e) => onFirmar(e.target.checked)}
                    data-firmar-al-guardar
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-[var(--text-primary)]">Firmar el recibo en la pantalla al guardar</span>
                    <span className="block text-sm text-[var(--text-secondary)]">La persona firma con el dedo; la hoja queda como foto del adelanto.</span>
                  </span>
                </label>
              )}
              {creaAdelanto && (
                <SelectorContrato
                  id="adelanto-contrato"
                  value={alta.contratoId}
                  onChange={alta.setContratoId}
                  hint="Elígelo si esta plata corresponde a un permiso."
                />
              )}
              {modo === "dar" && (
                <PiesTablares
                  cantidad={alta.piesTablares}
                  tipo={alta.piesTablaresTipo}
                  onCambiarCantidad={alta.setPiesTablares}
                  onCambiarTipo={alta.setPiesTablaresTipo}
                />
              )}
            </div>
          </div>

          {/* Lo que este negocio anota de un adelanto y el formulario no pregunta (ADR-427). */}
          {creaAdelanto && (
            <CamposPersonalizados
              formulario={FORMULARIO_ADELANTO}
              registroId={null}
              etiquetaFormulario="adelantos"
              pendientes={alta.camposPendientes}
              onPendientes={alta.setCamposPendientes}
            />
          )}
        </div>
      )}
      {conCamara && <CapturaFoto onSubida={alta.setComprobante} onCerrar={() => setConCamara(false)} />}
    </SeccionForm>
  );
}
