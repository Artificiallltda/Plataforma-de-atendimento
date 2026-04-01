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
 * Buscar cliente por channel + channelUserId
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
    .eq('channeluserid', channelUserId)
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
      channeluserid: customer.channelUserId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      gurusubscriptionid: customer.guruSubscriptionId,
      asaascustomerid: customer.asaasCustomerId
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
 * Fluxo principal de identificação:
 * 1. Busca cliente existente por channel + channelUserId
 * 2. Se não existe, cria novo cliente
 * 3. Retorna cliente (existente ou criado)
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
    
    // Se já tem guruSubscriptionId ou asaasCustomerId, não precisa enriquecer
    if (customer.guruSubscriptionId || customer.asaasCustomerId) {
      return customer;
    }
    
    // Enriquecer dados se faltando
    const enriched = await enrichCustomerData(customer, channelUserId);
    return enriched || customer;
  }

  // Criar novo cliente
  customer = await createCustomer({
    channel: channel as 'whatsapp' | 'telegram' | 'web',
    channelUserId
  });

  if (!customer) {
    // Fallback: criar com dados mínimos
    customer = await createCustomer({
      channel: channel as 'whatsapp' | 'telegram' | 'web',
      channelUserId
    });

    if (!customer) {
      throw new Error('Falha ao criar cliente');
    }
  }

  // Enriquecer dados do novo cliente
  await enrichCustomerData(customer, channelUserId);

  return customer;
}

/**
 * Enriquecer dados do cliente com GURU e Asaas
 * 
 * @param customer - Cliente existente
 * @param channelUserId - Telefone ou ID do canal
 * @returns Cliente enriquecido ou null se falhar
 */
async function enrichCustomerData(
  customer: Customer,
  channelUserId: string
): Promise<Customer | null> {
  try {
    // Normalizar telefone para E.164
    const phone = channelUserId.startsWith('+') ? channelUserId : `+55${channelUserId}`;
    
    // Buscar no GURU por telefone
    const guruCustomer = await guruService.findCustomerByPhone(phone);
    if (guruCustomer) {
      const updates: any = {};
      
      if (!customer.name && guruCustomer.name) {
        updates.name = guruCustomer.name;
      }
      if (!customer.email && guruCustomer.email) {
        updates.email = guruCustomer.email;
      }
      if (!customer.phone) {
        updates.phone = guruCustomer.phone;
      }
      if (guruCustomer.subscriptions && guruCustomer.subscriptions.length > 0) {
        updates.guruSubscriptionId = guruCustomer.subscriptions[0].id;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateCustomer(customer.id, updates);
        console.log('✅ Cliente enriquecido com dados do GURU:', customer.id);
      }
    }

    // Buscar no Asaas por CPF (se tiver) ou email
    if (customer.email) {
      const asaasCustomer = await asaasService.findCustomerByEmail(customer.email);
      if (asaasCustomer) {
        const updates: any = {};
        
        if (!customer.name && asaasCustomer.name) {
          updates.name = asaasCustomer.name;
        }
        updates.asaasCustomerId = asaasCustomer.id;
        
        await updateCustomer(customer.id, updates);
        console.log('✅ Cliente enriquecido com dados do Asaas:', customer.id);
      }
    }

    return { ...customer, ...customer };
  } catch (error) {
    console.error('⚠️ Erro ao enriquecer dados do cliente:', error);
    return null; // Falha silenciosa - não bloqueia o fluxo
  }
}

/**
 * Atualizar cliente com dados enriquecidos (GURU/Asaas)
 * 
 * @param customerId - ID do cliente
 * @param updates - Dados para atualizar
 * @returns Cliente atualizado ou null
 */
export async function updateCustomer(
  customerId: string,
  updates: Partial<{
    name: string;
    email: string;
    phone: string;
    guruSubscriptionId: string;
    asaasCustomerId: string;
  }>
): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .update({
      ...updates,
      updatedAt: new Date().toISOString()
    })
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao atualizar cliente:', error);
    return null;
  }

  console.log('✅ Cliente atualizado:', data.id);
  return data;
}

/**
 * Enriquecer cliente com dados do GURU/Asaas
 * 
 * @param customerId - ID do cliente
 * @param guruData - Dados do GURU (se disponíveis)
 * @param asaasData - Dados do Asaas (se disponíveis)
 * @returns Cliente enriquecido
 */
export async function enrichCustomer(
  customerId: string,
  guruData?: { subscriptionId: string; plan?: string },
  asaasData?: { asaasCustomerId: string; name?: string; email?: string }
): Promise<Customer | null> {
  const updates: any = {};

  if (guruData?.subscriptionId) {
    updates.guruSubscriptionId = guruData.subscriptionId;
  }

  if (asaasData) {
    if (asaasData.asaasCustomerId) {
      updates.asaasCustomerId = asaasData.asaasCustomerId;
    }
    if (asaasData.name) {
      updates.name = asaasData.name;
    }
    if (asaasData.email) {
      updates.email = asaasData.email;
    }
  }

  if (Object.keys(updates).length === 0) {
    // Nada para atualizar
    return findCustomerByChannel('', '');
  }

  return await updateCustomer(customerId, updates);
}

export default {
  findCustomerByChannel,
  createCustomer,
  identifyOrCreateCustomer,
  updateCustomer,
  enrichCustomer
};
