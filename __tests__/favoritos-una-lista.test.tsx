/**
 * Favoritos de la tienda: una sola lista (2026-10-11).
 *
 * Antes el corazón del catálogo guardaba en `<negocio>-favorites` y la página
 * `/favoritos` + el menú de cuenta leían `<negocio>-wishlist`: la página salía
 * siempre vacía. Ahora `useWishlist` es una vista de `useFavorites` y lo que el
 * navegador tenía en la lista vieja se suma una vez y se borra.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { TenantSlugProvider } from "@/contexts/tenant-context";
import {
  FavoritesProvider,
  contarFavoritosGuardados,
  idsDeListaVieja,
  unirConListaVieja,
  useFavorites,
} from "@/contexts/favorites-context";
import { useWishlist } from "@/contexts/wishlist-context";

const NUEVA = "buleje-musa-favorites";
const VIEJA = "buleje-musa-wishlist";

let corazon: ReturnType<typeof useFavorites>;
let pagina: ReturnType<typeof useWishlist>;

/** El corazón (useFavorites) y la página /favoritos (useWishlist) en la misma tienda. */
function Sonda() {
  corazon = useFavorites();
  pagina = useWishlist();
  return <output data-testid="ids">{pagina.items.map((i) => i.productId).join(",")}</output>;
}

function montar() {
  return render(
    <TenantSlugProvider slug="musa">
      <FavoritesProvider>
        <Sonda />
      </FavoritesProvider>
    </TenantSlugProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("favoritos: el corazón y /favoritos leen la misma lista", () => {
  it("lo que guarda el corazón aparece en /favoritos y cuenta para el menú", async () => {
    montar();
    act(() => corazon.toggle("p1"));
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("p1"));
    expect(pagina.count).toBe(1);
    expect(pagina.isInWishlist("p1")).toBe(true);
    expect(JSON.parse(localStorage.getItem(NUEVA) ?? "[]")).toEqual(["p1"]);
    expect(localStorage.getItem(VIEJA)).toBeNull();
  });

  it("quitar desde /favoritos apaga el corazón", async () => {
    montar();
    act(() => corazon.toggle("p1"));
    act(() => pagina.removeFromWishlist("p1"));
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe(""));
    expect(corazon.isFavorite("p1")).toBe(false);
  });

  it("«más recientes» = el último guardado tiene el addedAt mayor", async () => {
    montar();
    act(() => corazon.toggle("p1"));
    act(() => corazon.toggle("p2"));
    await waitFor(() => expect(pagina.items).toHaveLength(2));
    const [a, b] = pagina.items;
    expect(b.productId).toBe("p2");
    expect(b.addedAt).toBeGreaterThan(a.addedAt);
  });

  it("migra lo que el navegador tenía en la lista vieja y la borra", async () => {
    localStorage.setItem(NUEVA, JSON.stringify(["p3"]));
    localStorage.setItem(
      VIEJA,
      JSON.stringify([
        { productId: "p2", addedAt: 20 },
        { productId: "p1", addedAt: 10 },
        { productId: "p3", addedAt: 30 },
      ]),
    );
    montar();
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("p1,p2,p3"));
    expect(localStorage.getItem(VIEJA)).toBeNull();
    expect(JSON.parse(localStorage.getItem(NUEVA) ?? "[]")).toEqual(["p1", "p2", "p3"]);
  });

  it("lista vieja rota o ajena: no rompe y no migra nada", async () => {
    localStorage.setItem(VIEJA, "{no es json");
    montar();
    act(() => corazon.toggle("p9"));
    await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("p9"));
    expect(idsDeListaVieja(JSON.stringify({ productId: "x" }))).toEqual([]);
  });
});

describe("contarFavoritosGuardados (menú de la portada sin proveedores)", () => {
  it("cuenta la lista y lo que falte de la vieja, sin repetir", () => {
    expect(contarFavoritosGuardados("musa")).toBe(0);
    localStorage.setItem(NUEVA, JSON.stringify(["p1", "p2"]));
    localStorage.setItem(VIEJA, JSON.stringify([{ productId: "p2", addedAt: 1 }, { productId: 7, addedAt: 2 }]));
    expect(contarFavoritosGuardados("musa")).toBe(3);
    expect(contarFavoritosGuardados("otra-tienda")).toBe(0);
  });

  it("unirConListaVieja devuelve el mismo array si no falta nada", () => {
    const actuales = ["a", "b"];
    expect(unirConListaVieja(actuales, ["b", "a"])).toBe(actuales);
    expect(unirConListaVieja(actuales, ["c", "c"])).toEqual(["c", "a", "b"]);
  });
});
