# Potenciar Buleje (28-10) — estado vivo

Pedido de Brandon (28-10): «potenciar al máximo todo (forestal, ventas, todo)… revisar modales, ampliar campos y funciones de alto y medio nivel… lo más fácil, completo y navegable del mercado; cosas creativas; investigando, revisando, creando». Levanta el foco «sólo forestal» del 19-10.

Mapas medidos (scratchpad de la sesión `07dac613`, `mapa/{forestal,ventas,panel}.md`). Hechos clave:
- Blas: 1 usuario (blasadmin), 820 acciones/30 d: cámaras 395, CTP 204, LO-TH 89, asistencia 86. Sin usar: contar patio (0), parte diario (0), fletes, trámites, salidas del libro (0 con 18 Anexos 04).
- 14 guías de Blas sin fecha de recepción; 18 Anexos 04 sin comprador; 14 ingresos sin costo.
- Bodega (main): 16 ventas, todas de qaadmin; 0 comprobantes SUNAT; 57/110 productos sin código, 51 sin costo; 9 por kilo con cantidades enteras.
- Panel: al entrar se abre el Chat IA; el buscador no encuentra guías/trozas/trabajadores; forestal en el puesto 19 de 24 de la barra; no se registra qué pantallas se abren.

## Tanda 1 (en curso) — sin dinero ni schema
| Carril | Qué | Modelo | Estado |
|---|---|---|---|
| A | Buscador del aserradero y del personal (Ctrl+K) | opus | ✅ `841966fab` (security: 0 críticos; comodines LIKE y código vacío arreglados) |
| B | Importar = recepcionar + «sin recepcionar» en Trozas | opus | ✅ `1dacacc68` (las 14 de Blas SÍ entraban al conteo; sin fecha, los días cuentan desde la importación) |
| C | Resumen diario del CTP por correo (apagado; a quién = Brandon) | sonnet | ✅ `d0a67d5dc` (cubre ~7 de 11 revisiones; las otras 5 se calculan en el navegador) |

## Tanda 2
- D Uso del panel + barra por rubro y uso — ✅ `139117026` (rubro sube sólo si se abre más que Ventas: `Tenant.industry` dice «bodega» en Blas y main)
- E Bodega lista para vender — ✅ `7f8ac6717` (en pantalla 28/28/4 activos, no 57/51/23: el mapa contaba inactivos/servicios)
- Carrito dos pestañas (zona de peligro) — ✅ `4cdb4d755` (reviewer + security sin veto; 202-578 escrituras de [] → 0)
- Pendiente: puesta en marcha según rubro.
- Hallazgo de security (fuera del diff, MEDIO, propuesta): `/api/orders` GET sin rol → el cajero ve el teléfono del cliente en 19/20 pedidos.

## Tanda 3
Celular ✅ `31da5f9ac` (Clientes 5,82 → 1,70; Datos del negocio 3,91 → 1,64; Inventario 18,81 → 4,63; peor que queda: LO-TH 17,56) · (Clientes en secciones, Configuración, Inicio) · Registrar producción en 3 pasos (modal de 1.862 líneas) · Cada guía con el video del camión (verificar Hik-Connect por hora).

## Tanda 4 (cerrada salvo 3 tests; retomada 28-10 13:50 en la sesión `c1955b68` tras cerrarse la terminal)
| Carril | Qué | Modelo | Estado |
|---|---|---|---|
| enlaces | Ctrl+K abre el registro exacto (GTF LO-TH, lote, persona) | opus | ✅ `75db0b2ba` |
| t4-produccion-2 | Registrar producción en 3 pasos (modal 1.862 → 209 + 15 archivos ≤249) | opus | ✅ `d18dc6d5b` (revisor: payload idéntico también contra HEAD; 4 fallas del dictado escrito arregladas: coma decimal, cm/m abreviados, fracción con barra y unidades mezcladas → null) · 🔄 tester haiku agrega 3 casos al test del payload |
| t4-loth-celular-2 | LO-TH en el celular | sonnet | ✅ `d37d0589e` (17,56 → 2,34; todas las vistas ≤2,5) |
| t4-salidas-enlace | Ctrl+K abre GTF de salida y Anexo 04 + aviso de GTF ausente | sonnet | ✅ `e8eb62a4d` |

Si se corta otra vez: los archivos sin commit son de estos carriles; el guardián `buttonAMano` (4514) sube mientras los `<button>` copiados no pasen al DS.

## Tanda 5 (Brandon eligió 28-10 14:30: Anexos 04 en su cajón · Venta por peso · Resumen diario a su correo)
| Qué | Estado |
|---|---|
| Resumen diario | ✅ prueba llegó a Gmail (QA forestal, owner = Brandon). Reloj local `reportes-hora-exacta.timer` (:00/:30 → localhost/hora-exacta; log `~/.local/state/reportes-hora-exacta.log`), porque producción es de julio y su cron nunca llama a la PC. Falta: Brandon lo prende en Blas (Libro CTP › ⋯ › Reportes diarios › Recibir el resumen del CTP) |
| Venta por peso | ⏸️ contrato listo: `potenciar-2026-10-28/contrato-venta-por-peso.md`; esperando respuestas (base: migrar y caja primero; reglas de gramos/pasos/nombres/litros) |
| Anexos 04 en su cajón | ⏸️ contrato listo: `potenciar-2026-10-28/contrato-anexos04-cajon.md`; esperando respuestas (comprador = destinatario, emisor desde Ficha CTP, libreta, 2 sin GTF, N° 0488732 doble) |

## Para que Brandon apruebe (dinero / base / decisión)
Nuevos de la tanda 4: «Guardar producción» queda prendido sin fecha válida (ya pasaba antes; el paso Origen dice «falta») · Anexo 04 desde Ctrl+K abre siempre en Despacho · admin: ¿Ctrl+K «Miguel» abre su asistencia o su ficha? (hoy ficha) · Hallazgo security MEDIO: `/api/orders` GET sin rol (cajero ve teléfonos).
Venta por peso (0,5 kg) · Boleta SUNAT real · Yape que se anota solo · Precio por cantidad · Una sola regla para cupones y puntos · Cuánto deja cada permiso · Anexos 04 en su propio cajón · Abrir «Hoy en tu negocio» al entrar en vez del chat · A quién se manda el parte diario.

## Reglas de la corrida
≤3 constructores a la vez, archivos disjuntos; ningún carril hace commit (los hace el hilo principal al cerrar la tanda, por carril con `scripts/commit-carril.sh -- <paths>`); typecheck completo una vez por tanda; revisor para lo de rol/legal.
