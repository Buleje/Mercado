import { redirect } from "next/navigation";

// `/nosotros` es alias canónico del anchor `/#nosotros` en la landing
// consolidada (ver `components/landing/sections/NosotrosSection.tsx`).
export default function NosotrosPage() {
  redirect("/#nosotros");
}
