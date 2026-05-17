"""
app/api/exportar_mobile.py
Endpoints de exportação para o mobile.

GET  /api/v1/exportar/resumo  → JSON com resumo completo (streak, garantias, previsão)
GET  /api/v1/exportar/pdf     → PDF do relatório mensal
"""

import logging
from datetime import datetime, date
from calendar import monthrange
from flask import request, jsonify, make_response
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.api import api_bp
from app.models import User, Fatura
from app import db

logger = logging.getLogger(__name__)


def _get_garantias_ativas(faturas):
    """Retorna lista de garantias ativas a partir das faturas."""
    hoje = date.today()
    garantias = []
    for f in faturas:
        if not f.garantia_meses or f.garantia_meses <= 0:
            continue
        if not f.data:
            continue
        data_fatura = f.data if isinstance(f.data, date) else f.data.date()
        from dateutil.relativedelta import relativedelta
        data_fim = data_fatura + relativedelta(months=f.garantia_meses)
        dias_restantes = (data_fim - hoje).days
        if dias_restantes >= 0:
            garantias.append({
                'id':              f.id,
                'loja':            f.loja or 'Desconhecida',
                'total':           float(f.total or 0),
                'data':            data_fatura.isoformat(),
                'data_fim':        data_fim.isoformat(),
                'dias_restantes':  dias_restantes,
                'garantia_meses':  f.garantia_meses,
            })
    garantias.sort(key=lambda x: x['dias_restantes'])
    return garantias


def _get_historico_mensal(faturas, meses=6):
    """Retorna histórico de gastos dos últimos N meses."""
    from collections import defaultdict
    hoje = date.today()
    historico = defaultdict(float)

    for f in faturas:
        if not f.data:
            continue
        data_f = f.data if isinstance(f.data, date) else f.data.date()
        diff_meses = (hoje.year - data_f.year) * 12 + (hoje.month - data_f.month)
        if 0 <= diff_meses < meses:
            chave = data_f.strftime('%Y-%m')
            historico[chave] += float(f.total or 0)

    resultado = []
    for i in range(meses - 1, -1, -1):
        from dateutil.relativedelta import relativedelta
        mes_data = hoje - relativedelta(months=i)
        chave = mes_data.strftime('%Y-%m')
        resultado.append({
            'mes':   mes_data.strftime('%b'),
            'chave': chave,
            'total': round(historico.get(chave, 0), 2),
        })
    return resultado


def _get_top_categorias(faturas, mes=None, ano=None):
    """Retorna top categorias do mês."""
    from collections import defaultdict
    hoje = date.today()
    mes = mes or hoje.month
    ano = ano or hoje.year

    categorias = defaultdict(float)
    for f in faturas:
        if not f.data:
            continue
        data_f = f.data if isinstance(f.data, date) else f.data.date()
        if data_f.month == mes and data_f.year == ano:
            cat = f.categoria or 'Outros'
            categorias[cat] += float(f.total or 0)

    return sorted(
        [{'categoria': k, 'total': round(v, 2)} for k, v in categorias.items()],
        key=lambda x: x['total'],
        reverse=True
    )[:5]


def _calcular_previsao(faturas, orcamento):
    """Calcula previsão de gasto até fim do mês."""
    hoje = date.today()
    dias_no_mes = monthrange(hoje.year, hoje.month)[1]
    dia_atual = hoje.day

    total_mes = sum(
        float(f.total or 0)
        for f in faturas
        if f.data and (
            (f.data if isinstance(f.data, date) else f.data.date()).month == hoje.month and
            (f.data if isinstance(f.data, date) else f.data.date()).year == hoje.year
        )
    )

    if dia_atual > 0:
        previsao = (total_mes / dia_atual) * dias_no_mes
    else:
        previsao = total_mes

    return {
        'gasto_atual':    round(total_mes, 2),
        'previsao_mes':   round(previsao, 2),
        'orcamento':      float(orcamento or 0),
        'vai_ultrapassar': previsao > float(orcamento or 0) if orcamento else False,
        'percentagem':    round((total_mes / float(orcamento)) * 100, 1) if orcamento else 0,
    }


@api_bp.route('/exportar/resumo', methods=['GET'])
@jwt_required()
def exportar_resumo():
    """
    GET /api/v1/exportar/resumo
    Retorna resumo completo: streak, garantias ativas, previsão, histórico, top categorias.
    """
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    faturas = Fatura.query.filter_by(utilizador_id=user_id).all()

    garantias = _get_garantias_ativas(faturas)
    historico = _get_historico_mensal(faturas)
    top_cats  = _get_top_categorias(faturas)
    previsao  = _calcular_previsao(faturas, user.orcamento_mensal)

    return jsonify({
        'streak_dias':      getattr(user, 'streak_dias', 0) or 0,
        'garantias_ativas': garantias,
        'num_garantias':    len(garantias),
        'historico_mensal': historico,
        'top_categorias':   top_cats,
        'previsao':         previsao,
        'orcamento_mensal': float(user.orcamento_mensal or 0),
        'gerado_em':        datetime.utcnow().isoformat(),
    })


@api_bp.route('/exportar/pdf', methods=['GET'])
@jwt_required(optional=True)
def exportar_pdf():
    """
    GET /api/v1/exportar/pdf
    Gera PDF do relatório mensal.
    Aceita token via query param ?_token= para abrir no browser.
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity as get_identity
    from flask import current_app

    # Suporte a token via query param (para abrir no browser)
    _token = request.args.get('_token')
    if _token:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(_token)
            user_id = int(decoded['sub'])
        except Exception:
            return jsonify({'error': 'Token inválido.'}), 401
    else:
        try:
            verify_jwt_in_request()
            user_id = int(get_identity())
        except Exception:
            return jsonify({'error': 'Autenticação necessária.'}), 401

    user = User.query.get_or_404(user_id)
    faturas = Fatura.query.filter_by(utilizador_id=user_id).order_by(Fatura.data.desc()).all()

    hoje = date.today()
    top_cats = _get_top_categorias(faturas)
    garantias = _get_garantias_ativas(faturas)
    previsao = _calcular_previsao(faturas, user.orcamento_mensal)

    total_mes = sum(
        float(f.total or 0)
        for f in faturas
        if f.data and (
            (f.data if isinstance(f.data, date) else f.data.date()).month == hoje.month and
            (f.data if isinstance(f.data, date) else f.data.date()).year == hoje.year
        )
    )

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.units import cm
        import io

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)

        styles = getSampleStyleSheet()
        story = []

        # Título
        title_style = ParagraphStyle('Title', parent=styles['Title'],
                                     fontSize=24, textColor=colors.HexColor('#7C6FE0'),
                                     spaceAfter=6)
        story.append(Paragraph('Verly — Relatório Financeiro', title_style))
        story.append(Paragraph(f'{user.nome} · {hoje.strftime("%B %Y")}', styles['Normal']))
        story.append(Spacer(1, 0.5*cm))

        # Resumo
        story.append(Paragraph('Resumo do Mês', styles['Heading2']))
        resumo_data = [
            ['Total gasto', f'{total_mes:.2f} €'],
            ['Orçamento', f'{float(user.orcamento_mensal or 0):.2f} €'],
            ['Previsão fim do mês', f'{previsao["previsao_mes"]:.2f} €'],
            ['Streak', f'{getattr(user, "streak_dias", 0) or 0} dias'],
            ['Garantias ativas', str(len(garantias))],
        ]
        t = Table(resumo_data, colWidths=[8*cm, 8*cm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C6FE0')),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
            ('GRID',       (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE',   (0, 0), (-1, -1), 11),
            ('PADDING',    (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.5*cm))

        # Top categorias
        if top_cats:
            story.append(Paragraph('Top Categorias', styles['Heading2']))
            cat_data = [['Categoria', 'Total']] + [
                [c['categoria'], f'{c["total"]:.2f} €'] for c in top_cats
            ]
            t2 = Table(cat_data, colWidths=[10*cm, 6*cm])
            t2.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C6FE0')),
                ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
                ('GRID',       (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTSIZE',   (0, 0), (-1, -1), 11),
                ('PADDING',    (0, 0), (-1, -1), 6),
            ]))
            story.append(t2)
            story.append(Spacer(1, 0.5*cm))

        # Garantias ativas
        if garantias:
            story.append(Paragraph('Garantias Ativas', styles['Heading2']))
            gar_data = [['Loja', 'Expira em', 'Dias restantes']] + [
                [g['loja'], g['data_fim'], str(g['dias_restantes'])] for g in garantias[:10]
            ]
            t3 = Table(gar_data, colWidths=[7*cm, 5*cm, 4*cm])
            t3.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C6FE0')),
                ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
                ('GRID',       (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTSIZE',   (0, 0), (-1, -1), 10),
                ('PADDING',    (0, 0), (-1, -1), 6),
            ]))
            story.append(t3)

        doc.build(story)
        buffer.seek(0)

        response = make_response(buffer.read())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename=verly_{hoje.strftime("%Y%m")}.pdf'
        return response

    except ImportError:
        # Fallback: retorna JSON se reportlab não estiver instalado
        return jsonify({
            'error': 'reportlab não instalado. Adiciona ao requirements.txt.',
            'resumo': {
                'total_mes': total_mes,
                'previsao':  previsao,
                'garantias': garantias,
            }
        }), 500
    except Exception as e:
        logger.error(f'Erro ao gerar PDF: {e}')
        return jsonify({'error': f'Erro ao gerar PDF: {str(e)}'}), 500