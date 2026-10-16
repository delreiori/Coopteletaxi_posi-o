// Node.js 20+. Execute no backend: nunca exponha credenciais no navegador.
function validarNumero(valor, nome, minimo, maximo) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new TypeError(`${nome} inválido`);
  }
}

function validarId(valor, nome) {
  validarNumero(valor, nome, 1, 2147483647);
  if (!Number.isInteger(valor)) throw new TypeError(`${nome} deve ser inteiro`);
}

function validarCoordenadas(latitude, longitude) {
  validarNumero(latitude, 'latitude', -90, 90);
  validarNumero(longitude, 'longitude', -180, 180);
}

export function criarPluginAutocab({ subscriptionKey, obterTokenBearer, timeoutMs = 15000, fetchImpl = globalThis.fetch }) {
  if (typeof subscriptionKey !== 'string' || !subscriptionKey.trim()) {
    throw new Error('Subscription Key ausente');
  }
  validarNumero(timeoutMs, 'timeoutMs', 1, 300000);

  async function solicitarApi(caminho, metodo = 'GET', corpo, tokenBearer) {
    const headers = { 'Ocp-Apim-Subscription-Key': subscriptionKey, Accept: 'application/json' };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (tokenBearer) headers.Authorization = `Bearer ${tokenBearer}`;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const resposta = await fetchImpl(`https://autocab-api.azure-api.net${caminho}`, {
        method: metodo, headers, redirect: 'error', signal: controlador.signal,
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
      const texto = await resposta.text();
      if (!resposta.ok) {
        const erro = new Error(`Autocab respondeu HTTP ${resposta.status} em ${metodo} ${caminho.split('?')[0]}`);
        erro.status = resposta.status;
        throw erro;
      }
      let dados = texto || null;
      if (texto) { try { dados = JSON.parse(texto); } catch { /* Alguns comandos retornam texto. */ } }
      return { status: resposta.status, dados };
    } finally {
      clearTimeout(temporizador);
    }
  }

  async function consultarLista(caminho) {
    const { dados } = await solicitarApi(caminho);
    if (!Array.isArray(dados)) throw new Error(`Resposta inesperada em ${caminho}: lista necessária`);
    return dados;
  }

  function consultarPosicoesGps() {
    return consultarLista('/vehicle/v1/vehiclegpsposition');
  }

  function consultarEstadosVeiculos() {
    return consultarLista('/vehicle/v1/vehiclestatuses');
  }

  function consultarVeiculos() {
    return consultarLista('/vehicle/v1/vehicles');
  }

  function consultarZonas() {
    return consultarLista('/booking/v1/zones');
  }

  async function consultarZonaPorCoordenadas({ latitude, longitude, empresaId }) {
    validarCoordenadas(latitude, longitude);
    validarId(empresaId, 'empresaId');
    const parametros = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), companyId: String(empresaId) });
    const { dados } = await solicitarApi(`/booking/v1/zone?${parametros}`);
    return dados;
  }

  async function atualizarLocalizacaoGps({ veiculoId, latitude, longitude, velocidadeKmh, horarioDaLeitura }) {
    validarId(veiculoId, 'veiculoId');
    validarCoordenadas(latitude, longitude);
    validarNumero(velocidadeKmh, 'velocidadeKmh', 0, 500);
    if (typeof horarioDaLeitura !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(horarioDaLeitura) || !Number.isFinite(Date.parse(horarioDaLeitura))) {
      throw new TypeError('horarioDaLeitura deve ser uma data ISO com fuso da leitura GPS real');
    }
    if (typeof obterTokenBearer !== 'function') throw new Error('Configure obterTokenBearer para atualizar GPS');
    const tokenBearer = await obterTokenBearer();
    if (typeof tokenBearer !== 'string' || !tokenBearer.trim()) throw new Error('Token Bearer ausente');
    return solicitarApi(`/driver/v1/updateVehicleLocation?vehicleId=${veiculoId}`, 'PATCH', {
      coordinates: { lat: latitude, ln: longitude },
      vehicleSpeed: `${velocidadeKmh} KM/h`,
      currentTimeAtLocation: new Date(horarioDaLeitura).toISOString(),
    }, tokenBearer);
  }

  function aplicarPlotVeiculo({ veiculoId, zonaId, posicaoNaFila }) {
    validarId(veiculoId, 'veiculoId');
    validarId(zonaId, 'zonaId');
    validarId(posicaoNaFila, 'posicaoNaFila');
    return solicitarApi(`/vehicle/v1/vehicles/${veiculoId}/plot`, 'POST', {
      vehicleId: veiculoId, zoneId: zonaId, position: posicaoNaFila,
    });
  }

  return Object.freeze({ consultarPosicoesGps, consultarEstadosVeiculos, consultarVeiculos,
    consultarZonas, consultarZonaPorCoordenadas, atualizarLocalizacaoGps, aplicarPlotVeiculo });
}
