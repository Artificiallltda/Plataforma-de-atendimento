/**
 * Serviço de Integração com GURU
 * 
 * Integração com API do GURU para gestão de assinaturas.
 * 
 * @see https://docs.guru.com.br/api
 */

import axios, { AxiosInstance } from 'axios';

export interface GuruSubscription {
  id: string;
  customerId: string;
  plan: {
    id: string;
    name: string;
    type: 'basico' | 'premium' | 'enterprise';
    value: number;
  };
  status: 'ativo' | 'inativo' | 'cancelado' | 'pendente';
  startsAt: Date;
  expiresAt: Date;
  lastPaymentAt?: Date;
  nextBillingAt?: Date;
}

export interface GuruCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  document?: string; // CPF ou CNPJ
  subscriptions?: GuruSubscription[];
}

export interface GuruApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Cliente API do GURU
 */
class GuruServiceClient {
  private api: AxiosInstance;

  constructor() {
    const apiKey = process.env.GURU_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ GURU_API_KEY não configurada - integrações GURU desabilitadas');
    }

    this.api = axios.create({
      baseURL: process.env.GURU_API_BASE_URL || 'https://api.digitalmanagerguru.com.br/v1',

      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 segundos timeout
    });
  }

  /**
   * Buscar cliente por telefone
   * 
   * @param phone - Telefone do cliente (E.164: +5517987654321)
   * @returns Dados do cliente ou null
   */
  async findCustomerByPhone(phone: string): Promise<GuruCustomer | null> {
    try {
      const { data } = await this.api.get(`/customers`, {
        params: { phone }
      });

      if (!data || !data.customer) {
        return null;
      }

      return this.mapCustomer(data.customer);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null; // Cliente não encontrado
        }
        console.error('❌ Erro ao buscar cliente no GURU:', error.response?.data || error.message);
      } else {
        console.error('❌ Erro desconhecido ao buscar cliente no GURU:', error);
      }
      return null;
    }
  }

  /**
   * Buscar assinatura por ID
   * 
   * @param subscriptionId - ID da assinatura no GURU
   * @returns Dados da assinatura ou null
   */
  async findSubscriptionById(subscriptionId: string): Promise<GuruSubscription | null> {
    try {
      const { data } = await this.api.get(`/subscriptions/${subscriptionId}`);

      if (!data || !data.subscription) {
        return null;
      }

      return this.mapSubscription(data.subscription);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null; // Assinatura não encontrada
        }
        console.error('❌ Erro ao buscar assinatura no GURU:', error.response?.data || error.message);
      } else {
        console.error('❌ Erro desconhecido ao buscar assinatura no GURU:', error);
      }
      return null;
    }
  }

  /**
   * Buscar assinaturas ativas por telefone
   * 
   * @param phone - Telefone do cliente
   * @returns Lista de assinaturas ativas
   */
  async findActiveSubscriptionsByPhone(phone: string): Promise<GuruSubscription[]> {
    try {
      const { data } = await this.api.get(`/subscriptions`, {
        params: { phone, status: 'ativo' }
      });

      if (!data || !data.subscriptions || !Array.isArray(data.subscriptions)) {
        return [];
      }

      return data.subscriptions.map((s: any) => this.mapSubscription(s));
    } catch (error) {
      console.error('❌ Erro ao buscar assinaturas no GURU:', error);
      return [];
    }
  }

  /**
   * Aplicar cupom de desconto para retenção
   * 
   * @param subscriptionId - ID da assinatura
   * @param discountPercent - Percentual de desconto (ex: 30 para 30%)
   * @param months - Número de meses de desconto
   * @returns Resultado da operação
   */
  async applyRetentionCoupon(
    subscriptionId: string,
    discountPercent: number,
    months: number = 3
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.api.post(`/subscriptions/${subscriptionId}/coupons`, {
        type: 'retention',
        discount: discountPercent,
        duration: months,
        reason: 'customer_retention'
      });

      console.log(`✅ Cupom de ${discountPercent}% aplicado por ${months} meses na assinatura ${subscriptionId}`);
      return { success: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ Erro ao aplicar cupom no GURU:', error.response?.data || error.message);
        return {
          success: false,
          error: error.response?.data?.message || error.message
        };
      }
      console.error('❌ Erro desconhecido ao aplicar cupom:', error);
      return { success: false, error: 'Erro desconhecido' };
    }
  }

  /**
   * Gerar link de checkout para upgrade
   * 
   * @param planId - ID do plano para upgrade
   * @param customerId - ID do cliente
   * @returns Link de checkout ou null
   */
  async generateCheckoutLink(planId: string, customerId: string): Promise<string | null> {
    try {
      const { data } = await this.api.post(`/checkout`, {
        planId,
        customerId,
        type: 'upgrade'
      });

      if (!data || !data.checkoutUrl) {
        return null;
      }

      return data.checkoutUrl;
    } catch (error) {
      console.error('❌ Erro ao gerar link de checkout:', error);
      return null;
    }
  }

  /**
   * Mapear resposta da API para objeto GuruCustomer
   */
  private mapCustomer(customer: any): GuruCustomer {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      document: customer.document,
      subscriptions: customer.subscriptions?.map((s: any) => this.mapSubscription(s))
    };
  }

  /**
   * Mapear resposta da API para objeto GuruSubscription
   */
  private mapSubscription(subscription: any): GuruSubscription {
    return {
      id: subscription.id,
      customerId: subscription.customer_id,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        type: this.mapPlanType(subscription.plan.type),
        value: subscription.plan.value
      },
      status: subscription.status,
      startsAt: new Date(subscription.starts_at),
      expiresAt: new Date(subscription.expires_at),
      lastPaymentAt: subscription.last_payment_at ? new Date(subscription.last_payment_at) : undefined,
      nextBillingAt: subscription.next_billing_at ? new Date(subscription.next_billing_at) : undefined
    };
  }

  /**
   * Mapear tipo de plano
   */
  private mapPlanType(type: string): 'basico' | 'premium' | 'enterprise' {
    const types: Record<string, 'basico' | 'premium' | 'enterprise'> = {
      'basic': 'basico',
      'basico': 'basico',
      'premium': 'premium',
      'enterprise': 'enterprise',
      'corp': 'enterprise'
    };
    return types[type.toLowerCase()] || 'basico';
  }
}

// Singleton
let guruServiceInstance: GuruServiceClient | null = null;

/**
 * Obter instância do serviço GURU
 */
export function getGuruService(): GuruServiceClient {
  if (!guruServiceInstance) {
    guruServiceInstance = new GuruServiceClient();
  }
  return guruServiceInstance;
}

export const guruService = getGuruService();

export default guruService;
