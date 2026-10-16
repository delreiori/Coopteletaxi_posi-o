let token = '';
let eventos = [];
let timer;
let controlador;
const elemento = id => document.getElementById(id);
const horario = valor => valor ? new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const nomes = { pendente: 'Aguardando confirmação', confirmado: 'Confirmado', erro: 'Erro', concluido: 'Concluído', parcial: 'Parcial' };
function resumoCiclo(evento) {
  try { return JSON.parse(evento?.detalhe || '{}'); } catch { return {}; }
}
function preencherTabela(id, linhas, colunas) {
  const tabela = elemento(id);
  tabela.replaceChildren();
  if (!linhas.length) {
    const celula = document.createElement('td');
    celula.colSpan = colunas;
    celula.textContent = 'Nenhum registro disponível.';
    const linha = document.createElement('tr'); linha.append(celula); tabela.append(linha);
  }
  for (const valores of linhas) {
    const linha = document.createElement('tr');
    for (const valor of valores) {
      const celula = document.createElement('td'); celula.textContent = valor ?? '—'; linha.append(celula);
    }
    tabela.append(linha);
  }
}
function mostrarEventos() {
  const filtro = elemento('filtro').value.trim();
  const alteracoes = eventos.filter(evento => evento.veiculo_id != null && (!filtro || String(evento.veiculo_id).includes(filtro)));
  preencherTabela('alteracoes', alteracoes.map(evento => [horario(evento.criado_em), evento.veiculo_id,
    `${evento.zona_anterior ?? '—'} → ${evento.zona_destino ?? '—'}`, evento.posicao, nomes[evento.resultado] || evento.resultado, evento.detalhe]), 6);
  const ciclos = eventos.filter(evento => evento.veiculo_id == null);
  preencherTabela('ciclos', ciclos.map(evento => {
    const resumo = resumoCiclo(evento);
    return [horario(evento.criado_em), resumo.verificados, resumo.enviados, resumo.erros, nomes[evento.resultado] || evento.resultado];
  }), 5);
  elemento('ultimo').textContent = horario(ciclos[0]?.criado_em);
  elemento('verificados').textContent = resumoCiclo(ciclos[0]).verificados ?? '—';
  elemento('confirmados').textContent = eventos.filter(evento => evento.resultado === 'confirmado').length;
  elemento('atencao').textContent = eventos.filter(evento => ['erro', 'pendente'].includes(evento.resultado)).length;
}
async function atualizar() {
  clearTimeout(timer);
  controlador = new AbortController();
  const requisicaoAtual = controlador;
  const timeout = setTimeout(() => requisicaoAtual.abort(), 15000);
  try {
    const resposta = await fetch('/api/painel', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: requisicaoAtual.signal });
    const tipo = resposta.headers.get('content-type') || '';
    if (!tipo.includes('application/json')) throw new Error(`Servidor retornou HTTP ${resposta.status} sem JSON. Verifique o deploy.`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || `HTTP ${resposta.status}`);
    if (controlador !== requisicaoAtual || !token) return;
    eventos = dados.eventos;
    mostrarEventos();
    const emExecucao = dados.estado?.expira && Date.parse(dados.estado.expira) > Date.now();
    elemento('mensagem').textContent = `${emExecucao ? 'Execução em andamento ou trava aguardando expiração' : 'Sem execução bloqueando o cron'} · painel atualizado ${horario(dados.consultadoEm)}`;
  } catch (erro) {
    if (controlador === requisicaoAtual && token) elemento('mensagem').textContent = `${erro.message}. Os dados exibidos podem estar desatualizados.`;
  } finally {
    clearTimeout(timeout);
    if (controlador === requisicaoAtual && token) timer = setTimeout(atualizar, 10000);
  }
}
elemento('acesso').addEventListener('submit', evento => {
  evento.preventDefault(); controlador?.abort(); clearTimeout(timer);
  token = elemento('token').value.trim(); elemento('token').value = '';
  elemento('sair').hidden = false; atualizar();
});
elemento('sair').addEventListener('click', () => {
  token = ''; controlador?.abort(); clearTimeout(timer); eventos = []; mostrarEventos();
  elemento('sair').hidden = true; elemento('mensagem').textContent = 'Desconectado.';
});
elemento('filtro').addEventListener('input', mostrarEventos);
mostrarEventos();
