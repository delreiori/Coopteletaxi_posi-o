import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPluginAutocab } from './core.mjs';

test('GPS usa PATCH, ln, Bearer e preserva horário da leitura', async () => {
  const plugin = criarPluginAutocab({ subscriptionKey: 'teste', obterTokenBearer: async () => 'token-teste',
    fetchImpl: async (url, requisicao) => {
      assert.equal(url, 'https://autocab-api.azure-api.net/driver/v1/updateVehicleLocation?vehicleId=123');
      assert.equal(requisicao.method, 'PATCH');
      assert.equal(requisicao.headers.Authorization, 'Bearer token-teste');
      assert.deepEqual(JSON.parse(requisicao.body), {
        coordinates: { lat: -22, ln: -43 }, vehicleSpeed: '30 KM/h', currentTimeAtLocation: '2026-10-16T12:00:00.000Z',
      });
      return new Response(null, { status: 202 });
    } });
  assert.equal((await plugin.atualizarLocalizacaoGps({ veiculoId: 123, latitude: -22, longitude: -43,
    velocidadeKmh: 30, horarioDaLeitura: '2026-10-16T09:00:00-03:00' })).status, 202);
});

test('plot exige posição e envia POST com payload explícito', async () => {
  const plugin = criarPluginAutocab({ subscriptionKey: 'teste', fetchImpl: async (url, requisicao) => {
    assert.ok(url.endsWith('/vehicles/123/plot'));
    assert.equal(requisicao.method, 'POST');
    assert.deepEqual(JSON.parse(requisicao.body), { vehicleId: 123, zoneId: 4, position: 9 });
    return new Response(null, { status: 204 });
  } });
  assert.throws(() => plugin.aplicarPlotVeiculo({ veiculoId: 123, zonaId: 4 }), /inválido/);
  await plugin.aplicarPlotVeiculo({ veiculoId: 123, zonaId: 4, posicaoNaFila: 9 });
});

test('erros HTTP são propagados sem repetir escrita', async () => {
  let quantidadeChamadas = 0;
  const plugin = criarPluginAutocab({ subscriptionKey: 'teste', fetchImpl: async () => {
    quantidadeChamadas++;
    return new Response('indisponível', { status: 503 });
  } });
  await assert.rejects(plugin.aplicarPlotVeiculo({ veiculoId: 1, zonaId: 2, posicaoNaFila: 3 }), { status: 503 });
  assert.equal(quantidadeChamadas, 1);
});

test('resposta inesperada de consulta não vira lista vazia', async () => {
  const plugin = criarPluginAutocab({ subscriptionKey: 'teste', fetchImpl: async () => new Response('{}') });
  await assert.rejects(plugin.consultarPosicoesGps(), /lista necessária/);
});
