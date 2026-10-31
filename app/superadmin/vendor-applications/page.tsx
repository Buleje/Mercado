import { PestanasDelModulo } from "@/components/admin/shared/cabecera-compacta";
import VendorApplicationsModule from "@/components/superadmin/VendorApplicationsModule";
import { VendorsTabs } from "@/components/superadmin/_shared/VendorsTabs";

export default function VendorApplicationsPage() {
  return (
    <PestanasDelModulo pestanas={<VendorsTabs enLinea />}>
      <VendorApplicationsModule />
    </PestanasDelModulo>
  );
}
