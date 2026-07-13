import base64
import json
import os

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from builder import build_proposta

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

SYSTEM_PROMPT = """Você é um redator especialista em propostas comerciais técnicas da TAUBE EQUIPAMENTOS, empresa brasileira fabricante de equipamentos industriais pneumáticos e mecânicos.

Sua tarefa é receber dados brutos de uma proposta e retornar um JSON com o texto profissional e completo para cada seção.

Regras:
- Escreva em português brasileiro formal e técnico
- Apresentação: 2 a 3 parágrafos contextualizando a proposta para o cliente específico
- Objetivo: 1 a 2 parágrafos descrevendo o que será fornecido e o benefício esperado
- Para cada item: expanda os recursos operacionais e benefícios com linguagem técnica clara
- Não invente especificações técnicas que não foram fornecidas
- Se uma informação estiver vaga, use linguagem genérica mas profissional
- Retorne SOMENTE o JSON, sem nenhum texto antes ou depois

Formato de retorno:
{
  "apresentacao": "texto completo...",
  "objetivo": "texto completo...",
  "itens": [
    {
      "titulo": "...",
      "escopo": [{"qtd": "01", "produto": "..."}],
      "dadosAplicacao": [{"campo": "...", "valor": "..."}],
      "caracteristicas": [{"componente": "...", "descricao": "..."}],
      "recursosOperacionais": ["...", "..."],
      "beneficiosOperacionais": ["...", "..."]
    }
  ],
  "mensagem": "Proposta gerada com sucesso para [CLIENTE]. Confira o arquivo e ajuste se necessário."
}"""


def enriquecer_com_ia(payload: dict) -> dict:
    prompt = f"Dados da proposta:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"

    message = client.messages.create(
        model='claude-opus-4-8',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': prompt}],
    )

    raw = message.content[0].text.strip()

    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1]
        raw = raw.rsplit('```', 1)[0]

    return json.loads(raw)


@app.post('/api/gerar-proposta')
async def gerar_proposta(payload: dict):
    try:
        enriquecido = enriquecer_com_ia(payload)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f'IA retornou JSON inválido: {e}')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Erro na chamada à IA: {e}')

    data = {
        **payload,
        'apresentacao': enriquecido.get('apresentacao', payload.get('apresentacao', '')),
        'objetivo':     enriquecido.get('objetivo',     payload.get('objetivo', '')),
        'itens':        enriquecido.get('itens',        payload.get('itens', [])),
    }

    try:
        docx_bytes = build_proposta(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Erro ao gerar documento: {e}')

    cliente_nome = payload.get('cliente', {}).get('nome', 'CLIENTE').upper().replace(' ', '_')
    num_proposta = payload.get('numeroProposta', '000').replace(' ', '_').replace('/', '')
    filename = f'PROPOSTA_{num_proposta}_2026_{cliente_nome}_TAUBE.docx'

    return {
        'message':     enriquecido.get('mensagem', 'Proposta gerada com sucesso.'),
        'docx_base64': base64.b64encode(docx_bytes).decode(),
        'filename':    filename,
    }
