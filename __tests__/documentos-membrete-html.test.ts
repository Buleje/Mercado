/** El membrete en HTML: lo del negocio sale escapado y el logo sólo si es seguro. */
import { describe, expect, it } from "vitest";
import { datosDelMembrete } from "@/lib/documentos/membrete-pdf";
import { escaparHtml, membreteHtml, srcSeguroDelLogo } from "@/lib/documentos/membrete-html";

const DOC = { tipo: "Liquidación", codigo: "LIQ-0007", fecha: "jueves 08/10/2026" };

describe("membreteHtml", () => {
  it("escapa el nombre y los datos del negocio", () => {
    const m = datosDelMembrete({ nombre: `Bodega <script>alert("x")</script>`, direccion: "Jr. O'Higgins & Tacna" }, DOC);
    const { cabecera } = membreteHtml(m);
    expect(cabecera).not.toContain("<script>");
    expect(cabecera).toContain("Bodega &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(cabecera).toContain("Jr. O&#39;Higgins &amp; Tacna");
    expect(cabecera).toContain("LIQ-0007");
  });

  it("sin logo pone el monograma; con un logo seguro, la imagen", () => {
    expect(membreteHtml(datosDelMembrete({ nombre: "Buleje" }, DOC)).cabecera).toContain(`<div class="mbr-mono" aria-hidden="true">B</div>`);
    const conLogo = membreteHtml(datosDelMembrete({ nombre: "Blas", logoUrl: "https://x.supabase.co/logo.webp" }, DOC)).cabecera;
    expect(conLogo).toContain(`<img class="mbr-logo" src="https://x.supabase.co/logo.webp"`);
  });

  it("el pie lleva la hora de emisión en Lima y los estilos no traen hex", () => {
    const { pie, estilos } = membreteHtml(datosDelMembrete({ nombre: "Buleje" }, DOC), { emitido: new Date("2026-10-23T20:05:00.000Z") });
    expect(pie).toContain("Emitido el viernes 23/10/2026 · 15:05 (hora de Lima)");
    expect(estilos).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("srcSeguroDelLogo", () => {
  it("acepta data URL de imagen, https y rutas propias; rechaza javascript:, http y //otro", () => {
    expect(srcSeguroDelLogo("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(srcSeguroDelLogo("/api/admin/membrete/logo?v=abc")).toBe("/api/admin/membrete/logo?v=abc");
    expect(srcSeguroDelLogo("javascript:alert(1)")).toBeNull();
    expect(srcSeguroDelLogo("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(srcSeguroDelLogo("http://inseguro.pe/logo.png")).toBeNull();
    expect(srcSeguroDelLogo("//otro.pe/logo.png")).toBeNull();
    expect(srcSeguroDelLogo(`https://x.pe/a.png" onerror="alert(1)`)).toBeNull();
    expect(escaparHtml(`<a href="x">`)).toBe("&lt;a href=&quot;x&quot;&gt;");
  });
});
