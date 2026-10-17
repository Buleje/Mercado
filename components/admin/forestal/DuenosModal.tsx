"use client";

/**
 * DuenosModal — el ÚNICO lugar donde se crea un dueño del cubicador.
 *
 * Brandon 23-09: «el campo de dueño es para escoger las opciones disponibles;
 * sólo se creará en el modal». La barra de entrada y la tabla eligen con un
 * `<select>`; acá se elige del Directorio (con su precio pactado, ADR-430) o
 * se escribe un nombre una vez.
 *
 * Ancho y en dos columnas (Directorio | los de este equipo): la versión
 * angosta apilaba las dos listas y cada una se veía de a cuatro renglones.
 * Además limpia lo que la barra vieja guardaba letra por letra («w», «l»,
 * «lu») y ofrece atar un nombre escrito a mano a la ficha que se llama igual.
 */
import { useMemo, useState } from "react";
import { Check, Link2, Search, Trash2, UserCheck, UserPlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { ROL_LABEL, filtrarPartes, ordenarPorUso, type Parte } from "@/lib/forestal/directorio";
import { aMedioEscribir, claveDueno, mismoNombreEnDirectorio } from "@/lib/forestal/duenos-cubicador";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

type Ficha = { id: string; nombre: string };

const TITULO_COLUMNA = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const BUSCADOR =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

function Elegido() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
      <Check className="h-3.5 w-3.5" aria-hidden /> Elegido
    </span>
  );
}

/** Los del Directorio, clientes primero: a quien se le cubica es cliente del aserradero. */
function DelDirectorio({
  partes,
  cargando,
  error,
  actualParteId,
  onElegir,
}: {
  partes: Parte[];
  cargando: boolean;
  error: string | null;
  actualParteId: string | null;
  onElegir: (p: Ficha) => void;
}) {
  const [q, setQ] = useState("");
  const opciones = useMemo(() => {
    const activas = partes.filter((p) => p.activo);
    const clientes = ordenarPorUso(activas.filter((p) => p.roles.includes("cliente")));
    const resto = ordenarPorUso(activas.filter((p) => !p.roles.includes("cliente")));
    const todas = [...clientes, ...resto];
    return (q.trim() ? filtrarPartes(todas, q) : todas).slice(0, 60);
  }, [partes, q]);

  return (
    <section aria-label="Dueños del Directorio" className="flex min-h-0 flex-col gap-2">
      <p className={TITULO_COLUMNA}>Del Directorio · pone su precio pactado</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o documento…"
          aria-label="Buscar un dueño en el Directorio"
          className={BUSCADOR}
        />
      </div>
      {cargando && partes.length === 0 ? (
        <p className="px-1 text-sm text-[var(--text-tertiary)]">Leyendo el Directorio…</p>
      ) : error ? (
        <p className="px-1 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          No se pudo leer el Directorio: usa un dueño de tu lista, sin precio pactado.
        </p>
      ) : opciones.length === 0 ? (
        <p className="px-1 text-sm text-[var(--text-tertiary)]">{q.trim() ? "Nadie coincide." : "El Directorio está vacío."}</p>
      ) : (
        <ul className="max-h-[55vh] min-h-0 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
          {opciones.map((p) => {
            const elegido = actualParteId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onElegir({ id: p.id, nombre: p.nombre })}
                  aria-pressed={elegido}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none ${elegido ? "bg-primary/8" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{p.nombre}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">
                      {[p.roles.map((r) => ROL_LABEL[r]).join(" · "), p.docNumero ? `${p.docTipo ?? "Doc."} ${p.docNumero}` : null]
                        .filter(Boolean)
                        .join(" — ")}
                    </span>
                  </span>
                  {elegido ? (
                    <Elegido />
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]">
                      <UserCheck className="h-3.5 w-3.5" aria-hidden /> Elegir
                    </span>
                  )}
                </button>
              </li>
            );
          })}
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
  fichaDe,
  onAtar,
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
  onElegirParte?: (p: Ficha) => void;
  /** La ficha a la que ya está atado un nombre de la lista, si hay. */
  fichaDe?: (nombre: string) => Ficha | null;
  /** Ata un nombre de la lista a la ficha del Directorio que se llama igual. */
  onAtar?: (p: Ficha) => void;
}) {
  const directorio = useDirectorioForestal({ activo: !!onElegirParte });
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const agregar = () => {
    const limpio = nombre.trim();
    if (!limpio) { setErr("Escribe un nombre."); return; }
    if (duenos.some((d) => claveDueno(d) === claveDueno(limpio))) {
      setErr("Ese dueño ya está guardado.");
      return;
    }
    const enDirectorio = onElegirParte ? mismoNombreEnDirectorio(limpio, directorio.partes) : null;
    if (enDirectorio && onAtar) {
      /* Se llama igual que una ficha: se guarda atado a ella, con su precio. */
      onAtar({ id: enDirectorio.id, nombre: enDirectorio.nombre });
    } else {
      onAgregar(limpio);
    }
    setNombre("");
    setErr(null);
  };

  const pedazos = useMemo(() => aMedioEscribir(duenos), [duenos]);
  const visibles = useMemo(() => {
    const k = claveDueno(q);
    return k ? duenos.filter((d) => claveDueno(d).includes(k)) : duenos;
  }, [duenos, q]);

  const listaLocal = (
    <section aria-label="Dueños escritos en este equipo" className="flex min-h-0 flex-col gap-2">
      <p className={TITULO_COLUMNA}>
        {onElegirParte ? "Tus dueños · escritos en este equipo" : "Tus dueños"} ({duenos.length})
      </p>
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
          <UserPlus className="h-4 w-4" aria-hidden /> Crear
        </Btn>
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{err}</p>}

      {pedazos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          <span className="min-w-0 flex-1">
            Parecen nombres a medio escribir: <b>{pedazos.map((p) => `«${p}»`).join(", ")}</b> (el comienzo de otro de la lista).
          </span>
          <Btn variant="secondary" size="sm" onClick={() => pedazos.forEach((p) => onQuitar(p))}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Quitar {pedazos.length === 1 ? "ese" : `los ${pedazos.length}`}
          </Btn>
        </div>
      )}

      {duenos.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en tus dueños…" aria-label="Buscar en tus dueños" className={BUSCADOR} />
        </div>
      )}

      {duenos.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
          Todavía no guardaste ningún dueño. Escribe uno arriba{onElegirParte ? " o elige del Directorio" : ""}.
        </p>
      ) : (
        <ul className="max-h-[55vh] min-h-0 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
          {visibles.map((d) => {
            const atado = fichaDe?.(d) ?? null;
            const igual = !atado && onElegirParte ? mismoNombreEnDirectorio(d, directorio.partes) : null;
            const elegido = claveDueno(actual) === claveDueno(d);
            return (
              <li key={d} className={`flex items-center gap-2 px-3 py-2 ${elegido ? "bg-primary/8" : ""}`}>
                <button
                  type="button"
                  onClick={() => onElegir(d)}
                  className="min-w-0 flex-1 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{d}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">
                    {atado ? `Atado a ${atado.nombre} del Directorio · con precio pactado` : "Sin precio pactado"}
                  </span>
                </button>
                {igual && onAtar && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => onAtar({ id: igual.id, nombre: igual.nombre })}
                    title={`En el Directorio está ${igual.nombre}: atarlo le pone su precio pactado`}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden /> Usar su ficha
                  </Btn>
                )}
                {elegido ? <Elegido /> : (
                  <Btn variant="secondary" size="sm" onClick={() => onElegir(d)}>Elegir</Btn>
                )}
                <button
                  type="button"
                  onClick={() => onQuitar(d)}
                  aria-label={`Borrar a ${d} de la lista de dueños`}
                  title="Borrar de la lista (no toca las piezas que ya cargaste con este dueño)"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
          {visibles.length === 0 && <li className="px-3 py-4 text-sm text-[var(--text-tertiary)]">Nadie coincide.</li>}
        </ul>
      )}
    </section>
  );

  return (
    <AdminModal
      /* El cubicador vive DENTRO de otro modal («Producir sin lote», que se
         pinta en z-60): sin esto se monta detrás, invisible, y como Radix apaga
         los clics del resto de la página la pantalla parece colgada. */
      aboveModals
      open
      onClose={onClose}
      variant={onElegirParte ? "info" : "default"}
      title="Dueños"
      description={
        onElegirParte
          ? "Elige del Directorio para usar su precio pactado, o crea un nombre acá. En la barra y en la tabla sólo se elige."
          : "Crea el nombre acá; en la barra y en la tabla sólo se elige, sin re-tipearlo."
      }
      /* El pie va por la prop: el margen lo pone el modal (dentro del cuerpo
         quedaba pegado al borde). */
      footer={
        <ModalFooter nota="Tus dueños se guardan en este equipo; los del Directorio, para todos.">
          <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {onElegirParte ? (
          <div className="grid gap-5 md:grid-cols-2">
            <DelDirectorio
              partes={directorio.partes}
              cargando={directorio.cargando}
              error={directorio.error}
              actualParteId={actualParteId}
              onElegir={onElegirParte}
            />
            {listaLocal}
          </div>
        ) : (
          listaLocal
        )}
      </ModalBody>
    </AdminModal>
  );
}
