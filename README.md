# WhisperAPI

Uma API REST simples e eficiente para transcrição de áudio usando Whisper C++ via `nodejs-whisper`. Oferece processamento assíncrono com worker threads, estimativas de tempo e gerenciamento de fila.

## 🚀 Características

- **Transcrição assíncrona**: Upload de arquivos e processamento em background
- **Worker thread pool**: Processamento paralelo configurável
- **Estimativas de tempo**: Cálculo de tempo de processamento e espera na fila
- **Múltiplos formatos**: Suporte para WAV, MP3, OGG, FLAC, M4A, AAC
- **API RESTful**: Interface simples e padronizada
- **Monitoramento**: Endpoints para status e estatísticas da fila

## 📋 Pré-requisitos

- Node.js 16+ 
- npm ou yarn
- Modelo Whisper (ggml-base.bin ou similar)
- Dependências do sistema para nodejs-whisper

## 🔧 Instalação

1. **Clone o repositório**:
```bash
git clone <repository-url>
cd whisperapi
```

2. **Instale as dependências**:
```bash
npm install
```

3. **Configure as variáveis de ambiente**:
```bash
cp .env.example .env
```

Edite o arquivo `.env`:
```env
PORT=3000
MAX_WORKERS=4
MAX_FILE_SIZE=50MB
WHISPER_MODEL_PATH=./models/ggml-base.bin
UPLOAD_DIR=./uploads
TEMP_DIR=./temp
```

4. **Baixe o modelo Whisper**:
```bash
mkdir models
cd models
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

5. **Inicie o servidor**:
```bash
npm start
# ou para desenvolvimento:
npm run dev
```

## 📚 Endpoints da API

### 1. POST /transcribe
Envia arquivo de áudio para transcrição.

**Request**:
```bash
curl -X POST http://localhost:3000/transcribe \
  -F "audio=@exemplo.wav" \
  -F "language=pt" \
  -F "translate=false"
```

**Response**:
```json
{
  "jobId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "queued",
  "message": "Audio file queued for transcription",
  "estimatedWaitTime": 30
}
```

**Parâmetros opcionais**:
- `language`: Idioma do áudio (auto, pt, en, es, etc.)
- `translate`: Traduzir para inglês (true/false)
- `wordTimestamps`: Incluir timestamps das palavras (true/false)
- `cleanup`: Remover arquivo após processamento (true/false)

### 2. GET /status/:jobId
Verifica o status de um job de transcrição.

**Request**:
```bash
curl http://localhost:3000/status/123e4567-e89b-12d3-a456-426614174000
```

**Response (processando)**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "startedAt": "2024-01-15T10:30:05.000Z"
}
```

**Response (concluído)**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "result": {
    "text": "Olá, este é um exemplo de transcrição de áudio.",
    "processingTime": 15,
    "metadata": {
      "language": "pt",
      "duration": 15,
      "filePath": "/uploads/audio-1642248600000.wav"
    }
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "startedAt": "2024-01-15T10:30:05.000Z",
  "completedAt": "2024-01-15T10:30:20.000Z"
}
```

### 3. GET /estimate
Calcula estimativa de tempo de processamento baseado na duração do áudio.

**Request**:
```bash
curl "http://localhost:3000/estimate?duration=60&format=.mp3"
```

**Response**:
```json
{
  "estimatedProcessingTime": 72,
  "currentQueueWaitTime": 45,
  "totalEstimatedTime": 117,
  "format": ".mp3",
  "durationSeconds": 60,
  "message": "Estimated 72s processing + 45s queue wait = 117s total"
}
```

### 4. GET /queue-estimate
Retorna estatísticas detalhadas da fila de processamento.

**Request**:
```bash
curl http://localhost:3000/queue-estimate
```

**Response**:
```json
{
  "queueLength": 3,
  "activeJobs": 2,
  "availableWorkers": 2,
  "totalWorkers": 4,
  "averageProcessingTime": 45,
  "estimatedWaitTime": 68,
  "totalQueueProcessingTime": 135,
  "message": "3 jobs in queue, estimated wait time: 68s"
}
```

### 5. GET /formats
Lista formatos de áudio suportados.

**Request**:
```bash
curl http://localhost:3000/formats
```

**Response**:
```json
{
  "supportedFormats": [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac"],
  "maxFileSize": "100MB",
  "message": "Supported audio formats for transcription"
}
```

### 6. GET /health
Status de saúde do servidor.

**Request**:
```bash
curl http://localhost:3000/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "queue": {
    "pendingJobs": 2,
    "activeJobs": 1,
    "totalWorkers": 4,
    "availableWorkers": 3
  }
}
```

## 🧪 Testes

Execute os testes automatizados:

```bash
# Todos os testes
npm test

# Testes em modo watch
npm run test:watch

# Coverage
npm test -- --coverage
```

## 🔄 Fluxo de Processamento

1. **Upload**: Cliente envia arquivo via POST /transcribe
2. **Validação**: Formato e tamanho do arquivo são verificados
3. **Enfileiramento**: Job é adicionado à fila FIFO
4. **Processamento**: Worker thread disponível processa o áudio
5. **Resultado**: Transcrição fica disponível via GET /status/:jobId

## ⚙️ Configuração Avançada

### Worker Threads
- `MAX_WORKERS`: Número de threads paralelas (padrão: 4)
- Ajuste baseado na CPU disponível e memória

### Modelos Whisper
- `ggml-tiny.bin`: Mais rápido, menor precisão
- `ggml-base.bin`: Balanceado (recomendado)
- `ggml-small.bin`: Melhor precisão, mais lento
- `ggml-medium.bin`: Alta precisão
- `ggml-large.bin`: Máxima precisão, muito lento

### Limites de Arquivo
- Tamanho máximo: 100MB (configurável)
- Formatos suportados: WAV, MP3, OGG, FLAC, M4A, AAC

## 🐛 Tratamento de Erros

A API retorna erros padronizados:

```json
{
  "error": "Descrição do erro",
  "code": "ERROR_CODE",
  "details": "Informações adicionais (opcional)"
}
```

**Códigos de erro comuns**:
- `MISSING_FILE`: Arquivo não fornecido
- `FILE_TOO_LARGE`: Arquivo excede tamanho máximo
- `INVALID_FORMAT`: Formato não suportado
- `JOB_NOT_FOUND`: Job ID inválido
- `TRANSCRIPTION_ERROR`: Erro no processamento

## 📊 Monitoramento

### Logs
O servidor registra:
- Inicialização e configuração
- Jobs processados
- Erros de transcrição
- Estatísticas de performance

### Métricas
- Tempo médio de processamento
- Tamanho da fila
- Taxa de sucesso/erro
- Utilização dos workers

## 🚀 Deployment

### Docker (opcional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 (recomendado)
```bash
npm install -g pm2
pm2 start src/server.js --name whisperapi
pm2 startup
pm2 save
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature
3. Adicione testes para novas funcionalidades
4. Execute os testes: `npm test`
5. Commit suas mudanças
6. Abra um Pull Request

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 🔗 Links Úteis

- [nodejs-whisper](https://github.com/SamuelSackey/nodejs-whisper)
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [Modelos Whisper](https://huggingface.co/ggerganov/whisper.cpp)

---

**Suporte**: Para problemas ou dúvidas, abra uma issue no repositório.