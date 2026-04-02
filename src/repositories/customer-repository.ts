/**
 * Repositório de Clientes
 * 
 * Persistência e identificação de clientes no Supabase.
 */

import { getSupabaseClient } from '../config/supabase';
import { guruService } from '../integrations/guru-service';
import { asaasService } from '../integrations/asaas-service';

const supabase = getSupabaseClient();

export interface CustomerInput {
  channel: 'whatsapp' | 'telegram' | 'web';
  channelUserId: string;
  name?: string;
  email?: string;
  phone?: string;
  guruSubscriptionId?: string;
  asaasCustomerId?: string;
}

export interface Customer {
  id: string;
  channel: string;
  channel_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  guru_subscription_id: string | null;
  asaas_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Buscar cliente por channel + channel_user_id
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
    if (error.code === 'PGRST116') return null;
    console.error('❌ Erro ao buscar cliente:', error);
    return null;
  }

  return data;
}

/**
 * Criar novo cliente
 */
export async function createCustomer(customer: CustomerInput): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      channel: customer.channel,
      channel_user_id: customer.channelUserId,
      name: customer.name || null,
      email: customer.email || null,
      phone: customer.phone || null,
      guru_subscription_id: customer.guruSubscriptionId || null,
      asaas_customer_id: customer.asaasCustomerId || null
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
 */
export async function identifyOrCreateCustomer(
  channel: string,
  channelUserId: string
): Promise<Customer> {
  let customer = await findCustomerByChannel(channel, channelUserId);

  if (customer) {
    console.log('✅ Cliente identificado:', customer.id);
    return customer;
  }

  customer = await createCustomer({
    channel: channel as 'whatsapp' | 'telegram' | 'web',
    channelUserId
  });

  if (!customer) throw new Error('Falha ao criar cliente');

  // Enriquecer dados (background)
  enrichCustomerData(customer, channelUserId).catch(() => {});

  return customer;
}

/**
 * Enriquecer dados do cliente
 */
async function enrichCustomerData(customer: Customer, channelUserId: string): Promise<void> {
  try {
    const phone = channelUserId.startsWith('+') ? channelUserId : `+55${channelUserId}`;
    
    const guruCustomer = await guruService.findCustomerByPhone(phone).catch(() => null);
    if (guruCustomer) {
      const updates: any = {};
      if (!customer.name && guruCustomer.name) updates.name = guruCustomer.name;
      if (!customer.email && guruCustomer.email) updates.email = guruCustomer.email;
      if (guruCustomer.subscriptions?.length) updates.guru_subscription_id = guruCustomer.subscriptions[0].id;
      
      if (Object.keys(updates).length > 0) {
        await updateCustomer(customer.id, updates);
      }
    }
  } catch (error) {}
}

/**
 * Atualizar cliente
 */
export async function updateCustomer(customerId: string, updates: any): Promise<Customer | null> {
  const dbUpdates = { ...updates, updated_at: new Date().toISOString() };
  
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
