import VendorApplicationsModule from "@/components/superadmin/VendorApplicationsModule";
import { SuperAdminModuleTabs, VENDORS_TABS } from "@/components/superadmin/_shared/ModuleTabs";

export default function VendorApplicationsPage() {
  return (
    <>
      <SuperAdminModuleTabs tabs={VENDORS_TABS} />
      <VendorApplicationsModule />
    </>
  );
}
