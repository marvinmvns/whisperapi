# WhisperAPI - Parâmetros de Transcrição

## Endpoint: POST /transcribe

Esta documentação detalha todos os parâmetros disponíveis para o endpoint de transcrição, baseados na implementação do Whisper.

### Parâmetros Obrigatórios

#### `audio` (FormData)
- **Tipo**: Arquivo multipart/form-data
- **Descrição**: Arquivo de áudio a ser transcrito
- **Formatos suportados**: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.wma`
- **Limite de tamanho**: 100MB
- **Exemplo**:
  ```bash
  -F "audio=@./demo.mp3"
  ```

### Parâmetros Opcionais

#### `language` (String)
- **Tipo**: String
- **Padrão**: `"pt"` (ou valor de `WHISPER_LANGUAGE` no ambiente)
- **Descrição**: Idioma do áudio para transcrição
- **Valores aceitos**:
  - `"auto"` - Detecção automática do idioma
  - `"pt"` - Português
  - `"pt-br"` - Português brasileiro (equivalente a "pt")
  - `"en"` - Inglês
  - `"es"` - Espanhol
  - `"fr"` - Francês
  - `"de"` - Alemão
  - `"it"` - Italiano
  - `"ja"` - Japonês
  - `"ko"` - Coreano
  - `"zh"` - Chinês
  - `"ru"` - Russo
  - E outros códigos ISO 639-1 suportados pelo Whisper
- **Exemplo**:
  ```bash
  -F "language=pt"
  -F "language=auto"
  ```

#### `translate` (Boolean)
- **Tipo**: String ("true" ou "false")
- **Padrão**: `false`
- **Descrição**: Se deve traduzir o texto transcrito para inglês
- **Valores aceitos**:
  - `"true"` - Traduz para inglês
  - `"false"` - Mantém no idioma original
- **Exemplo**:
  ```bash
  -F "translate=true"
  -F "translate=false"
  ```

#### `wordTimestamps` (Boolean)
- **Tipo**: String ("true" ou "false")
- **Padrão**: `true`
- **Descrição**: Se deve incluir timestamps de palavras na transcrição
- **Valores aceitos**:
  - `"true"` - Inclui timestamps (usa `--max-len 1` no Whisper)
  - `"false"` - Não inclui timestamps, retorna apenas texto contínuo
- **Exemplo**:
  ```bash
  -F "wordTimestamps=true"
  -F "wordTimestamps=false"
  ```

### Exemplo Completo de Uso

```bash
# Transcrição básica em português sem timestamps
curl -X POST "http://localhost:3001/transcribe" \
  -F "audio=@./demo.mp3" \
  -F "language=pt" \
  -F "translate=false" \
  -F "wordTimestamps=false"

# Transcrição com detecção automática de idioma e tradução
curl -X POST "http://localhost:3001/transcribe" \
  -F "audio=@./audio.wav" \
  -F "language=auto" \
  -F "translate=true" \
  -F "wordTimestamps=true"

# Transcrição em inglês com timestamps
curl -X POST "http://localhost:3001/transcribe" \
  -F "audio=@./english_audio.mp3" \
  -F "language=en" \
  -F "translate=false" \
  -F "wordTimestamps=true"
```

### Resposta da API

#### Sucesso (200 OK)
```json
{
  "jobId": "12345-67890-abcdef",
  "status": "queued",
  "message": "Audio file queued for transcription",
  "estimatedWaitTime": 15
}
```

#### Monitoramento do Job
Use o `jobId` retornado para verificar o status:

```bash
curl "http://localhost:3001/status/12345-67890-abcdef"
```

**Resposta quando concluído:**
```json
{
  "jobId": "12345-67890-abcdef",
  "status": "completed",
  "result": {
    "text": "Texto transcrito do áudio",
    "processingTime": 8
  },
  "originalFilename": "demo.mp3"
}
```

### Códigos de Erro

#### 400 - Bad Request
- `MISSING_FILE`: Nenhum arquivo de áudio foi enviado
- `INVALID_DURATION`: Duração inválida (para estimativas)
- `MISSING_DURATION`: Parâmetro de duração obrigatório não fornecido

#### 413 - Payload Too Large
- `FILE_TOO_LARGE`: Arquivo excede 100MB

#### 500 - Internal Server Error
- `TRANSCRIPTION_ERROR`: Erro durante a transcrição
- `INTERNAL_ERROR`: Erro interno do servidor

### Observações Técnicas

1. **Conversão de Formato**: Arquivos não-WAV são automaticamente convertidos para WAV (16kHz, mono, PCM 16-bit) usando FFmpeg
2. **Processamento Assíncrono**: A transcrição é processada em fila com workers separados
3. **Cleanup Automático**: Arquivos temporários são removidos automaticamente após o processamento
4. **Detecção de Idioma**: Quando `language=auto`, o Whisper detecta automaticamente o idioma
5. **Timestamps**: O parâmetro `wordTimestamps=true` usa `--max-len 1` para gerar timestamps mais precisos

### Variáveis de Ambiente

Estas variáveis podem afetar o comportamento dos parâmetros:

- `WHISPER_LANGUAGE`: Idioma padrão (padrão: "pt")
- `WHISPER_MODEL_PATH`: Caminho para o modelo Whisper
- `MAX_WORKERS`: Número máximo de workers para processamento paralelo
- `UPLOAD_DIR`: Diretório para uploads temporários