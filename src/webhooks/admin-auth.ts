import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, timingSafeEqual } from 'crypto';
import { supabase } from '../config/supabase';

const VALID_SECTORS = ['suporte', 'financeiro', 'comercial', 'supervisor'] as const;
type Sector = (typeof VALID_SECTORS)[number];

/**
 * Gera senha temporária forte (12 chars, alfanum + símbolos seguros).
 */
function generateTempPassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$';
  const bytes = randomBytes(12);
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += charset[bytes[i] % charset.length];
  }
  return pwd;
}

/**
 * Compara dois tokens em tempo constante (evita timing attack).
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Hook de proteção: exige Bearer ADMIN_API_TOKEN no header Authorization.
 *
 * Em dev (NODE_ENV !== 'production') sem ADMIN_API_TOKEN setado,
 * apenas avisa e libera (facilita testes locais).
 */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  const isProd = process.env.NODE_ENV === 'production';

  if (!expected) {
    if (isProd) {
      request.log.error('ADMIN_API_TOKEN não configurado em produção — rota admin bloqueada');
      return reply.status(503).send({ error: 'Admin token not configured' });
    }
    request.log.warn('⚠️ ADMIN_API_TOKEN ausente — liberado em DEV apenas');
    return;
  }

  const auth = request.headers['authorization'];
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    return reply.status(401)
      .header('WWW-Authenticate', 'Bearer')
      .send({ error: 'Missing or invalid Authorization header' });
  }

  const provided = auth.slice('Bearer '.length).trim();
  if (!safeCompare(provided, expected)) {
    return reply.status(401)
      .header('WWW-Authenticate', 'Bearer')
      .send({ error: 'Invalid admin token' });
  }
}

export async function registerAdminAuthRoutes(fastify: FastifyInstance) {
  /**
   * POST /admin/register-agent
   * Cria novo atendente em auth.users + public.agents.
   *
   * Protegido por Bearer ADMIN_API_TOKEN.
   * Senha gerada aleatoriamente e devolvida no response (admin envia ao usuário).
   */
  fastify.post(
    '/admin/register-agent',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { name, email, sector, password } = request.body as {
        name?: string;
        email?: string;
        sector?: string;
        password?: string;
      };

      if (!name || !email || !sector) {
        return reply.status(400).send({ error: 'Campos obrigatórios: name, email, sector' });
      }

      if (!VALID_SECTORS.includes(sector as Sector)) {
        return reply.status(400).send({
          error: `Setor inválido. Aceitos: ${VALID_SECTORS.join(', ')}`,
        });
      }

      // Senha: a fornecida (caso admin queira customizar) ou aleatória forte.
      const finalPassword = password && password.length >= 8 ? password : generateTempPassword();

      try {
        fastify.log.info(`Tentando registrar novo atendente: ${email} (${sector})`);

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          user_metadata: { name, sector },
        });

        if (authError) {
          fastify.log.error(authError, 'Erro no Supabase Auth Admin:');
          return reply.status(400).send({ error: authError.message });
        }

        const userId = authData.user.id;

        const { error: dbError } = await (supabase.from('agents') as any).insert({
          id: userId,
          name,
          email,
          sector,
          is_online: false,
        });

        if (dbError) {
          fastify.log.error(dbError, 'Erro ao inserir na tabela agents:');
          // Rollback: remove usuário criado no Auth
          await supabase.auth.admin.deleteUser(userId);
          return reply.status(400).send({ error: dbError.message });
        }

        // Devolve a senha temporária APENAS para o admin que criou.
        // Admin é responsável por repassá-la ao atendente em canal seguro.
        return reply.status(201).send({
          message: 'Atendente registrado com sucesso',
          user: { id: userId, email, name, sector },
          temporary_password: finalPassword,
          instructions: 'Repasse a senha ao atendente em canal seguro. Recomendado trocar no primeiro acesso via "Esqueci minha senha".',
        });
      } catch (err: any) {
        fastify.log.error(err, 'Erro interno no registro de admin:');
        return reply.status(500).send({ error: 'Erro interno ao processar registro' });
      }
    }
  );

  /**
   * DELETE /admin/delete-agent/:id
   * Remove atendente de auth.users e public.agents.
   * Protegido por Bearer ADMIN_API_TOKEN.
   */
  fastify.delete(
    '/admin/delete-agent/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const { error: authError } = await supabase.auth.admin.deleteUser(id);
        if (authError) return reply.status(400).send({ error: authError.message });

        await supabase.from('agents').delete().eq('id', id);
        return reply.send({ message: 'Agente removido com sucesso' });
      } catch (err: any) {
        return reply.status(500).send({ error: 'Erro ao deletar agente' });
      }
    }
  );
}
