function normalizarNome(nome) {
  return String(nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}
function zonaProtegida(zona) {
  return /NAK|FORA DE AREA/.test(normalizarNome(zona.name ?? zona.descriptor));
}
function ocupado(estado) { return /busy|ocupad/i.test(estado.vehicleStatusType ?? ''); }

export async function escolherDestino(api, estado, veiculo, zonas, gps) {
  if (estado.penalty != null || estado.zoneId == null || !estado.vehicleStatusType) return null;
  const empresaId = Number(veiculo?.companyId);
  if (!Number.isInteger(empresaId) || empresaId <= 0) return null;
  const zonasEmpresa = zonas.filter(zona => Number(zona.companyId) === empresaId);
  const atual = zonasEmpresa.find(zona => Number(zona.id) === Number(estado.zoneId));
  if (!atual) return null;
  const zonasFora = zonasEmpresa.filter(zona => normalizarNome(zona.name ?? zona.descriptor) === 'FORA DE AREA');
  if (ocupado(estado)) {
    return !zonaProtegida(atual) && zonasFora.length === 1 ? zonasFora[0] : null;
  }
  if (zonaProtegida(atual) && normalizarNome(atual.name ?? atual.descriptor) !== 'FORA DE AREA') return null;
  const latitude = gps?.location?.latitude;
  const longitude = gps?.location?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) return null;
  const encontrada = await api.consultarZonaPorCoordenadas({ latitude, longitude, empresaId });
  const destino = zonasEmpresa.find(zona => Number(zona.id) === Number(encontrada?.id));
  return destino && !zonaProtegida(destino) && Number(destino.id) !== Number(atual.id) ? destino : null;
}

export function calcularFimFila(estados, zonaId) {
  const fila = estados.filter(estado => Number(estado.zoneId) === zonaId);
  return Math.max(fila.length, ...fila.map(estado => Number(estado.queuePosition) || 0), 0) + 1;
}

async function corrigirVeiculo(api, banco, ciclo, estado, veiculos, zonas, posicoes, pendentes) {
  const veiculoId = Number(estado.id);
  const pendente = pendentes.find(registro => Number(registro.veiculo_id) === veiculoId);
  if (pendente) {
    if (Number(estado.zoneId) === Number(pendente.zona_destino)) await banco.resolver(veiculoId);
    return false;
  }
  const veiculo = veiculos.find(item => Number(item.id) === veiculoId);
  const gps = posicoes.find(item => Number(item.id ?? item.vehicleId) === veiculoId);
  const destino = await escolherDestino(api, estado, veiculo, zonas, gps);
  if (!destino) return false;
  const estadosRecentes = await api.consultarEstadosVeiculos();
  const recente = estadosRecentes.find(item => Number(item.id) === veiculoId);
  if (!recente || Number(recente.zoneId) !== Number(estado.zoneId) || recente.penalty != null || recente.vehicleStatusType !== estado.vehicleStatusType) return false;
  const zonaId = Number(destino.id);
  const posicao = calcularFimFila(estadosRecentes, zonaId);
  await banco.registrar({ ciclo, veiculo_id: veiculoId, zona_anterior: Number(estado.zoneId), zona_destino: zonaId, posicao, resultado: 'pendente' });
  // Sem retry: se o envio falhar ou a confirmação não chegar, mantém bloqueio persistente.
  await api.aplicarPlotVeiculo({ veiculoId, zonaId, posicaoNaFila: posicao });
  const confirmados = await api.consultarEstadosVeiculos();
  if (confirmados.some(item => Number(item.id) === veiculoId && Number(item.zoneId) === zonaId)) await banco.resolver(veiculoId);
  return true;
}

export async function executarCiclo({ api, banco, ciclo, cursor = 0, agora = Date.now }) {
  const limite = agora() + 220000;
  const [estados, veiculos, zonas, posicoes, pendentes] = await Promise.all([
    api.consultarEstadosVeiculos(), api.consultarVeiculos(), api.consultarZonas(), api.consultarPosicoesGps(), banco.pendentes(),
  ]);
  const ordenados = [...estados].sort((primeiro, segundo) => Number(primeiro.id) - Number(segundo.id));
  const fila = [...ordenados.filter(item => Number(item.id) > cursor), ...ordenados.filter(item => Number(item.id) <= cursor)];
  const resumo = { verificados: 0, enviados: 0, erros: 0, parcial: false, cursor };
  for (const estado of fila) {
    if (agora() >= limite) { resumo.parcial = true; break; }
    try {
      if (await corrigirVeiculo(api, banco, ciclo, estado, veiculos, zonas, posicoes, pendentes)) resumo.enviados++;
    } catch {
      resumo.erros++;
      await banco.registrar({ ciclo, veiculo_id: Number(estado.id), resultado: 'erro', detalhe: 'Falha na consulta, envio ou confirmação; confira pendências antes de reenviar.' });
    }
    resumo.verificados++;
    resumo.cursor = Number(estado.id);
  }
  await banco.registrar({ ciclo, resultado: resumo.parcial ? 'parcial' : 'concluido', detalhe: JSON.stringify(resumo) });
  return resumo;
}
