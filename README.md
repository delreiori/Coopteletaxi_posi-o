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

Este repositório distribui o core, não um site ou serviço agendado. Não contém painel, banco de dados ou rotina automática. Para operar continuamente, importe o core no backend da aplicação e mantenha suas regras de seleção e registro. O workflow GitHub Actions executa somente testes locais, sem credenciais.
