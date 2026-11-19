/**
 * Desafio: Campo minado 18 x 14 com 40 bombas.
 *
 * Toda a regra de negócio do jogo está neste arquivo, junto com os casos de
 * teste. Os testes simulam o jogo do começo ao fim: criação do tabuleiro,
 * primeiro clique, abertura em cascata, bandeiras, derrota e vitória.
 *
 * Coordenadas: (linha, coluna), começando em 0.
 * O tabuleiro tem 14 linhas por 18 colunas (18 de largura x 14 de altura).
 */

// ---------------------------------------------------------------------------
// Regras do jogo
// ---------------------------------------------------------------------------

const LINHAS = 14;
const COLUNAS = 18;
const BOMBAS = 40;

/** Gerador pseudoaleatório com semente (mulberry32), para partidas reproduzíveis. */
function criarAleatorio(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class CampoMinado {
  /**
   * @param {object} opcoes
   * @param {() => number} [opcoes.aleatorio] gerador usado no sorteio das bombas
   * @param {Array<[number, number]>} [opcoes.posicoesBombas] bombas fixas (para montar cenários)
   */
  constructor({ aleatorio = Math.random, posicoesBombas = null } = {}) {
    this.linhas = LINHAS;
    this.colunas = COLUNAS;
    this.totalBombas = BOMBAS;
    this.aleatorio = aleatorio;
    this.estado = 'jogando'; // 'jogando' | 'vitoria' | 'derrota'
    this.bombasPosicionadas = false;
    this.bandeiras = 0;
    this.celulasAbertas = 0;
    this.explosao = null;
    this.tabuleiro = Array.from({ length: LINHAS }, () =>
      Array.from({ length: COLUNAS }, () => ({
        bomba: false,
        aberta: false,
        bandeira: false,
        vizinhas: 0,
      })),
    );
    if (posicoesBombas) this._posicionarBombas(posicoesBombas);
  }

  get bombasRestantes() {
    return this.totalBombas - this.bandeiras;
  }

  get celulasSeguras() {
    return this.linhas * this.colunas - this.totalBombas;
  }

  dentro(l, c) {
    return Number.isInteger(l) && Number.isInteger(c) && l >= 0 && l < this.linhas && c >= 0 && c < this.colunas;
  }

  vizinhos(l, c) {
    const lista = [];
    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dl === 0 && dc === 0) continue;
        if (this.dentro(l + dl, c + dc)) lista.push([l + dl, c + dc]);
      }
    }
    return lista;
  }

  celula(l, c) {
    this._validarPosicao(l, c);
    return this.tabuleiro[l][c];
  }

  /** Abre uma célula. Retorna quantas células foram abertas nesta jogada. */
  abrir(l, c) {
    this._validarEmAndamento();
    this._validarPosicao(l, c);
    const cel = this.tabuleiro[l][c];
    if (cel.bandeira) throw new Error('Não é possível abrir uma célula com bandeira');
    if (!this.bombasPosicionadas) this._sortearBombas(l, c);
    if (cel.aberta) return 0;
    if (cel.bomba) {
      this._perder(l, c);
      return 0;
    }
    const abertas = this._abrirEmCascata(l, c);
    this._verificarVitoria();
    return abertas;
  }

  /** Coloca ou retira a bandeira de uma célula fechada. Retorna se ficou com bandeira. */
  alternarBandeira(l, c) {
    this._validarEmAndamento();
    this._validarPosicao(l, c);
    const cel = this.tabuleiro[l][c];
    if (cel.aberta) throw new Error('Não é possível marcar uma célula aberta');
    if (cel.bandeira) {
      cel.bandeira = false;
      this.bandeiras--;
    } else {
      // como no jogo clássico, não há limite: com bandeiras a mais, o contador fica negativo
      cel.bandeira = true;
      this.bandeiras++;
    }
    return cel.bandeira;
  }

  /**
   * Atalho: numa célula numérica aberta cujo número de bandeiras ao redor é igual
   * ao número dela, abre todos os vizinhos sem bandeira.
   */
  abrirVizinhas(l, c) {
    this._validarEmAndamento();
    this._validarPosicao(l, c);
    const cel = this.tabuleiro[l][c];
    if (!cel.aberta || cel.vizinhas === 0) {
      throw new Error('O atalho só vale para célula numérica já aberta');
    }
    const vizinhos = this.vizinhos(l, c);
    const bandeirasAoRedor = vizinhos.filter(([vl, vc]) => this.tabuleiro[vl][vc].bandeira).length;
    if (bandeirasAoRedor !== cel.vizinhas) {
      throw new Error('Quantidade de bandeiras ao redor não confere com o número da célula');
    }
    let abertas = 0;
    for (const [vl, vc] of vizinhos) {
      const viz = this.tabuleiro[vl][vc];
      if (viz.aberta || viz.bandeira) continue;
      if (viz.bomba) {
        this._perder(vl, vc);
        return abertas;
      }
      abertas += this._abrirEmCascata(vl, vc);
    }
    this._verificarVitoria();
    return abertas;
  }

  /** Mapa em texto: # fechada, F bandeira, * bomba, . vazia, 1-8 número. */
  visualizar() {
    return this.tabuleiro
      .map((linha) =>
        linha
          .map((cel) => {
            if (cel.bandeira && !(cel.aberta && cel.bomba)) return 'F';
            if (!cel.aberta) return '#';
            if (cel.bomba) return '*';
            return cel.vizinhas === 0 ? '.' : String(cel.vizinhas);
          })
          .join(''),
      )
      .join('\n');
  }

  _validarPosicao(l, c) {
    if (!this.dentro(l, c)) throw new Error(`Posição fora do tabuleiro: (${l}, ${c})`);
  }

  _validarEmAndamento() {
    if (this.estado !== 'jogando') throw new Error('O jogo já terminou');
  }

  _posicionarBombas(posicoes) {
    if (posicoes.length !== this.totalBombas) {
      throw new Error(`O tabuleiro precisa de exatamente ${this.totalBombas} bombas`);
    }
    const vistas = new Set();
    for (const [l, c] of posicoes) {
      this._validarPosicao(l, c);
      const chave = `${l},${c}`;
      if (vistas.has(chave)) throw new Error(`Bomba repetida em (${l}, ${c})`);
      vistas.add(chave);
      this.tabuleiro[l][c].bomba = true;
    }
    for (let l = 0; l < this.linhas; l++) {
      for (let c = 0; c < this.colunas; c++) {
        this.tabuleiro[l][c].vizinhas = this.vizinhos(l, c).filter(([vl, vc]) => this.tabuleiro[vl][vc].bomba).length;
      }
    }
    this.bombasPosicionadas = true;
  }

  /** O primeiro clique e seus vizinhos nunca recebem bomba. */
  _sortearBombas(lPrimeira, cPrimeira) {
    const protegidas = new Set(
      [[lPrimeira, cPrimeira], ...this.vizinhos(lPrimeira, cPrimeira)].map(([l, c]) => `${l},${c}`),
    );
    const candidatas = [];
    for (let l = 0; l < this.linhas; l++) {
      for (let c = 0; c < this.colunas; c++) {
        if (!protegidas.has(`${l},${c}`)) candidatas.push([l, c]);
      }
    }
    for (let i = 0; i < this.totalBombas; i++) {
      const j = i + Math.floor(this.aleatorio() * (candidatas.length - i));
      [candidatas[i], candidatas[j]] = [candidatas[j], candidatas[i]];
    }
    this._posicionarBombas(candidatas.slice(0, this.totalBombas));
  }

  _abrirEmCascata(l, c) {
    const pilha = [[l, c]];
    let abertas = 0;
    while (pilha.length) {
      const [al, ac] = pilha.pop();
      const cel = this.tabuleiro[al][ac];
      if (cel.aberta || cel.bandeira || cel.bomba) continue;
      cel.aberta = true;
      abertas++;
      this.celulasAbertas++;
      if (cel.vizinhas === 0) pilha.push(...this.vizinhos(al, ac));
    }
    return abertas;
  }

  _perder(l, c) {
    this.estado = 'derrota';
    this.explosao = { linha: l, coluna: c };
    for (const linha of this.tabuleiro) {
      for (const cel of linha) if (cel.bomba) cel.aberta = true;
    }
  }

  _verificarVitoria() {
    if (this.celulasAbertas !== this.celulasSeguras) return;
    this.estado = 'vitoria';
    for (const linha of this.tabuleiro) {
      for (const cel of linha) if (cel.bomba) cel.bandeira = true;
    }
    this.bandeiras = this.totalBombas;
  }
}

// ---------------------------------------------------------------------------
// Cenários fixos usados nos testes
// ---------------------------------------------------------------------------

/**
 * Parede: bombas na coluna 5 inteira (14) e nas colunas 15 e 16 das linhas 0 a 12 (26).
 * Total: 40. A parede impede a cascata de passar da coluna 4.
 */
function cenarioParede() {
  const bombas = [];
  for (let l = 0; l < LINHAS; l++) bombas.push([l, 5]);
  for (let l = 0; l <= 12; l++) bombas.push([l, 15], [l, 16]);
  return bombas;
}

/**
 * Faixa inferior: bombas nas linhas 12 e 13 inteiras (36) e nas colunas 0 a 3 da linha 11 (4).
 * Total: 40. Um clique no canto superior abre todas as células seguras de uma vez.
 */
function cenarioFaixaInferior() {
  const bombas = [];
  for (let c = 0; c < COLUNAS; c++) bombas.push([12, c], [13, c]);
  for (let c = 0; c <= 3; c++) bombas.push([11, c]);
  return bombas;
}

function contarBombas(jogo) {
  return jogo.tabuleiro.flat().filter((cel) => cel.bomba).length;
}

function abrirTodasAsSeguras(jogo) {
  for (let l = 0; l < LINHAS; l++) {
    for (let c = 0; c < COLUNAS; c++) {
      const cel = jogo.tabuleiro[l][c];
      if (jogo.estado === 'jogando' && !cel.bomba && !cel.aberta && !cel.bandeira) jogo.abrir(l, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Casos de teste
// ---------------------------------------------------------------------------

describe('Tabuleiro', () => {
  test('tem 14 linhas por 18 colunas, 252 células', () => {
    const jogo = new CampoMinado();
    expect(jogo.tabuleiro).toHaveLength(14);
    jogo.tabuleiro.forEach((linha) => expect(linha).toHaveLength(18));
    expect(jogo.tabuleiro.flat()).toHaveLength(252);
  });

  test('começa com todas as células fechadas, sem bandeira, e 40 bombas restantes', () => {
    const jogo = new CampoMinado();
    expect(jogo.tabuleiro.flat().every((cel) => !cel.aberta && !cel.bandeira)).toBe(true);
    expect(jogo.estado).toBe('jogando');
    expect(jogo.bombasRestantes).toBe(40);
    expect(jogo.celulasSeguras).toBe(212);
  });

  test('as bombas só são sorteadas no primeiro clique, e são exatamente 40', () => {
    const jogo = new CampoMinado({ aleatorio: criarAleatorio(7) });
    expect(contarBombas(jogo)).toBe(0);
    jogo.abrir(7, 9);
    expect(contarBombas(jogo)).toBe(40);
  });

  test('rejeita cenário com quantidade de bombas diferente de 40', () => {
    expect(() => new CampoMinado({ posicoesBombas: [[0, 0]] })).toThrow('exatamente 40 bombas');
    expect(() => new CampoMinado({ posicoesBombas: [...cenarioParede(), [13, 17]] })).toThrow('exatamente 40 bombas');
  });

  test('rejeita bomba repetida ou fora do tabuleiro', () => {
    const repetida = cenarioParede();
    repetida[39] = [0, 5];
    expect(() => new CampoMinado({ posicoesBombas: repetida })).toThrow('Bomba repetida');

    const fora = cenarioParede();
    fora[39] = [14, 0];
    expect(() => new CampoMinado({ posicoesBombas: fora })).toThrow('fora do tabuleiro');
  });

  test('canto tem 3 vizinhos, borda tem 5 e meio tem 8', () => {
    const jogo = new CampoMinado();
    expect(jogo.vizinhos(0, 0)).toHaveLength(3);
    expect(jogo.vizinhos(13, 17)).toHaveLength(3);
    expect(jogo.vizinhos(0, 9)).toHaveLength(5);
    expect(jogo.vizinhos(6, 0)).toHaveLength(5);
    expect(jogo.vizinhos(6, 9)).toHaveLength(8);
  });
});

describe('Primeiro clique', () => {
  test.each([1, 2, 3, 42, 99, 1234, 2026])('nunca é bomba nem tem bomba vizinha (semente %i)', (semente) => {
    const jogo = new CampoMinado({ aleatorio: criarAleatorio(semente) });
    jogo.abrir(0, 0);
    expect(jogo.estado).not.toBe('derrota');
    expect(jogo.celula(0, 0).bomba).toBe(false);
    expect(jogo.celula(0, 0).vizinhas).toBe(0);
    expect(jogo.celulasAbertas).toBeGreaterThan(1);
  });

  test('vale também para 200 partidas com clique no meio do tabuleiro', () => {
    for (let semente = 1; semente <= 200; semente++) {
      const jogo = new CampoMinado({ aleatorio: criarAleatorio(semente) });
      jogo.abrir(7, 9);
      expect(jogo.estado).not.toBe('derrota');
      expect(jogo.vizinhos(7, 9).some(([l, c]) => jogo.tabuleiro[l][c].bomba)).toBe(false);
      expect(contarBombas(jogo)).toBe(40);
    }
  });

  test('clique recusado em célula com bandeira não sorteia as bombas', () => {
    for (let semente = 1; semente <= 50; semente++) {
      const jogo = new CampoMinado({ aleatorio: criarAleatorio(semente) });
      jogo.alternarBandeira(0, 0);
      expect(() => jogo.abrir(0, 0)).toThrow('com bandeira');
      expect(contarBombas(jogo)).toBe(0);
      jogo.abrir(7, 9);
      expect(jogo.estado).not.toBe('derrota');
      expect(jogo.vizinhos(7, 9).some(([l, c]) => jogo.tabuleiro[l][c].bomba)).toBe(false);
    }
  });

  test('a mesma semente gera o mesmo tabuleiro', () => {
    const a = new CampoMinado({ aleatorio: criarAleatorio(55) });
    const b = new CampoMinado({ aleatorio: criarAleatorio(55) });
    a.abrir(3, 3);
    b.abrir(3, 3);
    const bombasDe = (jogo) => jogo.tabuleiro.flat().map((cel) => cel.bomba);
    expect(bombasDe(a)).toEqual(bombasDe(b));
  });
});

describe('Números das células', () => {
  test('cada número é a quantidade de bombas nas 8 vizinhas', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    expect(jogo.celula(0, 4).vizinhas).toBe(2); // (0,5) e (1,5)
    expect(jogo.celula(6, 4).vizinhas).toBe(3); // (5,5), (6,5) e (7,5)
    expect(jogo.celula(6, 6).vizinhas).toBe(3);
    expect(jogo.celula(6, 3).vizinhas).toBe(0);
    expect(jogo.celula(13, 16).vizinhas).toBe(2); // (12,15) e (12,16)
    expect(jogo.celula(13, 17).vizinhas).toBe(1); // (12,16)
  });

  test('em tabuleiro sorteado, todos os números conferem com as bombas', () => {
    const jogo = new CampoMinado({ aleatorio: criarAleatorio(321) });
    jogo.abrir(5, 5);
    for (let l = 0; l < LINHAS; l++) {
      for (let c = 0; c < COLUNAS; c++) {
        const esperado = jogo.vizinhos(l, c).filter(([vl, vc]) => jogo.tabuleiro[vl][vc].bomba).length;
        expect(jogo.tabuleiro[l][c].vizinhas).toBe(esperado);
      }
    }
  });
});

describe('Abrir célula', () => {
  test('célula numérica abre só ela mesma', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    expect(jogo.abrir(0, 4)).toBe(1);
    expect(jogo.celulasAbertas).toBe(1);
  });

  test('célula vazia abre em cascata até os números e para na parede de bombas', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    const abertas = jogo.abrir(0, 0);
    expect(abertas).toBe(14 * 5); // colunas 0 a 4 inteiras
    for (let l = 0; l < LINHAS; l++) {
      for (let c = 0; c <= 4; c++) expect(jogo.celula(l, c).aberta).toBe(true);
      for (let c = 5; c < COLUNAS; c++) expect(jogo.celula(l, c).aberta).toBe(false);
    }
    expect(jogo.estado).toBe('jogando');
  });

  test('abrir de novo uma célula aberta não muda nada', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(0, 4);
    expect(jogo.abrir(0, 4)).toBe(0);
    expect(jogo.celulasAbertas).toBe(1);
  });

  test('posição fora do tabuleiro é rejeitada', () => {
    const jogo = new CampoMinado();
    expect(() => jogo.abrir(-1, 0)).toThrow('fora do tabuleiro');
    expect(() => jogo.abrir(14, 0)).toThrow('fora do tabuleiro');
    expect(() => jogo.abrir(0, 18)).toThrow('fora do tabuleiro');
    expect(() => jogo.abrir(1.5, 2)).toThrow('fora do tabuleiro');
  });
});

describe('Bandeiras', () => {
  test('marca e desmarca, atualizando o contador de bombas restantes', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    expect(jogo.alternarBandeira(0, 5)).toBe(true);
    expect(jogo.bombasRestantes).toBe(39);
    expect(jogo.alternarBandeira(0, 5)).toBe(false);
    expect(jogo.bombasRestantes).toBe(40);
  });

  test('pode marcar bandeira antes do primeiro clique', () => {
    const jogo = new CampoMinado({ aleatorio: criarAleatorio(3) });
    jogo.alternarBandeira(13, 17);
    expect(jogo.bombasRestantes).toBe(39);
  });

  test('célula com bandeira não pode ser aberta', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.alternarBandeira(0, 5);
    expect(() => jogo.abrir(0, 5)).toThrow('com bandeira');
    expect(jogo.estado).toBe('jogando');
  });

  test('célula aberta não pode receber bandeira', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(0, 4);
    expect(() => jogo.alternarBandeira(0, 4)).toThrow('célula aberta');
  });

  test('o contador diminui com cada bandeira e fica negativo se houver bandeiras a mais', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    let colocadas = 0;
    for (let l = 0; l < LINHAS && colocadas < 41; l++) {
      for (let c = 6; c < 15 && colocadas < 41; c++) {
        jogo.alternarBandeira(l, c);
        colocadas++;
        if (colocadas === 40) expect(jogo.bombasRestantes).toBe(0);
      }
    }
    expect(jogo.bandeiras).toBe(41);
    expect(jogo.bombasRestantes).toBe(-1);
  });

  test('o contador mostra bandeiras, não bombas encontradas: bandeira errada também conta', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.alternarBandeira(0, 0); // célula segura
    expect(jogo.bombasRestantes).toBe(39);
    expect(contarBombas(jogo)).toBe(40);
  });

  test('a cascata não abre célula com bandeira', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.alternarBandeira(10, 2);
    jogo.abrir(0, 0);
    expect(jogo.celula(10, 2).aberta).toBe(false);
    expect(jogo.celula(10, 2).bandeira).toBe(true);
  });
});

describe('Atalho: abrir as vizinhas de um número', () => {
  test('com as bandeiras certas, abre os vizinhos sem bandeira', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(6, 4); // número 3
    jogo.alternarBandeira(5, 5);
    jogo.alternarBandeira(6, 5);
    jogo.alternarBandeira(7, 5);
    const abertas = jogo.abrirVizinhas(6, 4);
    expect(abertas).toBeGreaterThan(0);
    expect(jogo.celula(6, 3).aberta).toBe(true);
    expect(jogo.estado).toBe('jogando');
  });

  test('com bandeira no lugar errado, explode a bomba esquecida', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(6, 4);
    jogo.alternarBandeira(5, 5);
    jogo.alternarBandeira(6, 5);
    jogo.alternarBandeira(5, 3); // errada: a bomba (7,5) ficou sem bandeira
    jogo.abrirVizinhas(6, 4);
    expect(jogo.estado).toBe('derrota');
    expect(jogo.explosao).toEqual({ linha: 7, coluna: 5 });
  });

  test('é rejeitado se o número de bandeiras não bate com o número da célula', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(6, 4);
    jogo.alternarBandeira(5, 5);
    expect(() => jogo.abrirVizinhas(6, 4)).toThrow('não confere');
  });

  test('é rejeitado em célula fechada ou vazia', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    expect(() => jogo.abrirVizinhas(6, 4)).toThrow('célula numérica já aberta');
    jogo.abrir(0, 0);
    expect(() => jogo.abrirVizinhas(0, 0)).toThrow('célula numérica já aberta');
  });
});

describe('Derrota', () => {
  test('abrir uma bomba encerra o jogo e revela todas as bombas', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(0, 0);
    jogo.abrir(3, 5);
    expect(jogo.estado).toBe('derrota');
    expect(jogo.explosao).toEqual({ linha: 3, coluna: 5 });
    const bombas = jogo.tabuleiro.flat().filter((cel) => cel.bomba);
    expect(bombas).toHaveLength(40);
    expect(bombas.every((cel) => cel.aberta)).toBe(true);
  });

  test('depois da derrota nenhuma jogada é aceita', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(0, 5);
    expect(() => jogo.abrir(0, 0)).toThrow('O jogo já terminou');
    expect(() => jogo.alternarBandeira(0, 0)).toThrow('O jogo já terminou');
  });
});

describe('Vitória', () => {
  test('abrir todas as 212 células seguras vence e marca as bombas com bandeira', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    abrirTodasAsSeguras(jogo);
    expect(jogo.estado).toBe('vitoria');
    expect(jogo.celulasAbertas).toBe(212);
    expect(jogo.bombasRestantes).toBe(0);
    expect(jogo.tabuleiro.flat().filter((cel) => cel.bomba).every((cel) => cel.bandeira)).toBe(true);
  });

  test('uma única cascata pode vencer o jogo', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioFaixaInferior() });
    expect(jogo.abrir(0, 0)).toBe(212);
    expect(jogo.estado).toBe('vitoria');
  });

  test('não vence enquanto faltar uma célula segura', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.alternarBandeira(13, 15); // segura, mas marcada: fica para o fim
    abrirTodasAsSeguras(jogo);
    expect(jogo.estado).toBe('jogando');
    expect(jogo.celulasAbertas).toBe(211);
    jogo.alternarBandeira(13, 15);
    jogo.abrir(13, 15);
    expect(jogo.estado).toBe('vitoria');
  });

  test('depois da vitória nenhuma jogada é aceita', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioFaixaInferior() });
    jogo.abrir(0, 0);
    expect(() => jogo.abrir(12, 0)).toThrow('O jogo já terminou');
  });
});

describe('Partida simulada', () => {
  test('partida sorteada jogada até o fim por um jogador que só abre células seguras', () => {
    const jogo = new CampoMinado({ aleatorio: criarAleatorio(2026) });
    jogo.abrir(7, 9);
    // o jogador "sabe" onde estão as bombas e marca bandeira nelas antes de abrir o resto
    for (let l = 0; l < LINHAS; l++) {
      for (let c = 0; c < COLUNAS; c++) if (jogo.tabuleiro[l][c].bomba) jogo.alternarBandeira(l, c);
    }
    expect(jogo.bombasRestantes).toBe(0);
    abrirTodasAsSeguras(jogo);
    expect(jogo.estado).toBe('vitoria');
    expect(jogo.celulasAbertas).toBe(212);
  });

  test('o mapa em texto mostra o andamento da partida', () => {
    const jogo = new CampoMinado({ posicoesBombas: cenarioParede() });
    jogo.abrir(0, 0);
    jogo.alternarBandeira(0, 5);
    const linhas = jogo.visualizar().split('\n');
    expect(linhas).toHaveLength(14);
    expect(linhas[0]).toBe('....2F############');
    expect(linhas[6]).toBe('....3#############');
    expect(linhas[13]).toBe('....2#############');
  });
});
