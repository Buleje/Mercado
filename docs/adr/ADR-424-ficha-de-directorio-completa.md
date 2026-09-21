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
