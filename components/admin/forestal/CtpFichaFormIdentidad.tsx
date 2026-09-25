"use client";

/**
 * CtpFichaFormIdentidad — identidad del centro + el bloque de registro de la
 * **carátula del Libro** (Anexo 1 de la RDE N° D000025-2023-MIDAGRI-SERFOR-DE).
 *
 * La carátula pide DOS números distintos que antes acá eran uno solo: el
 * «N° Registro del libro de operaciones» (el que la ARFFS le da al libro, "001"
 * en el ejemplo oficial) y el «N° de autorización o registro» (el del
 * establecimiento, "RD-SD-549"). Con un solo campo, uno de los dos casilleros
 * salía en blanco o con el número del otro.
 */

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
} from "@buleje/design-system/icons";
import { Field, I } from "./ctp-shared";
import CtpParteLogo from "./CtpParteLogo";
import { NotaCampo, BloqueCampos, type CamposFichaProps } from "./ctp-ficha-form";
import { CTP_TIPOS_ESTABLECIMIENTO, rucValido } from "@/lib/forestal/ctp-ficha-types";

/** Estado de la última consulta al padrón de SUNAT (nunca bloquea el guardado). */
export interface EstadoPadron {
  estado: "idle" | "cargando" | "ok" | "aviso" | "error";
  mensaje: string | null;
}

export default function CtpFichaFormIdentidad({
  draft,
  set,
  padron,
  onConsultarSunat,
  onRucEditado,
}: CamposFichaProps & {
  padron: EstadoPadron;
  onConsultarSunat: () => void;
  onRucEditado: () => void;
}) {
  // El RUC sale impreso en el certificado y en el Libro: si el dígito
  // verificador no cierra, el fiscalizador lo cruza contra SUNAT y el documento
  // queda observado. Se avisa mientras se tipea, sin bloquear el guardado
  // (puede estar a medio escribir, y un RUC raro no es motivo para perder todo).
  const rucSospechoso = draft.ruc.length === 11 && !rucValido(draft.ruc);

  return (
    <>
      <BloqueCampos title="Identidad del centro" icon={Building2}>
        <Field label="Nombre del CTP" required>
          <input
            className={I}
            value={draft.nombreCtp}
            onChange={(e) => set("nombreCtp", e.target.value)}
            placeholder="Aserradero San Martín"
          />
        </Field>
        <Field label="Código de CTP" required hint="Asignado por la ARFFS">
          <input
            className={I}
            value={draft.codigoCtp}
            onChange={(e) => set("codigoCtp", e.target.value)}
            placeholder="CTP-25-000123"
          />
        </Field>
        <Field
          label="RUC"
          required
          hint={rucSospechoso || padron.mensaje ? undefined : "11 dígitos · se puede traer de SUNAT"}
        >
          <div className="flex gap-2">
            <input
              className={I}
              value={draft.ruc}
              onChange={(e) => {
                set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11));
                onRucEditado();
              }}
              inputMode="numeric"
              placeholder="20512345671"
              aria-label="RUC"
              aria-invalid={rucSospechoso}
            />
            <button
              type="button"
              onClick={onConsultarSunat}
              disabled={draft.ruc.length !== 11 || padron.estado === "cargando"}
              title="Traer razón social y domicilio fiscal del padrón de SUNAT"
              className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              {padron.estado === "cargando" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}{" "}
              SUNAT
            </button>
          </div>
          {rucSospechoso && (
            <NotaCampo tono="aviso" icono={AlertTriangle}>
              Ese RUC no pasa la verificación de SUNAT (dígito verificador). Revisa que no falte o
              sobre un número.
            </NotaCampo>
          )}
          {padron.mensaje && (
            <NotaCampo
              tono={padron.estado === "ok" ? "ok" : padron.estado === "aviso" ? "aviso" : "error"}
              icono={padron.estado === "ok" ? CheckCircle2 : AlertTriangle}
            >
              {padron.mensaje}
            </NotaCampo>
          )}
        </Field>
        <Field label="Razón social" required hint="Titular del CTP, tal como figura en SUNAT">
          <input
            className={I}
            value={draft.razonSocial}
            onChange={(e) => set("razonSocial", e.target.value)}
            placeholder="Maderera San Martín S.A.C."
          />
        </Field>
        {/* El logo es del CENTRO: encabeza la guía de salida, el certificado
            y todo lo que emite el CTP con su nombre. La carátula del Libro lo
            pide "en caso se cuente", así que nunca cuenta como faltante. */}
        <Field label="Logo del CTP" hint="Va en el membrete de la guía de salida y sus anexos">
          <CtpParteLogo logo={draft.logo ?? ""} onCambio={(logo) => set("logo", logo)} />
        </Field>
      </BloqueCampos>

      <BloqueCampos
        title="Registro ante la autoridad forestal (ARFFS)"
        icon={CheckCircle2}
        hint="Los cuatro primeros son casilleros de la carátula del Libro (Anexo 1 de la RDE D000025-2023)."
      >
        <Field label="ARFFS competente">
          <input
            className={I}
            value={draft.arffs}
            onChange={(e) => set("arffs", e.target.value)}
            placeholder="GORE Ucayali · DRSAFFS"
          />
        </Field>
        <Field
          label="N° Registro del libro de operaciones"
          hint="El que la ARFFS le dio al libro. En el ejemplo oficial es «001»"
        >
          <input
            className={I}
            value={draft.registroLibro}
            onChange={(e) => set("registroLibro", e.target.value)}
            placeholder="001"
          />
        </Field>
        <Field
          label="N° de autorización o registro"
          hint="El del establecimiento del centro, no el del libro"
        >
          <input
            className={I}
            value={draft.registroArffs}
            onChange={(e) => set("registroArffs", e.target.value)}
            placeholder="RD-SD-549"
          />
        </Field>
        <Field label="Fecha de registro">
          <input
            type="date"
            className={I}
            value={draft.registroArffsFecha}
            onChange={(e) => set("registroArffsFecha", e.target.value)}
          />
        </Field>
        <Field
          label="N° del establecimiento anexo"
          hint="Con un solo local, siempre «001»"
        >
          <input
            className={I}
            value={draft.establecimientoAnexo}
            onChange={(e) => set("establecimientoAnexo", e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="001"
          />
        </Field>
        {/* Lista cerrada: la carátula sólo acepta una de las siete etiquetas
            con las que el local figura en SUNAT. */}
        <Field label="Tipo de establecimiento" hint="Como figura ese local en SUNAT">
          <select
            className={I}
            value={draft.tipoEstablecimiento}
            onChange={(e) => set("tipoEstablecimiento", e.target.value)}
          >
            <option value="">Elegir…</option>
            {CTP_TIPOS_ESTABLECIMIENTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Serie GTF autorizada" hint="Serie del talonario de GTF de salida">
          <input
            className={I}
            value={draft.gtfSerie}
            onChange={(e) => set("gtfSerie", e.target.value.toUpperCase().slice(0, 20))}
            placeholder="GTF-001"
          />
        </Field>
      </BloqueCampos>
    </>
  );
}
