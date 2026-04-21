import { AdminProviders } from "./providers";
import { SkipLink } from "@/components/ui-system/SkipLink";
import "./print.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProviders>
      {/* Skip-link WCAG 2.4.1 — apunta al <main id="main-content"> en AdminMainContent. */}
      <SkipLink />
      {children}
    </AdminProviders>
  );
}
