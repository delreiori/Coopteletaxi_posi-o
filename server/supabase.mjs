export function criarBancoSupabase(ambiente, fetchImpl = fetch) {
  const base = ambiente.SUPABASE_URL.replace(/\/$/, '');
  async function requisitar(caminho, corpo) {
    const resposta = await fetchImpl(`${base}/rest/v1/${caminho}`, {
      method: 'POST', headers: { apikey: ambiente.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${ambiente.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!resposta.ok) throw new Error(`Supabase HTTP ${resposta.status}; verifique credenciais e schema.sql`);
    const texto = await resposta.text();
    return texto ? JSON.parse(texto) : null;
  }
  return {
    adquirir: (dono) => requisitar('rpc/adquirir_cron_autocab', { dono }),
    liberar: (dono, cursor) => requisitar('rpc/liberar_cron_autocab', { dono, proximo_cursor: cursor }),
    registrar: (registro) => requisitar('autocab_eventos', registro),
    pendentes: () => requisitar('rpc/listar_plots_pendentes', {}),
    resolver: (veiculoId) => requisitar('rpc/resolver_plot_autocab', { veiculo: veiculoId }),
  };
}
