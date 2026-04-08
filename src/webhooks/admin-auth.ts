import { FastifyInstance } from 'fastify';
import { supabase } from '../config/supabase';

export async function registerAdminAuthRoutes(fastify: FastifyInstance) {
  /**
   * POST /admin/register-agent
   * Cria um novo atendente no Supabase Auth e na tabela public.agents
   */
  fastify.post('/admin/register-agent', async (request, reply) => {
    const { name, email, sector, password } = request.body as any;

    if (!name || !email || !sector) {
      return reply.status(400).send({ error: 'Campos obrigatórios: name, email, sector' });
    }

    try {
      fastify.log.info(`Tentando registrar novo atendente: ${email}`);

      // 1. Criar usuário no Supabase Auth (Admin API)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: password || '@Artificiall123',
        email_confirm: true,
        user_metadata: { name, sector }
      });

      if (authError) {
        fastify.log.error(authError, 'Erro no Supabase Auth Admin:');
        return reply.status(400).send({ error: authError.message });
      }

      const userId = authData.user.id;

      // 2. Criar registro na tabela public.agents (SNAKE_CASE)
      const { error: dbError } = await (supabase
        .from('agents') as any)
        .insert({
          id: userId,
          name,
          email,
          sector,
          is_online: false
        });

      if (dbError) {
        fastify.log.error(dbError, 'Erro ao inserir na tabela agents:');
        // Tentar remover o usuário do Auth se o DB falhar para manter consistência
        await supabase.auth.admin.deleteUser(userId);
        return reply.status(400).send({ error: dbError.message });
      }

      return reply.status(201).send({ 
        message: 'Atendente registrado com sucesso',
        user: { id: userId, email, name, sector }
      });

    } catch (err: any) {
      fastify.log.error(err, 'Erro interno no registro de admin:');
      return reply.status(500).send({ error: 'Erro interno ao processar registro' });
    }
  });

  /**
   * DELETE /admin/delete-agent/:id
   * Remove um atendente do Auth e da tabela agents
   */
  fastify.delete('/admin/delete-agent/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      // 1. Deletar do Auth (automaticamente deleta do DB se houver CASCADE ou fazemos manual)
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      
      if (authError) return reply.status(400).send({ error: authError.message });

      // 2. Deletar da tabela agents (manual por segurança)
      await supabase.from('agents').delete().eq('id', id);

      return reply.send({ message: 'Agente removido com sucesso' });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Erro ao deletar agente' });
    }
  });
}
