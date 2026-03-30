import type { ReactNode } from "react";

export const metadata = {
  title: "Platform Admin — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white antialiased">
      {children}
    </div>
  );
}
