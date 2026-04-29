import { getGeminiModel, extractText } from '../src/core/llm/factory';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('--- Testando Vertex AI ---');
  try {
    const model = getGeminiModel('gemini-2.5-flash');
    console.log('Modelo carregado. Enviando prompt...');
    
    const result = await model.generateContent('Olá, diga "Teste OK"');
    console.log('Resposta bruta recebida.');
    
    const text = extractText(result);
    console.log('Texto extraído:', text);
    
    if (text.includes('Teste OK')) {
      console.log('✅ SUCESSO: Resposta válida.');
    } else {
      console.log('⚠️ AVISO: Resposta não contém o esperado.');
    }
  } catch (err: any) {
    console.error('❌ ERRO:', err.message);
    if (err.response) {
      console.error('Stack:', err.stack);
    }
  }
}

test();
