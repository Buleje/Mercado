/**
 * Kbd — una tecla dibujada como tecla.
 *
 * Vive suelto porque lo usan los pies de página que anuncian atajos y las hojas
 * de ayuda; sin él cada lugar inventa su propio `<kbd>` con otro borde.
 */
export default function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">
      {children}
    </kbd>
  );
}
