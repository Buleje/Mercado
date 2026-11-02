/** Las vistas de Buleje IA, en `?vista=` (sin parámetro = el chat). */
export const VISTAS_IA = ["chat", "modelos", "memoria", "conectar"] as const;
export type VistaIa = (typeof VISTAS_IA)[number];

export const TITULO_VISTA: Record<VistaIa, string> = {
  chat: "Buleje IA",
  modelos: "Modelos",
  memoria: "Lo que recuerda",
  conectar: "Conectar apps",
};

export function leerVista(valor: string | null): VistaIa {
  return (VISTAS_IA as readonly string[]).includes(valor ?? "") ? (valor as VistaIa) : "chat";
}

/** La URL de una vista (y la conversación abierta, si es el chat). */
export function urlDeVista(vista: VistaIa, conversacionId?: string | null): string {
  const p = new URLSearchParams();
  if (vista !== "chat") p.set("vista", vista);
  if (vista === "chat" && conversacionId) p.set("c", conversacionId);
  const qs = p.toString();
  return `/admin/ia${qs ? `?${qs}` : ""}`;
}
