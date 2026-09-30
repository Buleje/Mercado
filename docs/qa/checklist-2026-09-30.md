# Checklist de prueba — sesión en la nube del 30/09/2026

Todo esto se construyó en un contenedor **sin base ni navegador**: pasó typecheck,
lint y tests, pero ninguna pantalla se vio todavía. Probar en la PC después de
`git pull`, con el tenant **Blas** (`inversiones-agroforestales-blas-sociedad-anonima`).

En cada pantalla: **claro**, **oscuro** y **ventana angosta (400 px)**, y la
consola del navegador sin errores rojos.

| # | Dónde | Qué hacer | Qué tiene que pasar (dato real de Blas) |
|---|---|---|---|
| 1 | Aviso arriba del panel | Entrar al panel | «La caja está abierta hace ~111 días · 3 ventas…». Como el esperado da **negativo** (−S/ 6.424), debe pedir revisar los egresos en vez de dar un monto a contar |
| 2 | `?tab=ventas-caja&vista=arqueo` | Mirar «Conteo de efectivo manual» sin abrirlo | En rojo: «El efectivo esperado da S/ −6,424.00… Revisa los egresos antes de contar» |
| 3 | `?tab=ventas-caja&vista=caja-registradora` → Movimientos | En el egreso «Adelanto ADL-2026-0002 · Wasaco» (S/ 3.217) elegir «Cambiar medio» → Transferencia, **y cancelar** | La confirmación dice «El esperado pasa de S/ −6.424,00 a S/ −3.207,00». Cancelar no cambia nada |
| 4 | Mismo lugar | Buscar el ingreso «Liquidación de adelanto ADL-2026-0001» (S/ 1.200) | **No** ofrece «Cambiar medio»: dice que el medio lo fija la liquidación |
| 5 | Mismo lugar | Solo si ese adelanto **de verdad** se pagó por transferencia: confirmar el cambio del paso 3 | El esperado baja en S/ 3.217 y en Auditoría aparece la «Corrección» (recargar) |
| 6 | Libro CTP (`?tab=ctp-libro-operaciones`) → campana «Avisos del libro» | Abrirla | «N paquetes sin medidas» (en la base eran 34 en 15 corridas), agrupados por corrida con lo que falta |
| 7 | Mismo aviso | «Poner medidas» en un paquete al que le falta **una** medida | El editor abre con las medidas que **ya tiene** cargadas, no en blanco. Al guardar, la campana baja en 1 |
| 8 | Adelantos (`?tab=adelantos`) → Resumen | Mirar arriba de «Vence esta semana» | «5 adelantos sin control · S/ 25.690». Primero Quispe Galindo Victor S/ 17.000 («Ninguna entrega en 58 días» · «Sin fecha de vencimiento») |
| 9 | Mismo aviso | «Poner vencimiento» en uno de Wasaco, **o** «Atar a contrato» en el de S/ 17.000 | Se guarda y la fila sale del aviso si ya no aplica |
| 10 | Libro TH (`?tab=loth-libro-operaciones&vista=mapa`) | Mirar arriba del mapa | «2 árboles sin coordenadas: no salen en el mapa» con código, especie y estado |
| 11 | Mismo aviso | «Cargar coordenadas» en uno, con Este/Norte reales | El árbol aparece en el mapa sin recargar y el mapa se centra en él |
| 12 | Iniciar sesión como **cajero** o **almacenero** | Repetir 3, 7, 9 y 11 | No ven los botones que escriben (sin errores 403 en consola) |

## Datos de prueba en el negocio real (no son de código)

- **ADL-2026-0005 «PRUEBA TEST - Juan Perez»** (S/ 1.000): Adelantos → Anular →
  «¿La plata volvió a caja?» **Sí · Efectivo**. El esperado sube S/ 1.000.
- **3 movimientos «Prueba QA»** en la caja (+20, −15, +10 = +S/ 15): quedan o se
  compensan con un egreso manual de S/ 15 con la nota «anula pruebas QA».
- **Reserva de Juancho** (SL-7, Cachimbo, vencida el 22/09): queda como está,
  por decisión del 30/09.
