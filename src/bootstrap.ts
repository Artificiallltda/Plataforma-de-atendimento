/**
 * Bootstrap — DEVE ser o PRIMEIRO import em server.ts.
 *
 * Resolve dois cenários do Railway com Vertex AI:
 *
 * 1) GOOGLE_APPLICATION_CREDENTIALS contém o JSON do Service Account inteiro
 *    (Railway aceita JSONs grandes em envs, mas a SDK do Vertex espera um
 *    caminho de arquivo). Detectamos JSON, gravamos em /tmp/gcp-key.json e
 *    re-apontamos a env para esse caminho.
 *
 * 2) GOOGLE_CLOUD_PROJECT não foi setado mas o JSON da chave tem `project_id`.
 *    Extraímos do JSON e populamos.
 *
 * Usa apenas APIs nativas do Node (fs/path) para não disparar imports
 * eager de módulos que dependem das envs (ex: agents/router-agent.ts L252).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') && trimmed.includes('"type"') && trimmed.includes('private_key');
}

function materializeGcpKey(): void {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) return;

  // Caso 1: já é um caminho válido — não precisa fazer nada
  if (!looksLikeJson(raw)) {
    if (fs.existsSync(raw)) {
      console.log(`[bootstrap] GOOGLE_APPLICATION_CREDENTIALS é caminho existente: ${raw}`);
    } else {
      console.warn(`[bootstrap] GOOGLE_APPLICATION_CREDENTIALS aponta para arquivo inexistente: ${raw}`);
    }
    return;
  }

  // Caso 2: é o JSON colado direto na env — materializa em /tmp
  try {
    const parsed = JSON.parse(raw);
    const targetDir = os.tmpdir();
    const targetPath = path.join(targetDir, 'gcp-sa-key.json');

    fs.writeFileSync(targetPath, JSON.stringify(parsed), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = targetPath;

    console.log(`[bootstrap] Service Account JSON detectado em GOOGLE_APPLICATION_CREDENTIALS — materializado em ${targetPath}`);

    // Bonus: se GOOGLE_CLOUD_PROJECT não está setado mas o JSON tem project_id, popula
    if (!process.env.GOOGLE_CLOUD_PROJECT && typeof parsed.project_id === 'string') {
      process.env.GOOGLE_CLOUD_PROJECT = parsed.project_id;
      console.log(`[bootstrap] GOOGLE_CLOUD_PROJECT extraído do Service Account: ${parsed.project_id}`);
    }
  } catch (err) {
    console.error('[bootstrap] Falha ao materializar GOOGLE_APPLICATION_CREDENTIALS como JSON:', err instanceof Error ? err.message : err);
    console.error('[bootstrap] Backend continuará a inicialização — Vertex AI provavelmente vai falhar.');
  }
}

materializeGcpKey();
