# ADR-424 — La ficha del Directorio: cómo se le paga, cómo se le ubica y hasta cuándo puede vender

- **Fecha:** 2026-09-21
- **Estado:** Aceptado
- **Área:** Forestal · Directorio (`ForestParty`)

## Contexto

La ficha guardaba quién es la parte, dónde está y sus datos forestales. Faltaban tres cosas que
el negocio resuelve por fuera del sistema:

1. **Cómo pagarle.** A una comunidad o a un proveedor hay que transferirle. La cuenta vivía en un
   cuaderno o en un chat, y el que paga la volvía a pedir cada vez.
2. **Cómo ubicarlo de verdad.** Había un `telefono`. En la selva el fijo no existe, el número que
   contesta no siempre es el del RUC, y quien coordina el flete rara vez es el representante legal.
3. **Hasta cuándo puede vender.** Comprarle madera a un proveedor con el **título habilitante
   vencido** invalida la GTF que se emita con esa madera. El dato no estaba en ninguna parte.

Además, el formulario pedía veinte campos **todos al mismo peso**, sin decir cuáles hacen falta
para qué. Una ficha se carga apurado —con el camión esperando— y se completa «después»; el
problema aparece al emitir la guía, cuando falta el ubigeo del destinatario.

## Decisión

**1. Ocho columnas nuevas** (migración `20260921030000_forest_party_pago_y_vigencia`, expand puro,
todas nullables): `banco`, `cuentaNumero`, `cuentaCci`, `cuentaTitular`, `whatsapp`,
`contactoNombre`, `contactoTelefono`, `tituloVigenciaHasta`.

`cuentaTitular` existe porque la cuenta no siempre está a nombre del titular de la ficha: la
comunidad cobra en la cuenta de su jefe, y quien paga necesita saberlo antes de transferir.

**2. Un medidor de completitud que dice qué falta y por qué.** `pendientesDeFicha()` define lo que
cada **papel** necesita: al destinatario la GTF le exige la dirección (es el punto de llegada), al
transportista el registro MTC, al conductor la licencia, al proveedor con qué título extrae. Cada
pendiente lleva su **razón**, no sólo el nombre del campo. El porcentaje se calcula contra lo que
*esa* ficha necesita, no contra un ideal fijo: un conductor con licencia, documento y teléfono está
al 100 % aunque no tenga dirección.

**3. Aviso de título vencido.** `estadoTitulo()` pinta el campo y, si ya pasó, lo dice con todas
las letras: «Título vencido hace N días — su GTF no ampara».

**4. CCI validado por largo, no inventado.** El Código de Cuenta Interbancario tiene 20 dígitos.
El par de control depende del banco y no hay un algoritmo público único, así que **no se inventa**
una validación que rechace cuentas buenas: se valida el largo y se formatea en bloques.

**5. WhatsApp con enlace directo.** Un celular peruano de 9 dígitos asume +51; si alguien carga el
código completo, se respeta.

## Consecuencias

**A favor**
- El pago deja de depender de un chat.
- El riesgo de comprarle a un permiso vencido se ve **antes** de comprar, no en la fiscalización.
- El formulario deja de ser una lista plana: dice qué falta para lo que esta ficha hace.

**En contra / a vigilar**
- Ocho columnas más en un modelo ya ancho.
- Los datos bancarios son sensibles: hoy los ve cualquiera con acceso al Directorio. Si el panel
  crece en roles, esta sección pide su propio permiso.
- `pendientesDeFicha` codifica reglas de negocio en una lista: si cambia el formato de la GTF, hay
  que tocarla junto con el formato.

## Verificación

En navegador, sobre el modal real: el medidor pasó de **0 % → 80 % → «Ficha completa para lo que
hace»** al cargar documento, nombre, título habilitante, representante, WhatsApp y cuenta. CCI de
3 dígitos avisa «El CCI tiene 20 dígitos; escribiste 3». Vigencia 2026-10-05 mostró «Su título
vence en 14 días» con el campo en ámbar. El enlace quedó en `https://wa.me/51961000111`.

Un defecto propio, encontrado probando: el enlace de WhatsApp envuelto junto al input dentro de
`<Field>` dejaba el `<label>` **sin campo asociado** (`label[for]` vacío). `Field` asocia por
`htmlFor` y sólo a un input/select/textarea — su propio comentario lo advertía. Se movió afuera,
como ya hacía el botón «Traer de SUNAT».

17 tests nuevos (`__tests__/directorio-salud.test.ts`).

## Referencias

- `lib/forestal/directorio-salud.ts` · `components/admin/forestal/CtpParteModal.tsx`
- Migración `prisma/migrations/20260921030000_forest_party_pago_y_vigencia/`
- ADR-423 (documentos de gestión y regente) · ADR-373 (zona/caserío en la GTF)

---

## Ronda 3 (2026-09-20) — lo que se pactó, dónde se carga y qué se habló

Cuatro datos más, en la misma ficha:

| Dato | Por qué en la ficha y no en un chat |
|---|---|
| `condicionPago` + `diasCredito` | Es lo que decide si una compra deja una **fecha de pago** que vigilar. `null` NO es contado: son estados distintos, y confundirlos hace aparecer deuda cero donde no se sabe. `fechaDePagoPactada()` devuelve `null` antes que inventar una fecha que se ordenaría junto a las reales. |
| `acopioLat` / `acopioLng` / `acopioReferencia` | El **punto de acopio** no es la dirección legal: el RUC dice una oficina y la madera se carga en una quebrada. De ahí salen el flete y el aviso al transportista. |
| `contacto2Nombre` / `contacto2Telefono` / `emailCobranza` | El que contesta cuando el primero se quedó sin señal, y dónde va la factura. |
| `bitacora` (Json) | Historial de notas **con fecha y autor puestos por el servidor**. `notas` es una hoja que se pisa; esto no. Una nota firmada por quien elige su propio nombre no prueba nada. |

**Decisión de interfaz:** el punto de acopio se carga **pegando** (`parsearCoordenadas`) — dos
números o el link de Google Maps —, no con dos campos numéricos separados. En el campo nadie tipea
coordenadas: se comparten por WhatsApp. Y se avisa cuando vienen **invertidas**
(`motivoCoordenadaSospechosa`), que es el error que de verdad pasa: el punto cae en el mar y nadie
lo nota hasta que sale el camión.

**Defecto propio, encontrado abriendo la ficha en el navegador:** `aBorrador` era una copia a mano
de los campos y se había quedado corta — banco, cuenta, CCI, WhatsApp, contacto y vigencia salían
**vacíos** al editar y, como la edición con `id` pisa con `null` lo que no llega, guardar los
**borraba**. Es el mismo patrón que costó dos rondas en RRHH (`PuestoInput`/`ColaboradorInput`).
Ahora sale de `parteAInput`, con un test que falla si alguien agrega un campo al schema y se
olvida del mapeo.

Migración `20260921040000_forest_party_comercial_y_acopio` — expand puro, nueve columnas nullables.

## Ronda 4 (2026-09-20) — el Directorio deja de ser una isla

- **Planilla en los dos sentidos** (`lib/forestal/directorio-importar.ts`): mismas columnas para
  entrar y salir, así lo exportado se corrige en Excel y vuelve. El encabezado se reconoce por
  alias («RAZON SOCIAL», «RUC/DNI», «Celular»), el tipo de documento se deduce del largo, un RUC
  con el verificador mal **no entra**, y dos filas del mismo documento se señalan entre sí.
  El import **muestra qué va a pasar con cada fila antes de guardar**: la lección del importador de
  trozas (2026-08-04) fue que 51 filas descartadas en silencio parecen una importación perfecta.
- **El export baja lo que se está viendo**, con el filtro y la pestaña puestos.
- **La carátula del LO-TH trae al titular del Directorio** y no pisa lo tipeado: rellena lo vacío.
  Es el dato que se imprime en cada hoja del libro; escribirlo aparte es cómo el mismo titular
  termina con dos nombres entre la carátula y las guías.
- **Un solo picker**: `TramiteEntidadPicker` pasa a ser un envoltorio de `DirectorioPicker`
  (183 → 66 líneas). Lo que sólo tenía uno de los dos —aviso de ficha parecida, «usar la que ya
  está», vehículos del transportista— no llegaba a las diez pantallas de trámites.

### Verificación de las rondas 3 y 4

Navegador, tenant QA, camino completo:

| Qué | Resultado |
|---|---|
| Ficha con los campos nuevos | reabre con `-8.379100, -74.553900` + «Ver en el mapa», «Crédito a 30 días», segundo contacto y las notas con autor y hora |
| Coordenadas invertidas | «Parece que están al revés: primero la latitud…» |
| Fila en la base | las nueve columnas cargadas (leída por SQL, no por el formulario) |
| CSV de 4 filas | «2 se agregan · 1 actualiza · 1 no entra (RUC con el verificador mal)» → importó 3 |
| Export | mismas columnas, con título, crédito 45 días y coordenadas |
| Carátula | titular, representante, RUC, DNI y teléfono del Directorio **sin pisar** el título ya cargado |

46 tests nuevos entre las dos rondas (`directorio-comercial-y-acopio`, `directorio-importar`).
