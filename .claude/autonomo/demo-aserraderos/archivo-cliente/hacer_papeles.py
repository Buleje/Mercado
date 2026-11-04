import fitz, sys
out = sys.argv[1]
def papel(nombre, titulo, filas, total, nota):
    d = fitz.open(); p = d.new_page(width=595, height=842)
    p.draw_rect(fitz.Rect(0,0,595,70), color=None, fill=(0.13,0.36,0.25))
    p.insert_text((40,42), "MADERERA EL BOSQUE", fontname="hebo", fontsize=18, color=(1,1,1))
    p.insert_text((40,60), "Cliente de ejemplo - datos inventados", fontname="helv", fontsize=9, color=(0.9,0.95,0.9))
    p.insert_text((40,110), titulo, fontname="hebo", fontsize=15)
    y = 150
    p.insert_text((40,y), "Concepto", fontname="hebo", fontsize=10); p.insert_text((430,y), "Importe", fontname="hebo", fontsize=10)
    y += 8; p.draw_line((40,y),(555,y), color=(0.6,0.6,0.6))
    for c, v in filas:
        y += 20; p.insert_text((40,y), c, fontname="helv", fontsize=10); p.insert_text((430,y), v, fontname="helv", fontsize=10)
    y += 14; p.draw_line((40,y),(555,y), color=(0.6,0.6,0.6))
    y += 22; p.insert_text((40,y), "TOTAL", fontname="hebo", fontsize=12); p.insert_text((430,y), total, fontname="hebo", fontsize=12)
    p.insert_text((40,y+40), nota, fontname="heit", fontsize=9, color=(0.4,0.4,0.4))
    d.save(f"{out}/{nombre}", garbage=4, deflate=True)
papel("Estado de cuenta - Carga 14.pdf", "Estado de cuenta - Carga 14 de tornillo",
      [("Madera de la carga 14 (31/10)", "S/ 5,439.32"), ("Saldo de la carga del 20/10", "S/ 1,250.00"), ("Flete Pucallpa", "S/ 300.00"), ("Adelanto en efectivo (28/10)", "- S/ 3,000.00")],
      "S/ 3,989.32", "Version corregida el 01/11: incluye el flete.")
papel("Estado de cuenta - Carga 14 (version del 31-10).pdf", "Estado de cuenta - Carga 14 de tornillo",
      [("Madera de la carga 14 (31/10)", "S/ 5,439.32"), ("Saldo de la carga del 20/10", "S/ 1,250.00"), ("Adelanto en efectivo (28/10)", "- S/ 3,000.00")],
      "S/ 3,689.32", "Primera version: faltaba el flete.")
papel("Cubicacion - Carga 14.pdf", "Cubicacion - Carga 14 de tornillo",
      [("Tornillo comercial 2x8x10 (40 pzs)", "533.33 PT"), ("Tornillo larga angosta 2x4x10 (30 pzs)", "200.00 PT"), ("Tornillo corta 2x6x6 (25 pzs)", "150.00 PT"), ("Cumala comercial 2x8x12 (20 pzs)", "320.00 PT")],
      "1,203.33 PT", "Cubicada en patio el 31/10.")
papel("Cotizacion 0003 - Maderera El Bosque.pdf", "Cotizacion N.o 0003",
      [("Tornillo comercial (por PT)", "S/ 5.50"), ("Tornillo larga angosta (por PT)", "S/ 4.20"), ("Cumala comercial (por PT)", "S/ 3.80")],
      "Precios con IGV", "Todavia se esta conversando el precio de la cumala.")
papel("Guia de remision - Carga 14.pdf", "Guia de remision EG01-000245",
      [("Punto de partida", "Pucallpa"), ("Llegada", "Lima"), ("Placa", "ABC-123")],
      "1,203.33 PT", "Copia de la guia emitida en SUNAT.")
