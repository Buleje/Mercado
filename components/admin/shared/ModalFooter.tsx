/**
 * components/admin/shared/ModalFooter.tsx — pie de acciones estándar de un `AdminModal`.
 *
 * Vivía en `components/admin/forestal/ctp-shared.tsx` y lo usaban 45 modales del
 * módulo forestal; se mueve acá (2026-09-14) para que el resto del panel —empezando
 * por Recursos Humanos— tenga el mismo pie sin importar del módulo forestal.
 * `ctp-shared` lo re-exporta, así que ningún import existente cambia.
 */

/**
 * Pie de acciones. Se pasa a la prop `footer` de `AdminModal`, que lo deja
 * FUERA del área scrolleable: el botón «Guardar» de un formulario largo no
 * tiene que ganarse con scroll (el del directorio quedaba a 1228px en una
 * pantalla de 900). Por lo mismo el error viaja acá y no al final del
 * formulario, donde el modal scrolleado lo escondía justo cuando hacía falta.
 */
export function ModalFooter({
  error,
  aviso,
  nota,
  atajo,
  children,
}: {
  error?: string | null;
  /** Confirmación efímera (verde), p. ej. "Datos traídos de SUNAT". */
  aviso?: React.ReactNode;
  /** Contexto neutro a la izquierda (conteos, totales, qué falta). */
  nota?: React.ReactNode;
  /** Muestra "Ctrl + Enter guarda" cuando no hay nada más que decir. */
  atajo?: boolean;
  children: React.ReactNode;
}) {
  // `div`, no `p`: el aviso y la nota reciben ReactNode de quien llama, y ya
  // hubo quien mandó un `<details>` con su `<ul>` adentro. Un `<p>` no admite
  // contenido de bloque — el HTML se auto-cierra al parsear y React tira error
  // de hidratación. El `div` acepta cualquier cosa y `role="alert"` sigue
  // anunciando el error igual.
  const mensaje = error ? (
    <div role="alert" className="min-w-0 flex-1 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
      {error}
    </div>
  ) : aviso ? (
    <div className="min-w-0 flex-1 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</div>
  ) : nota ? (
    <div className="min-w-0 flex-1 text-sm text-[var(--text-tertiary)]">{nota}</div>
  ) : atajo ? (
    <div className="hidden min-w-0 flex-1 text-xs text-[var(--text-tertiary)] sm:block">
      <kbd className="rounded border border-[var(--rule-base)] px-1 py-0.5 font-mono text-[length:var(--ts-2xs,11px)]">Ctrl</kbd>
      {" + "}
      <kbd className="rounded border border-[var(--rule-base)] px-1 py-0.5 font-mono text-[length:var(--ts-2xs,11px)]">Enter</kbd>
      {" guarda"}
    </div>
  ) : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      {mensaje}
      {children}
    </div>
  );
}
