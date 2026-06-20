import "server-only";
import { History } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";
import { AuditLogConsole } from "./AuditLogConsole";

export const metadata = {
  title: "Auditoría del superadmin — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/audit-log — Registro de acciones del superadmin (Brandon
 * 2026-06-19, idea #F): impersonaciones y acciones sensibles, quién y cuándo.
 */
export default async function AuditLogPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <History className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Plataforma · Seguridad
              </p>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Auditoría del superadmin
                <InfoTip
                  side="bottom"
                  title="Auditoría del superadmin"
                  what="Registro de las acciones sensibles del superadmin: cada vez que alguien impersona un negocio, aprueba un pago, manda un broadcast o cambia una automatización."
                  affects="Solo lectura. Es la trazabilidad de quién entró a qué negocio y qué hizo — confianza y rendición de cuentas. Exportable a CSV."
                  example="Si necesitás saber quién entró al panel de una tienda y cuándo, filtrás por 'impersonate' y lo ves con fecha, operador y negocio."
                />
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
                Quién impersonó qué negocio y qué acción sensible hizo, con fecha y operador.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <AuditLogConsole />
      </div>
    </div>
  );
}
