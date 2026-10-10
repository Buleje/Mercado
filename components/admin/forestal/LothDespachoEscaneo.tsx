"use client";

/**
 * «Escanear lo que sube al camión» (Despacho de trozas del Libro TH, QR4,
 * 08-10): se escanea cada troza que sube —con la cámara del celular, la
 * pistola o tipeando el código— y se arma la lista; «Armar la guía» abre
 * «Despachar con guía» con esas trozas ya elegidas. Avisa la repetida («ya
 * estaba»), la de otro permiso (una guía sale de uno solo) y la que no está
 * para despachar (ya salió, se consumió o no es de este libro).
 *
 * Reusa `EscanerTrozas` (el mismo del CTP): el QR por línea
 * (`/verificar/troza/<id>?c=…`) encuentra la troza por su id aunque el código
 * se repita entre permisos.
 */

import { Loader2, ScanBarcode, Truck, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import EscanerTrozas from "./EscanerTrozas";
import { Btn } from "./ctp-shared";
import { useEscaneoCamion } from "./hooks/use-escaneo-camion";

export default function LothDespachoEscaneo({
  onCerrar,
  onArmarGuia,
}: {
  onCerrar: () => void;
  /** Los códigos escaneados, en el orden en que subieron, y su permiso (lo fijó la primera). */
  onArmarGuia: (codigos: string[], planes: (string | null)[]) => void;
}) {
  const s = useEscaneoCamion();
  const n = s.lista.length;
  const nota =
    n === 0
      ? "Escanea la primera troza: fija el permiso de la guía."
      : `${n} troza${n === 1 ? "" : "s"} · ${fmtM3(s.m3)} m³ · ${s.permisoNombre ?? ""}`;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Escanear lo que sube al camión"
      description="Cada troza escaneada entra a la lista"
      icon={ScanBarcode}
      footer={
        <ModalFooter error={s.error} nota={nota}>
          <Btn variant="ghost" onClick={onCerrar}>
            Cancelar
          </Btn>
          <Btn variant="primary" disabled={n === 0} onClick={() => onArmarGuia(s.lista.map((t) => t.codigo), [...new Set(s.lista.map((t) => t.planId))])}>
            <Truck className="h-4 w-4" aria-hidden="true" />
            Armar la guía{n > 0 ? ` con ${n}` : ""}
          </Btn>
        </ModalFooter>
      }
    >
      {!s.trozas && s.error ? (
        <p className="py-6 text-sm text-[var(--text-secondary)]">No se pudieron leer las trozas para despachar. Cierra y vuelve a abrir.</p>
      ) : !s.trozas ? (
        <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando las trozas que faltan despachar…
        </p>
      ) : s.trozas && s.trozas.length === 0 ? (
        <p className="py-6 text-sm text-[var(--text-secondary)]">No hay trozas para despachar: todas salieron o se consumieron.</p>
      ) : (
        <div className="space-y-3" data-escaneo-camion>
          <EscanerTrozas
            trozas={s.trozas ?? []}
            onTroza={s.agregar}
            yaElegidas={s.yaElegidas}
            bloqueo={s.bloqueo}
            accion="sube al camión"
            mostrarCuenta={false}
            camaraGrande
            onDesconocido={(codigo) =>
              `Troza ${codigo}: no está para despachar (ya salió, se consumió o no es de este libro).`
            }
            pieCamara={<p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">{nota}</p>}
          />
          {n > 0 && (
            <ol className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" aria-label="Trozas en el camión">
              {s.lista.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-6 text-right tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{t.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{t.especieComun ?? "Sin especie"}</span>
                  <span className="tabular-nums text-[var(--text-primary)]">{t.volumenM3 == null ? "—" : `${fmtM3(t.volumenM3)} m³`}</span>
                  <button
                    type="button"
                    onClick={() => s.quitar(t.id)}
                    aria-label={`Quitar la troza ${t.codigo}`}
                    title="Quitar de la lista"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </AdminModal>
  );
}
