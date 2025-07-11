#!/bin/bash

# WhisperAPI - Exemplos de uso com cURL
# Execute este script para testar todos os endpoints da API

API_URL="http://localhost:3000"
AUDIO_FILE="./sample-audio.wav"

echo "=== WhisperAPI - Exemplos cURL ==="
echo

# 1. Health Check
echo "1. Verificando saúde da API..."
curl -s "$API_URL/health" | jq '.'
echo -e "\n"

# 2. Formatos suportados
echo "2. Consultando formatos suportados..."
curl -s "$API_URL/formats" | jq '.'
echo -e "\n"

# 3. Estimativa de processamento
echo "3. Calculando estimativa para áudio de 60 segundos..."
curl -s "$API_URL/estimate?duration=60&format=.mp3" | jq '.'
echo -e "\n"

# 4. Status da fila
echo "4. Consultando status da fila..."
curl -s "$API_URL/queue-estimate" | jq '.'
echo -e "\n"

# 5. Upload de áudio (se o arquivo existir)
if [ -f "$AUDIO_FILE" ]; then
    echo "5. Enviando arquivo de áudio para transcrição..."
    UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/transcribe" \
        -F "audio=@$AUDIO_FILE" \
        -F "language=auto" \
        -F "translate=false" \
        -F "wordTimestamps=true")
    
    echo "$UPLOAD_RESPONSE" | jq '.'
    
    # Extrair jobId da resposta
    JOB_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.jobId')
    
    if [ "$JOB_ID" != "null" ] && [ "$JOB_ID" != "" ]; then
        echo -e "\n6. Monitorando progresso do job $JOB_ID..."
        
        # Aguardar alguns segundos
        sleep 3
        
        # Verificar status até completar (máximo 10 tentativas)
        for i in {1..10}; do
            echo "Tentativa $i - Verificando status..."
            STATUS_RESPONSE=$(curl -s "$API_URL/status/$JOB_ID")
            echo "$STATUS_RESPONSE" | jq '.'
            
            STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
            
            if [ "$STATUS" = "completed" ]; then
                echo "✅ Transcrição concluída!"
                echo "Resultado:"
                echo "$STATUS_RESPONSE" | jq '.result.text'
                break
            elif [ "$STATUS" = "failed" ]; then
                echo "❌ Transcrição falhou!"
                break
            else
                echo "⏳ Status: $STATUS - Aguardando..."
                sleep 5
            fi
        done
    fi
else
    echo "5. ⚠️  Arquivo $AUDIO_FILE não encontrado"
    echo "   Para testar upload, crie um arquivo de áudio com esse nome"
    echo
    echo "   Simulando upload com arquivo inexistente (deve falhar)..."
    curl -s -X POST "$API_URL/transcribe" \
        -F "audio=@non-existent-file.wav" \
        -F "language=pt" | jq '.'
    echo
fi

# 6. Teste de endpoint inexistente
echo -e "\n7. Testando endpoint inexistente (deve retornar 404)..."
curl -s "$API_URL/non-existent-endpoint" | jq '.'
echo

# 7. Teste com parâmetros inválidos
echo -e "\n8. Testando parâmetros inválidos..."
echo "Estimativa sem duração:"
curl -s "$API_URL/estimate" | jq '.'
echo

echo "Status de job inexistente:"
curl -s "$API_URL/status/job-inexistente" | jq '.'
echo

echo "=== Fim dos exemplos ==="
echo
echo "💡 Dicas:"
echo "- Coloque um arquivo de áudio em $AUDIO_FILE para testar upload"
echo "- Use 'jq' para formatar JSON (sudo apt install jq)"
echo "- Monitore logs do servidor para debug"