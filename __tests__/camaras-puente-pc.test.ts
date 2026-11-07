/**
 * El puente de pantalla de las cámaras (Brandon 2026-10-03): lo que la pantalla
 * calcula sola. Cada caso es un error que se ve en la PC del aserradero:
 *
 *  - el recorte arrastrado hacia arriba a la izquierda quedaba con ancho
 *    negativo; un clic sin arrastrar guardaba un recorte de 0 px;
 *  - un reloj adelantado decía «sin señal» con el puente andando;
 *  - un servidor caído recibía un pedido por segundo de cada pestaña.
 */
import { describe, expect, it } from "vitest";
import {
  acotarAjuste,
  ajustesConDefectos,
  camposPuente,
  comandoPuente,
  componerRecorte,
  configPuente,
  costoMaximoDia,
  edadDelCuadro,
  esperaSiguiente,
  esTodaLaImagen,
  estiloRecorte,
  fraccionEnCaja,
  leerTsCuadro,
  recorteDeArrastre,
  recorteValido,
  relativoA,
  senalPorEdad,
  textoDolares,
  textoHace,
  textoSenal,
  ultimaCapturaDe,
  urlPuente,
  vistaRecortada,
  VIVO_POR_DEFECTO,
} from "@/components/admin/forestal/camaras/puente-pc";

describe("recorte", () => {
  const caja = { left: 100, top: 50, width: 400, height: 200 };

  it("el puntero se lee en fracciones de la imagen y no se sale de 0–1", () => {
    expect(fraccionEnCaja(300, 150, caja)).toEqual({ x: 0.5, y: 0.5 });
    expect(fraccionEnCaja(0, 0, caja)).toEqual({ x: 0, y: 0 });
    expect(fraccionEnCaja(900, 900, caja)).toEqual({ x: 1, y: 1 });
    expect(fraccionEnCaja(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("arrastrar hacia arriba a la izquierda da el mismo rectángulo que hacia abajo", () => {
    const abajo = recorteDeArrastre({ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.7 });
    const arriba = recorteDeArrastre({ x: 0.6, y: 0.7 }, { x: 0.1, y: 0.2 });
    expect(abajo).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(arriba).toEqual(abajo);
  });

  it("un clic sin arrastrar no es un recorte", () => {
    expect(recorteDeArrastre({ x: 0.3, y: 0.3 }, { x: 0.31, y: 0.5 })).toBeNull();
  });

  it("valida lo que viene del JSON (puede venir roto o de otra versión)", () => {
    expect(recorteValido({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(recorteValido({ x: 0.5, y: 0, w: 0.6, h: 1 })).toBe(false);
    expect(recorteValido({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
    expect(recorteValido({ x: "0", y: 0, w: 1, h: 1 })).toBe(false);
    expect(recorteValido(null)).toBe(false);
    expect(camposPuente({ recorte: { x: 2, y: 0, w: 1, h: 1 } }).recorte).toBeNull();
    expect(camposPuente({}).fuente).toBeNull();
  });

  it("toda la imagen no recorta nada", () => {
    expect(esTodaLaImagen(null)).toBe(true);
    expect(esTodaLaImagen({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(esTodaLaImagen({ x: 0, y: 0, w: 0.5, h: 1 })).toBe(false);
  });

  it("el rectángulo se dibuja en porcentajes de la caja", () => {
    expect(estiloRecorte({ x: 0.25, y: 0.1, w: 0.5, h: 0.8 })).toEqual({
      left: "25%",
      top: "10%",
      width: "50%",
      height: "80%",
    });
  });

  it("marcar sobre un cuadro YA recortado guarda el recorte de la captura entera, y vuelve", () => {
    /* Primero se sacó la barra de Hik-Connect (queda la vista de 4); después
       se eligió el cuadrante de arriba a la izquierda de ESA imagen. */
    const sinBotones = { x: 0, y: 0.1, w: 1, h: 0.8 };
    const cuadrante = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const guardado = componerRecorte(sinBotones, cuadrante);
    expect(guardado).toEqual({ x: 0, y: 0.1, w: 0.5, h: 0.4 });
    expect(relativoA(sinBotones, guardado)).toEqual(cuadrante);
    expect(relativoA(sinBotones, sinBotones)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(componerRecorte(null, cuadrante)).toEqual(cuadrante);
    expect(relativoA(sinBotones, null)).toBeNull();
    expect(relativoA({ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.6, y: 0.6, w: 0.2, h: 0.2 })).toBeNull();
  });

  it("mostrar sólo el cuadrante de abajo a la derecha: la imagen se agranda al doble y se corre", () => {
    const v = vistaRecortada({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 1280, 720);
    expect(v.aspectRatio).toBe("640 / 360");
    expect(v.img).toEqual({ width: "200%", height: "200%", left: "-100%", top: "-100%" });
  });
});

describe("ajustes del modo vivo", () => {
  it("faltantes o rotos toman el valor por defecto; fuera de rango se acotan", () => {
    expect(ajustesConDefectos(null)).toEqual(VIVO_POR_DEFECTO);
    expect(ajustesConDefectos({ umbralPct: Number.NaN, cadaMin: 0, maxDia: 99_999 })).toEqual({
      umbralPct: VIVO_POR_DEFECTO.umbralPct,
      cadaMin: 1,
      maxDia: 200,
    });
    expect(acotarAjuste("umbralPct", 12.6)).toBe(13);
  });

  it("el costo máximo del día sale del tope de fotos (US$0,01 por lectura)", () => {
    expect(costoMaximoDia(200)).toBe(2);
    expect(textoDolares(costoMaximoDia(150))).toBe("US$1,50");
  });
});

describe("la señal del puente", () => {
  it("«hace N»: segundos, minutos, horas y días", () => {
    expect(textoHace(400)).toBe("hace un instante");
    expect(textoHace(2_000)).toBe("hace 2 s");
    expect(textoHace(65_000)).toBe("hace 1 min");
    expect(textoHace(3 * 3_600_000)).toBe("hace 3 h");
    expect(textoHace(26 * 3_600_000)).toBe("hace 1 día");
    expect(textoHace(-5)).toBe("hace un instante");
  });

  it("X-Cuadro-Ts en milisegundos, segundos o ISO", () => {
    expect(leerTsCuadro("1759500000000")).toBe(1_759_500_000_000);
    expect(leerTsCuadro("1759500000")).toBe(1_759_500_000_000);
    expect(leerTsCuadro("2025-10-03T14:00:00.000Z")).toBe(Date.parse("2025-10-03T14:00:00.000Z"));
    expect(leerTsCuadro("")).toBeNull();
    expect(leerTsCuadro("basura")).toBeNull();
  });

  it("la edad se mide con el reloj del servidor, no con el de la compu", () => {
    const ts = Date.parse("2026-10-03T15:00:00Z");
    const clienteAdelantado = ts + 45_000;
    expect(edadDelCuadro(ts, "Sat, 03 Oct 2026 15:00:02 GMT", clienteAdelantado)).toBe(2_000);
    expect(edadDelCuadro(ts, null, ts + 3_000)).toBe(3_000);
    expect(edadDelCuadro(ts + 400, "Sat, 03 Oct 2026 15:00:00 GMT", 0)).toBe(0);
    expect(edadDelCuadro(null, null, 0)).toBeNull();
  });

  it("más de un minuto sin cuadro nuevo = sin señal", () => {
    expect(senalPorEdad(59_000)).toBe("vivo");
    expect(senalPorEdad(61_000)).toBe("sin_senal");
    expect(textoSenal("vivo", 2_000)).toBe("En vivo · hace 2 s");
    expect(textoSenal("sin_senal", 65_000)).toBe("Sin señal desde hace 1 min");
    expect(textoSenal("sin_senal", null)).toMatch(/todavía no mandó/);
  });

  it("errores seguidos esperan el doble cada vez, con tope de 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => esperaSiguiente("error", n))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(esperaSiguiente("vivo", 0)).toBe(1000);
    expect(esperaSiguiente("sin_senal", 0)).toBe(3000);
    expect(esperaSiguiente("vivo", 0, 15_000)).toBe(15_000);
  });
});

describe("el comando para la PC", () => {
  const url = urlPuente("http://localhost:3000/");

  it("la URL base del webhook, sin barra doble", () => {
    expect(url).toBe("http://localhost:3000/api/webhooks/camara");
  });

  it("BlueStacks es el de siempre: no hace falta decirlo; iVMS sí", () => {
    expect(comandoPuente({ url, token: "abc", ventana: "BlueStacks" })).toBe(
      'powershell -ExecutionPolicy Bypass -File camaras-puente-pc.ps1 -Url "http://localhost:3000/api/webhooks/camara" -Token "abc"',
    );
    expect(comandoPuente({ url, token: "abc", ventana: "iVMS-4200" })).toMatch(/-Ventana "iVMS-4200"$/);
  });

  it("la configuración usa los mismos nombres que los parámetros del script", () => {
    expect(JSON.parse(configPuente({ url, token: "abc" }))).toEqual({
      Url: url,
      Token: "abc",
      Ventana: "BlueStacks",
      CadaSeg: 1,
    });
  });
});

it("la última foto de una cámara es la más nueva, venga en el orden que venga", () => {
  const capturas = [
    { id: "a", camaraId: "c1", at: "2026-10-03T10:00:00Z" },
    { id: "b", camaraId: "c2", at: "2026-10-03T12:00:00Z" },
    { id: "c", camaraId: "c1", at: "2026-10-03T11:00:00Z" },
  ];
  expect(ultimaCapturaDe(capturas, "c1")?.id).toBe("c");
  expect(ultimaCapturaDe(capturas, "c3")).toBeNull();
});
