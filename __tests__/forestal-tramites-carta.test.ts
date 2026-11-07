/**
 * La carta de las guías con su código y el título del permiso (ADR-487).
 *
 * Lo que se fija: el código «REL-AAAA-NNNN» por negocio y año; que imprimir
 * selle la carta con lo que declaraba; que reimprimirla igual no gaste código
 * y que cambiarle las guías después de impresa NO se guarde bajo el mismo
 * código; que el expediente del permiso salga de su última carta; y que el
 * papel lleve arriba el título del permiso con su expediente. Y que el código
 * no se repita: dos impresiones a la vez, ni después de borrar una carta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  construirTramite,
  leerPisos,
  limiteDeCampo,
  pisosTrasRegistro,
} from "@/lib/forestal/tramites-registro";
import {
  CartaYaImpresaError,
  cartaCambiada,
  contenidoCarta,
  expedienteDelPermiso,
  huellaCarta,
} from "@/lib/forestal/tramites-carta";
import { formatoPorId } from "@/lib/forestal/tramites-catalogo";
import { datosDelPermiso, type PermisoDelOficio } from "@/lib/forestal/tramites-permiso";
import { nuevaFilaGuia, serializeGuiasInforme } from "@/lib/forestal/tramites-relacion-guias";
import { buildTramiteHtml } from "@/lib/forestal/tramites-print";

/* El KV en memoria. `actualizar` hace fila como el advisory lock de la base: cada
   uno espera al anterior, lee y escribe; `tx` es la misma memoria. Con `get` +
   `set` sueltos (lo de antes), dos `save` a la vez leían la lista vacía. */
const KV = vi.hoisted(() => ({
  datos: {} as Record<string, unknown>,
  fila: Promise.resolve() as Promise<unknown>,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/platform-settings.db", () => {
  const copia = (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const tx = {
    platformSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        where.key in KV.datos ? { value: copia(KV.datos[where.key]) } : null,
      upsert: async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => {
        KV.datos[where.key] = copia(update.value);
      },
    },
  };
  return {
    PlatformSettingsDB: {
      get: async (key: string) => copia(KV.datos[key]),
      actualizar: (
        key: string,
        cambio: (actual: unknown, t: typeof tx) => Promise<{ valor?: unknown; resultado: unknown }>,
      ) => {
        const turno = KV.fila.then(async () => {
          await new Promise((r) => setTimeout(r, 2));
          const r = await cambio(copia(KV.datos[key]), tx);
          if (r.valor !== undefined) KV.datos[key] = copia(r.valor);
          return r.resultado;
        });
        KV.fila = turno.catch(() => undefined);
        return turno;
      },
    },
  };
});

import { ForestTramitesDB } from "@/lib/db/forest-tramites.db";

const REL = formatoPorId("relacion-guias-serfor")!;
const AHORA = "2026-10-08T15:00:00.000Z";
const guias = (...nums: string[]) =>
  serializeGuiasInforme(
    nums.map((n, i) =>
      nuevaFilaGuia(`u${i}`, { numero: n.replace("*", ""), anulada: n.endsWith("*") }),
    ),
  );
const base = { formatoId: REL.id, autoridad: "serfor" as const, ahora: AHORA };

describe("código de la carta: REL-AAAA-NNNN por negocio y año", () => {
  it("la relación lleva su propio correlativo; los demás formatos de SERFOR siguen con el suyo", () => {
    const a = construirTramite({ ...base, id: "a" });
    expect(a.codigoInterno).toBe("REL-2026-0001");
    const b = construirTramite({ ...base, id: "b" }, [a]);
    expect(b.codigoInterno).toBe("REL-2026-0002");
    const cites = construirTramite(
      { formatoId: "constancia-cites", autoridad: "serfor", ahora: AHORA, id: "c" },
      [a, b],
    );
    expect(cites.codigoInterno).toBe("SERFOR-2026-001");
    const enero = construirTramite({ ...base, id: "d", ahora: "2027-01-03T12:00:00.000Z" }, [a, b]);
    expect(enero.codigoInterno).toBe("REL-2027-0001");
  });
});

describe("imprimir sella la carta con lo que declaraba", () => {
  const datos = {
    guiasJson: guias("019-001-0000772", "019-001-0000001*"),
    permisoCodigo: "19-SEC/REG-PLT-2025-096",
    expediente: "2025-0012345",
  };

  it("guarda guías, permiso, expediente, cuándo y quién", () => {
    const t = construirTramite({ ...base, datos, emitir: true, emitidaPor: "qaadmin" });
    expect(t.emision).toMatchObject({
      en: AHORA,
      por: "qaadmin",
      guias: ["019-001-0000772", "019-001-0000001 (anulada)"],
      permisoCodigo: "19-SEC/REG-PLT-2025-096",
      expediente: "2025-0012345",
    });
  });

  it("sin pedir imprimir no se sella; un formato que no es carta nunca", () => {
    expect(construirTramite({ ...base, datos }).emision).toBeNull();
    expect(
      construirTramite({
        formatoId: "constancia-cites",
        autoridad: "serfor",
        ahora: AHORA,
        emitir: true,
      }).emision,
    ).toBeNull();
  });

  it("reimprimir la misma carta: mismo código y mismo sello (aunque se corrija la redacción)", () => {
    const t = construirTramite({ ...base, datos, emitir: true, emitidaPor: "qaadmin" });
    const otraVez = construirTramite(
      {
        ...base,
        id: t.id,
        codigoInterno: t.codigoInterno,
        emision: t.emision,
        emitir: true,
        emitidaPor: "otro",
        datos: { ...datos, observaciones: "Corrijo una coma" },
        ahora: "2026-10-09T10:00:00.000Z",
      },
      [t],
    );
    expect(otraVez.codigoInterno).toBe(t.codigoInterno);
    expect(otraVez.emision).toEqual(t.emision);
  });

  it("cambiar las guías de una carta impresa NO se guarda bajo el mismo código", () => {
    const t = construirTramite({ ...base, datos, emitir: true, emitidaPor: "qaadmin" });
    const conOtra = {
      ...datos,
      guiasJson: guias("019-001-0000772", "019-001-0000001*", "019-001-0000773"),
    };
    expect(cartaCambiada(REL, conOtra, t.emision)).toBe(true);
    expect(() =>
      construirTramite(
        { ...base, id: t.id, codigoInterno: t.codigoInterno, emision: t.emision, datos: conOtra },
        [t],
      ),
    ).toThrow(CartaYaImpresaError);
    /* El expediente y el permiso también son parte de lo que declara. */
    expect(cartaCambiada(REL, { ...datos, expediente: "2026-0000001" }, t.emision)).toBe(true);
    expect(
      cartaCambiada(REL, { ...datos, permisoCodigo: "10-HUA-PUE/PER-FMP-2026-007" }, t.emision),
    ).toBe(true);
  });

  it("la huella no mira el orden de las guías ni cómo se escribe el código del permiso", () => {
    const a = huellaCarta(REL, datos);
    expect(
      huellaCarta(REL, { ...datos, guiasJson: guias("019-001-0000001*", "019-001-0000772") }),
    ).toBe(a);
    expect(huellaCarta(REL, { ...datos, permisoCodigo: "19 sec reg plt 2025 96" })).toBe(a);
    /* Una anulada no es la misma declaración que una emitida con ese N°. */
    expect(
      huellaCarta(REL, { ...datos, guiasJson: guias("019-001-0000772", "019-001-0000001") }),
    ).not.toBe(a);
  });

  it("los formatos de una guía o de un rango declaran su N°", () => {
    const anulacion = formatoPorId("anulacion-gtf")!;
    expect(
      contenidoCarta(anulacion, { numeroGtfAnulada: "019-001-0000007", permisoCodigo: "X-1" })
        .guias,
    ).toEqual(["019-001-0000007"]);
  });
});

describe("el expediente del permiso sale de su última carta", () => {
  const t = (id: string, updatedAt: string, datos: Record<string, string>) => ({
    id,
    codigoInterno: id.toUpperCase(),
    updatedAt,
    datos,
  });
  const tramites = [
    t("rel-1", "2026-09-01T00:00:00Z", {
      permisoContratoId: "c1",
      permisoCodigo: "19-SEC/REG-PLT-2025-096",
      expediente: "2025-0000001",
    }),
    t("rel-2", "2026-10-01T00:00:00Z", {
      permisoCodigo: "19-sec/reg-plt-2025-96",
      expediente: "2025-0012345",
    }),
    t("rel-3", "2026-10-05T00:00:00Z", {
      permisoContratoId: "c2",
      permisoCodigo: "10-HUA-PUE/PER-FMP-2026-007",
      expediente: "2026-9999999",
    }),
    t("rel-4", "2026-10-07T00:00:00Z", {
      permisoContratoId: "c1",
      permisoCodigo: "19-SEC/REG-PLT-2025-096",
    }),
  ];

  it("la más reciente del MISMO permiso que lo traía (por contrato o por código normalizado)", () => {
    expect(
      expedienteDelPermiso(tramites, { contratoId: "c1", codigo: "19-SEC/REG-PLT-2025-096" }),
    ).toEqual({ expediente: "2025-0012345", desde: "REL-2" });
    expect(
      expedienteDelPermiso(tramites, { codigo: "10-HUA-PUE/PER-FMP-2026-007" })?.expediente,
    ).toBe("2026-9999999");
  });

  it("no se sugiere a sí misma ni para un permiso sin cartas", () => {
    expect(
      expedienteDelPermiso(tramites, { codigo: "19-SEC/REG-PLT-2025-096" }, "rel-2")?.expediente,
    ).toBe("2025-0000001");
    expect(expedienteDelPermiso(tramites, { codigo: "19-SEC/REG-PLT-2026-033" })).toBeNull();
    expect(expedienteDelPermiso(tramites, { contratoId: "sin" })).toBeNull();
  });
});

describe("el título del permiso arriba de la carta", () => {
  const ficha = {
    razonSocial: "Inversiones Agroforestales Blas S.A.",
    ruc: "20600000001",
    representante: "Blas Gerente",
  };
  const permiso: PermisoDelOficio = {
    id: "c1",
    codigo: "19-SEC/REG-PLT-2025-096",
    titularNombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
    titularDoc: "20605859438",
    titularDocTipo: "RUC",
    tipo: "REG-PLT",
    resolucionNumero: "RA N° 045-2025-ATFFS-SC",
    resolucionFecha: "2025-03-12T00:00:00.000Z",
    region: "PASCO",
    provincia: "OXAPAMPA",
    distrito: "CONSTITUCION",
  };

  it("el permiso pone modalidad, resolución con fecha y ubicación; la resolución igual al código no se repite", () => {
    const d = datosDelPermiso(permiso, null, ficha, {});
    expect(d).toMatchObject({
      permisoTipo: "Registro de plantación forestal",
      permisoResolucion: "RA N° 045-2025-ATFFS-SC del 12/03/2025",
      permisoUbicacion: "CONSTITUCION, OXAPAMPA, PASCO",
      permisoTitularDni: "",
    });
    expect(
      datosDelPermiso({ ...permiso, resolucionNumero: permiso.codigo }, null, ficha, {})
        .permisoResolucion,
    ).toBe("");
    const natural = datosDelPermiso(
      { ...permiso, titularDoc: "41234567", titularDocTipo: "DNI" },
      null,
      ficha,
      {},
    );
    expect(natural).toMatchObject({ entidadRuc: "", permisoTitularDni: "41234567" });
  });

  it("el papel: código arriba y al pie, título del permiso con expediente, anexo después de la firma", () => {
    const datos = {
      ...datosDelPermiso(permiso, null, ficha, {}),
      expediente: "2025-0012345",
      periodoDesde: "2026-09-01",
      periodoHasta: "2026-09-30",
      guiasJson: guias("019-001-0000772"),
    };
    const html = buildTramiteHtml({
      formato: REL,
      datos,
      ficha: null,
      codigoInterno: "REL-2026-0001",
    });
    expect(html).toContain(`<div class="carta-codigo">Carta<b>REL-2026-0001</b></div>`);
    expect(html).toContain(`@bottom-left{content:"Carta REL-2026-0001"`);
    expect(html).toContain(
      `<span class="titulo-hab">19-SEC/REG-PLT-2025-096</span> · Registro de plantación forestal`,
    );
    expect(html).toMatch(/Expediente<\/th><td[^>]*>N° 2025-0012345/);
    expect(html).toContain("01/09/2026 al 30/09/2026");
    expect(html).toContain("RA N° 045-2025-ATFFS-SC del 12/03/2025");
    expect(html.indexOf("firma-uno")).toBeLessThan(html.indexOf("anexo-guias"));
    expect(html).not.toContain("doc-codigo");
  });

  it("sin expediente: en la app se marca para llenar; en el papel no queda un hueco con raya", () => {
    const datos = {
      ...datosDelPermiso(permiso, null, ficha, {}),
      guiasJson: guias("019-001-0000772"),
    };
    expect(buildTramiteHtml({ formato: REL, datos, ficha: null, editable: true })).toContain(
      "Falta el N° de expediente",
    );
    expect(buildTramiteHtml({ formato: REL, datos, ficha: null, editable: true })).toContain(
      "se numera al imprimir",
    );
    const papel = buildTramiteHtml({ formato: REL, datos, ficha: null });
    expect(papel).not.toContain("Expediente</th>");
    expect(papel).not.toContain("se numera al imprimir");
  });

  it("un formato que no es carta sale como siempre", () => {
    const html = buildTramiteHtml({
      formato: formatoPorId("constancia-cites")!,
      datos: {},
      ficha: null,
      codigoInterno: "SERFOR-2026-001",
    });
    expect(html).toContain("doc-codigo");
    expect(html).not.toContain("carta-codigo");
  });
});

describe("el código de la carta no se repite", () => {
  it("el piso de lo que ya salió: borrar la última no devuelve su código ni su N° de documento", () => {
    const a = construirTramite({ ...base, id: "a" }, [], { "REL-2026-": 7 });
    expect(a.codigoInterno).toBe("REL-2026-0008");
    expect(pisosTrasRegistro({ "REL-2026-": 7 }, a)).toEqual({ "REL-2026-": 8 });
    expect(pisosTrasRegistro({ "REL-2026-": 9 }, a)).toBeNull();
    const presentada = construirTramite({ ...base, id: "p", estado: "presentado" }, [], {
      "doc:relacion-guias-serfor-2026": 4,
    });
    expect(presentada.numeroDocumento).toBe("005-2026");
    expect(pisosTrasRegistro({}, presentada)).toEqual({
      "REL-2026-": 1,
      "doc:relacion-guias-serfor-2026": 5,
    });
    expect(leerPisos({ "REL-2026-": 3, texto: "5", negativo: -1, roto: 1.5 })).toEqual({
      "REL-2026-": 3,
    });
    expect(leerPisos([1, 2])).toEqual({});
  });

  it("una relación de 25 000 caracteres se guarda entera: la carta sellada declara todas sus guías", () => {
    const filas = Array.from({ length: 12 }, (_, i) =>
      nuevaFilaGuia(`u${i}`, {
        numero: `019-001-00007${String(i).padStart(2, "0")}`,
        trozas: Array.from(
          { length: 30 },
          (_, j) => `019-001-0000772-${j} · CAPIRONA · Ø0.55/0.48m · L4.2m · 0.874 m³`,
        ).join("\n"),
      }),
    );
    const datos = { guiasJson: serializeGuiasInforme(filas), permisoCodigo: "P-1" };
    expect(datos.guiasJson.length).toBeGreaterThan(20_000);
    expect(datos.guiasJson.length).toBeLessThan(limiteDeCampo("guiasJson"));
    const r = construirTramite({ ...base, id: "grande", datos, emitir: true });
    expect(r.emision?.guias).toHaveLength(12);
    expect(cartaCambiada(REL, datos, r.emision)).toBe(false);
    expect(limiteDeCampo("observaciones")).toBe(20_000);
  });

  describe("ForestTramitesDB bajo el candado de la lista", () => {
    beforeEach(() => {
      KV.datos = {};
      KV.fila = Promise.resolve();
    });
    /* El mismo `ahora` a propósito: dos clics en el mismo milisegundo. */
    const imprimir = () =>
      ForestTramitesDB.save(
        "t1",
        {
          ...base,
          datos: { guiasJson: guias("019-001-0000772"), permisoCodigo: "P-1" },
          emitir: true,
        },
        "qa",
      );
    const codigos = async () =>
      (await ForestTramitesDB.list("t1")).map((t) => t.codigoInterno).sort();

    it("dos impresiones a la vez: dos cartas, dos códigos, dos ids, ninguna pisada", async () => {
      const [a, b] = await Promise.all([imprimir(), imprimir()]);
      expect([a.codigoInterno, b.codigoInterno].sort()).toEqual(["REL-2026-0001", "REL-2026-0002"]);
      expect(a.id).not.toBe(b.id);
      expect(await codigos()).toEqual(["REL-2026-0001", "REL-2026-0002"]);
    });

    it("borrar la última carta impresa no devuelve su código; borrar mientras se imprime no se lleva la nueva", async () => {
      const a = await imprimir();
      const b = await imprimir();
      expect(await ForestTramitesDB.remove("t1", b.id, "qa")).toBe(true);
      expect((await imprimir()).codigoInterno).toBe("REL-2026-0003");
      const [d] = await Promise.all([imprimir(), ForestTramitesDB.remove("t1", a.id, "qa")]);
      expect(d.codigoInterno).toBe("REL-2026-0004");
      expect(await codigos()).toEqual(["REL-2026-0003", "REL-2026-0004"]);
    });
  });
});
