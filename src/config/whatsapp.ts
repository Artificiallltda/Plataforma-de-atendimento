/**
 * Configuração do WhatsApp Cloud API
 * 
 * @link https://developers.facebook.com/docs/whatsapp/cloud-api
 */

export const whatsappConfig = {
  // Chave de API da 360Dialog
  apiKey: process.env.WHATSAPP_API_KEY || '',
  
  // ID do telefone no WhatsApp Business
  phoneNumberId: process.env.WHATSAPP_PHONE_ID || '',
  
  // Token de verificação do webhook (escolhido arbitrariamente)
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'paa_whatsapp_verify_2026',
  
  // URL da API (360Dialog)
  baseUrl: 'https://waba.360dialog.io/v1',
  
  // URL do webhook (para produção)
  webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || 'https://paa-api.railway.app/webhooks/whatsapp'
};

// Validação de configuração
export function validateWhatsappConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!whatsappConfig.apiKey) {
    errors.push('WHATSAPP_API_KEY não configurada');
  }
  
  if (!whatsappConfig.phoneNumberId) {
    errors.push('WHATSAPP_PHONE_ID não configurado');
  }
  
  if (!whatsappConfig.verifyToken) {
    errors.push('WHATSAPP_VERIFY_TOKEN não configurado');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default whatsappConfig;
