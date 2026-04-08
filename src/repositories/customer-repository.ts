/**
 * Repositório de Clientes
 * 
 * Persistência e identificação de clientes no Supabase.
 */

import { getSupabaseClient, Database } from '../config/supabase';
import { guruService } from '../integrations/guru-service';
import { asaasService } from '../integrations/asaas-service';

const supabase = getSupabaseClient();

export interface CustomerInput {
  channel: 'whatsapp' | 'telegram' | 'web';
  channel_user_id: string;
  name?: string;
  email?: string;
  phone?: string;
  guru_subscription_id?: string;
  asaas_customer_id?: string;
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
  channel_user_id: string
): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('channel', channel)
    .eq('channel_user_id', channel_user_id)
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
  const { data, error } = await (supabase
    .from('customers') as any)
    .insert({
      channel: customer.channel,
      channel_user_id: customer.channel_user_id,
      name: customer.name || null,
      email: customer.email || null,
      phone: customer.phone || null,
      guru_subscription_id: customer.guru_subscription_id || null,
      asaas_customer_id: customer.asaas_customer_id || null
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao criar cliente:', error);
    return null;
  }

  return data as any;
}

/**
 * Identificar ou criar cliente
 */
export async function identifyOrCreateCustomer(
  channel: string,
  channel_user_id: string,
  name?: string
): Promise<Customer> {
  let customer = await findCustomerByChannel(channel, channel_user_id);

  if (customer) {
    console.log('✅ Cliente identificado:', customer.id);
    
    // Se o cliente já existia mas não tinha nome, e agora temos um nome, atualizar imediatamente
    if (name && (!customer.name || customer.name === 'Identificando...')) {
      const updated = await updateCustomer(customer.id, { name });
      if (updated) return updated;
    }
    
    return customer;
  }

  customer = await createCustomer({
    channel: channel as 'whatsapp' | 'telegram' | 'web',
    channel_user_id: channel_user_id,
    name
  });

  if (!customer) throw new Error('Falha ao criar cliente');

  // Se o cliente já existia mas não tinha nome, e agora temos um nome, atualizar
  if (name && !customer.name) {
    const updated = await updateCustomer(customer.id, { name });
    if (updated) customer = updated;
  }

  // Enriquecer dados (background)
  enrichCustomerData(customer, channel_user_id).catch(() => {});

  return customer;
}

/**
 * Enriquecer dados do cliente
 */
async function enrichCustomerData(customer: Customer, channel_user_id: string): Promise<void> {
  try {
    const phone = channel_user_id.startsWith('+') ? channel_user_id : `+55${channel_user_id}`;
    
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
export async function updateCustomer(customer_id: string, updates: Database['public']['Tables']['customers']['Update']): Promise<Customer | null> {
  const { data, error } = await (supabase
    .from('customers') as any)
    .update(updates)
    .eq('id', customer_id)
    .select()
    .single();

  if (error) {
    console.error(`❌ Erro ao atualizar cliente ${customer_id}:`, error);
    return null;
  }

  return data as any; // Fazemos o cast para a interface local Customer que também usa snake_case
}

export default {
  findCustomerByChannel,
  createCustomer,
  identifyOrCreateCustomer,
  updateCustomer
};
