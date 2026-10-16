# Core Autocab: GPS e plot

Módulo JavaScript ESM, Node.js 20.6+, sem dependências. Use no backend.
Não inicia rotinas automaticamente e não contém simulação ou credenciais.

```js
import { criarPluginAutocab } from './core.mjs';

const autocab = criarPluginAutocab({
  subscriptionKey: process.env.AUTOCAB_SUBSCRIPTION_KEY,
  obterTokenBearer: async () => process.env.AUTOCAB_DRIVER_BEARER_TOKEN,
});

const posicoesGps = await autocab.consultarPosicoesGps();
```

## Operações

- `consultarPosicoesGps()`: GET /vehicle/v1/vehiclegpsposition.
- `consultarEstadosVeiculos()`: GET /vehicle/v1/vehiclestatuses.
- `consultarVeiculos()`: GET /vehicle/v1/vehicles.
- `consultarZonas()`: GET /booking/v1/zones.
- `consultarZonaPorCoordenadas({ latitude, longitude, empresaId })`: GET /booking/v1/zone.
- `atualizarLocalizacaoGps({ veiculoId, latitude, longitude, velocidadeKmh, horarioDaLeitura })`: PATCH /driver/v1/updateVehicleLocation?vehicleId=….
- `aplicarPlotVeiculo({ veiculoId, zonaId, posicaoNaFila })`: POST /vehicle/v1/vehicles/{id}/plot.

IDs, coordenadas, velocidade e posição devem ser números. Horário deve ser ISO com fuso, correspondente à leitura GPS original. Longitude é enviada como `ln`, conforme o exemplo do driver.yaml fornecido.

As operações de escrita retornam `{ status, dados }`; sucesso HTTP indica aceite da API, não confirmação visual no mapa. A documentação prevê 202 para GPS. Não foi validada uma escrita na Autocab real.

## Integração

GPS exige uma fonte real e atualizada de coordenadas. Reenviar uma posição antiga da própria API não elimina atraso. Nunca substitua o horário de uma leitura antiga pela hora atual.

O driver.yaml documenta Authorization Bearer para o PATCH. A Subscription Key sozinha não deve ser presumida suficiente. Obtenha o token pelo fluxo autorizado da sua integração Autocab; o módulo aceita um callback para obtenção/renovação, mas não inventa um fluxo de autenticação.

O plot exige posição explícita na fila. Este é um cliente de endpoints: a rotina que o chama deve manter as regras existentes de punição, zonas protegidas, empresa e estado do veículo, e calcular a posição de destino antes de enviar. Não execute este módulo como um segundo agendador concorrente ao sistema existente.

Não há repetição automática de PATCH/POST: um timeout pode acontecer depois da aplicação da alteração. Consulte o estado antes de reenviar. Não há persistência neste módulo; utilize o banco e os logs do sistema que o integrar. Nenhuma mudança foi publicada na aplicação existente.

## Verificação local

`node --test core.test.mjs`

Os testes usam respostas locais e não alteram veículos reais.

## Início rápido

1. Use Node.js 22 ou superior.
2. Copie `.env.example` para `.env`.
3. Preencha `AUTOCAB_SUBSCRIPTION_KEY` no `.env` local.
4. Execute `npm run consultar` para verificar a consulta de GPS real.
5. Execute `npm test` para validar o módulo sem chamadas externas.

O comando de consulta só informa a quantidade de posições recebidas. Não envia plots nem atualizações GPS. A chave deve ter acesso aos endpoints da empresa desejada.

## Deploy na Vercel com Supabase

1. Execute `supabase/schema.sql` no SQL Editor do seu projeto Supabase.
2. Importe este repositório na Vercel usando Framework Preset **Other**, sem comando de build ou diretório de saída personalizados.
3. Cadastre em Production: `AUTOCAB_SUBSCRIPTION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e um `CRON_SECRET` longo e aleatório.
4. Faça o deploy de Production. O vercel.json agenda GET /api/cron a cada minuto (Vercel Pro). A Vercel envia automaticamente Authorization: Bearer com o CRON_SECRET.

Para agendador externo: GET `https://SEU-DOMINIO-DE-PRODUCAO/api/cron` com cabeçalho `Authorization: Bearer SEU_CRON_SECRET`. Não coloque o segredo na URL. Não precisa cadastrar um segundo cron se usar o da Vercel. Preview pode exigir autenticação adicional da Vercel e não recebe o cron de Production.

A rota executa plots reais: consulta veículos, estados, GPS e zonas; protege penalizados, NAK e FORA DE AREA; envia ocupados para a zona FORA DE AREA da mesma empresa quando ela é única; corrige os demais pela zona do GPS. Veículos sem empresa, estado ou dados suficientes são ignorados. Revalida o estado antes do envio e posiciona no fim da fila. Examina todos os estados retornados, com continuação persistente quando se aproxima do limite de tempo. Não garante incluir motoristas ausentes na resposta da Autocab.

Os eventos ficam em `autocab_eventos` no Supabase. `pendente` é gravado antes do POST e só vira `confirmado` ao observar a zona de destino. Uma pendência impede reenvio automático; se permanecer, verifique a Autocab antes de resolver manualmente o registro. A confirmação é de zona, não da permanência da posição na fila. A trava global expira em 360 segundos e a função tem duração máxima de 300 segundos. Use um projeto Supabase dedicado por integração.

O cron NÃO chama o PATCH de GPS: precisa de coordenadas novas e Bearer para isso. Ele corrige o plot com o GPS disponível. Não há painel web neste repositório. A raiz do site pode retornar 404; a rota publicada é /api/cron. Ao abri-la sem o segredo, o esperado é 401 JSON.

Códigos: 405 método inválido; 401 sem autorização; 503 configuração incompleta; 502 falha no ciclo; 200 com contadores ou ciclo ignorado por concorrência. Erros por veículo aparecem no contador `erros` e nos registros; não interrompem os demais quando o banco está disponível.

Testes locais usam serviços simulados, sem alterar veículos reais. O SQL precisa ser aplicado e a conexão de produção verificada no seu ambiente.
