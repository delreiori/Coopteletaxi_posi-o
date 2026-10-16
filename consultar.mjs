import { criarPluginAutocab } from './core.mjs';

async function mostrarQuantidadeDePosicoes() {
  const autocab = criarPluginAutocab({
    subscriptionKey: process.env.AUTOCAB_SUBSCRIPTION_KEY,
  });
  const posicoesGps = await autocab.consultarPosicoesGps();
  console.log(`Posições GPS recebidas: ${posicoesGps.length}`);
}

mostrarQuantidadeDePosicoes().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
