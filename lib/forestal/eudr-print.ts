"use client";

import type { DdsData } from "@/lib/forestal/eudr-types";

/**
 * eudr-print — Declaración de Diligencia Debida (DDS) imprimible (ADR-140).
 * Documento para acompañar la colocación en el mercado de la UE (Reg. 2023/1115).
 * Patrón window.open→print (igual que ctp-informe / ctp-traza-print).
 */

export interface DdsEmisor {
  razonSocial?: string;
  ruc?: string;
  codigoCtp?: string;
  registroArffs?: string;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const coord = (lat: number | null, lng: number | null, poly: boolean): string =>
  lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : poly ? "polígono (GeoJSON adjunto)" : "— sin geolocalizar —";

export function imprimirDds(dds: DdsData, emisor?: DdsEmisor): void {
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) return;

  const negligible = dds.riesgo === "negligible";
  const fecha = new Date(dds.generadoAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  const plotsRows = dds.plots.map((p) => `
    <tr>
      <td><strong>${esc(p.originCode)}</strong><br><span class="muted">${esc(p.originType)}${p.region ? " · " + esc(p.region) : ""}</span></td>
      <td>${esc(coord(p.lat, p.lng, p.hasPolygon))}</td>
      <td class="center">${esc(p.pais)}</td>
      <td class="center">${p.deforestationFree ? "✓ Sí" : '<span class="bad">✗ No atestado</span>'}</td>
      <td>${esc(p.gtfs.join(", ") || "—")}</td>
      <td>${esc(p.especies.join(", ") || "—")}${p.cites ? ' <span class="cites">CITES</span>' : ""}</td>
    </tr>`).join("");

  const gapsList = dds.gaps.length ? `<ul class="gaps">${dds.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : "";

  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>DDS EUDR — despacho ${esc(dds.gtfSalida ?? dds.despachoId)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;line-height:1.5}
    h1{font-size:20px;margin:0 0 2px} h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
    .muted{color:#777;font-size:12px} .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px}
    .verdict{margin:16px 0;padding:14px 16px;border-radius:10px;font-weight:700}
    .ok{background:#e7f6ec;color:#0a7d33;border:2px solid #0a7d33}
    .no{background:#fdecec;color:#b91c1c;border:2px solid #b91c1c}
    table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f4f4f4;font-size:11px;text-transform:uppercase;letter-spacing:.03em} .center{text-align:center}
    .bad{color:#b91c1c;font-weight:700} .cites{background:#fde68a;color:#92400e;font-size:10px;font-weight:700;padding:1px 5px;border-radius:6px}
    .gaps{color:#b91c1c;font-size:13px;margin:8px 0 0} .kv{display:grid;grid-template-columns:auto 1fr;gap:2px 16px;font-size:13px}
    .kv dt{color:#666} .sign{margin-top:48px;display:flex;gap:64px} .sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px;color:#555}
    .foot{margin-top:28px;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:8px}
    @media print{body{margin:12mm}}
  </style></head><body>
    <div class="hdr">
      <div>
        <h1>Declaración de Diligencia Debida (DDS)</h1>
        <div class="muted">Reglamento (UE) 2023/1115 — productos libres de deforestación</div>
      </div>
      <div style="text-align:right">
        <strong>${esc(emisor?.razonSocial || "Centro de Transformación Primaria")}</strong><br>
        <span class="muted">${emisor?.ruc ? "RUC " + esc(emisor.ruc) : ""}${emisor?.codigoCtp ? " · CTP " + esc(emisor.codigoCtp) : ""}</span><br>
        <span class="muted">Emitido: ${esc(fecha)}</span>
      </div>
    </div>

    <div class="verdict ${negligible ? "ok" : "no"}">
      ${negligible ? "✓ Riesgo evaluado como NEGLIGIBLE — cadena de custodia completa, orígenes geolocalizados y atestados sin deforestación (post-2020)." : "✗ Riesgo NO negligible: no se puede colocar en el mercado de la UE hasta cerrar los huecos:"}
      ${negligible ? "" : gapsList}
    </div>

    <h2>Producto despachado</h2>
    <dl class="kv">
      <dt>Producto</dt><dd>${esc(dds.producto)}${dds.cites ? ' <span class="cites">CITES</span>' : ""}</dd>
      <dt>Especie</dt><dd>${esc(dds.especie)}</dd>
      <dt>Cantidad</dt><dd>${esc(dds.cantidad)} ${esc(dds.unidad)}</dd>
      <dt>Destino</dt><dd>${esc(dds.destino || "—")}</dd>
      <dt>GTF de salida</dt><dd>${esc(dds.gtfSalida || "—")}</dd>
      <dt>País de producción</dt><dd>${esc(dds.pais)} (Perú)</dd>
    </dl>

    <h2>Parcelas de origen (geolocalización)</h2>
    <table>
      <thead><tr><th>Origen</th><th>Coordenadas (WGS84)</th><th>País</th><th>Sin deforestación</th><th>GTF de ingreso</th><th>Especies</th></tr></thead>
      <tbody>${plotsRows || '<tr><td colspan="6" class="center muted">Sin orígenes trazados.</td></tr>'}</tbody>
    </table>

    <h2>Trazabilidad y legalidad</h2>
    <p style="font-size:13px">Cadena de custodia: <strong>${dds.trazabilidadCompleta ? "completa" : "INCOMPLETA"}</strong> (despacho → corridas de producción → guías de transporte forestal de ingreso). Producción amparada por el Libro de Operaciones del CTP conforme a la Ley Forestal 29763 y su reglamento (D.S. 018-2015-MINAGRI). ${emisor?.registroArffs ? "Registro ARFFS: " + esc(emisor.registroArffs) + "." : ""}</p>

    <div class="sign">
      <div>Firma del operador / representante legal</div>
      <div>Fecha y lugar</div>
    </div>
    <div class="foot">Documento generado por el módulo Libro de Operaciones CTP (ADR-140). Este DDS acompaña la colocación en el mercado de la UE; los datos de geolocalización deben corresponder a la parcela de cosecha real.</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
  </body></html>`);
  w.document.close();
}
