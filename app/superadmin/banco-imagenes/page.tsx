import { Images } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ImageBankClient from "./ImageBankClient";
import { SUPERADMIN_PAGE, SUPERADMIN_HERO } from "@/lib/superadmin-layout";
import { SuperAdminModuleTabs, MARCA_TABS } from "@/components/superadmin/_shared/ModuleTabs";

/**
 * /superadmin/banco-imagenes
 *
 * Banco global de imágenes por rubro (Pollería, Bebidas, Pizzería, etc.).
 * Cada categoría tiene items típicos del rubro (ej: 1/4 Pollo, Inca Kola)
 * y el superadmin sube la foto. Los tenants reusan estas imágenes al
 * crear/editar productos sin tener que subir la suya.
 */
export default function SuperadminImageBankPage() {
  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={MARCA_TABS} />
      <header className={SUPERADMIN_HERO}>
        <div className="w-full">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Images className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Marketplace · Recursos
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Banco de imágenes
                </h1>
                <InfoTip
                  side="bottom"
                  title="Banco de imágenes"
                  what="Fotos globales por rubro. Subes una vez y todos los negocios la usan en sus productos."
                  affects="Quedan disponibles para productos, banners y portadas del marketplace."
                  example="Subes «Inca Kola 500 ml» → cualquier tienda la elige sin subir la suya."
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ImageBankClient />
      </div>
    </div>
  );
}
