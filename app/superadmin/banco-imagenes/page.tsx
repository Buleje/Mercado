import { Images } from "lucide-react";
import ImageBankClient from "./ImageBankClient";

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
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Images className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Marketplace · Recursos
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Banco de imágenes
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                Imágenes globales por rubro. Subí una foto de &quot;Inca Kola 500ml&quot; una sola vez y
                todos los tenants pueden usarla en sus productos. Agregá categorías e ítems según
                las necesidades de los negocios.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ImageBankClient />
      </div>
    </div>
  );
}
