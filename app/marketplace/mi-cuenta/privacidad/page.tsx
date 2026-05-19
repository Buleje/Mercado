"use client";

/**
 * /marketplace/mi-cuenta/privacidad — Brandon 2026-05-18 Sprint Final · Día 2
 *
 * Centro de privacidad y control de datos del cliente.
 * Compliance Ley 29733 PE Art. 18-22 — Derechos ARCO:
 *   · Acceso       → export JSON con todos sus datos
 *   · Rectificación → link al perfil para corregir
 *   · Cancelación  → solicitud de borrado (anonimización RTBF)
 *   · Oposición    → revocar consents granulares (REAL, fetch a /api/customer/consent)
 *
 * UI dividida en 3 cards:
 *   1. Mis datos (export — descarga JSON)
 *   2. Mis consentimientos (lista REAL + toggle por tipo)
 *   3. Eliminar mi cuenta (RTBF con doble confirmación)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Download,
  Trash2,
  AlertTriangle,
  FileText,
} from "@buleje/design-system/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConsentItem {
  type: string;
  description: string;
  granted: boolean | null;
  status: "granted" | "revoked" | "not_collected";
  grantedAt: string | null;
  revokedAt: string | null;
  lastUpdated: string | null;
}

// ── Toggle switch minimalista ─────────────────────────────────────────────────

function ConsentSwitch({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
        checked
          ? "border-transparent bg-[var(--data-success-500)]"
          : "border-transparent bg-[var(--rule-base)]",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ── Card 2 — Mis consentimientos (componente separado con su propio estado) ───

function ConsentsCard() {
  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Map type → boolean indicando si está en proceso de toggle (optimistic lock)
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/consent", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Inicia sesión para ver tus consentimientos.");
          return;
        }
        throw new Error(`Error ${res.status}`);
      }
      const data = (await res.json()) as { consents: ConsentItem[] };
      setConsents(Array.isArray(data.consents) ? data.consents : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar consentimientos",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConsents();
  }, [fetchConsents]);

  async function handleToggle(item: ConsentItem) {
    const nextGranted = !(item.granted ?? false);
    const type = item.type;

    // Optimistic update
    setConsents((prev) =>
      prev.map((c) =>
        c.type === type
          ? {
              ...c,
              granted: nextGranted,
              status: nextGranted ? "granted" : "revoked",
              grantedAt: nextGranted ? new Date().toISOString() : c.grantedAt,
              revokedAt: !nextGranted ? new Date().toISOString() : c.revokedAt,
              lastUpdated: new Date().toISOString(),
            }
          : c,
      ),
    );
    setToggling((prev) => ({ ...prev, [type]: true }));

    try {
      const res = await fetch("/api/customer/consent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentType: type, granted: nextGranted }),
      });
      if (!res.ok) {
        // Revert en error
        setConsents((prev) =>
          prev.map((c) =>
            c.type === type
              ? {
                  ...c,
                  granted: item.granted,
                  status: item.status,
                  grantedAt: item.grantedAt,
                  revokedAt: item.revokedAt,
                  lastUpdated: item.lastUpdated,
                }
              : c,
          ),
        );
        const body = await res.json().catch(() => ({ error: "Error de red" })) as { error?: string };
        setError(body.error ?? "Error al actualizar consentimiento");
      }
    } catch {
      // Revert
      setConsents((prev) =>
        prev.map((c) =>
          c.type === type
            ? {
                ...c,
                granted: item.granted,
                status: item.status,
                grantedAt: item.grantedAt,
                revokedAt: item.revokedAt,
                lastUpdated: item.lastUpdated,
              }
            : c,
        ),
      );
      setError("Error de red. Intentá de nuevo.");
    } finally {
      setToggling((prev) => ({ ...prev, [type]: false }));
    }
  }

  return (
    <section
      aria-labelledby="consents-title"
      className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-success-500)]/12 text-[var(--data-success-500)]">
          <Shield className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <h2
            id="consents-title"
            className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight"
          >
            Mis consentimientos
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug">
            Activá o desactivá cada tipo de comunicación o tratamiento.
            Podés cambiar tu elección en cualquier momento.{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              Ley 29733 Art. 13-14
            </span>
            .
          </p>

          {/* Error */}
          {error && (
            <p
              role="alert"
              className="mt-3 text-xs font-bold text-[var(--data-error-500)]"
            >
              {error}
            </p>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 space-y-2"
            >
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-xl bg-[var(--surface-sunken)]"
                />
              ))}
              <span className="sr-only">Cargando consentimientos...</span>
            </div>
          )}

          {/* Consent list */}
          {!loading && consents.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--rule-soft)]">
              {consents.map((item) => {
                const isChecked = item.granted === true;
                const isToggling = toggling[item.type] ?? false;
                const switchId = `consent-switch-${item.type}`;

                return (
                  <li
                    key={item.type}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor={switchId}
                        className="block text-sm font-semibold text-[var(--text-primary)] cursor-pointer"
                      >
                        {item.description}
                      </label>
                      {item.lastUpdated && (
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                          {isChecked ? "Activado" : "Desactivado"}{" "}
                          ·{" "}
                          {new Intl.DateTimeFormat("es-PE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(item.lastUpdated))}
                        </p>
                      )}
                      {!item.lastUpdated && (
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                          Sin elección registrada
                        </p>
                      )}
                    </div>
                    <ConsentSwitch
                      id={switchId}
                      checked={isChecked}
                      onChange={() => void handleToggle(item)}
                      disabled={isToggling}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && consents.length === 0 && !error && (
            <p className="mt-3 text-sm text-[var(--text-tertiary)]">
              No hay consentimientos registrados aún.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrivacidadPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/customer/me/export", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}: no se pudo exportar`);
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `buleje-mis-datos-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteResult(null);
    try {
      const res = await fetch("/api/customer/me/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: "BORRAR_MIS_DATOS",
          reason: "Solicitud desde panel de privacidad",
        }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Error al eliminar cuenta");
      }
      setDeleteResult(data.message ?? "Cuenta anonimizada exitosamente");
      // Redirigir tras 3 segundos al home
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (err) {
      setDeleteResult(
        err instanceof Error ? `Error: ${err.message}` : "Error desconocido",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
          <span aria-hidden className="inline-block h-[3px] w-6 rounded-full bg-[var(--accent)]" />
          Tu privacidad
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          Control de tus datos
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Ejercé tus derechos de la Ley 29733 PE: acceder a tu información,
          revocar consentimientos o solicitar el borrado de tu cuenta.
        </p>
      </div>

      {/* Card 1 — Mis datos (export) */}
      <section
        aria-labelledby="export-title"
        className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)]">
            <FileText className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="export-title"
              className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight"
            >
              Descargá tus datos
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug">
              Recibí un archivo JSON con toda tu información: perfil, pedidos,
              consentimientos e historial de cambios.{" "}
              <span className="font-semibold text-[var(--text-primary)]">Ley 29733 Art. 18</span>.
            </p>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] text-sm font-extrabold hover:opacity-90 transition-opacity active:scale-[0.985] disabled:opacity-60"
            >
              <Download className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              {exporting ? "Generando…" : "Descargar mis datos"}
            </button>
            {exportError && (
              <p className="mt-2 text-xs font-bold text-[var(--data-error-500)]">
                {exportError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Card 2 — Mis consentimientos (REAL, fetch a /api/customer/consent) */}
      <ConsentsCard />

      {/* Card 3 — Eliminar mi cuenta (RTBF) */}
      <section
        aria-labelledby="rtbf-title"
        className="rounded-3xl border-2 border-[var(--data-error-500)]/25 bg-[var(--data-error-500)]/5 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-error-500)]/12 text-[var(--data-error-500)]">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="rtbf-title"
              className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight"
            >
              Eliminar mi cuenta
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug">
              Tus datos personales (nombre, dirección, referencias) serán{" "}
              <span className="font-bold text-[var(--text-primary)]">
                anonimizados de forma irreversible
              </span>
              . Tus pedidos se conservan por obligación SUNAT (5 años).{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                Ley 29733 Art. 20-22
              </span>
              .
            </p>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-xl border-2 border-[var(--data-error-500)]/40 text-[var(--data-error-500)] text-sm font-extrabold hover:bg-[var(--data-error-500)]/10 transition-colors active:scale-[0.985]"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Solicitar eliminación
              </button>
            ) : (
              <div className="mt-4 rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-raised)] p-4">
                {deleteResult ? (
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {deleteResult}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-extrabold text-[var(--data-error-500)] uppercase tracking-wide mb-1">
                      Confirmación requerida
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] mb-3 leading-snug">
                      Escribí{" "}
                      <code className="font-mono font-extrabold text-[var(--text-primary)]">
                        BORRAR_MIS_DATOS
                      </code>{" "}
                      para confirmar.
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="BORRAR_MIS_DATOS"
                      className="w-full h-12 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] font-mono text-sm font-bold text-[var(--text-primary)] focus:border-[var(--data-error-500)] focus:outline-none"
                      autoComplete="off"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeleteConfirmText("");
                        }}
                        className="flex-1 h-11 rounded-xl text-sm font-extrabold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={
                          deleting || deleteConfirmText !== "BORRAR_MIS_DATOS"
                        }
                        className="flex-1 h-11 rounded-xl bg-[var(--data-error-500)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting ? "Procesando…" : "Eliminar cuenta"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-relaxed">
        ¿Dudas? Escribinos a{" "}
        <a
          href="mailto:soporte@buleje.pe"
          className="font-bold text-[var(--accent)] hover:underline"
        >
          soporte@buleje.pe
        </a>
        . Operador de datos: Buleje SaaS Perú · RUC pendiente · Pucallpa, Ucayali.
      </p>
    </div>
  );
}
