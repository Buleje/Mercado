import { Images } from "@buleje/design-system/icons";
import ImageBankClient from "./ImageBankClient";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
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
      <CabeceraConPestanas
        icon={Images}
        title="Banco de imágenes"
        kicker="Marketplace · Recursos"
        info={{
          title: "Banco de imágenes",
          what: "Fotos globales por rubro. Subes una vez y todos los negocios la usan en sus productos.",
          affects: "Quedan disponibles para productos, banners y portadas del marketplace.",
          example: "Subes «Inca Kola 500 ml» → cualquier tienda la elige sin subir la suya.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={MARCA_TABS} />}
      />

      <div className={SUPERADMIN_CONTENT}>
        <ImageBankClient />
      </div>
    </div>
  );
}
