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

import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
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
  productLabel,
  type WoodEntry,
} from "./ctp-shared";

interface CtpEntryDetailModalProps {
  entry: WoodEntry;
  onClose: () => void;
}

export default function CtpEntryDetailModal({ entry, onClose }: CtpEntryDetailModalProps) {
  const dias = diasDeRegistro(entry); // para mostrar
  const fueraDePlazo = estaFueraDePlazo(entry); // para decidir — matchea el SQL
  const photos = Array.isArray(entry.photos) ? entry.photos : [];

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="side"
      title={`Ingreso · ${entry.gtfNumber}`}
      description={`${entry.speciesCommonName} · ${Number(entry.volumeM3).toFixed(4)} m³`}
      icon={TreePine}
    >
      <div className="space-y-5">
        {/* Estado + alertas de cumplimiento arriba: es lo que se pregunta primero */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={entry.status} />
          {entry.speciesCites && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error-100)] px-3 py-1 text-xs font-bold text-[var(--data-error-700)]">
              <ShieldAlert className="h-3.5 w-3.5" />
              CITES · requiere permiso
            </span>
          )}
          {fueraDePlazo && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-100)] px-3 py-1 text-xs font-bold text-[var(--data-warning-700)]">
              <AlertCircle className="h-3.5 w-3.5" />
              Registrado {dias} días después (plazo: {PLAZO_REGISTRO_DIAS} días hábiles)
            </span>
          )}
        </div>

        {entry.rejectionReason && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>Motivo del rechazo:</strong> {entry.rejectionReason}
            </div>
          </div>
        )}

        <Section title="Guía de transporte forestal" icon={FileText}>
          <Field label="N° GTF" value={entry.gtfNumber} mono />
          <Field label="Serie" value={entry.gtfSeries} mono />
          <Field label="Fecha de la GTF" value={formatDate(entry.gtfDate)} />
          <Field label="Fecha de ingreso" value={formatDate(entry.entryDate)} />
        </Section>

        <Section title="Titular / proveedor" icon={User}>
          <Field label="Nombre o razón social" value={entry.providerName} span2 />
          <Field label="Documento" value={entry.providerDocument} mono />
          <Field label="Tipo" value={entry.providerDocumentType} />
        </Section>

        <Section title="Origen del material" icon={MapPin}>
          <Field label="Tipo de origen" value={originLabel(entry.originType)} />
          <Field label="Código (concesión / predio)" value={entry.originCode} mono />
          <Field label="Región" value={entry.originRegion} />
          <Field label="Distrito" value={entry.originDistrict} />
        </Section>

        <Section title="Especie y producto" icon={TreePine}>
          <Field label="Nombre común" value={entry.speciesCommonName} />
          <Field label="Nombre científico" value={entry.speciesScientificName} italic />
          <Field label="Producto" value={productLabel(entry.productType)} />
          <Field label="CITES" value={entry.speciesCites ? "Sí — especie protegida" : "No"} />
        </Section>

        <Section title="Medidas" icon={Scale}>
          <Field label="Volumen" value={`${Number(entry.volumeM3).toFixed(4)} m³`} mono />
          <Field label="Piezas" value={String(entry.pieces)} mono />
          <Field
            label="Largo promedio"
            value={entry.avgLengthM ? `${Number(entry.avgLengthM).toFixed(2)} m` : null}
            mono
          />
          <Field
            label="Diámetro promedio"
            value={entry.avgDiameterCm ? `${Number(entry.avgDiameterCm).toFixed(2)} cm` : null}
            mono
          />
          <Field
            label="Humedad"
            value={entry.humidityPct ? `${Number(entry.humidityPct).toFixed(2)} %` : null}
            mono
          />
          <Field label="Defectos observados" value={entry.defectsNotes} span2 />
        </Section>

        {(entry.notes || photos.length > 0) && (
          <Section title="Observaciones" icon={FileText}>
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
        )}

        <Section title="Trazabilidad" icon={FileText}>
          <Field label="Registrado por" value={entry.createdBy} />
          <Field label="Registrado el" value={formatDateTime(entry.createdAt)} />
          <Field label="Validado por" value={entry.validatedBy} />
          <Field label="Validado el" value={formatDateTime(entry.validatedAt)} />
        </Section>

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

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof TreePine;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          {title}
        </CardTitle>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
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
