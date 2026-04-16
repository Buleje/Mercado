import { AdminProviders } from "./providers";
import "./print.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>;
}
