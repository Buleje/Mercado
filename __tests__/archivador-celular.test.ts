import { describe, expect, it } from "vitest";
import {
  agruparArchivadores,
  indexarPapeles,
  juzgarLectura,
  leerSticker,
  partesDeUbicacion,
  progresoDelDestino,
  textoDestino,
  vaEnDestino,
  type Destino,
  type PapelDelArchivador,
} from "@/lib/documentos/archivador-celular";
import { urlDelPapel } from "@/lib/documentos/etiquetas-qr";

const ID = "cmhabc123def456ghi789jkl0";
const papel = (codigo: number, ubicacion: string | null, registrado = false, id = `doc${codigo}xyz`): PapelDelArchivador => ({
  id,
  codigo,
  nombre: `Papel ${codigo}`,
  ubicacion,
  registrado,
});

const RONAL = "Archivador 1 · Proveedores de madera · separador Ronal";
const ALEX = "Archivador 1 · Proveedores de madera · separador Alex y su hermano";
const PERLA = "Archivador 2 · Clientes · separador Perla";

const destino = (texto: string, conSeparador = true): Destino => {
  const p = partesDeUbicacion(texto);
  if (!p) throw new Error("ubicación sin archivador");
  return { clave: p.clave, archivador: p.archivador, separador: conSeparador ? p.separador : null, claveSeparador: conSeparador ? p.claveSeparador : null };
};

describe("leerSticker", () => {
  it("saca el id del QR del sticker, sea cual sea el servidor", () => {
    for (const origen of ["https://mercado-hazel.vercel.app", "http://localhost:3000", "https://pc-brandon.tail1f40e7.ts.net:8443"]) {
      expect(leerSticker(urlDelPapel(origen, ID))).toEqual({ tipo: "id", id: ID });
    }
  });

  it("lee el código escrito o impreso", () => {
    expect(leerSticker("DOC-000123")).toEqual({ tipo: "codigo", codigo: 123 });
    expect(leerSticker(" 123 ")).toEqual({ tipo: "codigo", codigo: 123 });
    expect(leerSticker("doc 45")).toEqual({ tipo: "codigo", codigo: 45 });
  });

  it("descarta lo que no es un sticker de papel", () => {
    expect(leerSticker("")).toBeNull();
    expect(leerSticker("https://mercado-hazel.vercel.app/admin?tab=documentos")).toBeNull();
    expect(leerSticker("https://x.com/admin?doc=<script>")).toBeNull();
    expect(leerSticker("TROZA-0042")).toBeNull();
    expect(leerSticker("0")).toBeNull();
  });
});

describe("partesDeUbicacion", () => {
  it("parte archivador y separador", () => {
    expect(partesDeUbicacion(RONAL)).toEqual({
      archivador: "Archivador 1 · Proveedores de madera",
      clave: "archivador 1",
      separador: "Ronal",
      claveSeparador: "ronal",
    });
    expect(partesDeUbicacion("Archivador 2 · Clientes")).toMatchObject({ archivador: "Archivador 2 · Clientes", separador: null });
  });

  it("sin archivador no hay partes", () => {
    expect(partesDeUbicacion(null)).toBeNull();
    expect(partesDeUbicacion("  ")).toBeNull();
    expect(partesDeUbicacion("separador Ronal")).toBeNull();
  });

  it("compara sin tildes ni mayúsculas", () => {
    expect(vaEnDestino("ARCHIVADOR 1 · separador ronal", destino(RONAL))).toBe(true);
    expect(vaEnDestino("Archivador 3 · Comunidades · separador CCNN Séptimo Unidos", destino("Archivador 3 · x · separador ccnn septimo unidos"))).toBe(true);
  });
});

describe("agruparArchivadores y progreso", () => {
  const papeles = [papel(1, RONAL, true), papel(2, RONAL), papel(3, ALEX), papel(4, PERLA), papel(10, "Archivador 10 · Varios"), papel(5, null)];

  it("arma los archivadores en orden natural, con separadores y cuentas", () => {
    const { grupos, sinLugar } = agruparArchivadores(papeles);
    expect(sinLugar).toBe(1);
    expect(grupos.map((g) => g.clave)).toEqual(["archivador 1", "archivador 2", "archivador 10"]);
    expect(grupos[0]).toMatchObject({ total: 3, registrados: 1 });
    expect(grupos[0].separadores).toEqual([
      { separador: "Alex y su hermano", claveSeparador: "alex y su hermano", total: 1, registrados: 0 },
      { separador: "Ronal", claveSeparador: "ronal", total: 2, registrados: 1 },
    ]);
  });

  it("«X de Y en su sitio» del separador y del archivador entero", () => {
    expect(progresoDelDestino(papeles, destino(RONAL))).toMatchObject({ total: 2, registrados: 1 });
    const todo = progresoDelDestino(papeles, destino(RONAL, false));
    expect(todo).toMatchObject({ total: 3, registrados: 1 });
    expect(todo.faltan.map((p) => p.codigo)).toEqual([2, 3]);
  });

  it("dice el destino como se lee en el papel", () => {
    expect(textoDestino(destino(RONAL))).toBe(RONAL);
    expect(textoDestino(destino(RONAL, false))).toBe("Archivador 1 · Proveedores de madera");
  });
});

describe("juzgarLectura", () => {
  const papeles = [papel(1, RONAL, false, ID), papel(2, RONAL, true), papel(3, PERLA), papel(4, ALEX), papel(5, null)];
  const indice = indexarPapeles(papeles);
  const aqui = destino(RONAL);

  it("el papel que va aquí y falta registrar → se registra (por QR o por número)", () => {
    expect(juzgarLectura(urlDelPapel("https://mercado-hazel.vercel.app", ID), indice, aqui)).toMatchObject({ estado: "guardar", papel: { codigo: 1 } });
    expect(juzgarLectura("1", indice, aqui)).toMatchObject({ estado: "guardar" });
  });

  it("ya registrado → no se vuelve a marcar", () => {
    expect(juzgarLectura("DOC-000002", indice, aqui).estado).toBe("ya-estaba");
  });

  it("de otro archivador o de otro separador → avisa dónde va", () => {
    expect(juzgarLectura("3", indice, aqui)).toEqual({ estado: "otro-lugar", papel: papeles[2], dondeVa: PERLA });
    expect(juzgarLectura("4", indice, aqui)).toMatchObject({ estado: "otro-lugar", dondeVa: ALEX });
    // Con el archivador entero elegido, el de otro separador SÍ va aquí.
    expect(juzgarLectura("4", indice, destino(RONAL, false)).estado).toBe("guardar");
  });

  it("sin lugar o desconocido", () => {
    expect(juzgarLectura("5", indice, aqui).estado).toBe("sin-lugar");
    expect(juzgarLectura("999", indice, aqui)).toEqual({ estado: "desconocido", texto: "999" });
    expect(juzgarLectura(urlDelPapel("https://x.app", "otronegocio12345"), indice, aqui).estado).toBe("desconocido");
    expect(juzgarLectura("hola", indice, aqui).estado).toBe("desconocido");
  });
});
