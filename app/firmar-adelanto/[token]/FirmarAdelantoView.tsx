"use client";

/**
 * Página donde el trabajador firma su adelanto desde SU celular (ADR-491).
 * Pensada para 360-400 px y para quien lee poco: monto grande, pocas palabras,
 * un botón. El único fetch es el POST de firmar; los datos vienen del servidor.
 */

import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "@buleje/design-system/icons";
import LienzoFirma from "@/components/ui-system/LienzoFirma";
import { firmaEnCanvas } from "@/components/admin/adelantos/firma/hoja-firma";
import { esFirmaSuficiente, type Trazo } from "@/lib/firma/trazos";
import { limpiarDocumento } from "@/lib/adelantos/recibo-firmado";
import { FirmarPublicoDatosSchema } from "@/lib/adelantos/entregar-schema";
import {
  VERSION_CONSENTIMIENTO_HUELLA,
  enmascararDocumento,
  type CodigoErrorPublico,
  type EstadoEnlace,
  type FirmarPublicoRespuesta,
  type VistaPublicaFirma,
} from "@/lib/adelantos/entregar-tipos";
import HuellaPublica from "./HuellaPublica";

const AVISOS: Record<Exclude<EstadoEnlace, "pendiente"> | "no_encontrado", { titulo: string; cuerpo: string }> = {
  usado: { titulo: "Este recibo ya fue firmado", cuerpo: "No tienes que hacer nada más. Si crees que es un error, avisa a quien te mandó el enlace." },
  vencido: { titulo: "Este enlace venció", cuerpo: "Pídele a quien te lo mandó que te envíe uno nuevo." },
  revocado: { titulo: "Este enlace ya no sirve", cuerpo: "Fue reemplazado por otro. Pídele a quien te lo mandó el enlace nuevo." },
  anulado: { titulo: "Este adelanto fue anulado", cuerpo: "Ya no hay nada que firmar. Si tienes dudas, consulta con el negocio." },
  no_encontrado: { titulo: "No encontramos este enlace", cuerpo: "Revisa que esté completo o pídele a quien te lo mandó que te envíe otro." },
};

const TEXTO_ERROR: Record<CodigoErrorPublico, string> = {
  no_encontrado: AVISOS.no_encontrado.cuerpo,
  vencido: "Este enlace venció. Pídele uno nuevo a quien te lo mandó.",
  usado: "Este recibo ya fue firmado.",
  revocado: "Este enlace ya no sirve. Pídele uno nuevo a quien te lo mandó.",
  anulado: "Este adelanto fue anulado.",
  dni_no_coincide: "Ese DNI no es el de este recibo. Revísalo y vuelve a escribirlo.",
  falta_huella: "Falta la foto de tu huella.",
  falta_consentimiento: "Marca la casilla para guardar tu huella.",
  no_es_imagen: "Esa foto no se pudo leer. Saca otra.",
  muy_grande: "La foto pesa demasiado. Saca otra.",
};

const CODIGOS = Object.keys(TEXTO_ERROR);

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--surface-sunken)] px-4 py-6 text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-md space-y-5">{children}</div>
    </main>
  );
}

function Aviso({ titulo, cuerpo, ok }: { titulo: string; cuerpo: string; ok?: boolean }) {
  const Icono = ok ? CheckCircle2 : AlertTriangle;
  return (
    <Marco>
      <div role={ok ? "status" : "alert"} className="space-y-3 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
        <Icono className={`mx-auto h-12 w-12 ${ok ? "text-[var(--data-success-ink,var(--data-success))]" : "text-[var(--data-warning-ink,var(--data-warning))]"}`} aria-hidden />
        <h1 className="text-2xl font-extrabold">{titulo}</h1>
        <p className="text-base text-[var(--text-secondary)]">{cuerpo}</p>
      </div>
    </Marco>
  );
}

const dinero = (n: number, moneda: string) =>
  `${moneda === "USD" ? "US$" : "S/"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «3:40 p. m.» en hora de Lima (el celular puede tener otra zona). */
const horaLima = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

export function FirmarAdelantoView({ token, vista }: { token: string; vista: VistaPublicaFirma | null }) {
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [documento, setDocumento] = useState("");
  const [huella, setHuella] = useState<Blob | null>(null);
  const [consiente, setConsiente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<FirmarPublicoRespuesta | null>(null);
  const [cerrado, setCerrado] = useState<CodigoErrorPublico | null>(null);

  if (!vista) return <Aviso {...AVISOS.no_encontrado} />;
  if (hecho) {
    return (
      <Aviso
        ok
        titulo={`Listo, firmaste el recibo${hecho.codigoOperacion ?? vista.codigoOperacion ? ` ${hecho.codigoOperacion ?? vista.codigoOperacion}` : ""} a las ${horaLima(hecho.firmadoEn)}`}
        cuerpo="Ya puedes cerrar esta página. Gracias."
      />
    );
  }
  const estado: EstadoEnlace | "no_encontrado" = cerrado && cerrado !== "dni_no_coincide" && cerrado in AVISOS ? (cerrado as keyof typeof AVISOS) : vista.estado;
  if (estado !== "pendiente") return <Aviso {...AVISOS[estado]} />;

  const recibe = vista.direccion === "DADO";
  const mascara = enmascararDocumento(vista.documentoFinal);

  async function firmar() {
    if (!vista) return;
    setError(null);
    if (!esFirmaSuficiente(trazos)) return setError("Firma en el recuadro con tu dedo.");
    const parsed = FirmarPublicoDatosSchema.safeParse({
      firmante: { nombre: vista.persona, documento: limpiarDocumento(documento) },
      trazos,
      ...(huella ? { consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA } : {}),
    });
    if (!parsed.success) {
      const doc = parsed.error.issues.find((i) => i.path.includes("documento"));
      return setError(doc ? "Escribe tu DNI completo (8 números)." : "Revisa tus datos y vuelve a intentar.");
    }
    if (vista.pideHuella && !huella) return setError(TEXTO_ERROR.falta_huella);
    if (huella && !consiente) return setError(TEXTO_ERROR.falta_consentimiento);

    setEnviando(true);
    try {
      const png = await new Promise<Blob | null>((ok) => firmaEnCanvas(trazos).toBlob(ok, "image/png"));
      if (!png) throw new Error("sin_firma");
      const cuerpo = new FormData();
      cuerpo.append("datos", JSON.stringify(parsed.data));
      cuerpo.append("firma", png, "firma.png");
      if (huella) cuerpo.append("huella", huella, "huella.jpg");
      const res = await fetch(`/api/public/adelantos/${encodeURIComponent(token)}/firmar`, { method: "POST", body: cuerpo });
      const json: Record<string, unknown> = await res.json().catch(() => ({}));
      if (res.ok) return setHecho(json as unknown as FirmarPublicoRespuesta);
      const codigo = [json.code, json.codigo, json.error].find((c): c is CodigoErrorPublico => typeof c === "string" && CODIGOS.includes(c));
      if (res.status === 429) return setError("Hiciste muchos intentos. Espera unos minutos y vuelve a probar.");
      if (!codigo) return setError("No se pudo firmar. Revisa tu internet y vuelve a intentar.");
      if (codigo === "dni_no_coincide") {
        const q = Number(json.intentosRestantes);
        return setError(`${TEXTO_ERROR.dni_no_coincide}${Number.isFinite(q) ? ` Te quedan ${q} ${q === 1 ? "intento" : "intentos"}.` : ""}`);
      }
      if (["vencido", "usado", "revocado", "anulado", "no_encontrado"].includes(codigo)) return setCerrado(codigo);
      setError(TEXTO_ERROR[codigo]);
    } catch {
      setError("No se pudo firmar. Revisa tu internet y vuelve a intentar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco>
      <header className="space-y-1">
        <p className="text-base font-semibold text-[var(--text-secondary)]">{vista.negocio}</p>
        <h1 className="text-2xl font-extrabold">
          Firma tu recibo
          {vista.codigoOperacion && <span className="block whitespace-nowrap text-lg font-bold text-[var(--text-secondary)]">{vista.codigoOperacion}</span>}
        </h1>
      </header>

      <section aria-label="Datos del adelanto" className="space-y-2 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <p className="text-base text-[var(--text-secondary)]">{recibe ? `Recibí de ${vista.negocio}` : `Entregué a ${vista.negocio}`}</p>
        <p className="whitespace-nowrap text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{dinero(vista.monto, vista.moneda)}</p>
        <p className="text-base text-[var(--text-secondary)]">{vista.montoEnLetras}</p>
        <p className="border-t border-[var(--rule-base)] pt-2 text-base">{vista.fechaAdelanto}</p>
        <p className="text-base font-semibold">{vista.persona}</p>
        {mascara && <p className="text-base text-[var(--text-secondary)]">DNI {mascara}</p>}
      </section>

      <div className="space-y-2">
        <label htmlFor="dni-firma" className="block text-lg font-bold">
          {vista.pideDocumento ? "Escribe tu DNI" : "Escribe tu DNI completo para confirmar que eres tú"}
        </label>
        <input
          id="dni-firma"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          disabled={enviando}
          placeholder="8 números"
          className="h-14 w-full rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-canvas)] px-4 text-xl tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-bold">Tu firma</h2>
        <LienzoFirma trazos={trazos} onCambio={setTrazos} etiqueta={`Firma de ${vista.persona}`} deshabilitado={enviando} />
      </div>

      <HuellaPublica
        obligatoria={vista.pideHuella}
        huella={huella}
        onHuella={setHuella}
        consiente={consiente}
        onConsiente={setConsiente}
        deshabilitado={enviando}
      />

      {error && (
        <p role="alert" className="rounded-xl border border-[var(--data-error-500)] bg-[var(--surface-raised)] p-3 text-base font-semibold text-[var(--data-error-ink,var(--data-error-700))]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={firmar}
        disabled={enviando}
        className="h-14 w-full rounded-xl bg-[var(--accent-dark)] text-lg font-bold text-white disabled:opacity-60"
      >
        {enviando ? "Firmando…" : "Firmar"}
      </button>
      <p className="pb-4 text-center text-base text-[var(--text-secondary)]">Este enlace sirve una sola vez.</p>
    </Marco>
  );
}
