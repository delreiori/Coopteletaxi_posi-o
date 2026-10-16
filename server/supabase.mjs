export function criarBancoSupabase(ambiente, fetchImpl = fetch) {
  const base = ambiente.SUPABASE_URL.replace(/\/$/, '');
  async function requisitar(caminho, corpo, metodo = 'POST') {
    const resposta = await fetchImpl(`${base}/rest/v1/${caminho}`, {
      method: metodo, headers: { apikey: ambiente.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${ambiente.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!resposta.ok) throw new Error(`Supabase HTTP ${resposta.status}; verifique credenciais e schema.sql`);
    const texto = await resposta.text();
    return texto ? JSON.parse(texto) : null;
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
