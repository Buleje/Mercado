"use client";

/**
 * Conexión con SUNAT — la pantalla que faltaba para encender lo ya construido.
 *
 * El motor de facturación electrónica existe entero desde ADR-045 (cliente
 * Nubefact, armado del comprobante, worker de envío, validador de webhook, y
 * los modelos `TenantSunatConfig`/`SunatInvoice`). El endpoint que guarda la
 * configuración —`PUT /api/admin/sunat/config`— también. Lo único que nunca se
 * escribió fue el formulario: medido en la base, `TenantSunatConfig` tenía CERO
 * filas y no se había emitido ni un comprobante. El negocio no podía conectarse
 * porque no había dónde escribir el RUC ni el token.
 *
 * Qué NO hace esta pantalla, para que no se espere de más: **no consulta la
 * deuda tributaria**. SUNAT no publica una API para eso — la deuda sólo se ve
 * entrando a SOL con Clave SOL. Acá se conecta la EMISIÓN de comprobantes.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle2, Loader2, Save, ShieldCheck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

const SunatModoOficialCard = dynamic(() => import("./SunatModoOficialCard"), { ssr: false });

/** Lo que devuelve el GET. El token NUNCA viaja de vuelta: es un secreto. */
interface ConfigLeida {
  id: string;
  ruc: string;
  razonSocial: string;
  direccionFiscal: string | null;
  ubigeo: string | null;
  boletaSeries: string;
  facturaSeries: string;
  lastBoletaNum: number;
  lastFacturaNum: number;
  isProduction: boolean;
}

const INPUT =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[var(--text-secondary)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

export default function SunatConexionTab() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [existe, setExiste] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const [ruc, setRuc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [direccionFiscal, setDireccionFiscal] = useState("");
  const [ubigeo, setUbigeo] = useState("");
  const [token, setToken] = useState("");
  const [boletaSeries, setBoletaSeries] = useState("B001");
  const [facturaSeries, setFacturaSeries] = useState("F001");
  const [isProduction, setIsProduction] = useState(false);
  const [correlativos, setCorrelativos] = useState({ boleta: 0, factura: 0 });

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/sunat/config", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data: ConfigLeida | null } | null) => {
        const c = j?.data;
        if (!c) return;
        setExiste(true);
        setRuc(c.ruc ?? "");
        setRazonSocial(c.razonSocial ?? "");
        setDireccionFiscal(c.direccionFiscal ?? "");
        setUbigeo(c.ubigeo ?? "");
        setBoletaSeries(c.boletaSeries ?? "B001");
        setFacturaSeries(c.facturaSeries ?? "F001");
        setIsProduction(Boolean(c.isProduction));
        setCorrelativos({ boleta: c.lastBoletaNum ?? 0, factura: c.lastFacturaNum ?? 0 });
      })
      .catch(() => { /* sin config: el formulario arranca vacío, que es lo correcto */ })
      .finally(() => setCargando(false));
    return () => ac.abort();
  }, []);

  const guardar = useCallback(async () => {
    setAviso(null);
    if (!/^\d{11}$/.test(ruc)) {
      setAviso({ tono: "error", texto: "El RUC tiene que ser de 11 dígitos." });
      return;
    }
    if (razonSocial.trim().length < 3) {
      setAviso({ tono: "error", texto: "Falta la razón social tal como figura en SUNAT." });
      return;
    }
    /* Sólo la primera vez: después, el token guardado se conserva si el campo
       queda vacío (por eso el GET nunca lo devuelve). */
    if (!existe && token.trim().length < 10) {
      setAviso({ tono: "error", texto: "Para conectar por primera vez hace falta el token de Nubefact." });
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/admin/sunat/config", {
        method: "PUT",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ruc,
          razonSocial: razonSocial.trim(),
          ...(direccionFiscal.trim() && { direccionFiscal: direccionFiscal.trim() }),
          ...(/^\d{6}$/.test(ubigeo) && { ubigeo }),
          ...(token.trim() && { nubefactToken: token.trim() }),
          boletaSeries,
          facturaSeries,
          isProduction,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setAviso({ tono: "error", texto: j?.error ?? "No se pudo guardar la configuración." });
        return;
      }
      setExiste(true);
      setToken("");
      setAviso({
        tono: "ok",
        texto: isProduction
          ? "Conectado en PRODUCCIÓN: los comprobantes que emitas van a SUNAT de verdad."
          : "Guardado en modo prueba (sandbox). Nada de lo que emitas tiene validez ante SUNAT todavía.",
      });
    } catch {
      setAviso({ tono: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }, [ruc, razonSocial, direccionFiscal, ubigeo, token, boletaSeries, facturaSeries, isProduction, existe]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo la conexión con SUNAT…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* El estado y el checklist de activación ya existían (ADR-123): se reusa,
          no se vuelve a dibujar. */}
      <SunatModoOficialCard />

      {/* Lo que esta pantalla NO puede hacer, dicho antes de que lo busque. */}
      <p className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        Esto conecta la <b className="text-[var(--text-primary)]">emisión</b> de boletas y facturas. La deuda
        tributaria no se puede consultar desde acá: SUNAT sólo la muestra dentro de SOL con tu Clave SOL.
      </p>

      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle as="h3" className="mb-4 text-base font-extrabold text-[var(--text-primary)]">
          Datos fiscales del negocio
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="RUC" hint="11 dígitos. Se valida contra SUNAT (tiene que estar ACTIVO y HABIDO).">
            <input
              value={ruc}
              onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
              inputMode="numeric"
              placeholder="20605859438"
              className={`${INPUT} font-mono tabular-nums`}
            />
          </Campo>
          <Campo label="Razón social" hint="Tal cual figura en la ficha RUC, sin abreviar.">
            <input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="INVERSIONES AGROFORESTALES BLAS S.A.C."
              className={INPUT}
            />
          </Campo>
          <Campo label="Dirección fiscal" hint="Opcional. Sale impresa en el comprobante.">
            <input value={direccionFiscal} onChange={(e) => setDireccionFiscal(e.target.value)} className={INPUT} />
          </Campo>
          <Campo label="Ubigeo" hint="Opcional. 6 dígitos del código SUNAT del distrito.">
            <input
              value={ubigeo}
              onChange={(e) => setUbigeo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="190301"
              className={`${INPUT} font-mono tabular-nums`}
            />
          </Campo>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle as="h3" className="mb-4 text-base font-extrabold text-[var(--text-primary)]">
          Conexión con Nubefact
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label={existe ? "Token de Nubefact (ya guardado)" : "Token de Nubefact"}
            hint={
              existe
                ? "Dejalo vacío para conservar el que ya está. Sólo escribí acá si lo vas a reemplazar."
                : "Se saca en app.nubefact.com → Configuración → Token."
            }
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={existe ? "•••••••••• guardado" : "pegá el token acá"}
              autoComplete="off"
              className={INPUT}
            />
          </Campo>
          <Campo label="Ambiente" hint="Producción emite comprobantes con validez legal. Empezá siempre en prueba.">
            <select
              value={isProduction ? "prod" : "beta"}
              onChange={(e) => setIsProduction(e.target.value === "prod")}
              className={INPUT}
            >
              <option value="beta">Prueba (sandbox) — sin validez ante SUNAT</option>
              <option value="prod">Producción — comprobantes reales</option>
            </select>
          </Campo>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle as="h3" className="mb-1 text-base font-extrabold text-[var(--text-primary)]">
          Series y numeración
        </CardTitle>
        {/* El correlativo se muestra pero no se edita: lo mueve la emisión, y
            pisarlo desde un formulario haría salir dos comprobantes con el
            mismo número — un problema con SUNAT, no un bug de pantalla. */}
        <p className="mb-4 text-sm text-[var(--text-tertiary)]">
          El número corre solo con cada comprobante emitido; no se edita a mano.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Serie de boletas" hint={`Último número emitido: ${correlativos.boleta}`}>
            <input
              value={boletaSeries}
              onChange={(e) => setBoletaSeries(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="B001"
              className={`${INPUT} font-mono`}
            />
          </Campo>
          <Campo label="Serie de facturas" hint={`Último número emitido: ${correlativos.factura}`}>
            <input
              value={facturaSeries}
              onChange={(e) => setFacturaSeries(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="F001"
              className={`${INPUT} font-mono`}
            />
          </Campo>
        </div>
      </section>

      {aviso && (
        <p
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            aviso.tono === "ok"
              ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              : "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          }`}
        >
          {aviso.tono === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {aviso.texto}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {isProduction && (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Vas a guardar en producción
          </span>
        )}
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {existe ? "Guardar cambios" : "Conectar con SUNAT"}
        </button>
      </div>
    </div>
  );
}
