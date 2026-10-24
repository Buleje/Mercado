import { describe, expect, it } from "vitest";
import {
  CONFIG_KIOSKO_VACIA,
  codigoDeMarcacion,
  decidirMarcaKiosko,
  leerConfigKiosko,
  minutosLimaDe,
  partirToken,
  primerNombre,
  revisarEnlace,
  type ConfigKiosko,
  type VivaKiosko,
} from "@/lib/rrhh/kiosko";
import { hashSecretoKiosko, nuevoTokenKiosko, secretoCoincide } from "@/lib/rrhh/kiosko-token.server";
import { revisarMarca } from "@/lib/rrhh/asistencia";
import { estadoAparato, faltaFoto, resumirAparato, vidaCookieAparato } from "@/lib/rrhh/kiosko-aparato";
import { resumenKiosko, SIN_ENLACE } from "@/lib/rrhh/kiosko";
import { nuevoSecretoAparato } from "@/lib/rrhh/kiosko-token.server";
import { haySecretoEnRuta, tacharSecretosDeRuta, tacharSecretosEnObjeto } from "@/lib/telemetry/secretos-en-url";

/* Lima = UTC−5 todo el año: 08:05 de Lima = 13:05Z. */
const lima = (hhmm: string, dia = "2026-10-10") => new Date(`${dia}T${hhmm}:00-05:00`);
const ID = "cmpxiv6p4000bohvzwl6bnfpv";
const HORARIO = { horaEntrada: "08:00", toleranciaMin: 10 };

function viva(p: Partial<VivaKiosko> = {}): VivaKiosko {
  return {
    estado: "PRESENTE",
    entradaMin: null,
    salidaMin: null,
    refrigerioMin: 0,
    horas: null,
    nota: null,
    origen: "manual",
    marcadoPor: "qaadmin",
    createdAt: lima("06:00"),
    ...p,
  };
}

describe("token del kiosko", () => {
  it("el token lleva el negocio y el secreto; la base sólo guarda el hash", () => {
    const { token, hash, fin } = nuevoTokenKiosko(ID);
    const partes = partirToken(token);
    expect(partes?.tenantId).toBe(ID);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(partes!.secreto);
    expect(partes!.secreto.endsWith(fin)).toBe(true);
    expect(secretoCoincide(partes!.secreto, hash)).toBe(true);
    expect(secretoCoincide(`${partes!.secreto}x`, hash)).toBe(false);
    expect(secretoCoincide(partes!.secreto, null)).toBe(false);
  });

  it("el negocio principal (`main`, sin cuid) también sirve", () => {
    const { token } = nuevoTokenKiosko("main");
    expect(partirToken(token)?.tenantId).toBe("main");
  });

  it("dos tokens del mismo negocio nunca se repiten", () => {
    expect(nuevoTokenKiosko(ID).token).not.toBe(nuevoTokenKiosko(ID).token);
  });

  it("rechaza formas raras", () => {
    expect(partirToken("")).toBeNull();
    expect(partirToken("sin-punto")).toBeNull();
    expect(partirToken(`${ID}.corto`)).toBeNull();
    expect(partirToken(`../${ID}.${"a".repeat(43)}`)).toBeNull();
  });

  it("revisarEnlace: sin enlace, otro secreto, vencido, apagado y vigente", () => {
    const ahora = lima("08:00");
    const vigente: ConfigKiosko = {
      ...CONFIG_KIOSKO_VACIA,
      activo: true,
      tokenHash: hashSecretoKiosko("s"),
      venceEn: lima("08:00", "2026-11-10").toISOString(),
    };
    expect(revisarEnlace(CONFIG_KIOSKO_VACIA, false, ahora)).toEqual({ ok: false, motivo: "sin_enlace" });
    expect(revisarEnlace(vigente, false, ahora)).toEqual({ ok: false, motivo: "no_coincide" });
    expect(revisarEnlace({ ...vigente, venceEn: lima("07:59").toISOString() }, true, ahora)).toEqual({ ok: false, motivo: "vencido" });
    expect(revisarEnlace({ ...vigente, activo: false }, true, ahora)).toEqual({ ok: false, motivo: "apagado" });
    expect(revisarEnlace(vigente, true, ahora)).toEqual({ ok: true });
  });

  it("la configuración guardada rara se lee como apagada y sin enlace", () => {
    expect(leerConfigKiosko(null)).toEqual(CONFIG_KIOSKO_VACIA);
    expect(leerConfigKiosko("texto")).toEqual(CONFIG_KIOSKO_VACIA);
    expect(leerConfigKiosko({ activo: "sí", tokenHash: "no-es-hex" })).toEqual(CONFIG_KIOSKO_VACIA);
    expect(leerConfigKiosko({ activo: true }).activo).toBe(true);
  });
});

describe("código del trabajador", () => {
  it("el QR del fotocheck (URL de la ficha) da el id, de cualquier host", () => {
    const qr = `https://otra-tienda.buleje.pe/admin?tab=rrhh&vista=personal&persona=${ID}`;
    expect(codigoDeMarcacion(qr)).toEqual({ tipo: "id", id: ID });
    expect(codigoDeMarcacion(ID)).toEqual({ tipo: "id", id: ID });
  });

  it("lo tipeado es el documento, sin espacios ni guiones", () => {
    expect(codigoDeMarcacion(" 4567 8901 ")).toEqual({ tipo: "documento", documento: "45678901" });
  });

  it("basura → null", () => {
    expect(codigoDeMarcacion("")).toBeNull();
    expect(codigoDeMarcacion("12")).toBeNull();
    expect(codigoDeMarcacion("https://x.pe/admin?tab=rrhh")).toBeNull();
    expect(codigoDeMarcacion("https://x.pe/admin?persona=' or 1=1")).toBeNull();
  });

  it("sólo el primer nombre sale de la ruta pública", () => {
    expect(primerNombre("  Ana María Quispe Ríos ")).toBe("Ana");
  });

  it("minutos de Lima", () => {
    expect(minutosLimaDe(lima("08:05"))).toBe(485);
    expect(minutosLimaDe(new Date("2026-10-11T04:30:00Z"))).toBe(23 * 60 + 30);
  });
});

describe("decidir la marca", () => {
  it("ENTRADA a tiempo (dentro de la tolerancia) → PRESENTE", () => {
    const d = decidirMarcaKiosko({ tipo: "ENTRADA", viva: null, ahora: lima("08:10"), horario: HORARIO });
    expect(d).toMatchObject({ accion: "escribir", hora: "08:10", tarde: false, marca: { estado: "PRESENTE", entrada: "08:10", salida: null } });
  });

  it("ENTRADA pasada la tolerancia → TARDANZA", () => {
    const d = decidirMarcaKiosko({ tipo: "ENTRADA", viva: null, ahora: lima("08:11"), horario: HORARIO });
    expect(d).toMatchObject({ accion: "escribir", tarde: true, marca: { estado: "TARDANZA" } });
  });

  it("ENTRADA sin horario en el puesto → PRESENTE y tardanza desconocida", () => {
    const d = decidirMarcaKiosko({ tipo: "ENTRADA", viva: null, ahora: lima("09:30"), horario: null });
    expect(d).toMatchObject({ accion: "escribir", tarde: null, marca: { estado: "PRESENTE" } });
  });

  it("dos marcas del kiosko en menos de 2 minutos: la segunda se ignora", () => {
    const v = viva({ entradaMin: 485, origen: "kiosko", createdAt: lima("08:05") });
    expect(decidirMarcaKiosko({ tipo: "SALIDA", viva: v, ahora: new Date(lima("08:05").getTime() + 119_000), horario: HORARIO })).toEqual({
      accion: "ignorar",
      tipo: "ENTRADA",
      hora: "08:05",
    });
    expect(decidirMarcaKiosko({ tipo: "ENTRADA", viva: v, ahora: lima("08:07"), horario: HORARIO })).toMatchObject({
      accion: "rechazar",
      motivo: "ya_tiene_entrada",
      hora: "08:05",
    });
  });

  it("la marca del kiosko guardada como «manual» (CHECK de la base) se reconoce por su firma", () => {
    const v = viva({ entradaMin: 485, origen: "manual", marcadoPor: "Kiosko de asistencia", createdAt: lima("08:05") });
    expect(decidirMarcaKiosko({ tipo: "SALIDA", viva: v, ahora: lima("08:06"), horario: HORARIO })).toMatchObject({ accion: "ignorar" });
  });

  it("una marca puesta A MANO hace un minuto no frena al kiosko", () => {
    const v = viva({ estado: "FALTA", origen: "manual", createdAt: lima("08:04") });
    const d = decidirMarcaKiosko({ tipo: "ENTRADA", viva: v, ahora: lima("08:05"), horario: HORARIO });
    expect(d).toMatchObject({ accion: "escribir", marca: { estado: "PRESENTE", entrada: "08:05" } });
  });

  it("SALIDA conserva la entrada, el estado y el refrigerio; vale la última salida", () => {
    const v = viva({ estado: "TARDANZA", entradaMin: 495, salidaMin: 1000, refrigerioMin: 60, origen: "kiosko", createdAt: lima("16:40") });
    const d = decidirMarcaKiosko({ tipo: "SALIDA", viva: v, ahora: lima("18:02"), horario: HORARIO });
    expect(d).toMatchObject({
      accion: "escribir",
      marca: { estado: "TARDANZA", entrada: "08:15", salida: "18:02", refrigerioMin: 60 },
    });
  });

  it("SALIDA sin entrada se guarda con nota para el encargado", () => {
    const d = decidirMarcaKiosko({ tipo: "SALIDA", viva: null, ahora: lima("17:00"), horario: HORARIO });
    expect(d).toMatchObject({ accion: "escribir", marca: { estado: "PRESENTE", entrada: null, salida: "17:00" } });
    if (d.accion === "escribir") expect(d.marca.nota).toContain("sin entrada");
  });

  it("SALIDA antes de la entrada → rechazo (no hay turnos que crucen medianoche)", () => {
    const v = viva({ entradaMin: 600, createdAt: lima("06:00") });
    expect(decidirMarcaKiosko({ tipo: "SALIDA", viva: v, ahora: lima("09:00"), horario: HORARIO })).toMatchObject({
      accion: "rechazar",
      motivo: "salida_antes_de_entrada",
    });
  });

  it("lo decidido pasa por revisarMarca con origen kiosko y calcula las horas", () => {
    const v = viva({ entradaMin: 480, refrigerioMin: 60, origen: "kiosko", createdAt: lima("08:00") });
    const d = decidirMarcaKiosko({ tipo: "SALIDA", viva: v, ahora: lima("17:00"), horario: HORARIO });
    if (d.accion !== "escribir") throw new Error("esperaba escribir");
    const r = revisarMarca(
      { colaboradorId: ID, fecha: "2026-10-10", ...d.marca },
      {
        colaborador: { fechaIngreso: null, fechaCese: null, eliminado: false },
        hoy: "2026-10-10",
        ventana: { desde: "2026-10-10", hasta: "2026-10-10" },
        marcadoPor: "Kiosko",
        origen: "kiosko",
      },
    );
    expect(r).toMatchObject({ ok: true, marca: { origen: "kiosko", entradaMin: 480, salidaMin: 1020, horas: 8 } });
  });
});

describe("tablet atada al enlace (security 10-10 H1)", () => {
  it("libre hasta que una tablet lo abre; después sólo la cookie de ESA tablet marca", () => {
    const { secreto, hash } = nuevoSecretoAparato();
    expect(estadoAparato({ aparatoHash: null }, false)).toBe("libre");
    expect(estadoAparato({ aparatoHash: hash }, secretoCoincide(secreto, hash))).toBe("propio");
    const celular = nuevoSecretoAparato().secreto;
    expect(estadoAparato({ aparatoHash: hash }, secretoCoincide(celular, hash))).toBe("otro");
    expect(estadoAparato({ aparatoHash: hash }, secretoCoincide("", hash))).toBe("otro");
  });

  it("sin foto no hay marca, salvo que el dueño lo permita (apagado por defecto)", () => {
    expect(CONFIG_KIOSKO_VACIA.permitirSinFoto).toBe(false);
    expect(faltaFoto(CONFIG_KIOSKO_VACIA, false)).toBe(true);
    expect(faltaFoto(CONFIG_KIOSKO_VACIA, true)).toBe(false);
    expect(faltaFoto({ permitirSinFoto: true }, false)).toBe(false);
  });

  it("la config vieja (sin los campos nuevos) se lee con foto obligatoria y sin tablet", () => {
    const vieja = { activo: true, tokenHash: hashSecretoKiosko("x"), tokenFin: "abcd", creadoEn: null, venceEn: null, creadoPor: null };
    const c = leerConfigKiosko(vieja);
    expect(c).toMatchObject({ activo: true, permitirSinFoto: false, aparatoHash: null, aparatoNombre: null });
    expect(leerConfigKiosko({ ...vieja, aparatoHash: "no-es-hex" }).aparatoHash).toBeNull();
  });

  it("el panel ve el nombre de la tablet y nunca el hash; generar/revocar la suelta", () => {
    const c: ConfigKiosko = {
      ...CONFIG_KIOSKO_VACIA,
      activo: true,
      tokenHash: hashSecretoKiosko("s"),
      venceEn: "2027-01-01T00:00:00.000Z",
      aparatoHash: hashSecretoKiosko("t"),
      aparatoEn: "2026-10-10T13:00:00.000Z",
      aparatoNombre: "Android · Chrome",
    };
    const r = resumenKiosko(c, lima("08:00"));
    expect(r.enlace?.aparato).toEqual({ nombre: "Android · Chrome", desde: "2026-10-10T13:00:00.000Z" });
    expect(JSON.stringify(r)).not.toContain(c.aparatoHash);
    expect(JSON.stringify(r)).not.toContain(c.tokenHash);
    expect(SIN_ENLACE).toMatchObject({ tokenHash: null, aparatoHash: null, aparatoEn: null, aparatoNombre: null });
  });

  it("la cookie vive hasta que vence el enlace (con topes)", () => {
    const ahora = lima("08:00");
    expect(vidaCookieAparato(new Date(ahora.getTime() + 90 * 86_400_000).toISOString(), ahora)).toBe(90 * 86_400);
    expect(vidaCookieAparato(null, ahora)).toBe(60);
    expect(vidaCookieAparato("2099-01-01T00:00:00.000Z", ahora)).toBe(400 * 86_400);
  });

  it("nombre corto de la tablet a partir del user-agent", () => {
    expect(resumirAparato("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36")).toBe("Android · Chrome");
    expect(resumirAparato("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPad · Safari");
    expect(resumirAparato("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0")).toBe("Windows · Edge");
    expect(resumirAparato("curl/8.5.0")).toBe("Aparato sin nombre");
    expect(resumirAparato(null)).toBe("Aparato sin nombre");
  });
});

describe("el secreto del enlace no sale a la analítica (security 10-10 H2)", () => {
  const token = `${ID}.${"A".repeat(43)}`;

  it("tacha el secreto en URL completa, ruta y texto con comillas", () => {
    expect(tacharSecretosDeRuta(`https://x.pe/kiosko/asistencia/${token}?a=1#b`)).toBe("https://x.pe/kiosko/asistencia/[token]?a=1#b");
    expect(tacharSecretosDeRuta(`/kiosko/asistencia/${encodeURIComponent(token)}`)).toBe("/kiosko/asistencia/[token]");
    expect(tacharSecretosDeRuta(`{"url":"/kiosko/asistencia/${token}"}`)).toBe('{"url":"/kiosko/asistencia/[token]"}');
  });

  it("idempotente y no toca otras rutas", () => {
    const una = tacharSecretosDeRuta(`/kiosko/asistencia/${token}`);
    expect(tacharSecretosDeRuta(una)).toBe(una);
    expect(haySecretoEnRuta(una)).toBe(false);
    expect(tacharSecretosDeRuta("/admin?tab=equipo")).toBe("/admin?tab=equipo");
    expect(tacharSecretosDeRuta("/tv/abc")).toBe("/tv/abc");
  });

  it("recorre las propiedades de un evento de PostHog", () => {
    const props: Record<string, unknown> = {
      $current_url: `https://x.pe/kiosko/asistencia/${token}`,
      $pathname: `/kiosko/asistencia/${token}`,
      $session_entry_url: `https://x.pe/kiosko/asistencia/${token}`,
      n: 3,
    };
    tacharSecretosEnObjeto(props);
    expect(JSON.stringify(props)).not.toContain("AAAA");
    expect(props.n).toBe(3);
  });
});
