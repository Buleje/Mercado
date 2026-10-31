"use client";

/**
 * CtpGuiasGuardadasModal — todas las guías guardadas antes del ingreso
 * (ADR-442): las que esperan su madera, las que ya entraron al libro, o todas.
 *
 * Una fila por guía con lo que la identifica (GTF, N° de registro, titular,
 * permiso), cuántos papeles tiene y si ya entró. Tocarla abre la guía con sus
 * casilleros; desde ahí se registra el ingreso.
 */

import { useMemo, useState } from "react";
import { ArrowRight, FolderOpen, FolderPlus, Loader2, Search, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useGuiasGuardadas } from "@/hooks/use-guias-guardadas";
import type {
  EstadoLista,
  GuiaGuardadaDetalle,
  GuiaGuardadaVista,
} from "@/lib/forestal/guias-guardadas";
import { Btn, I } from "./ctp-shared";
import CtpGuiaGuardadaModal from "./CtpGuiaGuardadaModal";
import CtpOrdenarPapelesViejos from "./CtpOrdenarPapelesViejos";
import { ChipDocsGuardada, EstadoGuardada, sinAcentos } from "./ctp-guias-guardadas-fila";

const FILTROS: { v: EstadoLista; label: string }[] = [
  { v: "por_ingresar", label: "Por ingresar" },
  { v: "ingresadas", label: "Ya ingresadas" },
  { v: "todas", label: "Todas" },
];

export interface CtpGuiasGuardadasModalProps {
  onClose: () => void;
  /** Registrar el ingreso con una guía: quien abre el alta cierra este modal. */
  onIngresar: (guia: GuiaGuardadaDetalle) => void;
  /** Se guardó, editó o eliminó alguna: la bandeja de Ingresos se relee. */
  onCambio?: () => void;
  estadoInicial?: EstadoLista;
}

export default function CtpGuiasGuardadasModal({
  onClose,
  onIngresar,
  onCambio,
  estadoInicial = "por_ingresar",
}: CtpGuiasGuardadasModalProps) {
  const [estado, setEstado] = useState<EstadoLista>(estadoInicial);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<{ id: string | null; inicial?: GuiaGuardadaVista } | null>(null);
  const { datos, cargando, error, recargar } = useGuiasGuardadas({ estado });

  const guias = useMemo(() => {
    const q = sinAcentos(buscar);
    const todas = datos?.guias ?? [];
    if (!q) return todas;
    return todas.filter((g) =>
      [g.gtfNumber, g.numeroRegistro, g.titularNombre, g.permisoCodigo, g.titularDoc]
        .some((v) => sinAcentos(v ?? "").includes(q)),
    );
  }, [datos, buscar]);

  const cuenta: Record<EstadoLista, number | null> = datos
    ? { por_ingresar: datos.porIngresar, ingresadas: datos.total - datos.porIngresar, todas: datos.total }
    : { por_ingresar: null, ingresadas: null, todas: null };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Guías guardadas"
      description="Guardadas antes del ingreso, con sus papeles"
      icon={FolderOpen}
      variant="wide"
      claveVentana="ctp-guias-guardadas"
    >
      <div className={`${MODAL_BODY} flex flex-col gap-3`} data-testid="guias-guardadas">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Qué guías ver" className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button
                key={f.v}
                type="button"
                role="radio"
                aria-checked={estado === f.v}
                onClick={() => setEstado(f.v)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold transition sm:min-h-9 ${
                  estado === f.v
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f.label}
                {cuenta[f.v] != null && (
                  <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-xs tabular-nums text-[var(--text-tertiary)]">
                    {cuenta[f.v]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Btn variant="primary" onClick={() => setAbierta({ id: null })} className="max-sm:w-full sm:ml-auto">
            <FolderPlus className="h-4 w-4" aria-hidden /> Guardar otra guía
          </Btn>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            aria-label="Buscar guía guardada"
            className={`${I} pl-10 pr-10`}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="N° de registro, GTF, titular o permiso"
          />
          {buscar && (
            <button
              type="button"
              onClick={() => setBuscar("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        {/* ADR-442: los papeles guardados antes por año/mes, a su titular. */}
        <CtpOrdenarPapelesViejos />

        {error && (
          <p role="alert" className="rounded-xl bg-[var(--data-error-500)]/10 p-3 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}{" "}
            <button type="button" onClick={() => void recargar()} className="font-bold underline underline-offset-2">
              Reintentar
            </button>
          </p>
        )}

        {!datos && cargando && (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las guías guardadas…
          </p>
        )}

        {datos && guias.length === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {buscar
                ? `Ninguna guía guardada coincide con «${buscar}».`
                : estado === "ingresadas"
                  ? "Todavía ninguna guía guardada entró al libro."
                  : estado === "por_ingresar"
                    ? "No hay guías guardadas esperando su madera."
                    : "Todavía no guardaste ninguna guía."}
            </p>
            {!buscar && estado !== "ingresadas" && (
              <Btn variant="secondary" onClick={() => setAbierta({ id: null })} className="sm:ml-auto">
                <FolderPlus className="h-4 w-4" aria-hidden /> Guardar una guía
              </Btn>
            )}
          </div>
        )}

        {guias.length > 0 && (
          <ul className={`flex flex-col gap-2 ${cargando ? "opacity-60" : ""}`} aria-busy={cargando}>
            {guias.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setAbierta({ id: g.id, inicial: g })}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-canvas)]"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">
                      GTF {g.gtfNumber}
                      {/* El registro entero salta de renglón, no se parte al medio. */}
                      {g.numeroRegistro && (
                        <span className="ml-2 inline-block whitespace-nowrap font-normal text-[var(--text-tertiary)]">
                          Reg. {g.numeroRegistro}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-sm text-[var(--text-secondary)]">
                      {[g.titularNombre, g.permisoCodigo].filter(Boolean).join(" · ") || "Sin titular ni permiso"}
                    </span>
                  </span>
                  <ChipDocsGuardada n={g.docsLlenos} />
                  <EstadoGuardada g={g} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] max-sm:hidden" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dentro del modal padre y con `aboveModals`: un AdminModal hijo se apila
          encima (memoria «modales anidados»). */}
      {abierta && (
        <CtpGuiaGuardadaModal
          key={abierta.id ?? "nueva"}
          guiaId={abierta.id}
          inicial={abierta.inicial}
          aboveModals
          onClose={() => setAbierta(null)}
          onCambio={() => {
            void recargar();
            onCambio?.();
          }}
          onIngresar={onIngresar}
        />
      )}
    </AdminModal>
  );
}
