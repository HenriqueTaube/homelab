FROM python:3.12-slim

WORKDIR /app

# Dependências do sistema para python-docx
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 libxslt1.1 \
 && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Código da API e assets (logo para o .docx)
COPY api/ ./api/
COPY assets/ ./assets/

WORKDIR /app/api

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
