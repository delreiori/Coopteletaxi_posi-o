import { timingSafeEqual } from 'node:crypto';
import { criarBancoSupabase, ErroSupabase } from '../server/supabase.mjs';

export function criarRotaPainel({ ambiente = process.env, criarBanco = criarBancoSupabase } = {}) {
  return async function painel(requisicao, resposta) {
    resposta.setHeader('Cache-Control', 'no-store');
    if (requisicao.method !== 'GET') {
      resposta.setHeader('Allow', 'GET');
      return resposta.status(405).json({ erro: 'Use GET' });
    }
    const segredo = ambiente.PANEL_TOKEN || ambiente.CRON_SECRET;
    if (!segredo) return resposta.status(503).json({ erro: 'Token do painel não configurado' });
    const esperado = Buffer.from(`Bearer ${segredo}`);
    const recebido = Buffer.from(typeof requisicao.headers.authorization === 'string' ? requisicao.headers.authorization : '');
    if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return resposta.status(401).json({ erro: 'Token inválido' });
    if (!ambiente.SUPABASE_URL || !ambiente.SUPABASE_SERVICE_ROLE_KEY) return resposta.status(503).json({ erro: 'Supabase não configurado' });
    try {
      const banco = criarBanco(ambiente);
      const [eventos, estados] = await Promise.all([banco.consultarEventos(), banco.consultarEstado()]);
      return resposta.status(200).json({ eventos, estado: estados[0] ?? null, consultadoEm: new Date().toISOString() });
    } catch (erro) {
      const detalhe = erro instanceof ErroSupabase ? { codigo: erro.codigo, erro: erro.message } : { codigo: 'PAINEL_FALHOU', erro: 'Não foi possível consultar o Supabase.' };
      console.error('Falha no painel', detalhe);
      return resposta.status(502).json(detalhe);
    }
  };
}
export default criarRotaPainel();
