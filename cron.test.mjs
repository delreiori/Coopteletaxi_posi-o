import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRotaCron } from './api/cron.js';
import { executarCiclo, escolherDestino } from './server/ciclo.mjs';
function respostaTeste() { return { setHeader() {}, status(valor) { this.codigo = valor; return this; }, json(valor) { this.corpo = valor; return this; } }; }
const ambiente = { CRON_SECRET: 'segredo', SUPABASE_URL: 'https://teste.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'teste', AUTOCAB_SUBSCRIPTION_KEY: 'teste' };
test('bloqueia chamada sem segredo sem acessar serviços', async () => {
 const resposta = respostaTeste();
 await criarRotaCron({ ambiente, criarBanco: () => { throw new Error('não chamar'); } })({ method: 'GET', headers: {} }, resposta);
 assert.equal(resposta.codigo, 401);
});
test('não executa ciclo concorrente', async () => {
 const resposta = respostaTeste();
 await criarRotaCron({ ambiente, criarBanco: () => ({ adquirir: async () => null }), executar: () => assert.fail() })({ method: 'GET', headers: { authorization: 'Bearer segredo' } }, resposta);
 assert.equal(resposta.corpo.estado, 'ignorado');
});
test('libera trava após falha e devolve JSON', async () => {
 let liberou = false;
 const resposta = respostaTeste();
 await criarRotaCron({ ambiente, criarBanco: () => ({ adquirir: async () => ({ cursor: 5 }), liberar: async () => { liberou = true; } }), criarApi: () => ({}), executar: async () => { throw new Error(); } })({ method: 'GET', headers: { authorization: 'Bearer segredo' } }, resposta);
 assert.equal(resposta.codigo, 502); assert.equal(liberou, true);
});
const zonas = [{ id: 1, companyId: 1, name: 'Centro' }, { id: 2, companyId: 1, name: 'Estação' }, { id: 3, companyId: 1, name: 'NAK' }];
test('protege veículo penalizado e zona protegida', async () => {
 const api = { consultarZonaPorCoordenadas: () => assert.fail() };
 assert.equal(await escolherDestino(api, { penalty: {}, zoneId: 1, vehicleStatusType: 'Free' }, { companyId: 1 }, zonas, {}), null);
 assert.equal(await escolherDestino(api, { zoneId: 3, vehicleStatusType: 'Free' }, { companyId: 1 }, zonas, {}), null);
});
test('registra antes de enviar, confirma e continua após erro de outro veículo', async () => {
 const eventos = []; const enviados = []; let confirmado = false;
 const estados = [{ id: 1, zoneId: 1, vehicleStatusType: 'Free' }, { id: 2, zoneId: 1, vehicleStatusType: 'Free' }];
 const api = {
 consultarEstadosVeiculos: async () => estados,
 consultarVeiculos: async () => [{ id: 1, companyId: 1 }, { id: 2, companyId: 1 }],
 consultarZonas: async () => zonas,
 consultarPosicoesGps: async () => [{ id: 1, location: { latitude: 1, longitude: 1 } }, { id: 2, location: { latitude: 2, longitude: 2 } }],
 consultarZonaPorCoordenadas: async ({ latitude }) => { if (latitude === 1) throw new Error(); return { id: 2 }; },
 aplicarPlotVeiculo: async (plot) => { assert.equal(eventos.at(-1).resultado, 'pendente'); enviados.push(plot); estados[1].zoneId = 2; },
 };
 const banco = { pendentes: async () => [], registrar: async evento => eventos.push(evento), resolver: async () => { confirmado = true; } };
 const resumo = await executarCiclo({ api, banco, ciclo: 'teste' });
 assert.equal(resumo.verificados, 2); assert.equal(resumo.erros, 1); assert.equal(enviados.length, 1); assert.equal(confirmado, true);
});
test('plot pendente impede reenvio', async () => {
 const api = { consultarEstadosVeiculos: async () => [{ id: 1, zoneId: 1 }], consultarVeiculos: async () => [], consultarZonas: async () => [], consultarPosicoesGps: async () => [], aplicarPlotVeiculo: () => assert.fail() };
 const banco = { pendentes: async () => [{ veiculo_id: 1, zona_destino: 2 }], registrar: async () => {} };
 assert.equal((await executarCiclo({ api, banco, ciclo: 'teste' })).enviados, 0);
});

test('segunda passagem inicia em 30 segundos e mantém a trava', async () => {
 let tempo = 0; let liberou = false; const inicios = []; const cursores = [];
 const resposta = respostaTeste();
 await criarRotaCron({ ambiente, agora: () => tempo, esperar: async ms => { tempo += ms; },
 criarBanco: () => ({ adquirir: async () => ({ cursor: 0 }), liberar: async () => { liberou = true; } }),
 criarApi: () => ({}), executar: async ({ cursor, prazoFinal }) => {
  assert.equal(liberou, false); assert.equal(prazoFinal, 220000);
  inicios.push(tempo); cursores.push(cursor); tempo += 5000;
  return { cursor: 12, verificados: 12 };
 } })({ method: 'GET', headers: { authorization: 'Bearer segredo' } }, resposta);
 assert.deepEqual(inicios, [0, 30000]); assert.deepEqual(cursores, [0, 12]);
 assert.equal(liberou, true); assert.equal(resposta.corpo.ciclos.length, 2);
 assert.notEqual(resposta.corpo.ciclos[0].ciclo, resposta.corpo.ciclos[1].ciclo);
});

test('passagem lenta não dispara segundo ciclo', async () => {
 let tempo = 0;
 const resposta = respostaTeste();
 await criarRotaCron({ ambiente, agora: () => tempo, esperar: async () => assert.fail(),
 criarBanco: () => ({ adquirir: async () => ({ cursor: 0 }), liberar: async () => {} }),
 criarApi: () => ({}), executar: async () => { tempo = 31000; return { cursor: 1 }; }
 })({ method: 'GET', headers: { authorization: 'Bearer segredo' } }, resposta);
 assert.equal(resposta.corpo.ciclos.length, 1);
});
