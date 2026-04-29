/**
 * Telegram Bot Provider - PAA
 * 
 * Integração com Telegram Bot usando node-telegram-bot-api.
 * Reutiliza código do projeto ChefIA adaptado para a PAA.
 * 
 * @see https://github.com/yagop/node-telegram-bot-api
 */

import TelegramBot from 'node-telegram-bot-api';

export interface TelegramIncomingMessage {
  userId: string;           // Telegram chat.id
  userName?: string;        // first_name + last_name
  text: string;             // Texto da mensagem ou comando
  imageUrl?: string;        // URL temporária da foto (se houver)
  mediaType?: 'photo' | 'document' | 'audio' | 'video';
  timestamp: Date;
  rawPayload: any;          // Payload original para debug
}

export interface TelegramOutgoingMessage {
  to: string;               // Telegram chat.id
  text: string;             // Texto da mensagem
  parseMode?: 'Markdown' | 'HTML';
  replyMarkup?: {
    inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
    keyboard?: Array<Array<string>>;
    resize_keyboard?: boolean;
  };
}

/**
 * Telegram Bot Provider para PAA
 * 
 * Responsabilidades:
 * - Receber mensagens via polling ou webhook
 * - Parsear mensagens (texto, comandos, mídia)
 * - Enviar mensagens de resposta
 * - Suportar teclados inline para seleção de setor
 */
export class TelegramProvider {
  private bot: TelegramBot;
  private messageCallback?: (msg: TelegramIncomingMessage) => void;
  private errorCallback?: (error: Error) => void;

  constructor(
    private botToken: string,
    options: {
      polling?: boolean;
      webhookUrl?: string;
    } = { polling: false }
  ) {
    const botOptions: TelegramBot.ConstructorOptions = {};
    
    if (options.polling) {
      botOptions.polling = {
        interval: 300,
        autoStart: true,
        params: { timeout: 10 }
      };
    }

    this.bot = new TelegramBot(this.botToken, botOptions);
    console.log(`[Telegram PAA] Bot iniciado ${options.polling ? 'via Polling' : 'via Webhook'}`);
    
    this.setupListeners();
  }

  /**
   * Configurar listeners de mensagens e erros
   */
  private setupListeners(): void {
    // Listener de mensagens
    this.bot.on('message', async (msg) => {
      if (!this.messageCallback) return;

      // Extrair dados da mensagem
      const parsed = this.parseMessage(msg);
      if (parsed) {
        this.messageCallback(parsed);
      }
    });

    // Listener de erros de polling
    this.bot.on('polling_error', (error: any) => {
      console.error('[Telegram PAA] Polling Error:', error.message);
      if (this.errorCallback) {
        this.errorCallback(new Error(error.message));
      }
    });

    // Listener de callback queries (teclado inline)
    this.bot.on('callback_query', async (query) => {
      if (!this.messageCallback || !query.data) return;

      // Transformar callback query em mensagem de comando
      const parsed: TelegramIncomingMessage = {
        userId: query.from.id.toString(),
        userName: query.from.first_name || 'Usuário',
        text: `/setor_${query.data}`, // Transforma em comando
        timestamp: new Date(),
        rawPayload: query
      };

      this.messageCallback(parsed);
      
      // Responder ao callback (remove loading)
      this.bot.answerCallbackQuery(query.id);
    });
  }

  /**
   * Parsear mensagem do Telegram para formato PAA
   */
  private parseMessage(msg: TelegramBot.Message): TelegramIncomingMessage | null {
    let text = msg.text || msg.caption || '';
    let imageUrl: string | undefined;
    let mediaType: TelegramIncomingMessage['mediaType'] | undefined;

    // Extrair foto (maior resolução)
    if (msg.photo && msg.photo.length > 0) {
      const highestResPhoto = msg.photo[msg.photo.length - 1];
      try {
        // Nota: getFileLink retorna URL temporária
        // Em produção, deve-se baixar e salvar em storage próprio
        imageUrl = `file_id:${highestResPhoto.file_id}`;
        mediaType = 'photo';
        console.log(`[Telegram PAA] Foto recebida, file_id: ${highestResPhoto.file_id}`);
      } catch (error) {
        console.error(`[Telegram PAA] Falha ao obter link da foto:`, error);
      }
    }

    // Extrair documento
    if (msg.document) {
      imageUrl = `file_id:${msg.document.file_id}`;
      mediaType = 'document';
      text = text || `Documento: ${msg.document.file_name}`;
    }

    // Extrair áudio
    if (msg.audio) {
      imageUrl = `file_id:${msg.audio.file_id}`;
      mediaType = 'audio';
    }

    // Extrair vídeo
    if (msg.video) {
      imageUrl = `file_id:${msg.video.file_id}`;
      mediaType = 'video';
    }

    // Ignorar mensagens sem conteúdo relevante
    if (!text && !imageUrl) {
      return null;
    }

    return {
      userId: msg.chat.id.toString(),
      userName: this.buildUserName(msg.from),
      text: text,
      imageUrl,
      mediaType,
      timestamp: new Date(msg.date * 1000),
      rawPayload: msg
    };
  }

  /**
   * Construir nome completo do usuário
   */
  private buildUserName(from?: any): string {
    if (!from) return 'Cliente Telegram';
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';
    const username = from.username ? `@${from.username}` : '';
    
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || username || `Usuário ${from.id}`;
  }

  /**
   * Enviar mensagem de resposta
   */
  async sendMessage(message: TelegramOutgoingMessage): Promise<{ success: boolean; messageId?: number }> {
    try {
      const options: TelegramBot.SendMessageOptions = {
        parse_mode: message.parseMode
      };

      if (message.replyMarkup) {
        // O SDK aceita uniao de InlineKeyboardMarkup | ReplyKeyboardMarkup; nosso
        // tipo permite ambos os campos no mesmo objeto para flexibilidade.
        options.reply_markup = message.replyMarkup as unknown as TelegramBot.SendMessageOptions['reply_markup'];
      }

      const result = await this.bot.sendMessage(message.to, message.text, options);
      console.log(`[Telegram PAA] Mensagem enviada para ${message.to}`);
      
      return {
        success: true,
        messageId: result.message_id
      };
    } catch (error: any) {
      // Fallback para erro de formatação Markdown
      if (error.message && error.message.includes('parse entities')) {
        console.warn(`[Telegram PAA] Erro de formatação Markdown. Tentando texto puro...`);
        try {
          const result = await this.bot.sendMessage(message.to, message.text);
          return { success: true, messageId: result.message_id };
        } catch (fallbackError) {
          console.error(`[Telegram PAA] Erro crítico ao enviar mensagem:`, fallbackError);
          return { success: false };
        }
      }

      console.error(`[Telegram PAA] Erro ao enviar mensagem:`, error);
      return { success: false };
    }
  }

  /**
   * Enviar teclado inline para seleção de setor
   */
  async sendSectorSelectionKeyboard(userId: string): Promise<{ success: boolean }> {
    const text = 'Para agilizar seu atendimento, selecione o setor:';
    
    const result = await this.sendMessage({
      to: userId,
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '🔧 Suporte Técnico', callback_data: 'suporte' },
            { text: '💰 Financeiro', callback_data: 'financeiro' }
          ],
          [
            { text: '🤝 Comercial', callback_data: 'comercial' }
          ]
        ]
      }
    });

    return { success: result.success };
  }

  /**
   * Registrar callback para mensagens recebidas
   */
  onMessage(callback: (msg: TelegramIncomingMessage) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Registrar callback para erros
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Parar polling e fechar conexão
   */
  async stop(): Promise<void> {
    await this.bot.stopPolling();
    console.log('[Telegram PAA] Bot parado');
  }
}

export default TelegramProvider;
