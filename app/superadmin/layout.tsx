import type { ReactNode } from "react";

export const metadata = {
  title: "Platform Admin — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="bg-gray-950 antialiased">
        {children}
      </body>
    </html>
  );
}
