/**
 * Cliente Supabase
 * 
 * Configuração centralizada do Supabase para toda a aplicação PAA.
 * 
 * @see https://supabase.com/docs/reference/javascript
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          channelUserId: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          guruSubscriptionId: string | null;
          asaasCustomerId: string | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: {
          id?: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          channelUserId: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          guruSubscriptionId?: string | null;
          asaasCustomerId?: string | null;
        };
      };
      tickets: {
        Row: {
          id: string;
          customerId: string | null;
          channel: 'whatsapp' | 'telegram' | 'web';
          sector: 'suporte' | 'financeiro' | 'comercial' | null;
          intent: string | null;
          status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';
          priority: 'critica' | 'alta' | 'media' | 'baixa';
          currentAgent: string | null;
          assignedTo: string | null;
          csatScore: number | null;
          routerConfidence: number | null;
          createdAt: string;
          resolvedAt: string | null;
        };
      };
      messages: {
        Row: {
          id: string;
          externalId: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          customerId: string | null;
          ticketId: string | null;
          body: string;
          mediaUrl: string | null;
          mediaType: 'audio' | 'image' | 'document' | 'video' | null;
          sender: 'customer' | 'bot' | 'human';
          senderId: string | null;
          timestamp: string;
          rawPayload: any | null;
        };
      };
      agent_logs: {
        Row: {
          id: string;
          ticketId: string | null;
          agentType: 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'feedback';
          action: 'classified' | 'responded' | 'tool_call' | 'handoff' | 'escalated' | 'collected_feedback';
          input: any | null;
          output: any | null;
          toolsUsed: string[] | null;
          confidence: number | null;
          durationMs: number | null;
          createdAt: string;
        };
      };
      handoffs: {
        Row: {
          id: string;
          ticketId: string | null;
          fromAgent: string;
          toAgent: string;
          reason: string;
          urgency: 'low' | 'medium' | 'high' | 'critical' | null;
          contextSnapshot: any | null;
          toolResults: any | null;
          createdAt: string;
        };
      };
      agents: {
        Row: {
          id: string;
          name: string;
          email: string;
          sector: 'suporte' | 'financeiro' | 'comercial' | 'supervisor';
          isOnline: boolean;
          createdAt: string;
        };
      };
      alerts: {
        Row: {
          id: string;
          ticketId: string | null;
          type: 'escalation' | 'timeout' | 'bug_sistemico';
          level: 'info' | 'warning' | 'critical';
          message: string;
          acknowledged: boolean;
          acknowledgedBy: string | null;
          createdAt: string;
        };
      };
    };
  };
}

// Singleton do cliente Supabase
let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Obter ou criar instância do cliente Supabase
 * 
 * @returns Instância do Supabase
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL no .env'
      );
    }

    console.log(`📡 [Supabase] Inicializando em: ${supabaseUrl}`);
    console.log(`🔐 [Supabase] Tipo de chave: ${isServiceKey ? 'SERVICE_ROLE (Bypass RLS)' : 'ANON (Subject to RLS)'}`);

    supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false
      },
      db: {
        schema: 'public'
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    console.log('✅ Cliente Supabase pronto');
  }

  return supabaseInstance;
}

/**
 * Cliente Supabase para uso direto (export named)
 * 
 * @example
 * import { supabase } from './config/supabase';
 * const { data } = await supabase.from('customers').select();
 */
export const supabase = getSupabaseClient();

export default supabase;
