-- Execute uma vez no SQL Editor do Supabase antes de ativar o cron.
create table if not exists public.autocab_cron (
  id integer primary key check (id = 1), dono uuid, expira timestamptz,
  cursor_veiculo bigint not null default 0
);
insert into public.autocab_cron(id) values (1) on conflict do nothing;
create table if not exists public.autocab_eventos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(), ciclo uuid not null,
  veiculo_id bigint, zona_anterior bigint, zona_destino bigint,
  posicao integer, resultado text not null, detalhe text
);
-- Um envio sem confirmação permanece bloqueado para evitar duplicação.
create unique index if not exists autocab_plot_pendente on public.autocab_eventos(veiculo_id)
where resultado = 'pendente';
alter table public.autocab_cron enable row level security;
alter table public.autocab_eventos enable row level security;
create or replace function public.adquirir_cron_autocab(dono uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare ultimo bigint;
begin
  update autocab_cron c set dono = $1, expira = now() + interval '360 seconds'
  where id = 1 and (expira is null or expira < now()) returning cursor_veiculo into ultimo;
  if not found then return null; end if;
  return jsonb_build_object('cursor', ultimo);
end $$;
create or replace function public.liberar_cron_autocab(dono uuid, proximo_cursor bigint) returns void
language sql security invoker set search_path = public as $$
  update autocab_cron c set dono = null, expira = null, cursor_veiculo = proximo_cursor
  where id = 1 and c.dono = $1;
$$;
create or replace function public.listar_plots_pendentes() returns setof public.autocab_eventos
language sql security invoker set search_path = public as $$
  select * from autocab_eventos where resultado = 'pendente';
$$;
create or replace function public.resolver_plot_autocab(veiculo bigint) returns void
language sql security invoker set search_path = public as $$
  update autocab_eventos set resultado = 'confirmado' where veiculo_id = veiculo and resultado = 'pendente';
$$;
revoke all on public.autocab_cron, public.autocab_eventos from anon, authenticated;
grant all on public.autocab_cron, public.autocab_eventos to service_role;
grant usage, select on sequence public.autocab_eventos_id_seq to service_role;
revoke all on function public.adquirir_cron_autocab(uuid), public.liberar_cron_autocab(uuid,bigint), public.listar_plots_pendentes(), public.resolver_plot_autocab(bigint) from public, anon, authenticated;
grant execute on function public.adquirir_cron_autocab(uuid), public.liberar_cron_autocab(uuid,bigint), public.listar_plots_pendentes(), public.resolver_plot_autocab(bigint) to service_role;
