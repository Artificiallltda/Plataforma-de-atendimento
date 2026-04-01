/**
 * Serviço de Integração com Asaas
 * 
 * Integração com API do Asaas para gestão financeira (cobranças, boletos, Pix).
 * 
 * @see https://www.asaas.com/docs
 */

import axios, { AxiosInstance } from 'axios';

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpfCnpj?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  country?: string;
  outstandingBalance: number;
  createdAt: Date;
}

export interface AsaasInvoice {
  id: string;
  customerId: string;
  billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'TRANSFER';
  value: number;
  netValue: number;
  status: 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED';
  description?: string;
  dueDate: Date;
  originalDueDate: Date;
  paymentDate?: Date;
  customerPaymentDate?: Date;
  installmentNumber?: number;
  externalReference?: string;
  invoiceUrl?: string; // URL do boleto/Pix
  pdfUrl?: string;    // URL do PDF
  createdAt: Date;
}

export interface AsaasPayment {
  id: string;
  invoiceId: string;
  customerId: string;
  billingType: string;
  value: number;
  status: 'RECEIVED' | 'PENDING' | 'REFUNDED';
  paymentDate: Date;
  createdAt: Date;
}

export interface AsaasApiResponse<T> {
  object: 'list' | 'object';
  hasMore: boolean;
  totalCount?: number;
  data?: T[];
}

/**
 * Cliente API do Asaas
 */
class AsaasServiceClient {
  private api: AxiosInstance;

  constructor() {
    const apiKey = process.env.ASAAS_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ ASAAS_API_KEY não configurada - integrações Asaas desabilitadas');
    }

    this.api = axios.create({
      baseURL: process.env.ASAAS_API_BASE_URL || 'https://www.asaas.com/api/v3',
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 segundos timeout
    });
  }

  /**
   * Buscar cliente por CPF/CNPJ
   * 
   * @param cpfCnpj - CPF ou CNPJ do cliente
   * @returns Dados do cliente ou null
   */
  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
    try {
      const { data } = await this.api.get(`/customers`, {
        params: { cpfCnpj }
      });

      if (!data || !data.data || data.data.length === 0) {
        return null;
      }

      return this.mapCustomer(data.data[0]);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null; // Cliente não encontrado
        }
        console.error('❌ Erro ao buscar cliente no Asaas:', error.response?.data || error.message);
      } else {
        console.error('❌ Erro desconhecido ao buscar cliente no Asaas:', error);
      }
      return null;
    }
  }

  /**
   * Buscar cliente por email
   * 
   * @param email - Email do cliente
   * @returns Dados do cliente ou null
   */
  async findCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
    try {
      const { data } = await this.api.get(`/customers`, {
        params: { email }
      });

      if (!data || !data.data || data.data.length === 0) {
        return null;
      }

      return this.mapCustomer(data.data[0]);
    } catch (error) {
      console.error('❌ Erro ao buscar cliente no Asaas:', error);
      return null;
    }
  }

  /**
   * Buscar cliente por ID Asaas
   * 
   * @param customerId - ID do cliente no Asaas
   * @returns Dados do cliente ou null
   */
  async findCustomerById(customerId: string): Promise<AsaasCustomer | null> {
    try {
      const { data } = await this.api.get(`/customers/${customerId}`);
      return this.mapCustomer(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('❌ Erro ao buscar cliente no Asaas:', error);
      return null;
    }
  }

  /**
   * Buscar faturas em aberto do cliente
   * 
   * @param customerId - ID do cliente no Asaas
   * @returns Lista de faturas pendentes
   */
  async findPendingInvoices(customerId: string): Promise<AsaasInvoice[]> {
    try {
      const { data } = await this.api.get(`/invoices`, {
        params: {
          customer: customerId,
          status: 'PENDING',
          limit: 10
        }
      });

      if (!data || !data.data) {
        return [];
      }

      return data.data.map((invoice: any) => this.mapInvoice(invoice));
    } catch (error) {
      console.error('❌ Erro ao buscar faturas no Asaas:', error);
      return [];
    }
  }

  /**
   * Reenviar boleto/Pix para o cliente
   * 
   * @param invoiceId - ID da fatura
   * @returns Resultado da operação
   */
  async resendInvoice(invoiceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.api.post(`/invoices/${invoiceId}/resendNotification`);
      console.log(`✅ Bboleto/Pix reenviado para fatura ${invoiceId}`);
      return { success: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ Erro ao reenviar boleto:', error.response?.data || error.message);
        return {
          success: false,
          error: error.response?.data?.message || error.message
        };
      }
      return { success: false, error: 'Erro desconhecido' };
    }
  }

  /**
   * Processar reembolso/estorno
   * 
   * @param invoiceId - ID da fatura
   * @param amount - Valor do reembolso
   * @param reason - Motivo do reembolso
   * @returns Resultado da operação
   */
  async processRefund(
    invoiceId: string,
    amount: number,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.api.post(`/payments/${invoiceId}/refund`, {
        value: amount,
        reason
      });

      console.log(`✅ Reembolso de R$ ${amount} processado para fatura ${invoiceId}`);
      return { success: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ Erro ao processar reembolso:', error.response?.data || error.message);
        return {
          success: false,
          error: error.response?.data?.message || error.message
        };
      }
      return { success: false, error: 'Erro desconhecido' };
    }
  }

  /**
   * Obter link da fatura (boleto/Pix)
   * 
   * @param invoiceId - ID da fatura
   * @returns URL do boleto/Pix ou null
   */
  async getInvoiceUrl(invoiceId: string): Promise<string | null> {
    try {
      const { data } = await this.api.get(`/invoices/${invoiceId}`);
      
      if (data.billingType === 'PIX') {
        return data.pixUrl || data.invoiceUrl || null;
      }
      
      return data.invoiceUrl || data.pdfUrl || null;
    } catch (error) {
      console.error('❌ Erro ao obter URL da fatura:', error);
      return null;
    }
  }

  /**
   * Criar nova fatura
   * 
   * @param invoice - Dados da fatura
   * @returns Fatura criada ou null
   */
  async createInvoice(invoice: {
    customerId: string;
    billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
    value: number;
    dueDate: Date;
    description?: string;
    externalReference?: string;
  }): Promise<AsaasInvoice | null> {
    try {
      const { data } = await this.api.post('/invoices', {
        customer: invoice.customerId,
        billingType: invoice.billingType,
        value: invoice.value,
        dueDate: this.formatDate(invoice.dueDate),
        description: invoice.description,
        externalReference: invoice.externalReference
      });

      return this.mapInvoice(data);
    } catch (error) {
      console.error('❌ Erro ao criar fatura:', error);
      return null;
    }
  }

  /**
   * Mapear resposta da API para objeto AsaasCustomer
   */
  private mapCustomer(customer: any): AsaasCustomer {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      cpfCnpj: customer.cpfCnpj,
      postalCode: customer.postalCode,
      address: customer.address,
      addressNumber: customer.addressNumber,
      complement: customer.complement,
      province: customer.province,
      city: customer.city,
      state: customer.state,
      country: customer.country,
      outstandingBalance: customer.outstandingBalance || 0,
      createdAt: new Date(customer.createdAt)
    };
  }

  /**
   * Mapear resposta da API para objeto AsaasInvoice
   */
  private mapInvoice(invoice: any): AsaasInvoice {
    return {
      id: invoice.id,
      customerId: invoice.customer,
      billingType: invoice.billingType,
      value: invoice.value,
      netValue: invoice.netValue,
      status: invoice.status,
      description: invoice.description,
      dueDate: new Date(invoice.dueDate),
      originalDueDate: new Date(invoice.originalDueDate),
      paymentDate: invoice.paymentDate ? new Date(invoice.paymentDate) : undefined,
      customerPaymentDate: invoice.customerPaymentDate ? new Date(invoice.customerPaymentDate) : undefined,
      installmentNumber: invoice.installmentNumber,
      externalReference: invoice.externalReference,
      invoiceUrl: invoice.invoiceUrl,
      pdfUrl: invoice.pdfUrl,
      createdAt: new Date(invoice.createdAt)
    };
  }

  /**
   * Formatar data para padrão YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

// Singleton
let asaasServiceInstance: AsaasServiceClient | null = null;

/**
 * Obter instância do serviço Asaas
 */
export function getAsaasService(): AsaasServiceClient {
  if (!asaasServiceInstance) {
    asaasServiceInstance = new AsaasServiceClient();
  }
  return asaasServiceInstance;
}

export const asaasService = getAsaasService();

export default asaasService;
