import { redirect } from "next/navigation";

// `/como-funciona` es alias canónico del anchor `/#como-funciona` en la landing
// consolidada (ver `components/landing/sections/ComoFuncionaSection.tsx`).
export default function ComoFuncionaPage() {
  redirect("/#como-funciona");
}
