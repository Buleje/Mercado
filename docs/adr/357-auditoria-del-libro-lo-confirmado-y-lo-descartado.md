# ADR-357 — Auditoría del libro: lo confirmado y lo descartado

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · recorrida completa de los 7 módulos de Operación + Control, Trazabilidad y Gestión
- **Relacionado:** ADR-317 (directorio) · ADR-339 (bandeja y archivo) · ADR-334 (lote de aserrío) · ADR-353 (cuadrar la guía)

## Antes de actuar, medir

El informe traía siete puntos. Cada uno se midió contra el tenant real antes de
tocar código. **Dos no eran lo que decían**, y decirlo vale tanto como arreglar
los otros cinco.

| Punto | Veredicto | Evidencia |
|---|---|---|
| El módulo Lotes deshabilitado **invalida el Cuadro Resumen 3** | **Parcialmente falso** | La spec sí está off (403), pero los tres cuadros salen de ingresos/corridas/despachos, que son pedidos **obligatorios**. Los lotes entran por `pedirOpcionalCtp` y sólo rellenan **una columna**. |
| «GTF ingresadas» es una copia de Ingresos | **Confirmado** | Mismos 5 KPI, mismo banner de pendientes, mismas 8 columnas. |
| El Directorio muestra 0 con las guías cargadas | **Confirmado** | `partes: 0, vehiculos: 0` contra **17 ingresos**, todos con proveedor y `gtfDatos`. |
| «Cuadrar» sólo se llega desde Cumplimiento | **Ya resuelto** | El aviso naranja de la fila **es** el botón (ADR-353, mismo día). |
| Un lote vacío cuenta como abierto | **Confirmado** | `LA-2026-001`, abierto, 0 trozas. |
| «Vaciar el libro» necesita confirmación reforzada | **Ya resuelto** | Pide escribir `VACIAR LIBRO`. |
| El despacho por encima del saldo puede pasar en silencio | **Ya resuelto** | I3 rechaza con 422 y el motivo: «Sólo quedan N sin despachar; estás pidiendo M». |

## Lo que se cambió

### 1. El archivo deja de ser la bandeja

«GTF ingresadas» mostraba «Ingresos del período», «Pendientes validar» y «Fuera
de plazo». En el archivo **dos de esas no pueden decir nada**: ahí todo está
recepcionado y validado por definición, así que «Pendientes validar» es siempre
0 y el operador aprende a no mirar la fila entera. También traía el aviso de
«guías del monte sin ingresar», que es de la bandeja de entrada.

`CtpGtfIngresadasKpis` contesta lo que sí se pregunta parado ahí: **guías
ingresadas, volumen recibido, piezas del archivo (y cuántas con recepción
cerrada), especies y guías sin cuadrar**. Se calcula de las guías que la tabla ya
tiene en memoria: sin un pedido más y sin poder contradecir a la tabla de abajo.

### 2. La libreta que ya estaba escrita en las guías

`descubrirEnGuias()` (puro, 16 tests) saca proveedor, destinatario,
transportista, conductor y placa de cada guía y los cruza contra el directorio.
En el tenant real encontró, sin cargar nada a mano:

- **RUBEN BAZAN ROSALES** — transportista y conductor, DNI 48831805, en **34 guías**
- **COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI** — proveedor, RUC, en 17
- **INVERSIONES AGROFORESTALES BLAS SAC** — destinatario, RUC, en 17
- 4 vehículos

**Propone, no da de alta.** Una guía trae el nombre como lo tipeó el emisor y un
alta automática llenaría la libreta de duplicados que después nadie limpia;
además el directorio es una libreta curada (cuenta bancaria, tarifas) que una
importación pisaría.

Dos deduplicaciones que la medición obligó a escribir:

- **Con documento y sin documento son la misma persona.** Una guía trae el RUC
  del titular y la siguiente no; sin fundirlas aparecía dos veces.
- **`V2H-901 /`, `V2H-901 / -----` y `V2H-901` son una placa.** El emisor escribe
  la placa, el separador y el remolque, y cuando no hay remolque deja el
  separador igual. Se veían tres vehículos donde hay uno.

### 3. Un lote vacío no es trabajo en curso

`resumenLotes` separa `vacios` de `abiertos`: un lote sin piezas es un rótulo
esperando madera, no una pila en el patio. El KPI dice «N con madera · M vacíos»
en vez de inflar el contador.

### 4. El aviso de Cuadros SERFOR deja de sonar a invalidez

Decía «les falta una parte… revisá esos casilleros antes de presentar el libro»,
que se lee como que el cuadro sale incompleto. Ahora dice la verdad medida: **los
tres cuadros están completos con los movimientos del libro; lo que falta es una
columna de apoyo, y los volúmenes, saldos y rendimiento no cambian.**

## Verificación

- **GTF ingresadas**: «Guías ingresadas 5 · 13 asientos · Volumen recibido 87.46
  m³ · Piezas del archivo 26, 17 con recepción cerrada · Especies 5 · **Guías sin
  cuadrar 1**», sin el banner de pendientes. Ingresos conserva los suyos.
- **Directorio**: los 3 contactos y 4 vehículos de arriba, con su conteo de guías.
- 0 errores de consola propios en las tres pantallas.

## El ciclo completo, de punta a punta (punto 5 del informe)

Corrido sobre el tenant de PRUEBAS, por los endpoints reales:

| Paso | Resultado |
|---|---|
| 1 · Ingreso | 12.0000 m³ · 3 piezas · folio 79 |
| 2 · Recepción | 200 |
| 3 · Lote de aserrío | `LA-2026-017` · 3 piezas apartadas |
| 4 · Consumo **parcial** | 2 de 3 piezas · **8 m³** · el lote **sigue abierto** con la 3ª (ADR-356) |
| 5 · Producción | 4 m³ declarados |
| 6 · Disponible | producido 4 · **rendimiento 50 %** (4 ÷ 8) |
| 7 · Despacho 3 de 4 | 201 |
| 8 · Despacho de 99 | **422 `I3_SOBRE_DESPACHO`** — «Sólo quedan 2.3911 … estás pidiendo 99» |

**El bloqueo del punto 8 existe y funciona.** Y el saldo que reporta es **por
producto en todo el libro**, no por corrida: I3 mira `Σ despachado(producto) ≤
Σ producido`, así que el número no es «lo que queda de mi corrida».

### El número que no cerraba, y por qué

El primer mensaje dijo «quedan 2.3911» cuando yo esperaba 1. Perseguirlo hasta el
fondo dio una lección de método, no un bug: **mi propio script de limpieza no
borraba la corrida de producción**, porque la crea el SERVIDOR al consumir el
lote y yo sólo registraba lo que mandaba a crear. Dos corridas huérfanas de 4 m³
quedaron en el libro de pruebas y corrieron el saldo.

Borradas: el saldo volvió a 1.3911, que es exactamente lo que implicaba el primer
mensaje. Los dos avisos del guard eran correctos desde el principio.

Queda dicho: **no habilité la spec `spec:forestal:lotes`**. Es una decisión de
configuración del tenant —si Brandon no usa lotes comerciales, encenderla agrega
un módulo que no necesita— y el libro oficial no depende de ella. El único efecto
de dejarla apagada es esa columna de apoyo, que ahora el aviso nombra bien.
