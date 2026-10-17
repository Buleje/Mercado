"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Firma de contrato desde el celular, sin cuenta ni app.
 *
 * Está pensada para alguien que abre un link de WhatsApp parado en la vereda:
 * primero le decimos en criollo qué está por firmar, después le dejamos leer el
 * documento entero, y recién al final le pedimos el trazo. Rechazar tiene el
 * mismo peso que firmar, no está escondido.
 */

const ANCHO = 560;
const ALTO = 190;

type Parte = { nombre: string; rol: string; estado: string; orden: number; esVos: boolean };

interface Props {
  token: string;
  firmante: { nombre: string; documento: string; rol: string; estado: string };
  contrato: {
    numero: string;
    tipoLabel: string;
    resumen: string;
    monto: number;
    moneda: string;
    fechaInicio: string;
    fechaVencimiento: string | null;
    otraParte: string;
  };
  partes: Parte[];
  puedeFirmar: boolean;
  motivo: string | null;
  esperandoA: string | null;
}

const MOTIVOS: Record<string, string> = {
  ya_firmo: "Ya firmaste este contrato. Guardá el PDF para tu registro.",
  rechazado: "Registramos que no aceptaste firmar este contrato.",
  no_es_su_turno: "Todavía no es tu turno: falta que firme la otra parte.",
  link_vencido: "Este link venció. Pedile a quien te lo mandó que genere uno nuevo.",
  contrato_cerrado: "Este contrato ya no está en circulación.",
};

function fecha(iso: string | null) {
  if (!iso) return "sin fecha de término";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
}

function plata(monto: number, moneda: string) {
  const simbolo = moneda === "USD" ? "US$" : "S/";
  return `${simbolo} ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FirmarContratoView(props: Props) {
  const { token, firmante, contrato, partes, puedeFirmar, motivo, esperandoA } = props;

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<"firmado" | "rechazado" | null>(null);
  const [completo, setCompleto] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [confirma, setConfirma] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const trazado = useRef(false);

  useEffect(() => {
    if (listo || !puedeFirmar) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    trazado.current = false;
  }, [listo, puedeFirmar]);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  }
  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    dibujando.current = true;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    trazado.current = true;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function terminar() {
    dibujando.current = false;
  }
  function borrar() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    trazado.current = false;
  }

  async function firmar() {
    if (!trazado.current) {
      setError("Dibujá tu firma en el recuadro.");
      return;
    }
    if (!confirma) {
      setError("Marcá la casilla para confirmar que sos vos.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/contratos/${token}/firmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "firmar",
          firma: canvasRef.current?.toDataURL("image/png"),
          confirmaIdentidad: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo firmar");
      setListo("firmado");
      setCompleto(Boolean(json.completo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo firmar");
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar() {
    if (motivoRechazo.trim().length < 3) {
      setError("Contanos en una línea por qué no lo firmás.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/contratos/${token}/firmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "rechazar", motivo: motivoRechazo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo registrar");
      setListo("rechazado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setEnviando(false);
    }
  }

  // ── Pantalla final ────────────────────────────────────────────────────────
  if (listo) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f5f6f8] p-6">
        <div className="bg-white rounded-3xl border border-[#e5e7eb] shadow-sm p-10 max-w-lg text-center">
          <h1 className="text-2xl font-extrabold text-[#0f172a]">
            {listo === "firmado" ? "Listo, quedó firmado" : "Registramos tu respuesta"}
          </h1>
          <p className="text-base text-[#475569] mt-3 leading-relaxed">
            {listo === "firmado"
              ? completo
                ? `Firmaron todas las partes. El contrato ${contrato.numero} ya es un documento cerrado y quedó guardado con tu firma.`
                : `Tu firma quedó registrada en el contrato ${contrato.numero}. Falta que firme la otra parte.`
              : `Le avisamos a quien te envió el contrato ${contrato.numero} que no lo aceptaste.`}
          </p>
          {listo === "firmado" && (
            <a
              href={`/api/public/contratos/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-6 px-6 py-3 rounded-xl bg-[#0f172a] text-white text-base font-bold"
            >
              Ver el contrato firmado
            </a>
          )}
        </div>
      </main>
    );
  }

  // ── Pantalla de firma ─────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#f5f6f8] py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="bg-white rounded-3xl border border-[#e5e7eb] p-7">
          <p className="text-sm font-bold uppercase tracking-wide text-[#00807f]">
            Contrato de {contrato.tipoLabel}
          </p>
          <h1 className="text-2xl font-extrabold text-[#0f172a] mt-1">
            {firmante.nombre}, te pidieron firmar este contrato
          </h1>
          <p className="text-base text-[#475569] mt-3 leading-relaxed">{contrato.resumen}</p>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-[#e5e7eb]">
            <div>
              <dt className="text-xs font-bold uppercase text-[#64748b]">Documento</dt>
              <dd className="text-base font-semibold text-[#0f172a]">{contrato.numero}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase text-[#64748b]">Monto</dt>
              <dd className="text-base font-semibold text-[#0f172a]">
                {contrato.monto > 0 ? plata(contrato.monto, contrato.moneda) : "Sin monto pactado"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase text-[#64748b]">Vigencia</dt>
              <dd className="text-base font-semibold text-[#0f172a]">
                {fecha(contrato.fechaInicio)} — {fecha(contrato.fechaVencimiento)}
              </dd>
            </div>
          </dl>
        </header>

        {/* Quién firma y en qué orden */}
        <section className="bg-white rounded-3xl border border-[#e5e7eb] p-6">
          <h2 className="text-base font-bold text-[#0f172a] mb-3">Quiénes firman</h2>
          <ol className="space-y-2">
            {partes.map((p) => (
              <li key={`${p.orden}-${p.nombre}`} className="flex items-center gap-3 text-base">
                <span className="h-7 w-7 shrink-0 rounded-full bg-[#eef2f5] text-[#475569] text-sm font-bold flex items-center justify-center">
                  {p.orden}
                </span>
                <span className="text-[#0f172a] font-semibold">
                  {p.nombre}
                  {p.esVos && <span className="text-[#00807f] font-bold"> (vos)</span>}
                </span>
                <span
                  className={
                    p.estado === "FIRMADO"
                      ? "text-sm font-bold text-[#0f7a5a]"
                      : p.estado === "RECHAZADO"
                        ? "text-sm font-bold text-[#b42318]"
                        : "text-sm text-[#64748b]"
                  }
                >
                  {p.estado === "FIRMADO" ? "ya firmó" : p.estado === "RECHAZADO" ? "no aceptó" : "pendiente"}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* El documento completo */}
        <section className="bg-white rounded-3xl border border-[#e5e7eb] p-6">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-base font-bold text-[#0f172a]">Leé el contrato completo</h2>
            <a
              href={`/api/public/contratos/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-bold text-[#00807f] underline"
            >
              Abrir en pantalla completa
            </a>
          </div>
          <iframe
            src={`/api/public/contratos/${token}/pdf`}
            title={`Contrato ${contrato.numero}`}
            className="w-full h-[520px] rounded-2xl border border-[#e5e7eb] bg-white"
          />
        </section>

        {!puedeFirmar ? (
          <section className="bg-white rounded-3xl border border-[#e5e7eb] p-7 text-center">
            <p className="text-base text-[#475569]">
              {MOTIVOS[motivo ?? ""] ?? "Por ahora no podés firmar este contrato."}
              {motivo === "no_es_su_turno" && esperandoA ? ` Estamos esperando a ${esperandoA}.` : ""}
            </p>
          </section>
        ) : (
          <section className="bg-white rounded-3xl border border-[#e5e7eb] p-7 space-y-4">
            <h2 className="text-base font-bold text-[#0f172a]">Tu firma</h2>
            <p className="text-base text-[#475569]">
              Dibujala con el dedo o el mouse. Queda registrada con la fecha, la hora y el dispositivo
              desde el que firmaste.
            </p>

            <div className="border-2 border-dashed border-[#cbd5e1] rounded-2xl overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={ANCHO}
                height={ALTO}
                onPointerDown={empezar}
                onPointerMove={mover}
                onPointerUp={terminar}
                onPointerLeave={terminar}
                style={{ touchAction: "none", maxWidth: "100%" }}
                className="block w-full"
              />
            </div>
            <button
              type="button"
              onClick={borrar}
              className="text-base font-bold text-[#64748b] underline"
            >
              Borrar y dibujar de nuevo
            </button>

            <label className="flex items-start gap-3 text-base text-[#0f172a] cursor-pointer">
              <input
                type="checkbox"
                checked={confirma}
                onChange={(e) => setConfirma(e.target.checked)}
                className="mt-1 h-5 w-5"
              />
              <span>
                Confirmo que soy {firmante.nombre}
                {firmante.documento ? ` (documento ${firmante.documento})` : ""} y que leí el contrato
                completo.
              </span>
            </label>

            {error && <p className="text-base font-semibold text-[#b42318]">{error}</p>}

            <button
              type="button"
              onClick={firmar}
              disabled={enviando}
              className="w-full py-4 rounded-2xl bg-[#00807f] text-white text-lg font-extrabold disabled:opacity-60"
            >
              {enviando ? "Registrando tu firma…" : "Firmar el contrato"}
            </button>

            {!rechazando ? (
              <button
                type="button"
                onClick={() => setRechazando(true)}
                className="w-full py-3 rounded-2xl border-2 border-[#e5e7eb] text-[#475569] text-base font-bold"
              >
                No estoy de acuerdo con este contrato
              </button>
            ) : (
              <div className="space-y-3 pt-2 border-t border-[#e5e7eb]">
                <label className="block text-base font-semibold text-[#0f172a]" htmlFor="motivo">
                  ¿Por qué no lo firmás?
                </label>
                <textarea
                  id="motivo"
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  rows={3}
                  placeholder="Ej.: el monto no es el que habíamos hablado"
                  className="w-full rounded-2xl border-2 border-[#cbd5e1] p-3 text-base"
                />
                <button
                  type="button"
                  onClick={rechazar}
                  disabled={enviando}
                  className="w-full py-3 rounded-2xl bg-[#b42318] text-white text-base font-bold disabled:opacity-60"
                >
                  {enviando ? "Enviando…" : "Enviar mi respuesta"}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
