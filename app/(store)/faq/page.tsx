import { redirect } from "next/navigation";

// `/faq` es alias canónico del anchor `/#faq` en la landing consolidada
// (ver `components/landing/sections/FAQSection.tsx`).
export default function FaqPage() {
  redirect("/#faq");
}
