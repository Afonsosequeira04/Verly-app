import io
import json
from datetime import datetime
from flask import Blueprint, send_file, current_app
from flask_login import login_required, current_user
from app.models import Fatura, Conversa
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER

exportar_bp = Blueprint('exportar', __name__)


@exportar_bp.route('/exportar/pdf')
@login_required
def exportar_pdf():
    faturas = Fatura.query.filter_by(user_id=current_user.id).order_by(Fatura.data_upload.desc()).all()
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    story = []

    # Estilos
    title_s = ParagraphStyle('t', fontSize=26, fontName='Helvetica-Bold',
                              textColor=colors.HexColor('#1a1a2e'), spaceAfter=4)
    sub_s = ParagraphStyle('s', fontSize=10, fontName='Helvetica',
                            textColor=colors.HexColor('#666666'), spaceAfter=2)
    label_s = ParagraphStyle('l', fontSize=8, fontName='Helvetica',
                              textColor=colors.HexColor('#999999'))
    h2_s = ParagraphStyle('h2', fontSize=13, fontName='Helvetica-Bold',
                           textColor=colors.HexColor('#1a1a2e'), spaceBefore=16, spaceAfter=8)
    normal_s = ParagraphStyle('n', fontSize=9, fontName='Helvetica', leading=14)

    # Header
    total_gasto = sum(f.total or 0 for f in faturas)
    data_relatorio = datetime.now().strftime('%d/%m/%Y %H:%M')

    header_data = [[
        [Paragraph('🚔 Shopping Police', title_s),
         Paragraph('Relatório Financeiro · Unidade Anti-Gastos', sub_s)],
        [Paragraph('GERADO EM', label_s),
         Paragraph(data_relatorio, ParagraphStyle('v', fontSize=10, fontName='Helvetica-Bold')),
         Spacer(1, 4),
         Paragraph('RECRUTA', label_s),
         Paragraph(current_user.nome, ParagraphStyle('v', fontSize=10, fontName='Helvetica-Bold'))]
    ]]
    ht = Table(header_data, colWidths=[10*cm, 7*cm])
    ht.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    story.append(ht)
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width='100%', thickness=2, color=colors.HexColor('#e63946')))
    story.append(Spacer(1, 0.5*cm))

    # Resumo
    story.append(Paragraph('Resumo', h2_s))
    resumo_data = [
        ['Total de Faturas', 'Total Gasto', 'Maior Despesa'],
        [str(len(faturas)), f'{total_gasto:.2f} €',
         f'{max((f.total or 0) for f in faturas):.2f} €' if faturas else '—'],
    ]
    rt = Table(resumo_data, colWidths=[5.5*cm, 5.5*cm, 5.5*cm])
    rt.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a1a2e')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 9),
        ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,1), (-1,1), 18),
        ('TEXTCOLOR', (0,1), (-1,1), colors.HexColor('#e63946')),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 12),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e0e0e0')),
    ]))
    story.append(rt)
    story.append(Spacer(1, 0.8*cm))

    # Gastos por categoria
    categorias = {}
    for f in faturas:
        cat = f.categoria or 'Outros'
        categorias[cat] = categorias.get(cat, 0) + (f.total or 0)

    if categorias:
        story.append(Paragraph('Gastos por Categoria', h2_s))
        cat_data = [['Categoria', 'Total (€)', '% do Gasto']]
        for cat, val in sorted(categorias.items(), key=lambda x: x[1], reverse=True):
            pct = (val / total_gasto * 100) if total_gasto > 0 else 0
            cat_data.append([cat, f'{val:.2f} €', f'{pct:.1f}%'])
        ct = Table(cat_data, colWidths=[8*cm, 4*cm, 4.5*cm])
        ct.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e63946')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#fafafa')]),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#eeeeee')),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(ct)
        story.append(Spacer(1, 0.8*cm))

    # Lista de faturas
    story.append(Paragraph('Detalhe das Faturas', h2_s))
    fat_data = [['Ficheiro', 'Loja', 'Categoria', 'Data Compra', 'Total', 'Garantia até']]
    for f in faturas:
        fat_data.append([
            f.nome_ficheiro[:30] + ('...' if len(f.nome_ficheiro) > 30 else ''),
            (f.loja or '—')[:20],
            f.categoria or '—',
            f.data_compra or '—',
            f'{f.total:.2f} €' if f.total else '—',
            f.data_garantia or '—',
        ])
    ft = Table(fat_data, colWidths=[4*cm, 3.5*cm, 2.5*cm, 2.2*cm, 2*cm, 2.3*cm])
    ft.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a1a2e')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8f8f8')]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e0e0e0')),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('ALIGN', (4,0), (4,-1), 'RIGHT'),
    ]))
    story.append(ft)

    # Rodapé
    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#cccccc')))
    story.append(Spacer(1, 0.3*cm))
    nota = ParagraphStyle('nota', fontSize=7, fontName='Helvetica',
                          textColor=colors.HexColor('#aaaaaa'), leading=10)
    story.append(Paragraph(
        'Relatório gerado pelo Shopping Police · Unidade Anti-Gastos · '
        'Garantia legal: 3 anos (Diretiva EU 2019/771). Devolução: 30 dias.',
        nota))

    doc.build(story)
    buffer.seek(0)

    filename = f'relatorio_shopping_police_{datetime.now().strftime("%Y%m%d")}.pdf'
    return send_file(buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')
