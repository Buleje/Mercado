"use client";

/**
 * loth-labels.ts — Etiquetas QR imprimibles de trozas/árboles (Batch 4).
 * Cada etiqueta lleva código + especie + medidas + QR que apunta a
 * /verificar/[code] (certificado público de origen). QR real vía `qrcode`.
 */
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: string | null, dp = 2) => (v == null ? "—" : Number(v).toFixed(dp));

export async function printTrozaLabels(
  entries: LothEntryDTO[],
  opts: { origin: string; titular?: string | null; planNumber?: string | null },
): Promise<number> {
  const labelable = entries.filter((e) => (e.trozaCode || e.treeCode) && e.status !== "anulado");
  if (labelable.length === 0) return 0;

  const QR = (await import("qrcode")).default;
  const cards = await Promise.all(
    labelable.map(async (e) => {
      const code = (e.trozaCode ?? e.treeCode) as string;
      const url = `${opts.origin}/verificar/${encodeURIComponent(code)}`;
      const qr = await QR.toDataURL(url, { margin: 1, width: 150, errorCorrectionLevel: "M" });
      const dims = e.diamMayorM || e.lengthM
        ? `Ø ${n(e.diamMayorM)}/${n(e.diamMenorM)} m · L ${n(e.lengthM)} m`
        : "";
      return `<div class="label">
        <div class="lhead">
          <div>
            <div class="code">${esc(code)}${e.isRama ? " <span class='r'>R</span>" : ""}</div>
            <div class="sp">${esc(e.speciesCommon ?? "")}${e.cites ? " <b class='cites'>CITES</b>" : ""}</div>
          </div>
          <img class="qr" src="${qr}" alt="QR ${esc(code)}" />
        </div>
        <div class="meta">${esc(dims)}${e.volumeM3 ? ` · ${n(e.volumeM3, 4)} m³` : ""}</div>
        <div class="foot">
          <span>${esc(opts.planNumber ?? opts.titular ?? "")}</span>
          <span class="org">Origen SERFOR · escaneá para verificar</span>
        </div>
      </div>`;
    }),
  );

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de trozas</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; color: #111827; }
    .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
    .label { border: 1.5px solid #14532d; border-radius: 8px; padding: 10px 12px; height: 46mm; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid; }
    .lhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .code { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .code .r { font-size: 11px; background: #e5e7eb; border-radius: 4px; padding: 1px 4px; vertical-align: middle; }
    .sp { font-size: 13px; color: #374151; margin-top: 2px; }
    .cites { color: #b91c1c; font-size: 10px; }
    .qr { width: 76px; height: 76px; }
    .meta { font-size: 12px; color: #4b5563; font-variant-numeric: tabular-nums; }
    .foot { display: flex; justify-content: space-between; align-items: flex-end; font-size: 9px; color: #6b7280; border-top: 1px dashed #d1d5db; padding-top: 4px; }
    .org { color: #14532d; font-weight: 600; }
  </style></head><body>
    <div class="sheet">${cards.join("")}</div>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir etiquetas.");
  w.document.write(html);
  w.document.close();
  w.focus();
  return labelable.length;
}
