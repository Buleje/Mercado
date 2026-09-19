"use client";

/**
 * CtpFichaReadView — la Ficha del CTP como la lee un fiscalizador.
 *
 * Antes esto era una grilla de pares "label: valor" y los problemas graves
 * salían como chips de 10px al lado del código: un título habilitante VENCIDO
 * —que invalida el origen de toda la madera que ampara— se veía igual que el
 * resto de la línea. Ahora lo que rompe un documento se lee primero, con la
 * consecuencia escrita, y los datos duros van en un carnet que se puede copiar
 * de un toque para pegarlos en el SNIFFS.
 */

import { useState } from "react";
import {
  AlertCircle, AlertTriangle, Building2, CheckCircle2, FileText, MapPin, Pencil, ShieldCheck,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import CtpFichaPreviewGtf from "./CtpFichaPreviewGtf";
import CtpFichaCompletitud from "./CtpFichaCompletitud";
import Carnet from "./CtpFichaCarnet";
import {
  avisosDeFicha, coordenadasUtmLinea, estadoVencimiento, fechaCortaUTC, tituloDeGuia, tituloTipoLabel,
  type AvisoFicha, type CtpFicha, type CtpTituloHabilitante,
} from "@/lib/forestal/ctp-ficha-types";

function PanelAvisos({ avisos, onEditar }: { avisos: AvisoFicha[]; onEditar?: () => void }) {
  if (avisos.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-4 text-sm text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div><strong>Ficha en regla.</strong> La GTF de salida, el certificado de trazabilidad y el export del Libro salen completos y con los títulos vigentes.</div>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {avisos.map((a) => {
        const critico = a.nivel === "critico";
        return (
          <li
            key={a.clave}
            className={`flex items-start gap-3 rounded-xl border-2 p-4 ${critico
              ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12"
              : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12"}`}
          >
            {critico
              ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" aria-hidden />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${critico ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>{a.titulo}</p>
              <p className={`mt-0.5 text-sm ${critico ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>{a.detalle}</p>
            </div>
            {onEditar && (
              <button
                type="button"
                onClick={onEditar}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-2 bg-[var(--surface-raised)] px-3 text-sm font-bold ${critico
                  ? "border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                  : "border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Arreglar
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Un casillero de la GTF: se nombra por su número porque así lo pide el que
 *  revisa el papel en un puesto de control. Vacío se ve VACÍO, no con un guion
 *  que parezca declarado. */
function Casillero({ n, label, valor }: { n: string; label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
        <span className="font-mono">({n})</span> {label}
      </div>
      {valor
        ? <div className="mt-0.5 break-words text-sm text-[var(--text-primary)]">{valor}</div>
        : <div className="mt-0.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">sale en blanco en la guía</div>}
    </div>
  );
}

function ChipVigencia({ vencimiento }: { vencimiento: string }) {
  const estado = estadoVencimiento(vencimiento);
  if (!vencimiento) return <span className="text-sm text-[var(--text-tertiary)]">sin fecha de vencimiento</span>;
  const clase = estado === "vencido"
    ? "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"
    : estado === "por_vencer"
      ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
      : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  const texto = estado === "vencido" ? "Vencido el" : estado === "por_vencer" ? "Vence el" : "Vigente hasta";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-xs)] font-bold ${clase}`}>
      {estado === "vigente" ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
      {texto} {fechaCortaUTC(vencimiento)}
    </span>
  );
}

function TituloCard({ t, esDeGuia }: { t: CtpTituloHabilitante; esDeGuia: boolean }) {
  const vencido = estadoVencimiento(t.vencimiento) === "vencido";
  return (
    <li className={`rounded-xl border-2 p-3.5 ${vencido ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : "border-[var(--rule-base)] bg-[var(--surface-canvas)]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)]">{tituloTipoLabel(t.tipo)}</span>
          {esDeGuia && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent-dark)] dark:bg-[var(--accent)]/15 dark:text-[var(--accent)]"
              title="Es el que cada guía de salida propone. En el formulario de la guía se puede elegir otro; para cambiar el predeterminado, entra a editar y súbelo."
            >
              <FileText className="h-3.5 w-3.5" aria-hidden /> Predeterminado en la GTF
            </span>
          )}
        </div>
        <ChipVigencia vencimiento={t.vencimiento} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Casillero n="6" label="N° del título habilitante" valor={t.codigo} />
        <Casillero n="8" label="N° de resolución" valor={t.resolucion} />
        <Casillero n="9" label="Plan de manejo" valor={t.planManejo} />
      </div>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--rule-soft)] py-2.5 last:border-0">
      <span className="text-sm font-medium text-[var(--text-tertiary)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{value || "—"}</span>
    </div>
  );
}

function Card({ titulo, icono: Icono, children }: { titulo: string; icono: typeof Building2; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <CardTitle as="h3" className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Icono className="h-4 w-4" aria-hidden /> {titulo}
      </CardTitle>
      {children}
    </div>
  );
}

export default function CtpFichaReadView({ ficha: f, onEditar }: { ficha: CtpFicha; onEditar?: () => void }) {
  const [verGtf, setVerGtf] = useState(false);
  const avisos = avisosDeFicha(f);
  const deGuia = tituloDeGuia(f);

  return (
    <div className="space-y-4">
      <Carnet f={f} avisos={avisos} />
      <PanelAvisos avisos={avisos} onEditar={onEditar} />
      <CtpFichaCompletitud ficha={f} onEditar={onEditar} />

      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Títulos habilitantes
          </CardTitle>
          <button
            type="button"
            onClick={() => setVerGtf(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <FileText className="h-4 w-4" aria-hidden /> Ver cómo sale la guía
          </button>
        </div>
        <p className="mb-3 text-sm text-[var(--text-tertiary)]">
          El origen legal de la materia prima. Los casilleros (5), (6), (8) y (9) de la guía salen del título marcado, salvo que en esa guía se elija otro.
        </p>
        {f.titulos.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Sin títulos cargados. Sin uno, la guía de salida sale sin declarar el origen.</p>
        ) : (
          <ul className="space-y-2.5">
            {f.titulos.map((t, i) => <TituloCard key={`${t.codigo}-${i}`} t={t} esDeGuia={t === deGuia} />)}
          </ul>
        )}
      </div>

      {f.citesPermisos.length > 0 && (
        <Card titulo="Permisos CITES (especies protegidas)" icono={ShieldCheck}>
          <ul className="space-y-2">
            {f.citesPermisos.map((p, i) => (
              <li key={`${p.numero}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
                <span className="text-sm font-bold text-[var(--text-primary)]">{p.especie || "—"}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-[var(--text-secondary)]">{p.numero || "sin N° de permiso"}</span>
                  <ChipVigencia vencimiento={p.vencimiento} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Los nombres son los del Anexo 1 de la RDE D000025-2023: es lo que
            el operador va a buscar en la carátula que le pide la ARFFS. */}
        <Card titulo="Registro ante la autoridad forestal" icono={Building2}>
          <Row label="ARFFS competente" value={f.arffs} />
          <Row label="N° Registro del libro de operaciones" value={f.registroLibro} />
          <Row label="N° de autorización o registro" value={f.registroArffs} />
          <Row label="Fecha de registro" value={fechaCortaUTC(f.registroArffsFecha)} />
          <Row label="N° del establecimiento anexo" value={f.establecimientoAnexo} />
          <Row label="Tipo de establecimiento" value={f.tipoEstablecimiento} />
          <Row label="Serie GTF autorizada" value={f.gtfSerie} />
        </Card>
        <Card titulo="Representante y ubicación" icono={MapPin}>
          <Row label="Representante legal" value={[f.representante, f.representanteDni].filter(Boolean).join(" · ")} />
          <Row label="Domicilio" value={[f.direccion, f.distrito, f.provincia, f.region].filter(Boolean).join(", ")} />
          <Row label="Coordenadas UTM" value={coordenadasUtmLinea(f)} />
          <Row label="Contacto" value={[f.telefono, f.email].filter(Boolean).join(" · ")} />
        </Card>
      </div>

      {verGtf && <CtpFichaPreviewGtf ficha={f} onCerrar={() => setVerGtf(false)} />}
    </div>
  );
}
