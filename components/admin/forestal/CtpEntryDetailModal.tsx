"use client";

/**
 * CtpEntryDetailModal — ficha completa de un ingreso de madera.
 *
 * El formulario captura ~12 campos (origen, concesión, humedad, defectos,
 * fotos, dimensiones, quién validó) que la tabla no puede mostrar sin volverse
 * ilegible. Sin esta vista esos datos se escriben y nunca se leen — que es
 * justo lo que un libro de operaciones tiene que poder responder ante una
 * fiscalización.
 */

import { Children, isValidElement, type ReactElement } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import CtpHistorial from "./CtpHistorial";
import TrazaForwardSection from "./CtpTrazaForward";
import CtpTrozasDeIngreso from "./CtpTrozasDeIngreso";
import {
  AlertCircle,
  FileText,
  MapPin,
  Scale,
  ShieldAlert,
  TreePine,
  User,
} from "@buleje/design-system/icons";
import {
  PLAZO_REGISTRO_DIAS,
  STATUS_META,
  diasDeRegistro,
  estaFueraDePlazo,
  formatDate,
  formatDateTime,
  originLabel,
  parseCitesPermiso,
  productLabel,
  type WoodEntry,
} from "./ctp-shared";
import { UNIDADES_LOCTP } from "@/lib/forestal/loctp-campos";
import CtpIngresoCompletitud from "./CtpIngresoCompletitud";

/**
 * La unidad declarada. Dos formas a propósito: el símbolo para el número grande
 * del encabezado —donde "m³ — metros cúbicos" al lado del 4.87 no se lee— y la
 * etiqueta completa para la ficha, que es la del catálogo oficial.
 */
function unidadLabel(unit: string | null): string {
  return UNIDADES_LOCTP.find((u) => u.valor === (unit || "m3"))?.label ?? (unit || "m³");
}
function unidadSimbolo(unit: string | null): string {
  const v = unit || "m3";
  return v === "m3" ? "m³" : v === "unidad" ? "un." : v;
}

interface CtpEntryDetailModalProps {
  entry: WoodEntry;
  onClose: () => void;
  /** Abre el editor con este ingreso. Sin esto el panel informa pero no resuelve. */
  onCompletar?: (entry: WoodEntry) => void;
}

export default function CtpEntryDetailModal({ entry, onClose, onCompletar }: CtpEntryDetailModalProps) {
  const dias = diasDeRegistro(entry); // para mostrar
  const fueraDePlazo = estaFueraDePlazo(entry); // para decidir — matchea el SQL
  const photos = Array.isArray(entry.photos) ? entry.photos : [];
  // Permiso CITES vinculado (estructurado, leído de notes) — visible si es CITES.
  const citesPermiso = parseCitesPermiso(entry.notes);

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={entry.libroNro != null ? `Ingreso N° ${entry.libroNro} · ${entry.gtfNumber}` : `Ingreso · ${entry.gtfNumber}`}
      description={`${entry.speciesCommonName} · ${Number(entry.volumeM3).toFixed(4)} m³`}
      icon={TreePine}
      className="sm:w-[min(95vw,84rem)] sm:max-w-none sm:max-h-[95vh]"
    >
      <div className="space-y-5 p-5 sm:p-6">
        {/* Antes de la ficha: qué falta para el formato. Los bloques de abajo
            siguen nombrando sus vacíos, pero sólo acá se distingue lo que
            IMPIDE presentar de lo que es complemento — y sale de la misma
            fuente que el chip de la tabla, así que los números coinciden. */}
        <CtpIngresoCompletitud
          entry={entry as unknown as Record<string, unknown>}
          onCompletar={onCompletar ? () => onCompletar(entry) : undefined}
        />
        {/* Hero: la especie y el volumen — lo que se pregunta primero — con el
            estado y las alertas de cumplimiento, sobre una banda editorial. */}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--accent-soft)] to-[var(--surface-canvas)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-xl font-bold text-[var(--text-primary)]">{entry.speciesCommonName}</CardTitle>
              {entry.speciesScientificName && (
                <p className="truncate text-sm italic text-[var(--text-tertiary)]">{entry.speciesScientificName}</p>
              )}
            </div>
            <StatusChip status={entry.status} />
          </div>

          {/* Los cuatro datos que se preguntan primero. El folio del libro va acá
              arriba y no enterrado en una sección: es la columna (1) del formato
              oficial y lo primero que pide un fiscalizador para ubicar la línea. */}
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
            <HeroStat value={Number(entry.volumeM3).toFixed(2)} unit={unidadSimbolo(entry.unit)} label="Volumen" big />
            <HeroStat value={String(entry.pieces)} label="Piezas" />
            <HeroStat value={productLabel(entry.productType)} label="Producto" />
            {entry.libroNro != null && <HeroStat value={`N° ${entry.libroNro}`} label="Folio del libro" />}
            <HeroStat value={`${entry.docType || "GTF"} ${entry.gtfNumber}`} label="Documento" />
          </div>

          {(entry.speciesCites || fueraDePlazo) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--rule-soft)] pt-3">
              {entry.speciesCites && (
                citesPermiso ? (
                  <span
                    title="Permiso CITES vinculado a este ingreso"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-3 py-1 text-xs font-bold text-[var(--data-success-700)]"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> CITES · Permiso {citesPermiso}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error-100)] px-3 py-1 text-xs font-bold text-[var(--data-error-700)]">
                    <ShieldAlert className="h-3.5 w-3.5" /> CITES · sin permiso vinculado
                  </span>
                )
              )}
              {fueraDePlazo && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-100)] px-3 py-1 text-xs font-bold text-[var(--data-warning-700)]">
                  <AlertCircle className="h-3.5 w-3.5" /> Registrado {dias} días después (plazo {PLAZO_REGISTRO_DIAS} días hábiles)
                </span>
              )}
            </div>
          )}
        </div>

        {entry.rejectionReason && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>{entry.status === "anulado" ? "Motivo de la anulación:" : "Motivo del rechazo:"}</strong> {entry.rejectionReason}
            </div>
          </div>
        )}

        {/* Tres columnas en pantalla grande: con el modal ancho, las secciones
            de la ficha entran casi sin scroll. Cae a dos en tablet y a una en
            teléfono, que es donde se consulta en el patio.

            `columns` y no `grid`: las secciones tienen alturas muy distintas
            (Origen ocupa el doble que Titular) y con grid la fila entera se
            estiraba a la más alta, dejando huecos de media pantalla. Con
            columnas CSS se empaquetan una debajo de otra. */}
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>section]:mb-4 [&>section]:break-inside-avoid">
          <Section title="Guía de transporte forestal" icon={FileText}>
            <Field label="Tipo de documento" value={entry.docType} />
            <Field label="N° del documento" value={entry.gtfNumber} mono />
            <Field label="Serie" value={entry.gtfSeries} mono />
            <Field label="Fecha de la guía" value={formatDate(entry.gtfDate)} />
            <Field label="Fecha de ingreso al CTP" value={formatDate(entry.entryDate)} />
            {/* El N° de registro del SNIFFS es lo que permite volver a la guía en
                la base de SERFOR: sin él, la ficha guardada no se puede contrastar. */}
            <Field label="N° de registro SERFOR" value={entry.serforNumeroRegistro} mono />
          </Section>

          <Section title="Titular / proveedor" icon={User}>
            <Field label="Nombre o razón social" value={entry.providerName} span2 />
            <Field label="Documento" value={entry.providerDocument} mono />
            <Field label="Tipo" value={entry.providerDocumentType} />
          </Section>

          <Section title="Origen del material" icon={MapPin}>
            <Field label="Tipo de origen" value={originLabel(entry.originType)} />
            <Field label="Código de origen" value={entry.originCode} mono />
            <Field label="N° de fuente de origen" value={entry.originSourceNumber} mono span2 />
            <Field label="Región" value={entry.originRegion} />
            <Field label="Distrito" value={entry.originDistrict} />
            <Field label="Código que asigna el CTP" value={entry.ctpProductCode} mono />
          </Section>

          <Section title="Especie y producto" icon={TreePine}>
            <Field label="Nombre común" value={entry.speciesCommonName} />
            <Field label="Nombre científico" value={entry.speciesScientificName} italic />
            <Field label="Producto" value={productLabel(entry.productType)} />
            <Field label="Unidad de medida" value={unidadLabel(entry.unit)} />
            <Field label="CITES" value={entry.speciesCites ? "Sí — especie protegida" : "No"} />
          </Section>

          <Section title="Medidas" icon={Scale}>
            <Field label="Volumen" value={`${Number(entry.volumeM3).toFixed(4)} m³`} mono />
            <Field label="Piezas" value={String(entry.pieces)} mono />
            <Field label="Largo promedio" value={entry.avgLengthM ? `${Number(entry.avgLengthM).toFixed(2)} m` : null} mono />
            <Field label="Diámetro promedio" value={entry.avgDiameterCm ? `${Number(entry.avgDiameterCm).toFixed(2)} cm` : null} mono />
            <Field label="Humedad" value={entry.humidityPct ? `${Number(entry.humidityPct).toFixed(2)} %` : null} mono />
            <Field label="Defectos observados" value={entry.defectsNotes} span2 />
          </Section>

          <Section title="Observaciones" icon={FileText} opcional>
            <Field label="Notas" value={entry.notes} span2 />
            {photos.length > 0 && (
              <div className="col-span-2">
                <FieldLabel>Fotos ({photos.length})</FieldLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-20 w-20 overflow-hidden rounded-xl border-2 border-[var(--rule-base)] hover:border-[var(--brand-ink)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Foto del ingreso" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* La lista de trozas va a ANCHO COMPLETO: es una tabla que un
            fiscalizador compara pieza por pieza contra el POA, y en una columna
            se corta. Sólo aparece si la guía la trajo (ADR-312). */}
        <CtpTrozasDeIngreso entryId={entry.id} volumenDelIngreso={Number(entry.volumeM3 ?? 0) || null} />

        {/* Trazabilidad hacia adelante + auditoría, en 2 columnas para ahorrar scroll. */}
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {/* ¿A dónde fue esta madera? — corridas → despachos. */}
          <TrazaForwardSection entryId={entry.id} />

        <Section title="Trazabilidad" icon={FileText}>
          <Field label="Registrado por" value={entry.createdBy} />
          <Field label="Registrado el" value={formatDateTime(entry.createdAt)} />
          <Field label="Validado por" value={entry.validatedBy} />
          <Field label="Validado el" value={formatDateTime(entry.validatedAt)} />
        </Section>
        </div>

        {/* Rec #10 QA: todo lo que pasó con este registro, del audit trail. */}
        <CtpHistorial entityId={entry.id} />

        <p className="border-t-2 border-[var(--rule-soft)] pt-4 text-xs text-[var(--text-tertiary)]">
          Registro interno del CTP. No reemplaza al LOE-CTP oficial de SERFOR.
        </p>
      </div>
    </AdminModal>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────

function StatusChip({ status }: { status: WoodEntry["status"] }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;
  const cls =
    meta.tone === "success"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
      : meta.tone === "warning"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
        : meta.tone === "danger"
          ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
          : meta.tone === "info"
            ? "bg-[var(--data-info-100)] text-[var(--data-info-700)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function HeroStat({ value, unit, label, big }: { value: string; unit?: string; label: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1">
        <span className={`font-mono font-bold tabular-nums text-[var(--text-primary)] ${big ? "text-3xl" : "text-xl"}`}>{value}</span>
        {unit && <span className="text-sm text-[var(--text-tertiary)]">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}

/**
 * Bloque de datos de la ficha.
 *
 * Rediseño 2026-07-30: los campos SIN dato ya no ocupan una fila con un guión.
 * En un ingreso recién cargado la mitad de los campos están vacíos, y el modal
 * medía el doble mostrando nada — había que scrollear entre guiones para
 * encontrar los tres datos que sí estaban. Ahora los vacíos se nombran en una
 * línea al pie ("Sin registrar: Serie · Distrito"): el modal es corto Y sigue
 * diciendo qué falta, que es justo lo que un fiscalizador pregunta.
 */
function Section({
  title,
  icon: Icon,
  opcional,
  children,
}: {
  title: string;
  icon: typeof TreePine;
  /** Si no tiene ni un dato, no se dibuja: una tarjeta que sólo dice "sin
   *  registrar: Notas" ocupa una columna entera para no informar nada. En las
   *  secciones obligatorias del formato sí conviene ver el hueco. */
  opcional?: boolean;
  children: React.ReactNode;
}) {
  const hijos = Children.toArray(children).filter(isValidElement) as ReactElement<{
    label?: string;
    value?: string | null;
  }>[];
  // El "—" cuenta como vacío: varios llamadores ya mandan el guión hecho, y si
  // no se trata igual queda una fila con un guión al lado de la lista que dice
  // que ese campo no está registrado.
  const vacio = (h: ReactElement<{ value?: string | null }>) =>
    h.props?.value == null || h.props?.value === "" || h.props?.value === "—";
  const conDato = hijos.filter((h) => !vacio(h));
  const sinDato = hijos.filter((h) => vacio(h)).map((h) => h.props?.label).filter(Boolean);
  if (opcional && conDato.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--rule-soft)] pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Icon className="h-4 w-4" />
        </span>
        <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          {title}
        </CardTitle>
      </div>
      {conDato.length > 0 && <div className="grid grid-cols-2 gap-x-4 gap-y-3">{conDato}</div>}
      {sinDato.length > 0 && (
        <p className={`text-xs leading-relaxed text-[var(--text-tertiary)] ${conDato.length > 0 ? "mt-3 border-t border-[var(--rule-soft)] pt-2.5" : ""}`}>
          <span className="font-bold uppercase tracking-wide">Sin registrar:</span>{" "}
          {sinDato.join(" · ")}
        </p>
      )}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  mono,
  italic,
  span2,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  italic?: boolean;
  span2?: boolean;
}) {
  const empty = value == null || value === "";
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <FieldLabel>{label}</FieldLabel>
      <p
        className={`mt-0.5 text-sm ${
          empty ? "text-[var(--text-tertiary)]" : "font-medium text-[var(--text-primary)]"
        } ${mono && !empty ? "font-mono" : ""} ${italic && !empty ? "italic" : ""}`}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}
