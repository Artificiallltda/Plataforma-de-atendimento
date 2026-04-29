/**
 * Cliente Supabase
 * 
 * Configuração centralizada do Supabase para toda a aplicação PAA.
 * Inclui timeouts para prevenir queries travadas.
 * 
 * @see https://supabase.com/docs/reference/javascript
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          channel_user_id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          guru_subscription_id: string | null;
          asaas_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          channel_user_id: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          guru_subscription_id?: string | null;
          asaas_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel?: 'whatsapp' | 'telegram' | 'web';
          channel_user_id?: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          guru_subscription_id?: string | null;
          asaas_customer_id?: string | null;
          updated_at?: string;
        };
      };
      tickets: {
        Row: {
          id: string;
          customer_id: string | null;
          channel: 'whatsapp' | 'telegram' | 'web';
          sector: 'suporte' | 'financeiro' | 'comercial' | null;
          intent: string | null;
          status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';
          priority: 'critica' | 'alta' | 'media' | 'baixa';
          current_agent: string | null;
          assigned_to: string | null;
          csat_score: number | null;
          router_confidence: number | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          channel: 'whatsapp' | 'telegram' | 'web';
          sector?: 'suporte' | 'financeiro' | 'comercial' | null;
          intent?: string | null;
          status?: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';
          priority?: 'critica' | 'alta' | 'media' | 'baixa';
          current_agent?: string | null;
          assigned_to?: string | null;
          csat_score?: number | null;
          router_confidence?: number | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          customer_id?: string | null;
          sector?: 'suporte' | 'financeiro' | 'comercial' | null;
          intent?: string | null;
          status?: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';
          priority?: 'critica' | 'alta' | 'media' | 'baixa';
          current_agent?: string | null;
          assigned_to?: string | null;
          csat_score?: number | null;
          resolved_at?: string | null;
        };
      };
      messages: {
        Row: {
          id: string;
          external_id: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          customer_id: string | null;
          ticket_id: string | null;
          body: string;
          media_url: string | null;
          media_type: 'audio' | 'image' | 'document' | 'video' | null;
          sender: 'customer' | 'bot' | 'human';
          sender_id: string | null;
          timestamp: string;
          raw_payload: any | null;
        };
        Insert: {
          id?: string;
          external_id: string;
          channel: 'whatsapp' | 'telegram' | 'web';
          customer_id?: string | null;
          ticket_id?: string | null;
          body: string;
          media_url?: string | null;
          media_type?: 'audio' | 'image' | 'document' | 'video' | null;
          sender: 'customer' | 'bot' | 'human';
          sender_id?: string | null;
          timestamp?: string;
          raw_payload?: any | null;
        };
      };
      agent_logs: {
        Row: {
          id: string;
          ticket_id: string | null;
          agent_type: 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'feedback';
          action: 'classified' | 'responded' | 'tool_call' | 'handoff' | 'escalated' | 'collected_feedback';
          input: any | null;
          output: any | null;
          tools_used: string[] | null;
          confidence: number | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id?: string | null;
          agent_type: 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'feedback';
          action: 'classified' | 'responded' | 'tool_call' | 'handoff' | 'escalated' | 'collected_feedback';
          input?: any | null;
          output?: any | null;
          tools_used?: string[] | null;
          confidence?: number | null;
          duration_ms?: number | null;
          created_at?: string;
        };
      };
      handoffs: {
        Row: {
          id: string;
          ticket_id: string | null;
          from_agent: string;
          to_agent: string;
          reason: string;
          urgency: 'low' | 'medium' | 'high' | 'critical' | null;
          context_snapshot: any | null;
          tool_results: any | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id?: string | null;
          from_agent: string;
          to_agent: string;
          reason: string;
          urgency?: 'low' | 'medium' | 'high' | 'critical' | null;
          context_snapshot?: any | null;
          tool_results?: any | null;
          created_at?: string;
        };
      };
      agents: {
        Row: {
          id: string;
          name: string;
          email: string;
          sector: 'suporte' | 'financeiro' | 'comercial' | 'supervisor';
          is_online: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          sector: 'suporte' | 'financeiro' | 'comercial' | 'supervisor';
          is_online?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          email?: string;
          sector?: 'suporte' | 'financeiro' | 'comercial' | 'supervisor';
          is_online?: boolean;
        };
      };
      alerts: {
        Row: {
          id: string;
          ticket_id: string | null;
          type: string;
          level: 'low' | 'medium' | 'high' | 'critical';
          message: string;
          acknowledged: boolean;
          acknowledged_by?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id?: string | null;
          type: string;
          level: 'low' | 'medium' | 'high' | 'critical';
          message: string;
          acknowledged?: boolean;
          acknowledged_by?: string | null;
          created_at?: string;
        };
      };
      feedback: {
        Row: {
          id: string;
          ticket_id: string | null;
          customer_id: string;
          type: 'csat' | 'nps';
          score: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id?: string | null;
          customer_id: string;
          type: 'csat' | 'nps';
          score: number;
          comment?: string | null;
          created_at?: string;
        };
      };
      nps_history: {
        Row: {
          id: string;
          customer_id: string;
          score: number;
          classification: 'detractor' | 'passive' | 'promoter';
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          score: number;
          classification: 'detractor' | 'passive' | 'promoter';
          created_at?: string;
        };
      };
      kb_articles: {
        Row: {
          id: string;
          title: string;
          content: string;
          url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          url?: string | null;
          created_at?: string;
        };
      };
      technical_tickets: {
        Row: {
          id: string;
          customer_id: string;
          ticket_id: string;
          error: string;
          steps_to_reproduce: string | null;
          expected_behavior: string;
          actual_behavior: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          status: string;
          reported_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          ticket_id: string;
          error: string;
          steps_to_reproduce?: string | null;
          expected_behavior: string;
          actual_behavior: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          status?: string;
          reported_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};

// Singleton do cliente Supabase
//
// Nota sobre tipos: a versão atual do @supabase/supabase-js exige uma
// propriedade interna `__InternalSupabase: { PostgrestVersion }` no tipo
// Database, que não está documentada. Sem ela, queries em tabelas custom
// retornam `never` e o TS rejeita .insert/.update/.select.
//
// Como o Database acima é mantido apenas como contrato/documentação dos
// schemas, removemos o genérico no createClient e tipamos o cliente como
// any-friendly. Schema Database fica disponível para tipos discretos
// (ex: import { Database } from '../config/supabase' e usar Database['public']['Tables']['...']['Row']).
let supabaseInstance: SupabaseClient | null = null;

/**
 * Obter ou criar instância do cliente Supabase com timeout nas queries
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
      auth: { persistSession: false },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-application-name': 'paa-api'
        }
      }
    };

    supabaseInstance = createClient(supabaseUrl, supabaseKey, options);

    logger.info('✅ Supabase client inicializado');
  }
  return supabaseInstance;
}

/**
 * Resetar instância do Supabase (útil para testes e reconexão)
 */
export function resetSupabaseClient(): void {
  if (supabaseInstance) {
    supabaseInstance.removeAllChannels();
    supabaseInstance = null;
    logger.info('🔄 Supabase client resetado');
  }
}

export const supabase: SupabaseClient = getSupabaseClient();
export default supabase;
