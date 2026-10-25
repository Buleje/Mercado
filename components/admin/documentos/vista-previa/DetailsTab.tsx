"use client";

import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";
import DescripcionDoc from "../DescripcionDoc";
import ParecidosDoc from "../ParecidosDoc";
import { Sparkles, Clock as AlarmClock, Link2, Users, Truck, Folder as FolderIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { patchDocument, marcarCodigoFisicoEnServidor } from "@/hooks/use-documents";
import { CodigoFisicoControl } from "../CodigoDocumento";
import { buildChildrenMap, flattenAll, folderPath } from "@/lib/documentos/folder-tree";
import { type DbDocument, type DbDocumentFolder } from "@/lib/types/documents";
import { type EntityOpt, StructuredCard } from "./TarjetaEstructurada";
import { RelatedSection } from "./RelatedSection";
import { ApprovalSection } from "./ApprovalSection";
import { PermissionsSection } from "./PermissionsSection";

export function DetailsTab({ doc, allDocs, folders, onPatched, onAbrirOtro }: { doc: DbDocument; allDocs: DbDocument[]; folders: DbDocumentFolder[]; onPatched: (d: DbDocument) => void; onAbrirOtro?: (d: DbDocument) => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [customers, setCustomers] = useState<EntityOpt[]>([]);
  const [suppliers, setSuppliers] = useState<EntityOpt[]>([]);

  const expiryValue = doc.expiresAt ? doc.expiresAt.slice(0, 10) : "";

  useEffect(() => {
    fetch("/api/customers?limit=200", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.customers ?? [];
        // Customer.@id es `phone` (no hay campo id) — Document.customerId guarda el phone.
        setCustomers(
          arr
            .map((c: { phone?: string; name?: string }) => ({ id: c.phone ?? "", name: c.name || c.phone || "Cliente" }))
            .filter((c: EntityOpt) => c.id)
        );
      })
      .catch((err) => logger.error("[document-preview] fetch customers failed", { error: String(err) }));
    fetch("/api/suppliers", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.suppliers ?? [];
        setSuppliers(arr.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
      })
      .catch((err) => logger.error("[document-preview] fetch suppliers failed", { error: String(err) }));
  }, []);

  async function save(field: string, body: Record<string, unknown>) {
    setSaving(field);
    try {
      const d = await patchDocument(doc.id, body);
      onPatched(d);
    } finally {
      setSaving(null);
    }
  }

  const dias = doc.expiresAt
    ? Math.ceil((new Date(doc.expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const rutaCarpeta = doc.folderId ? folderPath(folderById, doc.folderId).map((f) => f.name).join(" › ") : null;
  const arbolCarpetas = flattenAll(buildChildrenMap(folders));

  return (
    // Dos columnas en pantallas grandes: con el visor a pantalla casi completa,
    // una sola columna angosta dejaba media pantalla vacía. Va con grid y no
    // con `columns-*`: las columnas de CSS parten las tarjetas por la mitad y
    // el botón de una sección terminaba pisando el título de la otra.
    <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-4 p-5 xl:grid-cols-2">
      {/* ADR-516 — el código único del papel y si ya se anotó en el físico. */}
      <CodigoFisicoControl
        doc={doc}
        className="rounded-2xl bg-[var(--surface-raised)] p-4 xl:col-span-2"
        onMarcar={async (puesto) => {
          const r = await marcarCodigoFisicoEnServidor([doc.id], puesto);
          if (r.ids.length > 0) onPatched({ ...doc, codigoFisicoAt: r.codigoFisicoAt, codigoFisicoPor: r.codigoFisicoPor });
        }}
      />
      {/* Carpeta — dónde vive el documento, y mover sin salir del detalle */}
      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
          <FolderIcon className="h-4 w-4 text-[var(--accent)]" /> Carpeta
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rutaCarpeta ? (
            <span className="text-sm font-bold text-[var(--text-primary)]">{rutaCarpeta}</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--rule-strong)] px-2 py-0.5 text-xs font-bold text-[var(--text-tertiary)]">
              Sin carpeta (raíz)
            </span>
          )}
          <select
            value={doc.folderId ?? ""}
            onChange={(e) => save("folder", { folderId: e.target.value || null })}
            disabled={saving === "folder"}
            aria-label="Mover a otra carpeta"
            className="h-9 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
          >
            <option value="">Sin carpeta (raíz)</option>
            {arbolCarpetas.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>{`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}</option>
            ))}
          </select>
        </div>
      </section>

      {/* De qué se trata: descripción de la IA + la que escribe el usuario.
          Las dos entran al buscador (ver lib/documents/texto-buscable). */}
      <DescripcionDoc doc={doc} onPatched={onPatched} />

      {/* Datos estructurados extraídos por IA (facturas/recibos) */}
      <StructuredCard doc={doc} />

      {/* Documentos relacionados (vinculados a mano) */}
      <RelatedSection doc={doc} allDocs={allDocs} onChanged={onPatched} />

      {/* Parecidos: los deduce el sistema de lo que dice cada documento */}
      {onAbrirOtro && <ParecidosDoc doc={doc} todos={allDocs} onAbrir={onAbrirOtro} />}

      {/* Flujo de aprobación */}
      <ApprovalSection doc={doc} onChanged={onPatched} />

      {/* Permisos por documento */}
      <PermissionsSection doc={doc} onChanged={onPatched} />

      {/* Vencimiento */}
      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-1 inline-flex items-center gap-1.5">
          <AlarmClock className="h-4 w-4 text-[var(--data-error-500)]" /> Fecha de vencimiento
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Para licencias, certificados o contratos. Te avisamos por WhatsApp 7 días antes.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            aria-label="Fecha de vencimiento"
            defaultValue={expiryValue}
            onChange={(e) => save("expiry", { expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
          />
          {doc.expiresAt && (
            <button
              onClick={() => save("expiry", { expiresAt: null })}
              className="px-2.5 py-2 rounded-xl bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)]"
            >
              Quitar
            </button>
          )}
          {saving === "expiry" && <span className="text-xs text-[var(--text-tertiary)]">Guardando…</span>}
          {dias !== null && (
            <span className={cn(
              "text-xs font-bold px-2 py-1 rounded-md",
              dias < 0 ? "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" : dias <= 7 ? "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" : dias <= 30 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" : "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]"
            )}>
              {dias < 0 ? "Ya venció" : dias === 0 ? "Vence hoy" : `Faltan ${dias} días`}
            </span>
          )}
        </div>
      </section>

      {/* Vincular a entidad */}
      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-1 inline-flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-primary" /> Vincular a
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Conecta este documento con un cliente o proveedor para encontrarlo desde su ficha.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Cliente</span>
            <select
              value={doc.customerId ?? ""}
              onChange={(e) => save("customer", { customerId: e.target.value || null })}
              className="mt-1 w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary bg-[var(--surface-raised)]"
            >
              <option value="">— Ninguno —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Proveedor</span>
            <select
              value={doc.supplierId ?? ""}
              onChange={(e) => save("supplier", { supplierId: e.target.value || null })}
              className="mt-1 w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary bg-[var(--surface-raised)]"
            >
              <option value="">— Ninguno —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        {saving && (saving === "customer" || saving === "supplier") && (
          <p className="text-xs text-[var(--text-tertiary)] mt-2">Guardando…</p>
        )}
      </section>

      {/* Texto OCR detectado */}
      {doc.ocrText && (
        <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
          <p className="text-sm font-bold text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Texto detectado (OCR)
          </p>
          <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-6 leading-relaxed">{doc.ocrText.slice(0, 800)}</p>
        </section>
      )}
    </div>
  );
}

// ─────────── Share tab ───────────
