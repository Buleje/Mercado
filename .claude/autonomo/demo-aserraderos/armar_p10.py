"""Página 10 del folleto «Buleje para aserraderos»: «El papel con el resultado, en 1 clic» (04-11).

Uso: python3 armar_p10.py <folleto de 9 págs> <20 Papel de resultado - revisar proveedores.png>
                          <Revisión de proveedores de ejemplo - Aserradero Ejemplo.pdf> <salida.pdf>
Además deja en la pág. 8 (la de «Antes de pagar, revisa al proveedor», donde está la caja de la revisión
suelta de S/ 49) una línea que manda a esta página. El papel va como vector (show_pdf_page): se lee nítido.
La captura y el papel salen del tenant QA forestal con la marca disfrazada: papel-revision/LEEME.md. Nada de Blas.
"""
import fitz, sys

src, img, papel, out = sys.argv[1:5]
d = fitz.open(src)
assert d.page_count == 9, d.page_count
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255); NEGRO = (0, 0, 0)
BORDE = (0.85, 0.87, 0.86); CAJA = (0.059, 0.463, 0.431)
NB = " "  # Helvética base14 parte «S/» de su cifra si no va con espacio duro (y no tiene «…» ni «›»)


def tb(p, r, t, font="helv", size=10, color=NEGRO, align=0):
    R0 = fitz.Rect(*r); R0.y1 += 6
    rc = p.insert_textbox(R0, t, fontname=font, fontsize=size, color=color, align=align, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)


# Pág. 8: la caja «Revisión suelta» promete un papel; el ejemplo está en la 10.
p8 = d[7]
assert "Revisión suelta" in p8.get_text(), "la pág. 8 ya no es la del aviso sancionado"
assert "página 10" not in p8.get_text(), "la línea de la pág. 8 ya estaba"
tb(p8, (51, 684, 544, 698), "Vea el papel de resultado de ejemplo en la página 10.", "heit", 10, VERDE)

p = d.new_page(width=595.2756, height=841.8898)
tb(p, (40, 38, 555, 60), "13. El papel con el resultado, en 1 clic", "hebo", 13, VERDE)
tb(p, (40, 64, 555, 104), "Toca «Revisar a todos» y después «Papel de resultado»: sale una hoja con su marca, cada "
   "proveedor y lo que dicen SERFOR y OSINFOR, con la fecha de cada lista. Lista para imprimir o mandar por "
   "WhatsApp a su socio o a su comprador.")

pm = fitz.Pixmap(img)
w = 515; h = w * pm.height / pm.width
r1 = fitz.Rect(40, 108, 40 + w, 108 + h)
p.insert_image(r1 + (1, 1, -1, -1), filename=img, keep_proportion=True)
p.draw_rect(r1, color=BORDE, width=0.8)
tb(p, (r1.x0, r1.y1 + 4, r1.x1, r1.y1 + 16), "El botón sale después de «Revisar a todos» (Libro CTP > Cumplimiento)",
   "heit", 8, GRIS, align=1)

src_papel = fitz.open(papel)
assert src_papel.page_count == 1, src_papel.page_count
yp = r1.y1 + 26; wp = 262; hp = wp * src_papel[0].rect.height / src_papel[0].rect.width
r2 = fitz.Rect(40, yp, 40 + wp, yp + hp)
p.show_pdf_page(r2, src_papel, 0)
p.draw_rect(r2, color=BORDE, width=0.8)
tb(p, (r2.x0, r2.y1 + 4, r2.x1, r2.y1 + 16), "El papel de ejemplo, tal como sale (1 hoja)", "heit", 8, GRIS, align=1)

xr = 320
tb(p, (xr, yp + 2, 555, yp + 60), "Es como el ticket de la balanza: un papel con fecha que dice lo que salió, para "
   "que nadie lo discuta después.", "heit", 10, GRIS)
tb(p, (xr, yp + 72, 555, yp + 90), "Qué dice el papel", "hebo", 11, VERDE)
tb(p, (xr, yp + 92, 555, yp + 262),
   "Arriba, su marca: nombre, RUC y logo.\n"
   "Cuántos salen sancionados, para revisar, posibles por nombre y sin alertas.\n"
   "Una fila por proveedor: la resolución de SERFOR con su fecha y lo que dice OSINFOR de cada permiso.\n"
   "La fecha de cada lista y un código propio en el pie.\n"
   "Si OSINFOR no respondió, sale una cinta ámbar: no se entrega a medias.")
tb(p, (xr, yp + 270, 555, yp + 300), "Lo que no dice", "hebo", 11, VERDE)
tb(p, (xr, yp + 290, 555, yp + 350), "Si la madera es legal o ilegal. No reemplaza la GTF, el permiso ni la "
   "verificación en campo: dice si el proveedor figura en las listas públicas a esa fecha.")

yb = r2.y1 + 26; hb = 74
assert yb > yp + 350, (yb, yp)
p.draw_rect(fitz.Rect(51, yb, 292, yb + hb), color=CAJA, width=1.2)
tb(p, (60, yb + 8, 286, yb + 28), f"Revisión suelta: S/{NB}49", "hebo", 12, VERDE)
tb(p, (60, yb + 30, 286, yb + hb - 6), "Nos pasa nombre y RUC de hasta 30 proveedores y le entregamos este papel.")
p.draw_rect(fitz.Rect(303, yb, 544, yb + hb), color=CAJA, width=1.2)
tb(p, (312, yb + 8, 538, yb + 28), f"Incluido en los S/{NB}349 al mes", "hebo", 12, VERDE)
tb(p, (312, yb + 30, 538, yb + hb - 6), "Lo saca usted mismo con un clic, cada mes o antes de una compra grande.")
tb(p, (51, yb + hb + 12, 544, yb + hb + 28), "Pida su revisión o la prueba sin costo por WhatsApp: 917 013 738.", "hebo")
assert yb + hb + 28 < 784, yb
tb(p, (40, 790, 555, 802), "Ejemplo: «Aserradero Ejemplo» y 4 proveedores son inventados; San Luis y su sanción son "
   "datos públicos de SERFOR (13/10/2026).", "heit", 8, GRIS)
tb(p, (51, 805, 300, 817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb(p, (480, 805, 544, 817), "Página 10", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count, round(yb + hb + 28))
