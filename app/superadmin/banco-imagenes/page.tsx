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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-[var(--text-tertiary)] font-bold">
          Marketplace · Recursos
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
          Banco de Imágenes
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
          Imágenes globales por rubro. Subí una foto de &quot;Inca Kola 500ml&quot;
          una sola vez y todos los tenants pueden usarla en sus productos.
          Agregá categorías y items según las necesidades de los negocios.
        </p>
      </div>
      <ImageBankClient />
    </div>
  );
}
