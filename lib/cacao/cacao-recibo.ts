/**
 * Recibo de liquidación al productor de cacao (ADR-128).
 * Client-safe: NO importar prisma ni lib/db. Abre ventana imprimible (patrón
 * de PurchaseOrderPDF). El productor se lleva su comprobante de pago.
 */
import { GRADO_LABEL, type CacaoGrado } from "@/lib/cacao/cacao-quality";

export interface ReciboLote {
  loteCode: string;
  fecha: string;
  productorNombre: string | null;
  variedad: string | null;
  tipoGrano: string;
  pesoKg: string | number;
  humedadPct: string | number | null;
  precioPorKg: string | number | null;
  premioPorKg?: string | number | null;
  totalPagado: string | number | null;
  grado: string | null;
  indiceFermentacion?: string | number | null;
}

const money = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : `S/ ${Number(v).toFixed(2)}`;
const n2 = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : Number(v).toFixed(2);
const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fdate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }); }
  catch { return iso; }
};

export function printCacaoRecibo(lote: ReciboLote, acopiador = "Acopio de Cacao") {
  if (typeof window === "undefined") return;
  const grado = lote.grado ? (GRADO_LABEL[lote.grado as CacaoGrado] ?? lote.grado) : "Sin clasificar";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>Recibo ${esc(lote.loteCode)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; }
  .doc { max-width: 720px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #166534; padding-bottom: 16px; }
  .brand { font-size: 20px; font-weight: 800; color: #166534; }
  .brand small { display: block; font-size: 11px; font-weight: 500; color: #555; letter-spacing: .08em; text-transform: uppercase; }
  .doctype { text-align: right; }
  .doctype .t { font-size: 13px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #555; }
  .doctype .code { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 20px 0; font-size: 14px; }
  .meta .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
  .meta .row span:first-child { color: #666; }
  .meta .row span:last-child { font-weight: 700; }
  .total { margin-top: 16px; background: #f0fdf4; border: 2px solid #166534; border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
  .total .lbl { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #166534; }
  .total .val { font-size: 28px; font-weight: 800; color: #166534; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 64px; }
  .sign { border-top: 1px solid #999; padding-top: 6px; text-align: center; font-size: 12px; color: #666; }
  .foot { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style></head><body><div class="doc">
  <div class="head">
    <div class="brand">${esc(acopiador)}<small>Recibo de liquidación · Cacao</small></div>
    <div class="doctype"><div class="t">Lote</div><div class="code">${esc(lote.loteCode)}</div></div>
  </div>
  <div class="meta">
    <div class="row"><span>Fecha</span><span>${fdate(lote.fecha)}</span></div>
    <div class="row"><span>Productor</span><span>${esc(lote.productorNombre) || "—"}</span></div>
    <div class="row"><span>Variedad</span><span>${esc(lote.variedad) || "—"} ${lote.tipoGrano === "humedo" ? "(húmedo)" : "(seco)"}</span></div>
    <div class="row"><span>Grado de calidad</span><span>${esc(grado)}</span></div>
    <div class="row"><span>Peso</span><span>${n2(lote.pesoKg)} kg</span></div>
    <div class="row"><span>Humedad</span><span>${lote.humedadPct != null ? Number(lote.humedadPct).toFixed(1) + " %" : "—"}</span></div>
    <div class="row"><span>Precio por kg</span><span>${money(lote.precioPorKg)}</span></div>
    <div class="row"><span>Premio por kg</span><span>${money(lote.premioPorKg)}</span></div>
  </div>
  <div class="total"><span class="lbl">Total pagado al productor</span><span class="val">${money(lote.totalPagado)}</span></div>
  <div class="signs">
    <div class="sign">Productor / Conformidad</div>
    <div class="sign">Acopiador / Responsable</div>
  </div>
  <div class="foot">Comprobante interno de acopio · No es comprobante de pago electrónico SUNAT.</div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}
