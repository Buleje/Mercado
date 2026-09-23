"use client";

/**
 * DuenosModal — gestión explícita de los dueños guardados.
 *
 * El campo "Dueño" ya guardaba solo (al tipear uno nuevo, queda recordado
 * para la próxima vez) — pero eso era implícito y Brandon lo pidió explícito:
 * un lugar donde CREAR un nombre y GUARDARLO es un gesto aparte de ESCOGERLO
 * después. Este modal es ese lugar.
 *
 * ADR-430: arriba, el Directorio. Un dueño elegido de ahí queda atado a su
 * ficha (`duenoParteId`) y el cubicador pone el precio pactado con él; los
 * nombres escritos en este equipo siguen valiendo, sin precio propio.
 */
import { useMemo, useState } from "react";
import { Check, Search, Trash2, UserCheck, UserPlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { filtrarPartes, ordenarPorUso } from "@/lib/forestal/directorio";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

/** Los del Directorio, clientes primero: a quien se le cubica es cliente del aserradero. */
function DelDirectorio({
  actualParteId,
  onElegir,
}: {
  actualParteId: string | null;
  onElegir: (p: { id: string; nombre: string }) => void;
}) {
  const directorio = useDirectorioForestal();
  const [q, setQ] = useState("");
  const opciones = useMemo(() => {
    const activas = directorio.partes.filter((p) => p.activo);
    const clientes = ordenarPorUso(activas.filter((p) => p.roles.includes("cliente")));
    const resto = ordenarPorUso(activas.filter((p) => !p.roles.includes("cliente")));
    const todas = [...clientes, ...resto];
    return (q.trim() ? filtrarPartes(todas, q) : todas).slice(0, 30);
  }, [directorio.partes, q]);

  return (
    <section aria-label="Dueños del Directorio" className="space-y-2">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        Del Directorio · pone su precio pactado
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o documento…"
          aria-label="Buscar un dueño en el Directorio"
          className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </div>
      {directorio.cargando && directorio.partes.length === 0 ? (
        <p className="px-1 text-sm text-[var(--text-tertiary)]">Leyendo el Directorio…</p>
      ) : directorio.error ? (
        <p className="px-1 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          No se pudo leer el Directorio: escribe el dueño abajo, sin precio pactado.
        </p>
      ) : opciones.length === 0 ? (
        <p className="px-1 text-sm text-[var(--text-tertiary)]">{q.trim() ? "Nadie coincide." : "El Directorio está vacío."}</p>
      ) : (
        <ul className="max-h-60 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
          {opciones.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
              {p.roles.includes("cliente") && (
                <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  cliente
                </span>
              )}
              {actualParteId === p.id ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Elegido
                </span>
              ) : (
                <Btn variant="secondary" size="sm" onClick={() => onElegir({ id: p.id, nombre: p.nombre })}>
                  <UserCheck className="h-3.5 w-3.5" aria-hidden /> Elegir
                </Btn>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DuenosModal({
  duenos,
  actual,
  onAgregar,
  onQuitar,
  onElegir,
  onClose,
  actualParteId = null,
  onElegirParte,
}: {
  /** Los ya guardados en este equipo. */
  duenos: string[];
  /** El dueño que está fijo ahora mismo, para marcarlo en la lista. */
  actual: string;
  onAgregar: (nombre: string) => void;
  onQuitar: (nombre: string) => void;
  /** Elegir cierra el modal: es el gesto de "lo uso ahora". */
  onElegir: (nombre: string) => void;
  onClose: () => void;
  /** La ficha del dueño fijo ahora, si salió del Directorio. */
  actualParteId?: string | null;
  /** Elegir del Directorio (ADR-430). Sin esto, el modal es sólo la lista local. */
  onElegirParte?: (p: { id: string; nombre: string }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const agregar = () => {
    const limpio = nombre.trim();
    if (!limpio) { setErr("Escribe un nombre."); return; }
    if (duenos.some((d) => d.toLowerCase() === limpio.toLowerCase())) {
      setErr("Ese dueño ya está guardado.");
      return;
    }
    onAgregar(limpio);
    setNombre("");
    setErr(null);
  };

  return (
    <AdminModal
      /* El cubicador vive DENTRO de otro modal («Producir sin lote», que se
         pinta en z-60): sin esto se monta detrás, invisible, y como Radix apaga
         los clics del resto de la página la pantalla parece colgada. */
      aboveModals
      open
      onClose={onClose}
      title={onElegirParte ? "Dueños" : "Dueños guardados"}
      description={
        onElegirParte
          ? "Elige del Directorio para usar su precio pactado, o escribe un nombre una vez y elígelo después."
          : "Crea el nombre una vez; después lo eliges de la lista, sin re-tipearlo."
      }
    >
      <ModalBody className="space-y-4">
        {onElegirParte && <DelDirectorio actualParteId={actualParteId} onElegir={onElegirParte} />}
        {onElegirParte && (
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Escritos en este equipo · sin precio pactado
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
            placeholder="Nombre del dueño nuevo"
            aria-label="Nombre del dueño nuevo"
            autoFocus={!onElegirParte}
            className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <Btn variant="primary" onClick={agregar}>
            <UserPlus className="h-4 w-4" /> Guardar
          </Btn>
        </div>
        {err && <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{err}</p>}

        {duenos.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
            Todavía no guardaste ningún dueño. Escribe uno arriba.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
            {duenos.map((d) => (
              <li key={d} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{d}</span>
                {actual === d ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <Check className="h-3.5 w-3.5" /> Elegido
                  </span>
                ) : (
                  <Btn variant="secondary" size="sm" onClick={() => onElegir(d)}>Elegir</Btn>
                )}
                <button
                  type="button"
                  onClick={() => onQuitar(d)}
                  aria-label={`Borrar a ${d} de la lista de dueños`}
                  title="Borrar de la lista (no toca las piezas que ya cargaste con este dueño)"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalBody>
      <ModalFooter nota="Se guarda en este equipo — no se comparte con otro dispositivo.">
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
      </ModalFooter>
    </AdminModal>
  );
}
