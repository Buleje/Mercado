"use client";

/**
 * ctp-certificado-css — el papel compartido de los certificados internos de
 * trazabilidad (`ctp-certificado.ts` de un despacho, `lote-certificado.ts` de
 * un lote). NO son el documento oficial de SERFOR —cada uno lo dice en su
 * pie— así que, a diferencia de la GTF (`ctp-documento-print.ts`), pueden
 * verse elegantes sin arriesgar la fidelidad a un formato ajeno.
 *
 * Antes cada archivo traía su propio `<style>` casi idéntico (mismo verde,
 * mismo doble filete, misma caja redondeada) — un ajuste visual en uno se
 * olvidaba en el otro y con el tiempo divergían. Single source (Brandon
 * 2026-08-20, "bordes elegantes... aplicable a todas las páginas"): sale de
 * acá una vez y los dos certificados quedan iguales para siempre.
 */
export const CSS_CERTIFICADO_TRAZABILIDAD = `
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1f2937; font-size: 13px; line-height: 1.55; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #14532d; padding-bottom: 12px; }
    .emp { font-size: 17px; font-weight: 700; }
    .ruc { font-size: 11px; color: #4b5563; }
    .nro { text-align: right; font-size: 11px; color: #4b5563; }
    .nro b { display: block; font-size: 16px; color: #14532d; font-family: monospace; }
    h1 { text-align: center; font-size: 20px; letter-spacing: 2px; color: #14532d; margin: 26px 0 2px; }
    .sub { text-align: center; font-size: 11px; color: #6b7280; margin: 0 0 22px; text-transform: uppercase; letter-spacing: 1px; }
    .decl { text-align: justify; margin: 0 0 18px; }
    .box { border: 1.5px solid #14532d; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    @media screen { .box { box-shadow: 0 1px 2px rgba(20,83,45,.05), 0 6px 16px rgba(20,83,45,.06); } }
    .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #14532d; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .grid div b { color: #111827; }
    .lbl { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #14532d; border-bottom: 1.5px solid #14532d; padding: 4px 6px; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
    .mono { font-family: monospace; font-variant-numeric: tabular-nums; }
    /* Los códigos de pieza son muchos y cortos: se dejan fluir en varias líneas
       en vez de estirar la columna y romper el A4 (sólo lo usa el certificado
       de lote, que detalla trozas; el de despacho no tiene esa tabla). */
    .codigos { font-size: 10px; line-height: 1.5; word-break: break-word; }
    .right { text-align: right; }
    .cites { color: #b91c1c; font-weight: 700; }
    .firma { margin-top: 48px; display: flex; justify-content: space-between; gap: 40px; }
    .firma div { flex: 1; text-align: center; border-top: 1px solid #374151; padding-top: 6px; font-size: 11px; color: #4b5563; }
    .verif { margin-top: 22px; display: flex; align-items: center; gap: 14px; border: 1px dashed #14532d; border-radius: 8px; padding: 10px 14px; }
    .verif img { width: 86px; height: 86px; }
    .verif .vt { font-size: 11px; color: #374151; line-height: 1.5; }
    .verif .vt b { color: #14532d; }
    .verif .vu { font-family: monospace; font-size: 9px; color: #6b7280; word-break: break-all; }
    .foot { margin-top: 20px; font-size: 9.5px; color: #9ca3af; border-top: 1px dashed #d1d5db; padding-top: 8px; }
`;
