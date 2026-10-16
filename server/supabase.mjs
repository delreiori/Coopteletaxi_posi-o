export class ErroSupabase extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}
function falhaSupabase(codigo, mensagem) { return new ErroSupabase(codigo, mensagem); }

export function criarBancoSupabase(ambiente, fetchImpl = fetch) {
  let url;
  try { url = new URL(ambiente.SUPABASE_URL.trim()); } catch {
    throw falhaSupabase('URL_INVALIDA', 'SUPABASE_URL deve ser a Project URL HTTPS, não a conexão PostgreSQL nem a URL do dashboard.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw falhaSupabase('URL_INVALIDA', 'Use em SUPABASE_URL somente a Project URL HTTPS do Supabase, sem caminhos ou credenciais.');
  }
  const base = url.origin;
  const chave = ambiente.SUPABASE_SERVICE_ROLE_KEY.trim();
  if (!chave || /[\r\n]/.test(chave)) throw falhaSupabase('CHAVE_INVALIDA', 'A chave do Supabase está vazia ou contém quebras de linha.');
  async function requisitar(caminho, corpo, metodo = 'POST') {
    let resposta;
    try { resposta = await fetchImpl(`${base}/rest/v1/${caminho}`, {
      method: metodo, headers: { apikey: chave,
        Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    } catch {
      throw falhaSupabase('CONEXAO', 'Não foi possível conectar ao Supabase. Confira a Project URL, a disponibilidade do projeto e a rede.');
    }
    if (!resposta.ok) {
      let codigo;
      try { codigo = (await resposta.json()).code; } catch {}
      if (['42P01', 'PGRST202', 'PGRST205'].includes(codigo)) throw falhaSupabase('SCHEMA_AUSENTE', 'Tabela ou função ausente: execute supabase/schema.sql no mesmo projeto usado pela Vercel.');
      if (resposta.status === 401 || resposta.status === 403 || codigo === '42501') throw falhaSupabase('ACESSO_NEGADO', 'Supabase recusou acesso: confira a chave de backend service_role/secret e as permissões do schema.sql.');
      throw falhaSupabase('HTTP_' + resposta.status, `Supabase respondeu HTTP ${resposta.status}. Confira o projeto e as funções do banco.`);
    }
    const texto = await resposta.text();
    try { return texto ? JSON.parse(texto) : null; } catch { throw falhaSupabase('RESPOSTA_INVALIDA', 'Supabase retornou uma resposta que não é JSON. Confira a Project URL.'); }
  }
  return {
    consultarEventos: () => requisitar('autocab_eventos?select=*&order=criado_em.desc,id.desc&limit=500', undefined, 'GET'),
    consultarEstado: () => requisitar('autocab_cron?select=expira,cursor_veiculo&id=eq.1', undefined, 'GET'),
    adquirir: (dono) => requisitar('rpc/adquirir_cron_autocab', { dono }),
    liberar: (dono, cursor) => requisitar('rpc/liberar_cron_autocab', { dono, proximo_cursor: cursor }),
    registrar: (registro) => requisitar('autocab_eventos', registro),
    pendentes: () => requisitar('rpc/listar_plots_pendentes', {}),
    resolver: (veiculoId) => requisitar('rpc/resolver_plot_autocab', { veiculo: veiculoId }),
  };
}
