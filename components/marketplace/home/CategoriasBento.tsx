import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Reveal } from "@/components/landing/Reveal";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import {
  CategoriaTile,
  CeldaGrande,
  CeldaVerTodas,
  type TileCategoria,
} from "@/components/marketplace/home/CategoriaTile";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { logger } from "@/lib/logger";
import {
  FAMILIAS,
  claveCategoria,
  etiquetaCategoria,
  familiaDe,
  type FamiliaId,
} from "@/lib/marketplace/familias-categoria";

/**
 * «¿Qué se te antoja?» — bento de categorías de la home «Dosel» (md+; en el
 * celular mandan los chips del chrome). Dos celdas grandes con la ilustración
 * 3D del rubro (Comida lista a la izquierda, Bodega a la derecha) y, entre
 * ellas, un bloque de celdas chicas con las categorías de PRODUCTO reales.
 *
 * Sin huecos: el bloque del medio mide 2 filas × (cols − 4) columnas. En lg
 * (10 cols) son 12 celdas = 11 categorías + «Ver todas»; en md (6 cols) son 4
 * = 3 + «Ver todas». Las que sobran en md se ocultan con `hidden lg:flex`
 * (nunca filas de alto 0: quedarían enfocables).
 *
 * Elección: una por familia por ronda (round-robin), así el bloque no se llena
 * de comida (hoy 9 de 18 categorías son de comida y «Bebidas», la más grande,
 * quedaba fuera). Se pintan agrupadas por familia y, dentro, por cantidad.
 */

const CHICAS_LG = 11;
const CHICAS_MD = 3;

const ARCHIVO_RUBROS = join(process.cwd(), "lib", "data", "marketplace-categories.json");

/** Ilustración 3D del rubro, la que sube el superadmin. `null` → glifo. */
async function imagenesDeRubro(): Promise<Record<"restaurante" | "bodega", string | null>> {
  const vacio = { restaurante: null, bodega: null };
  try {
    const crudo: unknown = JSON.parse(await readFile(ARCHIVO_RUBROS, "utf8"));
    if (!crudo || typeof crudo !== "object") return vacio;
    const leer = (id: string): string | null => {
      const r = (crudo as Record<string, unknown>)[id];
      if (!r || typeof r !== "object") return null;
      const url = (r as { imageUrl?: unknown }).imageUrl;
      return typeof url === "string" && url.length > 0 ? url : null;
    };
    return { restaurante: leer("restaurante"), bodega: leer("bodega") };
  } catch (err) {
    logger.warn("[home/bento] no se pudo leer marketplace-categories.json", {
      error: String(err),
    });
    return vacio;
  }
}

interface Grupo {
  id: string;
  clave: string;
  familia: FamiliaId;
  orden: number;
  count: number;
}

/** Une «Bebidas»/«bebidas», asigna familia y devuelve la elección del bloque. */
function elegirCategorias(crudas: Array<{ id: string; count: number }>) {
  const porClave = new Map<string, Grupo>();
  for (const c of crudas) {
    if (!c.id || c.count <= 0) continue;
    const clave = claveCategoria(c.id);
    const previo = porClave.get(clave);
    if (previo) {
      // Se queda el id de la variante con más productos (el filtro del
      // catálogo no distingue mayúsculas: verificado con bebidas/Bebidas).
      if (c.count > previo.count) previo.id = c.id;
      previo.count += c.count;
      continue;
    }
    const familia = familiaDe(c.id);
    porClave.set(clave, {
      id: c.id,
      clave,
      familia,
      orden: FAMILIAS.findIndex((f) => f.id === familia),
      count: c.count,
    });
  }

  const colas = FAMILIAS.map((f) =>
    [...porClave.values()]
      .filter((g) => g.familia === f.id)
      .sort((a, b) => b.count - a.count),
  );

  const elegidas: Grupo[] = [];
  for (let ronda = 0; elegidas.length < CHICAS_LG; ronda++) {
    const deEstaRonda = colas.map((q) => q[ronda]).filter((g): g is Grupo => !!g);
    if (deEstaRonda.length === 0) break;
    for (const g of deEstaRonda) {
      if (elegidas.length < CHICAS_LG) elegidas.push(g);
    }
  }

  // En md entran 3: las 3 primeras de la 1.ª ronda (familias distintas).
  const enMd = new Set(elegidas.slice(0, CHICAS_MD).map((g) => g.clave));
  const tiles: TileCategoria[] = [...elegidas]
    .sort((a, b) => a.orden - b.orden || b.count - a.count)
    .map((g) => ({
      id: g.id,
      label: etiquetaCategoria(g.id),
      familia: g.familia,
      soloLg: !enMd.has(g.clave),
    }));

  return { tiles, total: porClave.size };
}

export default async function CategoriasBento() {
  const [crudas, imagenes] = await Promise.all([
    MarketplacePublicDB.getProductCategories().catch((err: unknown) => {
      logger.warn("[home/bento] getProductCategories falló", { error: String(err) });
      return [] as Array<{ id: string; count: number }>;
    }),
    imagenesDeRubro(),
  ]);
  const { tiles, total } = elegirCategorias(crudas);
  if (tiles.length === 0) return null;

  // Con menos de 11 categorías el bloque de lg tendría huecos: se usa la
  // grilla de md (6 cols) en todos los anchos. Con menos de 3, solo las grandes.
  const completo = tiles.length >= CHICAS_LG;
  const conChicas = tiles.filter((t) => !t.soloLg).length >= CHICAS_MD;
  const grilla = !conChicas
    ? "grid-cols-4"
    : completo
      ? "grid-cols-6 lg:grid-cols-10"
      : "grid-cols-6";
  const visibles = completo ? tiles : tiles.filter((t) => !t.soloLg);

  return (
    <section
      aria-labelledby="antojo-titulo"
      className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8"
    >
      <Reveal duration={400} offset={16}>
        <HomeSeccionTitulo
          id="antojo-titulo"
          titulo="¿Qué se te antoja?"
          accion={{ label: "Ver tiendas", href: "/tiendas" }}
        />
        <ul className={`grid auto-rows-[7rem] grid-flow-dense gap-3 ${grilla}`} role="list">
          <li className="col-span-2 col-start-1 row-span-2 row-start-1 flex">
            <CeldaGrande
              familia="comida"
              titulo="Comida lista"
              bajada="Pollerías, pizzerías y más"
              href="/?v=comida#catalogo"
              imagen={imagenes.restaurante}
            />
          </li>
          <li
            className={`col-span-2 row-span-2 row-start-1 flex ${
              !conChicas ? "col-start-3" : completo ? "col-start-5 lg:col-start-9" : "col-start-5"
            }`}
          >
            <CeldaGrande
              familia="despensa"
              titulo="Bodega"
              bajada="Abarrotes, lácteos y limpieza"
              href="/?v=bodega#catalogo"
              imagen={imagenes.bodega}
            />
          </li>
          {conChicas &&
            visibles.map((t) => (
              <li key={t.id} className={t.soloLg ? "hidden lg:flex" : "flex"}>
                <CategoriaTile tile={t} />
              </li>
            ))}
          {conChicas && (
            <li className="flex">
              <CeldaVerTodas
                restantesMd={total - CHICAS_MD}
                restantesLg={completo ? total - CHICAS_LG : total - CHICAS_MD}
              />
            </li>
          )}
        </ul>
      </Reveal>
    </section>
  );
}
