import { randomUUID, timingSafeEqual } from 'node:crypto';
import { criarPluginAutocab } from '../core.mjs';
import { criarBancoSupabase } from '../server/supabase.mjs';
import { executarCiclo } from '../server/ciclo.mjs';

function autorizado(cabecalho, segredo) {
  const recebido = Buffer.from(typeof cabecalho === 'string' ? cabecalho : '');
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export function criarRotaCron({ ambiente = process.env, criarBanco = criarBancoSupabase, criarApi = criarPluginAutocab, executar = executarCiclo } = {}) {
  return async function cron(requisicao, resposta) {
    resposta.setHeader('Cache-Control', 'no-store');
    if (requisicao.method !== 'GET') {
      resposta.setHeader('Allow', 'GET');
      return resposta.status(405).json({ erro: 'Use GET' });
    }
    if (!ambiente.CRON_SECRET) return resposta.status(503).json({ erro: 'CRON_SECRET não configurado' });
    if (!autorizado(requisicao.headers.authorization, ambiente.CRON_SECRET)) return resposta.status(401).json({ erro: 'Não autorizado' });
    const ausentes = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTOCAB_SUBSCRIPTION_KEY'].filter(nome => !ambiente[nome]);
    if (ausentes.length) return resposta.status(503).json({ erro: 'Configuração incompleta', ausentes });
    const ciclo = randomUUID();
    let banco;
    let trava;
    let cursor = 0;
    try {
      banco = criarBanco(ambiente);
      trava = await banco.adquirir(ciclo);
      if (!trava) return resposta.status(200).json({ estado: 'ignorado', motivo: 'Ciclo anterior em execução' });
      cursor = trava.cursor;
      const api = criarApi({ subscriptionKey: ambiente.AUTOCAB_SUBSCRIPTION_KEY, timeoutMs: 4000 });
      const resumo = await executar({ api, banco, ciclo, cursor });
      cursor = resumo.cursor;
      return resposta.status(200).json({ ciclo, ...resumo });
    } catch {
      return resposta.status(502).json({ erro: 'Falha no ciclo. Verifique a configuração, as tabelas do Supabase e a disponibilidade da Autocab.', ciclo });
    } finally {
      if (trava) {
        try { await banco.liberar(ciclo, cursor); } catch { console.error('Não foi possível liberar a trava; ela expira automaticamente.'); }
      }
    }
  };
}
export default criarRotaCron();
