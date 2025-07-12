#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

class AudioTranscriptionTester {
  constructor(serverURL = 'http://localhost:3001') {
    this.serverURL = serverURL;
    this.axios = axios.create({ 
      baseURL: serverURL,
      timeout: 60000
    });
  }

  // Test server health
  async testHealth() {
    console.log('🏥 Testando saúde do servidor...');
    try {
      const response = await this.axios.get('/health');
      console.log('✅ Servidor online:', response.data);
      return true;
    } catch (error) {
      console.error('❌ Servidor não responde:', error.message);
      return false;
    }
  }

  // Get supported formats
  async getSupportedFormats() {
    console.log('📋 Obtendo formatos suportados...');
    try {
      const response = await this.axios.get('/formats');
      console.log('✅ Formatos suportados:', response.data.supportedFormats.join(', '));
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao obter formatos:', error.message);
      return null;
    }
  }

  // Upload audio file for transcription
  async uploadAudio(audioPath, options = {}) {
    console.log(`📤 Enviando arquivo de áudio: ${audioPath}`);
    
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Arquivo não encontrado: ${audioPath}`);
    }

    try {
      const formData = new FormData();
      formData.append('audio', fs.createReadStream(audioPath));
      
      // Add optional parameters
      if (options.language) formData.append('language', options.language);
      if (options.translate !== undefined) formData.append('translate', String(options.translate));
      if (options.wordTimestamps !== undefined) formData.append('wordTimestamps', String(options.wordTimestamps));
      if (options.cleanup !== undefined) formData.append('cleanup', String(options.cleanup));

      const response = await this.axios.post('/transcribe', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      console.log('✅ Upload realizado com sucesso!');
      console.log(`📊 Job ID: ${response.data.jobId}`);
      console.log(`⏱️  Tempo estimado de espera: ${response.data.estimatedWaitTime}s`);
      
      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error('❌ Erro no upload:', errorMsg);
      throw new Error(`Upload falhou: ${errorMsg}`);
    }
  }

  // Check job status
  async checkJobStatus(jobId) {
    try {
      const response = await this.axios.get(`/status/${jobId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Job não encontrado');
      }
      throw new Error(`Erro ao verificar status: ${error.response?.data?.error || error.message}`);
    }
  }

  // Wait for transcription completion
  async waitForCompletion(jobId, pollInterval = 3000, maxWaitTime = 600000) {
    console.log(`⏳ Aguardando conclusão do job ${jobId}...`);
    
    const startTime = Date.now();
    let lastStatus = '';
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.checkJobStatus(jobId);
        
        if (status.status !== lastStatus) {
          console.log(`📊 Status do job: ${status.status}`);
          lastStatus = status.status;
        }
        
        if (status.status === 'completed') {
          console.log('✅ Transcrição concluída com sucesso!');
          return status;
        }
        
        if (status.status === 'failed') {
          throw new Error(`Transcrição falhou: ${status.error}`);
        }
        
        // Show progress dots
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.error(`❌ Erro ao verificar status: ${error.message}`);
        throw error;
      }
    }
    
    throw new Error(`Timeout após ${maxWaitTime/1000}s aguardando conclusão`);
  }

  // Complete transcription workflow
  async transcribeAudio(audioPath, options = {}) {
    console.log('\n🎵 === INICIANDO TRANSCRIÇÃO DE ÁUDIO ===\n');
    
    try {
      // 1. Upload audio
      const uploadResult = await this.uploadAudio(audioPath, options);
      
      // 2. Wait for completion
      const result = await this.waitForCompletion(uploadResult.jobId);
      
      // 3. Display results
      console.log('\n📝 === RESULTADO DA TRANSCRIÇÃO ===\n');
      console.log('Texto transcrito:');
      console.log('─'.repeat(50));
      console.log(result.result.text);
      console.log('─'.repeat(50));
      console.log(`⏱️  Tempo de processamento: ${result.result.processingTime}s`);
      console.log(`🌍 Idioma detectado: ${result.result.metadata.language}`);
      console.log(`📁 Arquivo processado: ${path.basename(audioPath)}`);
      console.log(`🕐 Criado em: ${new Date(result.createdAt).toLocaleString('pt-BR')}`);
      console.log(`✅ Concluído em: ${new Date(result.completedAt).toLocaleString('pt-BR')}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Erro na transcrição: ${error.message}`);
      throw error;
    }
  }

  // Get queue statistics
  async getQueueStats() {
    console.log('📊 Verificando estatísticas da fila...');
    try {
      const response = await this.axios.get('/queue-estimate');
      const stats = response.data;
      
      console.log(`📋 Fila: ${stats.queueLength} jobs pendentes, ${stats.activeJobs} ativos`);
      console.log(`👷 Workers: ${stats.availableWorkers}/${stats.totalWorkers} disponíveis`);
      console.log(`⏱️  Tempo médio de processamento: ${stats.averageProcessingTime}s`);
      console.log(`⏳ Tempo estimado de espera: ${stats.estimatedWaitTime}s`);
      
      return stats;
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error.message);
      return null;
    }
  }

  // Test with curl simulation
  async testWithCurl(audioPath) {
    console.log('\n🌐 === TESTE SIMULANDO CURL ===\n');
    
    if (!fs.existsSync(audioPath)) {
      console.error(`❌ Arquivo não encontrado: ${audioPath}`);
      return false;
    }

    try {
      const formData = new FormData();
      formData.append('audio', fs.createReadStream(audioPath));
      formData.append('language', 'pt');
      formData.append('wordTimestamps', 'true');

      console.log('📤 Simulando: curl -X POST -F "audio=@' + audioPath + '" ' + this.serverURL + '/transcribe');
      
      const response = await this.axios.post('/transcribe', formData, {
        headers: formData.getHeaders()
      });

      console.log('✅ Resposta do servidor:');
      console.log(JSON.stringify(response.data, null, 2));
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro na simulação curl:', error.response?.data || error.message);
      return false;
    }
  }
}

// Main test function
async function runTests() {
  console.log('🎯 === TESTADOR DE TRANSCRIÇÃO DE ÁUDIO ===\n');
  
  const tester = new AudioTranscriptionTester();
  
  // Check if server is running
  const isHealthy = await tester.testHealth();
  if (!isHealthy) {
    console.log('\n💡 Para iniciar o servidor, execute: npm start\n');
    process.exit(1);
  }
  
  console.log('');
  
  // Get supported formats
  await tester.getSupportedFormats();
  console.log('');
  
  // Get queue stats
  await tester.getQueueStats();
  console.log('');
  
  // Test audio file path (user can modify this)
  const audioPath = process.argv[2] || 'demo.mp3';
  
  if (!fs.existsSync(audioPath)) {
    console.log('📁 Arquivo de áudio não fornecido ou não encontrado.');
    console.log('💡 Uso: node test-audio-transcription.js [caminho-do-audio]');
    console.log('💡 Exemplo: node test-audio-transcription.js ./demo.mp3');
    console.log('\n🔍 Procurando por arquivos de áudio no diretório atual...');
    
    // Look for audio files in current directory
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac'];
    const files = fs.readdirSync('.').filter(file => 
      audioExtensions.some(ext => file.toLowerCase().endsWith(ext))
    );
    
    if (files.length > 0) {
      console.log('🎵 Arquivos de áudio encontrados:');
      files.forEach(file => console.log(`  - ${file}`));
      console.log(`\n💡 Tente: node test-audio-transcription.js ./${files[0]}`);
    } else {
      console.log('❌ Nenhum arquivo de áudio encontrado no diretório atual.');
    }
    
    console.log('\n🧪 Executando teste de simulação sem arquivo...');
    await tester.testWithCurl('./dummy-audio.wav');
    return;
  }
  
  try {
    // Run complete transcription test
    await tester.transcribeAudio(audioPath, {
      language: 'auto',
      wordTimestamps: false,
      cleanup: true
    });
    
    console.log('\n✅ Todos os testes concluídos com sucesso!');
    
  } catch (error) {
    console.error('\n❌ Teste falhou:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

module.exports = AudioTranscriptionTester;