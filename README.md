# 🎙️ WhisperAPI

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-16+-green.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

**Uma API REST moderna e eficiente para transcrição de áudio usando Whisper C++**

*Processamento assíncrono • Worker threads • Estimativas inteligentes • Fila otimizada*

[🚀 Início Rápido](#-instalação) • [📚 API Docs](#-endpoints-da-api) • [⚙️ Configuração](#️-configuração) • [🤝 Contribuir](#-contribuindo)

</div>

---

Uma API REST simples e poderosa para transcrição de áudio usando Whisper C++ via `nodejs-whisper`. Oferece processamento assíncrono com worker threads, estimativas de tempo inteligentes e gerenciamento eficiente de fila.

## 🚀 Características

- **Transcrição assíncrona**: Upload de arquivos e processamento em background
- **Worker thread pool**: Processamento paralelo configurável
- **Estimativas de tempo**: Cálculo de tempo de processamento e espera na fila
- **Múltiplos formatos**: Suporte para WAV, MP3, OGG, FLAC, M4A, AAC
- **API RESTful**: Interface simples e padronizada
- **Monitoramento**: Endpoints para status e estatísticas da fila

## 📋 Pré-requisitos

- **Node.js** 16 ou superior
- **npm** ou yarn
- **CMake** e ferramentas de build (para compilar Whisper.cpp)
- **Git** para clone do repositório
- **wget** ou curl (para download de modelos)

### 🖥️ Dependências do Sistema

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install build-essential cmake git wget
```

**CentOS/RHEL:**
```bash
sudo yum groupinstall "Development Tools"
sudo yum install cmake git wget
```

**macOS:**
```bash
# Com Homebrew
brew install cmake git wget
```

**Windows:**
- Visual Studio Build Tools ou Visual Studio Community
- CMake (instalar via site oficial)
- Git for Windows

## 🔧 Instalação

### 📦 Instalação Rápida (Automática)

1. **Clone o repositório**:
```bash
git clone <repository-url>
cd whisperapi
```

2. **Configure as variáveis de ambiente**:
```bash
cp .env.example .env
```

Edite o arquivo `.env` para habilitar o download automático:
```env
PORT=3001
MAX_WORKERS=4
MAX_FILE_SIZE=50MB
WHISPER_MODEL_PATH=./node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin
UPLOAD_DIR=./uploads
TEMP_DIR=./temp
AUTO_DOWNLOAD_MODEL=base
```

3. **Instale as dependências (irá compilar Whisper.cpp e baixar o modelo automaticamente)**:
```bash
npm install
```

4. **Inicie o servidor**:
```bash
npm start
# ou para desenvolvimento:
npm run dev
```

### 🔧 Instalação Manual

Se preferir instalar manualmente ou tiver problemas com a instalação automática:

1. **Clone e instale dependências**:
```bash
git clone <repository-url>
cd whisperapi
npm install
```

2. **Configure as variáveis de ambiente**:
```bash
cp .env.example .env
```

Edite o arquivo `.env` (sem AUTO_DOWNLOAD_MODEL):
```env
PORT=3001
MAX_WORKERS=4
MAX_FILE_SIZE=50MB
WHISPER_MODEL_PATH=./models/ggml-base.bin
UPLOAD_DIR=./uploads
TEMP_DIR=./temp
```

3. **Baixe o modelo Whisper manualmente**:
```bash
mkdir models
cd models
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

4. **Execute setup manual (se necessário)**:
```bash
npm run setup
```

5. **Inicie o servidor**:
```bash
npm start
```

### 🎯 Scripts Disponíveis

- `npm start` - Inicia o servidor em modo produção
- `npm run dev` - Inicia em modo desenvolvimento com auto-reload
- `npm test` - Executa testes automatizados
- `npm run setup` - Executa configuração manual (build + download de modelo)
- `npm run check:models` - Verifica modelos disponíveis
- `npm run test:watch` - Executa testes em modo watch

### 🔍 Verificação da Instalação

Para verificar se tudo foi instalado corretamente:

```bash
# Verificar modelos disponíveis
npm run check:models

# Testar API básica
curl http://localhost:3001/health
```

## 📚 Endpoints da API

### 1. POST /transcribe
Envia arquivo de áudio para transcrição.

**Request**:
```bash
curl -X POST http://localhost:3001/transcribe \
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
- `language`: Idioma do áudio (`auto`, `pt`, `en`, `es`, `fr`, `de`, `it`, `ja`, `ko`, `zh`, `ru`, etc.)
- `translate`: Traduzir para inglês (`true`/`false`)
- `wordTimestamps`: Incluir timestamps das palavras (`true`/`false`)
- `cleanup`: Remover arquivo após processamento (`true`/`false`)

### 2. GET /status/:jobId
Verifica o status de um job de transcrição.

**Request**:
```bash
curl http://localhost:3001/status/123e4567-e89b-12d3-a456-426614174000
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
curl "http://localhost:3001/estimate?duration=60&format=.mp3"
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
curl http://localhost:3001/queue-estimate
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
curl http://localhost:3001/formats
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
curl http://localhost:3001/health
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

## 🔄 Como Funciona

### 📋 Fluxo de Processamento

1. **📤 Upload**: Cliente envia arquivo via `POST /transcribe`
2. **✅ Validação**: Formato, tamanho e parâmetros verificados
3. **📝 Criação**: Job único criado com UUID
4. **⏳ Enfileiramento**: Adicionado à fila FIFO
5. **⚙️ Processamento**: Worker thread disponível processa
6. **✨ Conclusão**: Resultado salvo e disponibilizado
7. **📊 Consulta**: Cliente verifica via `GET /status/:jobId`

## ⚙️ Configuração

### 🌍 Variáveis de Ambiente

Configure estas variáveis no arquivo `.env`:

| Variável | Descrição | Padrão | Exemplo |
|----------|-----------|--------|---------|
| `PORT` | Porta do servidor | `3001` | `3001` |
| `MAX_WORKERS` | Workers paralelos | `4` | `2` |
| `MAX_FILE_SIZE` | Tamanho máximo de arquivo | `100MB` | `50MB` |
| `WHISPER_MODEL_PATH` | Caminho do modelo | `./models/ggml-base.bin` | `./models/ggml-small.bin` |
| `UPLOAD_DIR` | Diretório de uploads | `./uploads` | `/tmp/uploads` |
| `TEMP_DIR` | Diretório temporário | `./temp` | `/tmp/whisper` |
| `AUTO_DOWNLOAD_MODEL` | Modelo para download automático | - | `base`, `small`, `large` |
| `WHISPER_LANGUAGE` | Idioma padrão | `pt` | `en`, `auto` |

### 🎛️ Modelos Disponíveis

| Modelo | Tamanho | Velocidade | Precisão | Uso Recomendado |
|--------|---------|------------|----------|------------------|
| `tiny` | ~39 MB | ⚡⚡⚡ | ⭐⭐ | Testes rápidos |
| `base` | ~142 MB | ⚡⚡ | ⭐⭐⭐ | **Uso geral** |
| `small` | ~466 MB | ⚡ | ⭐⭐⭐⭐ | Qualidade boa |
| `medium` | ~1.5 GB | 🐌 | ⭐⭐⭐⭐⭐ | Alta qualidade |
| `large` | ~2.9 GB | 🐌🐌 | ⭐⭐⭐⭐⭐ | Máxima precisão |

## 🚨 Tratamento de Erros

### 📋 Códigos de Status

| Código | Descrição | Ação Recomendada |
|--------|-----------|-------------------|
| `200` | ✅ Sucesso | - |
| `400` | ❌ Requisição inválida | Verificar parâmetros |
| `413` | 📦 Arquivo muito grande | Reduzir tamanho |
| `500` | 💥 Erro interno | Tentar novamente |

### 🔍 Códigos de Erro Específicos

```json
{
  "error": "Descrição do erro",
  "code": "ERROR_CODE",
  "details": "Informações adicionais"
}
```

| Código | Causa | Solução |
|--------|-------|----------|
| `MISSING_FILE` | Arquivo não enviado | Adicionar arquivo na requisição |
| `FILE_TOO_LARGE` | Arquivo > limite | Comprimir ou dividir arquivo |
| `INVALID_FORMAT` | Formato não suportado | Usar WAV, MP3, OGG, FLAC, M4A, AAC |
| `JOB_NOT_FOUND` | Job ID inválido | Verificar ID retornado |
| `TRANSCRIPTION_ERROR` | Erro no Whisper | Verificar modelo e arquivo |

## 🧪 Testes e Desenvolvimento

### 🔬 Executando Testes

```bash
# Todos os testes
npm test

# Testes em modo watch
npm run test:watch

# Coverage de código
npm test -- --coverage
```

### 🛠️ Desenvolvimento

```bash
# Modo desenvolvimento (auto-reload)
npm run dev

# Verificar modelos instalados
npm run check:models

# Recompilar se necessário
npm run setup
```

## 📊 Monitoramento e Logs

### 📈 Métricas Disponíveis

- ⏱️ **Tempo médio de processamento**
- 📊 **Tamanho da fila de jobs**
- ✅ **Taxa de sucesso/erro**
- 🔧 **Utilização dos workers**
- 💾 **Uso de memória e CPU**

### 📝 Logs do Sistema

O servidor registra automaticamente:

- 🚀 **Inicialização e configuração**
- ✅ **Jobs processados com sucesso**
- ❌ **Erros de transcrição**
- 📊 **Estatísticas de performance**
- 🔧 **Status dos workers**

### 🩺 Health Check

```bash
# Verificar saúde da API
curl http://localhost:3001/health

# Verificar estatísticas da fila
curl http://localhost:3001/queue-estimate
```

## 🚀 Deploy em Produção

### 🐳 Docker (Recomendado)

**Dockerfile:**
```dockerfile
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache cmake make g++ git

WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./
COPY .env.example .env

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Expor porta
EXPOSE 3001

# Iniciar aplicação
CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  whisperapi:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./uploads:/app/uploads
      - ./models:/app/models
    environment:
      - NODE_ENV=production
      - MAX_WORKERS=4
    restart: unless-stopped
```

### ⚡ PM2 (Alternativa)

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar aplicação
pm2 start src/server.js --name whisperapi

# Configurar auto-start
pm2 startup
pm2 save

# Monitorar
pm2 monit
```

### 🔒 Nginx (Proxy Reverso)

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Siga estes passos:

1. **🍴 Fork** o projeto
2. **🌿 Crie** uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. **✅ Adicione** testes para novas funcionalidades
4. **🧪 Execute** os testes: `npm test`
5. **💾 Commit** suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
6. **📤 Push** para a branch (`git push origin feature/MinhaFeature`)
7. **🔄 Abra** um Pull Request

### 📝 Diretrizes

- Mantenha o código limpo e bem documentado
- Adicione testes para novas funcionalidades
- Siga as convenções de código existentes
- Atualize a documentação quando necessário

## 🆘 Suporte e Troubleshooting

### ❓ Problemas Comuns

| Problema | Causa Provável | Solução |
|----------|---------------|---------|
| 🔥 Erro de compilação | Dependências de build ausentes | Instalar CMake e build tools |
| 📁 Modelo não encontrado | Caminho incorreto | Verificar `WHISPER_MODEL_PATH` |
| 🚫 Permission denied | Permissões de arquivo | `chmod +x` nos scripts |
| 💾 Out of memory | Modelo muito grande | Usar modelo menor (tiny/base) |

### 📞 Onde Buscar Ajuda

- **🐛 Bugs**: Abra uma [issue](https://github.com/seu-usuario/whisperapi/issues)
- **💡 Dúvidas**: Use as [Discussions](https://github.com/seu-usuario/whisperapi/discussions)
- **📖 Docs**: Consulte este README
- **💬 Chat**: Entre em contato via email

## 📄 Licença

```
MIT License

Copyright (c) 2024 WhisperAPI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🔗 Links e Recursos

### 📚 Documentação Oficial
- 🎯 [nodejs-whisper](https://github.com/SamuelSackey/nodejs-whisper) - Binding Node.js
- ⚡ [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) - Implementação C++
- 🤖 [OpenAI Whisper](https://github.com/openai/whisper) - Projeto original
- 📦 [Modelos Whisper](https://huggingface.co/ggerganov/whisper.cpp) - Download de modelos

### 🛠️ Ferramentas Relacionadas
- 🎵 [FFmpeg](https://ffmpeg.org/) - Conversão de áudio
- 🔧 [CMake](https://cmake.org/) - Build system
- 🐳 [Docker](https://www.docker.com/) - Containerização
- ⚡ [PM2](https://pm2.keymetrics.io/) - Process manager

---

<div align="center">

**⭐ Se este projeto foi útil, considere dar uma estrela!**

**🚀 Desenvolvido com ❤️ para a comunidade**

*Para dúvidas ou sugestões, abra uma issue no repositório.*

</div>