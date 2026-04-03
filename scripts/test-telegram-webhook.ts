/**
 * Script de Teste Manual - Webhook Telegram
 * Envia um POST fake para o endpoint do Railway para testar o fluxo de IA
 */

const WEBHOOK_URL = 'https://plataformadeatendimentoartificiall.up.railway.app/webhooks/telegram';

const fakePayload = {
  update_id: 123456789,
  message: {
    message_id: 999,
    from: {
      id: 299603690,
      is_bot: false,
      first_name: 'Teste',
      last_name: 'Orion',
      username: 'test_orion'
    },
    chat: {
      id: 299603690,
      type: 'private'
    },
    date: Math.floor(Date.now() / 1000),
    text: 'Olá, gostaria de suporte técnico'
  }
};

async function testWebhook() {
  console.log(`🚀 Enviando payload fake para: ${WEBHOOK_URL}`);
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fakePayload)
    });

    const result = await response.json();
    console.log(`✅ Status: ${response.status}`);
    console.log(`📦 Resposta:`, result);
    
    if (response.status === 200) {
      console.log('🔥 Fluxo disparado! Verifique os logs do Railway para ver a IA processando.');
    }
  } catch (error) {
    console.error('❌ Falha ao conectar no Railway:', error);
  }
}

testWebhook();
