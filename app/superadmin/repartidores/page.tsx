import RepartidoresModule from "@/components/superadmin/RepartidoresModule";

export const metadata = {
  title: "Repartidores · Superadmin",
  robots: { index: false, follow: false },
};

export default function RepartidoresSuperadminPage() {
  return <RepartidoresModule />;
}
