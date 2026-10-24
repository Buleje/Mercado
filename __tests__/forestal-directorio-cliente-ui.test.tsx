/**
 * ADR-430 — la interfaz del Directorio para clientes: el papel «Cliente», su
 * precio del pie (Global / Por grupos), los grupos de especies de la planta y
 * los vínculos con otra parte o con un permiso.
 *
 * Todo con `fetch` simulado y leyendo lo que VIAJA al servidor: el precio que
 * la pantalla muestra no sirve si el cuerpo del POST dice otra cosa.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import CtpParteModal from "@/components/admin/forestal/CtpParteModal";
import CtpPartePrecios from "@/components/admin/forestal/CtpPartePrecios";
import CtpEspeciesGrupos from "@/components/admin/forestal/CtpEspeciesGrupos";
import CtpParteVinculos from "@/components/admin/forestal/CtpParteVinculos";
import { fraseVinculo } from "@/components/admin/forestal/CtpParteVinculoForm";
import type { Parte } from "@/lib/forestal/directorio";
import {
  gruposEspeciesSchema,
  type GrupoEspecies,
  type GruposEspeciesInput,
} from "@/lib/forestal/precio-cliente";

interface Llamada {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

/** `fetch` que contesta por URL y guarda cada llamada con su cuerpo. */
function simularFetch(contestar: (url: string, method: string) => unknown): Llamada[] {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      llamadas.push({ url, method, body });
      return new Response(JSON.stringify(contestar(url, method) ?? {}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return llamadas;
}

const enviadas = (llamadas: Llamada[], ruta: string) =>
  llamadas.filter((l) => l.method === "POST" && l.url.startsWith(ruta));

function parte(id: string, nombre: string, roles: Parte["roles"]): Parte {
  return {
    id,
    roles,
    nombre,
    categoria: null,
    codigoCtp: null,
    docTipo: null,
    docNumero: null,
    direccion: null,
    region: null,
    provincia: null,
    distrito: null,
    zona: null,
    ubigeo: null,
    telefono: null,
    email: null,
    registroMtc: null,
    licencia: null,
    tituloHabilitante: null,
    resolucion: null,
    planManejo: null,
    arffs: null,
    representante: null,
    representanteDni: null,
    notas: null,
    activo: true,
    usos: 0,
    ultimoUso: null,
    logo: null,
    adjuntos: [],
  };
}

const DURAS: GrupoEspecies = { id: "g-duras", nombre: "Duras", claves: ["shihuahuaco"] };
const TARIFA_OK = {
  tarifa: {
    id: "t1",
    parteId: "p1",
    servicio: "aserrio",
    vigenteDesde: "2026-09-22",
    basePt: 0.5,
    grupos: [],
    especies: [],
    tipos: [],
    nota: null,
  },
};

/** Las rutas de ADR-430 que tocan estas pantallas. */
function contestarDirectorio(url: string, method: string): unknown {
  if (url.startsWith("/api/admin/forestal/especies"))
    return { catalogo: { agregadas: [], ocultas: [], grupos: [DURAS] } };
  if (url.startsWith("/api/admin/forestal/tarifas-cliente"))
    return method === "POST" ? TARIFA_OK : { tarifas: [] };
  if (url.startsWith("/api/admin/forestal/directorio/vinculos"))
    return method === "POST" ? { vinculo: { id: "v1" } } : { vinculos: [] };
  if (url.startsWith("/api/admin/forestal/contratos")) {
    return {
      contratos: [
        { id: "c1", codigo: "17-UCA/C-OPP-001", titularNombre: "CCNN SANTA ROSA", isActive: true },
      ],
    };
  }
  return {};
}

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("papel «Cliente» en la ficha del Directorio", () => {
  it("se marca, viaja en los roles y sus precios del alta se guardan con el id de la ficha nueva", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    const onGuardar = vi.fn(async (input: { roles: string[]; nombre: string }) => ({
      ...parte("nueva", input.nombre, ["cliente"]),
    }));
    render(
      <ConfirmDialogProvider>
        <CtpParteModal
          parte={null}
          rolInicial="destinatario"
          existentes={[]}
          onGuardar={onGuardar}
          onClose={vi.fn()}
        />
      </ConfirmDialogProvider>,
    );

    const chip = screen.getByRole("button", { name: "Cliente" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText(/Nombre o razón social/), {
      target: { value: "MADERERA QA" },
    });
    fireEvent.change(await screen.findByLabelText("Precio por pie, toda especie"), {
      target: { value: "0,50" },
    });
    expect(screen.getByText("Se guarda junto con la ficha.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));

    await waitFor(() =>
      expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")).toHaveLength(1),
    );
    expect(onGuardar.mock.calls[0]![0].roles).toEqual(["destinatario", "cliente"]);
    expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")[0]!.body).toMatchObject({
      parteId: "nueva",
      servicio: "aserrio",
      basePt: 0.5,
      grupos: [],
    });
  });
});

describe("precio del pie de un cliente", () => {
  it("Por grupos: cada grupo con su precio y «lo demás» como general", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    render(
      <ConfirmDialogProvider>
        <CtpPartePrecios parteId="p1" onPendientes={vi.fn()} />
      </ConfirmDialogProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Por grupos/ }));
    fireEvent.change(await screen.findByLabelText("Duras"), { target: { value: "1.20" } });
    fireEvent.change(screen.getByLabelText("Lo demás (general)"), { target: { value: "0.50" } });

    // La vista previa sale de `precioDelCliente`: la misma cuenta que el cobro.
    expect(
      screen.getByText(
        "Shihuahuaco comercial → S/ 1.20 por pie (precio del cliente para el grupo Duras)",
      ),
    ).toBeInTheDocument();
    // Las que caen al general, en UN renglón (el Tornillo entre ellas: no se corta en las primeras seis).
    expect(
      screen.getByText(
        /^Las demás en comercial \(Bolaina, Caoba, Capirona y 10 más\) → S\/ 0\.50 por pie \(precio general del cliente\)$/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Guardar precio/ }));
    await waitFor(() =>
      expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")).toHaveLength(1),
    );
    expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")[0]!.body).toMatchObject({
      parteId: "p1",
      servicio: "aserrio",
      basePt: 0.5,
      grupos: [{ grupoId: "g-duras", precioPt: 1.2 }],
    });
  });

  it("Global: un precio para toda especie; lo tipeado en los grupos NO viaja", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    render(
      <ConfirmDialogProvider>
        <CtpPartePrecios parteId="p1" onPendientes={vi.fn()} />
      </ConfirmDialogProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Por grupos/ }));
    fireEvent.change(await screen.findByLabelText("Duras"), { target: { value: "1.20" } });
    fireEvent.click(screen.getByRole("button", { name: /^Global/ }));
    fireEvent.change(screen.getByLabelText("Precio por pie, toda especie"), {
      target: { value: "0.50" },
    });
    // Servicio de venta, no de aserrío: el servicio también viaja.
    fireEvent.click(screen.getByRole("button", { name: /Venta de madera/ }));
    fireEvent.change(screen.getByLabelText("Precio por pie, toda especie"), {
      target: { value: "2.10" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Guardar precio/ }));
    await waitFor(() =>
      expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")).toHaveLength(1),
    );
    expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")[0]!.body).toMatchObject({
      servicio: "venta",
      basePt: 2.1,
      grupos: [],
    });
  });

  it("un precio que no es número no se manda y dice por qué", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    render(
      <ConfirmDialogProvider>
        <CtpPartePrecios parteId="p1" onPendientes={vi.fn()} />
      </ConfirmDialogProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Precio por pie, toda especie"), {
      target: { value: "cincuenta" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guardar precio/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("«cincuenta» no es un precio");
    expect(enviadas(llamadas, "/api/admin/forestal/tarifas-cliente")).toHaveLength(0);
  });
});

describe("grupos de especies de la planta", () => {
  it("una especie no queda en dos grupos: sumarla a otro la muda, y se avisa", async () => {
    const onGuardar = vi.fn(
      async (_input: GruposEspeciesInput): Promise<string | null> => "Grupos guardados.",
    );
    render(
      <ConfirmDialogProvider>
        <CtpEspeciesGrupos
          grupos={[DURAS, { id: "g-blandas", nombre: "Blandas", claves: [] }]}
          especies={[
            { clave: "shihuahuaco", nombre: "Shihuahuaco" },
            { clave: "tornillo", nombre: "Tornillo" },
          ]}
          guardando={false}
          error={null}
          onGuardar={onGuardar}
        />
      </ConfirmDialogProvider>,
    );
    const sumarABlandas = screen.getByLabelText("Sumar una especie a Blandas");
    expect(
      within(sumarABlandas).getByRole("option", { name: "Shihuahuaco (está en Duras)" }),
    ).toBeInTheDocument();
    fireEvent.change(sumarABlandas, { target: { value: "shihuahuaco" } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "«Shihuahuaco» salió de «Duras» y pasó a «Blandas»",
    );
    expect(
      within(screen.getByRole("list", { name: "Especies de Duras" })).queryByText("Shihuahuaco"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Guardar grupos/ }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    const enviado = onGuardar.mock.calls[0]![0];
    expect(enviado).toEqual([
      { id: "g-duras", nombre: "Duras", especies: [] },
      { id: "g-blandas", nombre: "Blandas", especies: ["Shihuahuaco"] },
    ]);
    expect(gruposEspeciesSchema.safeParse(enviado).success).toBe(true);
  });
});

describe("vínculos de una parte", () => {
  const yo = parte("p1", "MADERERA QA", ["cliente"]);
  const otra = parte("p2", "TRANSPORTES RÍO", ["transportista"]);

  function montar() {
    return render(
      <ConfirmDialogProvider>
        <CtpParteVinculos
          parteId="p1"
          existentes={[yo, otra]}
          saldo={null}
          pendientes={[]}
          onPendientes={vi.fn()}
        />
      </ConfirmDialogProvider>,
    );
  }

  it("con otra parte: viaja la parte y NO un permiso; la propia ficha no se ofrece", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Vincular con otra parte o un permiso/ }));
    const select = screen.getByLabelText("Parte");
    expect(within(select).queryByRole("option", { name: /MADERERA QA/ })).toBeNull();
    fireEvent.change(select, { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Vincular$/ }));

    await waitFor(() =>
      expect(enviadas(llamadas, "/api/admin/forestal/directorio/vinculos")).toHaveLength(1),
    );
    expect(enviadas(llamadas, "/api/admin/forestal/directorio/vinculos")[0]!.body).toMatchObject({
      parteId: "p1",
      relacion: "tercero",
      vinculadaParteId: "p2",
      contratoId: null,
    });
  });

  it("con un permiso: viaja el permiso y NO una parte", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Vincular con otra parte o un permiso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Un permiso" }));
    const select = screen.getByLabelText("Permiso");
    await within(select).findByRole("option", { name: /17-UCA\/C-OPP-001/ });
    fireEvent.change(select, { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Relación"), { target: { value: "representa" } });
    fireEvent.click(screen.getByRole("button", { name: /^Vincular$/ }));

    await waitFor(() =>
      expect(enviadas(llamadas, "/api/admin/forestal/directorio/vinculos")).toHaveLength(1),
    );
    expect(enviadas(llamadas, "/api/admin/forestal/directorio/vinculos")[0]!.body).toMatchObject({
      parteId: "p1",
      relacion: "representa",
      vinculadaParteId: null,
      contratoId: "c1",
    });
  });

  it("con un permiso, la relación contrae la preposición: «al permiso», «del permiso»", () => {
    expect(fraseVinculo("representa", true)).toBe("Representa al permiso");
    expect(fraseVinculo("tercero", true)).toBe("Tercero del permiso");
    expect(fraseVinculo("trabaja_para", true)).toBe("Trabaja para el permiso");
    expect(fraseVinculo("tercero", false)).toBe("Tercero de");
  });

  it("sin elegir con quién no se manda nada: el contrato pide UNA parte o UN permiso", async () => {
    const llamadas = simularFetch(contestarDirectorio);
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Vincular con otra parte o un permiso/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Vincular$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vincula con UNA parte del Directorio o con UN permiso",
    );
    expect(enviadas(llamadas, "/api/admin/forestal/directorio/vinculos")).toHaveLength(0);
  });
});
