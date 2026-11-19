# desafio_teste_campo_minado

Casos de teste em JavaScript (Jest) que simulam uma partida de **Campo minado**. Toda a regra de negócio do jogo está dentro do próprio arquivo de teste, [`campo_minado.test.js`](campo_minado.test.js): a partida acontece só pelos testes.

## Especificação do desafio

> Campo minado (by Laura)
> - casos de teste para testar campo minado de tabuleiro 18 x 14 com 40 bombas;
> - casos de teste em Javascript para testar Javascript.

## Regras implementadas

- Tabuleiro de 18 colunas por 14 linhas (252 células), com exatamente 40 bombas.
- As bombas são sorteadas no primeiro clique. A célula clicada e as 8 vizinhas dela nunca recebem bomba, então o primeiro clique sempre abre uma área.
- Cada célula segura mostra quantas bombas existem nas 8 vizinhas.
- Abrir uma célula vazia (número 0) abre as vizinhas em cascata, até chegar às células com número.
- Bandeira: só em célula fechada, e célula com bandeira não pode ser aberta. O contador mostra 40 menos as bandeiras colocadas. Como no jogo clássico, não há limite de bandeiras: com bandeiras a mais, o contador fica negativo.
- Atalho: numa célula numérica aberta com o mesmo número de bandeiras ao redor, abre todas as vizinhas sem bandeira. Se uma bandeira estiver errada, a bomba esquecida explode.
- Derrota: abrir uma bomba encerra o jogo e revela todas as bombas.
- Vitória: abrir as 212 células seguras. As bombas recebem bandeira automaticamente.
- Depois do fim, nenhuma jogada é aceita.

Coordenadas são `(linha, coluna)`, começando em 0.

## Como executar

Requer Node.js 18 ou superior.

```bash
npm install
npm test
```

## Funcionamento dos casos de teste

O arquivo tem três partes:

1. **Regras do jogo**: a classe `CampoMinado` e um gerador aleatório com semente (`criarAleatorio`), para que as partidas sorteadas sejam reproduzíveis.
2. **Cenários fixos**: tabuleiros com as 40 bombas em lugares conhecidos (`cenarioParede` e `cenarioFaixaInferior`), para testar cascata, números, derrota e vitória com resultado exato.
3. **Casos de teste**, agrupados assim:

| Grupo | O que verifica |
|---|---|
| Tabuleiro | Tamanho 18 x 14, estado inicial, 40 bombas sorteadas só no primeiro clique, cenários com bomba a mais, repetida ou fora do tabuleiro, quantidade de vizinhos de canto, borda e meio |
| Primeiro clique | Nunca é bomba nem tem bomba vizinha (várias sementes e 200 partidas), e a mesma semente gera o mesmo tabuleiro |
| Números das células | O número de cada célula confere com as bombas vizinhas, em cenário fixo e sorteado |
| Abrir célula | Célula numérica abre só ela, cascata para na parede de bombas, reabrir não muda nada, posição fora do tabuleiro é recusada |
| Bandeiras | Marcar e desmarcar, contador de bombas restantes, bandeira antes do primeiro clique, célula com bandeira não abre, célula aberta não recebe bandeira, contador negativo com bandeiras a mais, bandeira errada também conta no contador, cascata respeita bandeira |
| Atalho | Abre as vizinhas com as bandeiras certas, explode com bandeira errada, recusa quando o número de bandeiras não bate |
| Derrota | Bomba encerra o jogo, revela as bombas e bloqueia novas jogadas |
| Vitória | Abrir as 212 seguras vence, uma única cascata pode vencer, falta de uma célula impede a vitória, jogo bloqueado depois |
| Partida simulada | Partida sorteada jogada do primeiro clique até a vitória, e o mapa em texto do andamento |

Cada teste monta a própria partida, faz as jogadas e confere o estado do jogo (`jogando`, `vitoria` ou `derrota`), as células abertas e os erros das jogadas proibidas.

## Colaborador

- Filipe ([filipesgoncalves](https://github.com/filipesgoncalves))
