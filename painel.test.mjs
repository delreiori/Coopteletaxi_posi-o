import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRotaPainel } from './api/painel.js';
import { criarBancoSupabase } from './server/supabase.mjs';
function respostaTeste() { return { setHeader() {}, status(valor) { this.codigo = valor; return this; }, json(valor) { this.corpo = valor; return this; } }; }
const ambiente = { PANEL_TOKEN: 'leitura', CRON_SECRET: 'cron', SUPABASE_URL: 'https://teste.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'privada' };
test('painel rejeita acesso sem token e segredo do cron quando token separado existe', async () => {
 for (const authorization of ['', 'Bearer cron']) {
  const resposta = respostaTeste();
  await criarRotaPainel({ ambiente, criarBanco: () => assert.fail() })({ method: 'GET', headers: { authorization } }, resposta);
  assert.equal(resposta.codigo, 401);
 }
});
test('painel retorna histórico sem chave nem identificador do dono da trava', async () => {
 const resposta = respostaTeste();
 await criarRotaPainel({ ambiente, criarBanco: () => ({ consultarEventos: async () => [{ resultado: 'confirmado' }], consultarEstado: async () => [{ expira: null }] }) })({ method: 'GET', headers: { authorization: 'Bearer leitura' } }, resposta);
 assert.equal(resposta.codigo, 200); assert.equal(resposta.corpo.eventos.length, 1);
 assert.equal(JSON.stringify(resposta.corpo).includes('privada'), false);
});
test('consultas Supabase usam GET limitado e não enviam corpo', async () => {
 const banco = criarBancoSupabase(ambiente, async (url, opcoes) => {
  assert.equal(opcoes.method, 'GET'); assert.equal(opcoes.body, undefined);
  assert.ok(url.includes('limit=500') || url.includes('select=expira,cursor_veiculo'));
  return new Response('[]');
 });
 await banco.consultarEventos(); await banco.consultarEstado();
});

test('URL incorreta retorna diagnóstico seguro antes de enviar credenciais', () => {
 assert.throws(() => criarBancoSupabase({ ...ambiente, SUPABASE_URL: 'postgresql://usuario:segredo@host/banco' }, () => assert.fail()), erro => erro.codigo === 'URL_INVALIDA' && !erro.message.includes('segredo'));
});
test('schema ausente identificado sem revelar resposta arbitrária', async () => {
 const banco = criarBancoSupabase(ambiente, async () => new Response(JSON.stringify({ code: 'PGRST202', message: 'dados privados' }), { status: 404 }));
 await assert.rejects(banco.adquirir('teste'), erro => erro.codigo === 'SCHEMA_AUSENTE' && !erro.message.includes('privados'));
});
