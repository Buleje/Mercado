"""Guion de la demo, página 6: «Minuto extra · Antes de pagar, revisa al proveedor» (04-11).
Uso: python3 armar_guion_p6.py <guion de 5 págs> <salida.pdf>"""
import fitz, sys
src, out = sys.argv[1:3]
d = fitz.open(src); assert d.page_count == 5, d.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255)
NB = " "
y = [38]
def tb(t, font="helv", size=10, color=(0, 0, 0), alto=40, gap=8):
    R = fitz.Rect(40, y[0], 553, y[0] + alto)
    rc = p.insert_textbox(R, t, fontname=font, fontsize=size, color=color, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)
    y[0] += alto - rc + gap
tb("Minuto extra (1 minuto) · Antes de pagar, revisa al proveedor", "hebo", 13, VERDE, 24)
tb("Qué mostrar: la página 8 del folleto o la captura «19 Aviso proveedor sancionado». En vivo, solo en la copia de "
   "prueba del cliente: Nuevo ingreso > sección 4, nombre COMUNIDAD NATIVA SAN LUIS y RUC 20393286238 (dato público). "
   "Nunca el panel de Blas: sus proveedores son reales y Blas mismo figura en el registro de SERFOR (2023).", alto=64)
tb("Qué decir: «Antes de pagarle a un proveedor, el sistema lo revisa solo en SERFOR y en OSINFOR. Si está "
   "sancionado, sale en rojo con la resolución y la fecha. Es como pedir el DNI antes de fiar. No le bloquea nada: "
   "usted decide.»", alto=52)
tb("Ejemplo para contar: «Esta comunidad tiene una sanción de SERFOR del 27/02/2023 y su permiso está en la lista roja "
   "de OSINFOR. Sale en menos de 2 segundos, mientras llena el ingreso.»", alto=40)
tb("Si preguntan «¿y si mañana sancionan a uno?»: «Cada mes el sistema vuelve a revisar a todos sus proveedores y, "
   "si alguno entró a la lista, le avisa por WhatsApp. Si nadie entró, no le molesta.»", alto=40)
tb(f"Si preguntan «¿cuánto cuesta?»: «Viene en los S/{NB}349 al mes. Para empezar le revisamos gratis a los proveedores "
   f"de su último mes. Si solo quiere la revisión, son S/{NB}49 hasta 30 proveedores, con un papel de resultado.»", alto=40)
tb("No prometer: que la madera es legal o ilegal (el aviso dice lo que publican SERFOR y OSINFOR a la fecha de su "
   "lista; no reemplaza revisar la guía) · que frena la compra (es solo un aviso).", alto=40)
tb("Para cerrar: «Páseme la lista de proveedores de su último mes y le devuelvo la revisión sin costo.»", "hebo", alto=28)
R = fitz.Rect(51, 805, 544, 817)
p.insert_textbox(R + (0, 0, 0, 6), "Buleje · guion de demo para aserraderos · uso interno", fontname="helv", fontsize=8, color=GRIS)
p.insert_textbox(fitz.Rect(480, 805, 544, 823), "Página 6", fontname="helv", fontsize=8, color=GRIS, align=2)
d.save(out, garbage=3, deflate=True); print("ok", round(y[0]), d.page_count)
