# Jogo de Adivinhar Nomes

Um pequeno jogo de navegador em que descobres **COELHO**, **MACHADO** e **MIGUEL**, uma letra de cada vez. Escolhe as letras pela ordem certa. Uma escolha errada apaga as letras descobertas nesse nível.

O jogo usa HTML, CSS e JavaScript simples. Não precisa de servidor de aplicações, contas, som, compilação nem dependências externas. O progresso só fica guardado enquanto a página está aberta; ao recarregá-la, o jogo começa no nível 1.

## Executar localmente

Abre o ficheiro `index.html` num navegador. Para executar os testes das regras, instala o Node.js e corre:

```sh
node --test game.test.js
```

## Publicar com GitHub Pages

O site usa caminhos relativos para os ficheiros e pode ser servido a partir de um subdiretório do repositório. No repositório, abre **Settings > Pages**, escolhe **Deploy from a branch**, seleciona o ramo predefinido do repositório e `/(root)`, e guarda. O GitHub Pages serve HTML, CSS e JavaScript estáticos; não é necessário configurar um workflow nem uma ferramenta de compilação. Consulta a [introdução ao GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Não foi presumido nem verificado qual é o ramo predefinido do repositório ou o URL da publicação.

## Validação

`node --test game.test.js` executa os testes das regras do jogo. A página e os dois ficheiros locais foram servidos com resposta HTTP 200 por um servidor estático local. Não foi possível verificar o jogo visualmente num navegador (partida completa, teclado, movimento reduzido e layout a 320 px), porque não havia um navegador ligado durante a implementação. A publicação no GitHub Pages também não foi verificada.
