"use client";

/**
 * Subir productos de golpe (Excel o CSV) contra `/api/products/import`.
 *
 * Antes (hasta 11-10) la pestaña «Subir» pedía «1. Elige a dónde van los
 * datos» entre siete módulos, pero TODO iba a productos: un CSV de clientes
 * con «Clientes» elegido se cargaba como productos. La única importación que
 * existe es la de productos, y la ventana lo dice.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

type Resultado = { ok: true; creados: number; errores: number } | { ok: false; mensaje: string };

export default function SubirProductosModal({ onClose, onImportado }: { onClose: () => void; onImportado: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [encima, setEncima] = useState(false);

  const subir = async (file: File) => {
    setSubiendo(true);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/import", { method: "POST", headers: csrfHeaders(), body: fd, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultado({ ok: false, mensaje: typeof data?.error === "string" ? data.error : "No se pudo importar el archivo" });
        return;
      }
      const errores = Array.isArray(data?.errors) ? data.errors.length : Number(data?.errors ?? 0);
      setResultado({ ok: true, creados: Number(data?.created ?? 0), errores });
      onImportado();
    } catch {
      setResultado({ ok: false, mensaje: "Error de red al importar. Intenta de nuevo." });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <AdminModal open onClose={onClose} title="Subir productos" description="Un Excel o CSV con tus productos: se crean de una vez.">
      <div className={`${MODAL_BODY} space-y-3`}>
        <div
          onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => { e.preventDefault(); setEncima(false); const f = e.dataTransfer.files[0]; if (f) void subir(f); }}
          className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center", encima ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)]")}
        >
          {subiendo ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procesando el archivo…
            </p>
          ) : resultado?.ok ? (
            <p className="flex items-center gap-2 text-base font-semibold text-[var(--data-success-ink)]" role="status">
              <CheckCircle className="h-5 w-5" aria-hidden /> {resultado.creados} productos creados{resultado.errores > 0 ? ` · ${resultado.errores} filas con error` : ""}
            </p>
          ) : resultado ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-ink)]" role="alert">
              <AlertTriangle className="h-5 w-5" aria-hidden /> {resultado.mensaje}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">Arrastra tu archivo aquí o elígelo</p>
          )}
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-bold text-white hover:brightness-110">
            <Upload className="h-4 w-4" aria-hidden /> {resultado ? "Subir otro archivo" : "Elegir archivo"}
            <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
          </label>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          .csv o .xlsx, hasta 10 MB
          <InfoTip
            title="Cómo armar el archivo"
            what="La primera fila lleva los encabezados (nombre, precio, categoría, stock…). Las filas con error se saltan y el resto se crea."
            affects="Cada importación queda en «Historial de importaciones» (menú «⋯»)."
            example="Bajas «Productos» en Excel, le agregas filas nuevas y lo subes aquí."
          />
        </p>
      </div>
    </AdminModal>
  );
}
