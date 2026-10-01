"use client";

/**
 * Cámaras — lo que la cámara del patio manda, lo que la IA leyó, y la
 * dirección para que mande (ADR-411, ADR-456).
 *
 * La cámara es 4G con panel solar: nadie puede «entrar» a verla (CGNAT), y un
 * stream continuo no se sostiene ni en datos ni en batería. Así que esta
 * pantalla no es un monitor de video: es **el historial de lo que pasó**, que es
 * lo que sirve a la mañana siguiente — quién entró, a qué hora, y la foto.
 *
 * Tres vistas (`?vista=`), por la pregunta que responden:
 *  · **Fotos** — cada foto con lo que leyó la IA: chalecos, placa con su guía,
 *    actividad y la pila. La placa y el chaleco son propuestas que se confirman.
 *  · **Hoy en el patio** — el día entero en una pantalla, de cualquier fecha.
 *  · **Cámaras** — alta, dirección para copiar, avisos, pila y chalecos: lo que
 *    se configura una vez.
 *
 * Arriba, en las tres, sólo lo que hace que la cámara funcione o no: el túnel
 * cerrado, la IA sin clave, la cámara que dejó de mandar.
 *
 * Los datos y las escrituras viven en `camaras/use-camaras.ts`; la dirección
 * pública en `use-direccion-publica.ts`; la conexión directa en
 * `use-conexion-directa.ts`.
 */

import { useMemo, useState } from "react";
import { CalendarDays, Camera, Image as ImageIcon, RefreshCw } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { estaCallada } from "@/lib/camaras/camaras";
import { normalizarChaleco } from "@/lib/camaras/cruces";
import ConectarCamaraModal from "./camaras/ConectarCamaraModal";
import ChalecosModal from "./camaras/ChalecosModal";
import HistorialFotos from "./camaras/HistorialFotos";
import HoyEnElPatio from "./camaras/HoyEnElPatio";
import VistaCamaras from "./camaras/VistaCamaras";
import { CalladasAviso, DireccionAviso, MensajeAccion, SinIaAviso } from "./camaras/AvisosCamaras";
import { useCamaras } from "./camaras/use-camaras";
import { useConexionDirecta } from "./camaras/use-conexion-directa";
import { useDireccionPublica } from "./camaras/use-direccion-publica";
import { usePantallaAngosta } from "./camaras/use-pantalla-angosta";
import EstadoCamaras from "./camaras/EstadoCamaras";
import { BTN, faltaClaveIa, porQueNoSeCopia } from "./camaras/camaras-ui";

const VISTAS = ["fotos", "patio", "camaras"] as const;

export default function CamarasView() {
  const d = useCamaras();
  const conexion = useConexionDirecta(d);
  const dir = useDireccionPublica();
  const { vista, irA } = useVistaModulo("camaras", VISTAS, "fotos");
  /* A 400 px «Hoy en el patio» partía el control en dos renglones y dejaba
     «Actualizar» solo en una fila: en el celular la pestaña dice «Hoy» y van
     sin ícono (medido: 373 px de 368 con los íconos). */
  const angosta = usePantallaAngosta();
  const [recarga, setRecarga] = useState(0);
  const [conectando, setConectando] = useState<string | null>(null);
  const [chalecos, setChalecos] = useState<{ numero: string | null } | null>(null);

  const calladas = useMemo(() => d.camaras.filter((c) => estaCallada(c)), [d.camaras]);
  const sinIa = useMemo(() => faltaClaveIa(d.capturas), [d.capturas]);
  const camaraAConectar = d.camaras.find((c) => c.id === conectando) ?? null;

  /* Los números que la IA leyó y no son de nadie: el modal los ofrece para
     asignarlos sin tipearlos. Cuenta fotos, no lecturas repetidas. */
  const vistosSinAsignar = useMemo(() => {
    const fotos = new Map<string, number>();
    for (const c of d.capturas) {
      const numeros = new Set<string>();
      for (const x of c.cruces?.chalecos ?? []) if (!x.colaboradorId) numeros.add(x.numero);
      for (const n of c.lectura?.chalecos ?? []) {
        const k = normalizarChaleco(n);
        if (k && !d.chalecos[k]) numeros.add(k);
      }
      for (const n of numeros) if (!d.chalecos[n]) fotos.set(n, (fotos.get(n) ?? 0) + 1);
    }
    return [...fotos.entries()]
      .map(([numero, n]) => ({ numero, fotos: n }))
      .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));
  }, [d.capturas, d.chalecos]);

  const abrirChalecos = (numero: string | null) => {
    d.setError(null);
    setChalecos({ numero });
  };
  /* Asignar cambia quién es quién también en el resumen del día: se lo vuelve a
     pedir (el servidor lo arma con la lista viva de chalecos). */
  const asignarChaleco = async (numero: string, colaboradorId: string | null) => {
    const r = await d.asignarChaleco(numero, colaboradorId);
    if (r) setRecarga((n) => n + 1);
    return r;
  };
  const actualizar = () => {
    void d.cargar();
    void dir.recargar();
    setRecarga((n) => n + 1);
  };

  return (
    <div className="space-y-4" data-vista="camaras">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={vista}
          onChange={(v) => irA(v)}
          label="Qué mirar de las cámaras"
          className="max-w-full overflow-x-auto whitespace-nowrap"
          options={[
            /* El conteo va en el rótulo y no en `badge`: la pastilla del control
               marcado da 2,98:1 (blanco sobre turquesa a 12 px, medido con axe). */
            {
              value: "fotos",
              label: d.capturas.length ? `Fotos (${d.capturas.length})` : "Fotos",
              icon: angosta ? undefined : <ImageIcon className="h-4 w-4" aria-hidden />,
            },
            {
              value: "patio",
              label: angosta ? "Hoy" : "Hoy en el patio",
              icon: angosta ? undefined : <CalendarDays className="h-4 w-4" aria-hidden />,
            },
            {
              value: "camaras",
              label: "Cámaras",
              icon: angosta ? undefined : <Camera className="h-4 w-4" aria-hidden />,
            },
          ]}
        />
        <button type="button" onClick={actualizar} title="Actualizar" className={`${BTN} ml-auto`}>
          <RefreshCw className={`h-4 w-4 ${d.cargando ? "animate-spin" : ""}`} aria-hidden />
          <span className="max-sm:sr-only">Actualizar</span>
        </button>
      </div>

      {/* En «Cámaras» el aviso va con la lista (también en verde): acá sólo los problemas, y una vez. */}
      {vista !== "camaras" && <DireccionAviso estado={dir.estado} soloProblemas />}
      {sinIa && <SinIaAviso />}
      <CalladasAviso calladas={calladas} />
      <MensajeAccion error={chalecos ? null : d.error} aviso={chalecos ? null : d.aviso} />

      {vista === "fotos" && (
        <EstadoCamaras
          camaras={d.camaras}
          direccionParaCamara={dir.direccionParaCamara}
          motivoSinDireccion={porQueNoSeCopia(dir.estado)}
          guardando={d.guardando}
          onRotar={(id) => void d.rotar(id)}
          onErrorCopia={() =>
            d.setError("El navegador no dejó copiar. Selecciona la dirección a mano.")
          }
        />
      )}
      {vista === "fotos" && (
        <HistorialFotos
          camaras={d.camaras}
          capturas={d.capturas}
          cargando={d.cargando}
          guardando={d.guardando}
          onBorrar={(id) => void d.borrarCaptura(id)}
          onConfirmar={d.confirmarCruce}
          onAsignarChaleco={abrirChalecos}
          chalecosVivos={d.chalecos}
          onIrACamaras={() => irA("camaras")}
        />
      )}
      {vista === "patio" && (
        <HoyEnElPatio activo recarga={recarga} onAsignarChaleco={abrirChalecos} />
      )}
      {vista === "camaras" && (
        <VistaCamaras
          datos={d}
          conexion={conexion}
          estadoDireccion={dir.estado}
          direccionParaCamara={dir.direccionParaCamara}
          onConectar={setConectando}
          onAbrirChalecos={() => abrirChalecos(null)}
        />
      )}

      {camaraAConectar && (
        <ConectarCamaraModal
          /* Uno por cámara: al montarse lee la conexión que ya tiene, y así una
             recarga de la lista mientras se escribe no pisa lo tipeado. */
          key={camaraAConectar.id}
          camara={camaraAConectar}
          onCerrar={() => setConectando(null)}
          onConectar={(datos) => conexion.conectar(camaraAConectar, datos)}
          onDesconectar={async () => {
            await d.desconectar(camaraAConectar.id);
          }}
        />
      )}
      {chalecos && (
        <ChalecosModal
          key={chalecos.numero ?? "nuevo"}
          chalecos={d.chalecos}
          colaboradores={d.colaboradores}
          vistosSinAsignar={vistosSinAsignar}
          numeroInicial={chalecos.numero}
          guardando={d.guardando}
          error={d.error}
          onAsignar={asignarChaleco}
          onCerrar={() => setChalecos(null)}
        />
      )}
    </div>
  );
}
