import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VISTAS_POR_MODULO } from "@/lib/admin/subvistas-modulos";

/**
 * `VISTAS_POR_MODULO` es un espejo: declara las sub-vistas de cada módulo para
 * que el buscador global pueda ofrecerlas SIN importar el módulo (que es lazy y
 * arrastraría medio panel a su chunk).
 *
 * Un espejo se desincroniza solo. Sin este test, renombrar una pestaña deja al
 * buscador ofreciendo un destino que ya no existe —click y no pasa nada— y
 * agregar una la deja invisible. Se lee el SOURCE de cada módulo y se comparan
 * los ids: es feo, y es el precio de no poder importarlos.
 */

const RAIZ = join(__dirname, "..");

/** Dónde vive cada módulo y de dónde salen sus ids. */
const MODULOS: Record<string, { archivo: string; extraer: (src: string) => string[] }> = {
  "ventas-caja": { archivo: "components/admin/unified/POSCajaModule.tsx", extraer: idsDeTABS },
  compras: { archivo: "components/admin/unified/ComprasModule.tsx", extraer: idsDeTABS },
  inventario: { archivo: "components/admin/unified/InventarioAlmacenesModule.tsx", extraer: idsDeTABS },
  clientes: { archivo: "components/admin/unified/CRMClientesModule.tsx", extraer: idsDeTABS },
  "mensajes-hub": { archivo: "components/admin/unified/MensajesHubModule.tsx", extraer: idsDeTABS },
  "crecimiento-hub": { archivo: "components/admin/unified/CrecimientoHubModule.tsx", extraer: idsDeTABS },
  "documentos-hub": { archivo: "components/admin/unified/DocumentosHubModule.tsx", extraer: idsDeTABS },
  "analisis-hub": { archivo: "components/admin/unified/AnalisisHubModule.tsx", extraer: idsDeTABS },
  "asistente-ia-hub": { archivo: "components/admin/unified/AsistenteIAHubModule.tsx", extraer: idsDeTABS },
  "sistema-hub": { archivo: "components/admin/unified/SistemaHubModule.tsx", extraer: idsDeTABS },
  "equipo-hub": { archivo: "components/admin/unified/EquipoHubModule.tsx", extraer: idsDeTABS },
  "mi-tienda-hub": { archivo: "components/admin/unified/MiTiendaHubModule.tsx", extraer: idsDeTABS },
  recetas: { archivo: "components/admin/RecetasModule.tsx", extraer: idsDeRecetas },
  // Mi Plata es de dos niveles: las vistas direccionables son las HOJAS (la
  // sección dentro de la pestaña), no las pestañas.
  plata: { archivo: "components/admin/unified/FinanzasModule.tsx", extraer: idsDeFinanzas },
};

/** Los `id: "..."` del bloque `const TABS = [...]`. */
function idsDeTABS(src: string): string[] {
  const bloque = src.match(/const TABS(?::\s*[^=]+)?\s*=\s*\[([\s\S]*?)\n\];/);
  if (!bloque) return [];
  return [...bloque[1].matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function idsDeRecetas(src: string): string[] {
  const bloque = src.match(/const RECETAS_VISTAS = \[([^\]]+)\]/);
  if (!bloque) return [];
  return [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Las hojas de Mi Plata: la sub-vista de cada pestaña, o la pestaña misma
 * cuando no se divide. Es la misma cuenta que hace `VISTAS` en el componente.
 */
function idsDeFinanzas(src: string): string[] {
  const tabs = idsDeTABS(src);
  const bloque = src.match(/const SUBS[^=]*=\s*\{([\s\S]*?)\n\};/);
  const subsPorTab = new Map<string, string[]>();
  if (bloque) {
    // Cada entrada cierra con `\n  ],` — incluida la última. Un lookahead por
    // "la próxima clave" se comía el último bloque (perdía `activos`).
    for (const m of bloque[1].matchAll(/"?([\w-]+)"?:\s*\[([\s\S]*?)\n\s{2}\],/g)) {
      subsPorTab.set(m[1], [...m[2].matchAll(/\bid:\s*"([^"]+)"/g)].map((x) => x[1]));
    }
  }
  return tabs.flatMap((t) => subsPorTab.get(t) ?? [t]);
}

describe("VISTAS_POR_MODULO refleja las pestañas reales de cada módulo", () => {
  it("declara todos los módulos que dice cubrir", () => {
    expect(Object.keys(VISTAS_POR_MODULO).sort()).toEqual(Object.keys(MODULOS).sort());
  });

  for (const [moduleId, { archivo, extraer }] of Object.entries(MODULOS)) {
    it(`${moduleId} — los ids coinciden con ${archivo.split("/").pop()}`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");
      const reales = extraer(src);

      // Si la extracción falla, el test tiene que caerse — no dar por bueno un
      // array vacío, que compararía "nada contra nada" y pasaría siempre.
      expect(reales.length, `no se pudieron extraer los ids de ${archivo}`).toBeGreaterThan(0);

      const declaradas = VISTAS_POR_MODULO[moduleId].map((v) => v.key);
      expect([...declaradas].sort()).toEqual([...reales].sort());
    });
  }

  /**
   * Y las ETIQUETAS también: el buscador tiene que ofrecer la pestaña con el
   * nombre que la persona va a leer cuando llegue. Escribí "Kardex", "Arqueo" y
   * "Reseñas" de memoria y en pantalla dicen "Entradas y Salidas", "Cuadrar
   * Caja" y "Opiniones" — buscar por el nombre real no encontraba nada.
   */
  for (const [moduleId, { archivo, extraer }] of Object.entries(MODULOS)) {
    if (extraer !== idsDeTABS) continue; // sólo los de `TABS` con label
    it(`${moduleId} — las etiquetas son las que se ven en pantalla`, () => {
      const src = readFileSync(join(RAIZ, archivo), "utf8");
      const bloque = src.match(/const TABS(?::\s*[^=]+)?\s*=\s*\[([\s\S]*?)\n\];/);
      const reales = new Map(
        [...bloque![1].matchAll(/\bid:\s*"([^"]+)"(?:\s*as const)?\s*,\s*label:\s*"([^"]+)"/g)].map(
          (m) => [m[1], m[2]] as const,
        ),
      );
      expect(reales.size).toBeGreaterThan(0);
      for (const v of VISTAS_POR_MODULO[moduleId]) {
        expect(v.label, `${moduleId}/${v.key}`).toBe(reales.get(v.key));
      }
    });
  }

  it("ninguna vista se declara sin etiqueta ni pista", () => {
    for (const [moduleId, vistas] of Object.entries(VISTAS_POR_MODULO)) {
      for (const v of vistas) {
        expect(v.label.trim(), `${moduleId}/${v.key}`).not.toBe("");
        expect(v.hint.trim(), `${moduleId}/${v.key}`).not.toBe("");
      }
    }
  });
});
