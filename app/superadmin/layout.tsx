import type { ReactNode } from "react";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import SuperAdminShell from "@/components/superadmin/SuperAdminShell";

export const metadata = {
  title: "Platform Admin — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { username } = await requirePlatformPage();

  return (
    <SuperAdminShell username={username}>
      {children}
    </SuperAdminShell>
  );
}
