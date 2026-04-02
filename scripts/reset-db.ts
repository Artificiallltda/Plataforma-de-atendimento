import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carregar .env da raiz
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/ANON_KEY são necessários no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetDatabase() {
  console.log('🧹 Iniciando limpeza total do banco de dados...');
  
  try {
    // 1. Deletar Mensagens
    const { error: msgErr } = await supabase
      .from('messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (msgErr) throw msgErr;
    console.log('✅ Mensagens deletadas.');

    // 2. Deletar Tickets
    const { error: ticketErr } = await supabase
      .from('tickets')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (ticketErr) throw ticketErr;
    console.log('✅ Tickets deletados.');

    console.log('✨ Banco de dados limpo com sucesso! Pode testar novamente agora.');
  } catch (error: any) {
    console.error('❌ Falha crítica no reset:', error.message);
    process.exit(1);
  }
}

resetDatabase();
