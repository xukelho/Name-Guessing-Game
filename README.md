# Jogo de Adivinhar Nomes

Um pequeno jogo de navegador em que descobres **COELHO**, **MACHADO** e **MIGUEL**, uma letra de cada vez. Escolhe as letras pela ordem certa. Uma escolha errada apaga as letras descobertas nesse nível.

Antes de abrir o jogo, existe uma barreira de tempo. O desafio fica disponível em **25 de novembro de 2026, às 21:30 (hora de Lisboa)** e não tem data de encerramento nem limite de tempo durante a partida. A abertura é confirmada exclusivamente através de uma nova consulta HTTPS ao serviço [WorldTimeAPI](https://worldtimeapi.org/api/timezone/Etc/UTC); não depende do relógio do dispositivo nem guarda uma autorização local. Cada carregamento da página faz uma verificação nova.

O jogo usa HTML, CSS e JavaScript simples. Não precisa de servidor de aplicações, contas, som, compilação, chaves ou dependências instaladas. A consulta externa tem um limite de 10 segundos; se falhar, o jogo permanece bloqueado e tenta novamente 5 segundos depois de a tentativa terminar. Também é possível usar o botão **Tentar novamente**. Sem internet ou sem acesso do navegador ao serviço de hora, não há abertura offline. Como o site é estático, o código e as respostas continuam visíveis para quem descarregar os ficheiros; a barreira é uma funcionalidade de apresentação, não um mecanismo de segredo.

Quando uma verificação falha, a consola do navegador regista o motivo, a origem da página, o estado de rede, o acionador da tentativa, a duração e o estado HTTP quando existe resposta. Um `ERR_CONNECTION_RESET` sem estado HTTP indica que a ligação foi interrompida antes de o serviço responder; não é uma falha na leitura de `utc_datetime`.

O progresso só fica guardado enquanto a página está aberta; ao recarregá-la, o jogo começa no nível 1 depois de uma nova verificação de hora.

## Executar localmente

Abre o ficheiro `index.html` num navegador com acesso à internet e permissão para o navegador consultar o serviço de hora. Para executar os testes das regras locais, instala o Node.js e corre:

```sh
node --test game.test.js timegate.test.js
```

Os testes locais não precisam de internet porque usam respostas, relógios e agendadores controlados. Nesta cópia do trabalho, `timegate.test.js` ainda não foi criado porque os testes automatizados pertencem ao fluxo do Tester; o teste existente pode ser executado isoladamente com `node --test game.test.js`.

## Publicar com GitHub Pages

O site usa caminhos relativos para os ficheiros e pode ser servido a partir de um subdiretório do repositório. No repositório, abre **Settings > Pages**, escolhe **Deploy from a branch**, seleciona o ramo predefinido do repositório e `/(root)`, e guarda. O GitHub Pages serve HTML, CSS e JavaScript estáticos; não é necessário configurar um workflow nem uma ferramenta de compilação. Consulta a [introdução ao GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Não foi presumido nem verificado qual é o ramo predefinido do repositório ou o URL da publicação.

## Validação

`node --test game.test.js timegate.test.js` é o comando completo previsto para os testes das regras do jogo e da barreira de tempo. A consulta HTTPS ao serviço externo, a atualização da contagem decrescente, a recuperação de uma aba e a abertura confirmada devem ser verificadas a partir do URL real do GitHub Pages antes de publicar; essa validação de origem/CORS e frescura não foi feita nesta implementação. Também não foi feita uma verificação visual completa num navegador (partida, teclado, movimento reduzido e layout a 320 px), nem foi verificada a publicação no GitHub Pages.
