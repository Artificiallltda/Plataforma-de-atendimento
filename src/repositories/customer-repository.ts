/**
 * Repositório de Clientes
 * 
 * Persistência e identificação de clientes no Supabase.
 * 
 * @see docs/architecture/architecture.md#4-modelo-de-dados
 */

import { supabase } from '../config/supabase';
import { guruService } from '../integrations/guru-service';
import { asaasService } from '../integrations/asaas-service';

export interface CustomerInput {
  channel: 'whatsapp' | 'telegram' | 'web';
  channelUserId: string;
  name?: string;
  email?: string;
  phone?: string;
  guruSubscriptionId?: string;
  asaasCustomerId?: string;
}

export interface Customer extends CustomerInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Buscar cliente por channel + channel_user_id
 * 
 * @param channel - Canal de origem
 * @param channelUserId - ID do usuário no canal (número WA, Telegram ID)
 * @returns Cliente encontrado ou null
 */
export async function findCustomerByChannel(
  channel: string,
  channelUserId: string
): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('channel', channel)
    .eq('channel_user_id', channelUserId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('❌ Erro ao buscar cliente:', error);
    return null;
  }

  return data;
}

/**
 * Criar novo cliente
 * 
 * @param customer - Dados do cliente
 * @returns Cliente criado
 */
export async function createCustomer(customer: CustomerInput): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      channel: customer.channel,
      channel_user_id: customer.channelUserId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      guru_subscription_id: customer.guruSubscriptionId,
      asaas_customer_id: customer.asaasCustomerId
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao criar cliente:', error);
    return null;
  }

  console.log('✅ Cliente criado:', data.id);
  return data;
}

/**
 * Identificar ou criar cliente
 *
 * @param channel - Canal de origem
 * @param channelUserId - ID do usuário no canal
 * @returns Cliente identificado
 */
export async function identifyOrCreateCustomer(
  channel: string,
  channelUserId: string
): Promise<Customer> {
  // Tentar buscar cliente existente
  let customer = await findCustomerByChannel(channel, channelUserId);

  if (customer) {
    console.log('✅ Cliente identificado:', customer.id);
    return customer;
  }

  // Criar novo cliente
  customer = await createCustomer({
    channel: channel as 'whatsapp' | 'telegram' | 'web',
    channelUserId
  });

  if (!customer) {
    throw new Error('Falha ao criar cliente');
  }

  // Enriquecer dados do novo cliente (em background para não travar resposta)
  enrichCustomerData(customer, channelUserId).catch(err => {
    console.warn('⚠️ Falha ao enriquecer dados (Guru/Asaas):', err.message);
  });

  return customer;
}

/**
 * Enriquecer dados do cliente com GURU e Asaas
 */
async function enrichCustomerData(
  customer: Customer,
  channelUserId: string
): Promise<Customer | null> {
  try {
    const phone = channelUserId.startsWith('+') ? channelUserId : `+55${channelUserId}`;
    
    // Tentar GURU
    try {
      const guruCustomer = await guruService.findCustomerByPhone(phone);
      if (guruCustomer) {
        const updates: any = {};
        if (!customer.name && guruCustomer.name) updates.name = guruCustomer.name;
        if (!customer.email && guruCustomer.email) updates.email = guruCustomer.email;
        if (guruCustomer.subscriptions?.length) updates.guru_subscription_id = guruCustomer.subscriptions[0].id;
        
        if (Object.keys(updates).length > 0) {
          await updateCustomer(customer.id, updates);
        }
      }
    } catch (e) {
      console.warn('⚠️ Guru indisponível ou erro de DNS');
    }

    // Tentar Asaas
    if (customer.email) {
      try {
        const asaasCustomer = await asaasService.findCustomerByEmail(customer.email);
        if (asaasCustomer) {
          await updateCustomer(customer.id, { asaas_customer_id: asaasCustomer.id });
        }
      } catch (e) {
        console.warn('⚠️ Asaas indisponível');
      }
    }

    return customer;
  } catch (error) {
    return customer;
  }
}

/**
 * Atualizar cliente
 */
export async function updateCustomer(
  customerId: string,
  updates: Partial<CustomerInput>
): Promise<Customer | null> {
  const dbUpdates: any = { ...updates, updated_at: new Date().toISOString() };
  
  // Mapear campos para snake_case
  if (updates.guruSubscriptionId) {
    dbUpdates.guru_subscription_id = updates.guruSubscriptionId;
    delete dbUpdates.guruSubscriptionId;
  }
  if (updates.asaasCustomerId) {
    dbUpdates.asaas_customer_id = updates.asaasCustomerId;
    delete dbUpdates.asaasCustomerId;
  }

  const { data, error } = await supabase
    .from('customers')
    .update(dbUpdates)
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao atualizar cliente:', error);
    return null;
  }

  return data;
}

export default {
  findCustomerByChannel,
  createCustomer,
  identifyOrCreateCustomer,
  updateCustomer
};
