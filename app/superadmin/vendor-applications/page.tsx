import VendorApplicationsModule from "@/components/superadmin/VendorApplicationsModule";
import { VendorsTabs } from "@/components/superadmin/_shared/VendorsTabs";

export default function VendorApplicationsPage() {
  return (
    <>
      <VendorsTabs />
      <VendorApplicationsModule />
    </>
  );
}
