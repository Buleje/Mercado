import { escapeHtml } from "@/lib/safe-html";

/** Tipos, formularios vacíos y ayudas de Promociones (antes arriba de PromotionsTab). */
export function safeMdToHtml(md: string): string {
  return md.split("\n").map(line => {
    const safe = escapeHtml(line);
    const rich = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">$1</strong>')
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (line.startsWith("### ")) return `<h3 class="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-3 mb-0.5">${rich.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2 class="text-base font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-4 mb-1 pb-1 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">${rich.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1 class="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-4 mb-2">${rich.slice(2)}</h1>`;
    if (/^[-*] /.test(line)) return `<li class="ml-5 list-disc text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed text-sm">${rich.slice(2)}</li>`;
    if (/^\d+\. /.test(line)) return `<li class="ml-5 list-decimal text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed text-sm">${rich.replace(/^\d+\.\s/, "")}</li>`;
    if (line === "") return '<div class="h-2"></div>';
    return `<p class="text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed text-sm">${rich}</p>`;
  }).join("");
}

export type PromoForm = {
  name: string;
  description: string;
  discountPercent: number;
  minPurchase: string;
  imageUrl: string;
  message: string;
  targetType: string;
  expiresAt: string;
};

export type ScheduledCampaign = {
  id: string;
  name: string;
  description: string;
  targetSegment: string;
  startDate: string;
  endDate: string;
  messageTemplate: string;
  discountCode: string;
  autoSend: boolean;
  status: "scheduled" | "active" | "completed" | "paused";
  createdAt: string;
};

export const emptyForm: PromoForm = {
  name: "", description: "", discountPercent: 0, minPurchase: "",
  imageUrl: "", message: "", targetType: "all", expiresAt: "",
};

export const emptyCampaign: Omit<ScheduledCampaign, "id" | "createdAt" | "status"> = {
  name: "", description: "", targetSegment: "all",
  startDate: "", endDate: "", messageTemplate: "", discountCode: "", autoSend: false,
};

/** Reemplaza `{TIENDA}` con el nombre del negocio dinámicamente. */
export function applyStoreName(template: string, storeName: string): string {
  return template.replace(/\{TIENDA\}/g, `*${storeName}*`);
}
