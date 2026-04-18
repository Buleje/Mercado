import { PageTitle } from "@buleje/design-system";
import Link from "next/link";
import { Search } from "@buleje/design-system/icons";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] p-4">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--data-info-50)] text-[var(--data-info)] dark:bg-[var(--data-info)]/20 dark:text-[var(--data-info)]">
            <Search className="h-8 w-8" />
          </div>
        </div>
        <PageTitle className="text-2xl font-bold text-[var(--text-primary)]">
          Pagina no encontrada
        </PageTitle>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Esta seccion del panel no existe o fue movida.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-lg bg-[var(--accent-soft)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] transition-colors"
        >
          Ir al panel principal
        </Link>
      </div>
    </div>
  );
}
