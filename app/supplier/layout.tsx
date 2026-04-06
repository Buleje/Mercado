import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Portal Proveedor | Buleje",
    template: "%s | Portal Proveedor · Buleje",
  },
};

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {children}
    </div>
  );
}
