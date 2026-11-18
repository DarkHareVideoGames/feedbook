# 404 Arcade — issue #191

## Entrega

Jogo extraído de `/home/noct2600/feedbook/src/NotFoundPage.tsx` para `/home/noct2600/feedbook/src/components/ArcadeGame.tsx`. Área máxima 760×280 px (antes 600×200), responsiva, obstáculos gerados na largura real em vez de 600 px fixos. Velocidade 300→440 px/s até 600 pontos; intervalo mínimo 1,25→0,85 s mais 0–0,3 s aleatórios. Velocidade reduzida em ecrãs estreitos. Salto mais curto e obstáculos de 30×50 px. Teclas só atuam com foco no campo de jogo; botão de salto para toque. Nós de obstáculos reutilizados em vez de recriar HTML e imagens por frame.

Top 10 global, pontuação descendente/desempate por data ascendente. Nicks de 3–12 caracteres A–Z/0–9/_/-, convertidos em maiúsculas. React apresenta texto, nunca HTML do nick. Formulário opcional após game over, sem bloquear recomeço. Textos novos em PT-PT/inglês. Textos antigos da página 404 não alterados.

## Ativação — operação manual, não realizada

1. Rever e executar `/home/noct2600/feedbook/supabase_migration_arcade_scores.sql` primeiro num Supabase de teste.
2. Confirmar no servidor `SUPABASE_URL` (ou `VITE_SUPABASE_URL`) e **`SUPABASE_SERVICE_ROLE_KEY`**, conforme integrações existentes. Nunca criar `VITE_SUPABASE_SERVICE_ROLE_KEY` nem copiar chaves para o frontend.
3. Vercel usa `/home/noct2600/feedbook/api/arcade.js`. Express espelha `/api/arcade`; desenvolvimento usa o proxy Vite existente para porta 4000.
4. Testar partida/guardar/recarregar/outro browser e verificar o ranking comum. Sem migração/configuração: ranking indisponível, mas o jogo funciona.

Não houve migração remota, deploy nem escrita em base de dados real durante a implementação.

## Segurança e limites

- Leitura apenas de nick/score; tabelas sem acesso anon/authenticated, RLS ativa e RPC executável apenas por service_role.
- Sessão assinada, validade de uma hora, pontuação inteira positiva limitada pelo tempo decorrido a 10 pontos/s e máximo 36000; UUID único impede reenvio da mesma partida.
- Cinco gravações por minuto por hash HMAC do endereço de ligação, protegidas por lock transacional na RPC. IP original não é guardado; o hash é pseudónimo, não se deve considerar dado anónimo. Em Express atrás de proxy partilhado o limite pode agrupar visitantes; não confiar em headers externos sem configurar uma fronteira de confiança.
- Ranking casual: não há simulação autoritativa de colisões, autenticação, reserva de nick, moderação automática ou proteção distribuída contra bots. Esperar antes de enviar pode contornar a plausibilidade; não usar para prémios/competição. Aplicar limites de infraestrutura se necessário.
- Nicks são públicos; aviso para não usar dados pessoais. Para remover abusos, operador autorizado elimina entradas no Supabase. Há uma linha por partida guardada, não apenas por nick. Não há limpeza automática: definir retenção e manutenção antes de exposição prolongada; preservar duplicados por uma hora para manter a proteção de replay durante a validade dos tokens.

## Verificações

### Espaçamento e contorno dos obstáculos

Botão de regresso afastado 18 px do ranking (antes 6 px). Removidas borda e sombra amarelas dos amplificadores; imagem com fundo transparente e bloco neutro apenas quando a imagem falha. Preview de produção: sem scroll a 320×568, 390×844, 1440×900 e 844×390; gap medido de 18 px no game over; imagem carregada com borda 0 e sombra none. A primeira tentativa em dev tinha uma resposta CSS vazia e não foi usada como evidência do layout; repetida no build de produção. Build/testes novamente executados.

### Jogador maior e obstáculos explícitos

Jogador aumentado de 44×64 para 60×88 px, largura de colisão atualizada e limites cobertos por teste. Obstáculos com camada absoluta explícita, imagem `<img>` reutilizada e bloco de contraste como fallback se `/amp.png` falhar. O desaparecimento reportado não foi reproduzido no Vite anterior (nós dentro do jogo e fundo CSS presente); não se atribui uma causa não confirmada. Browser a 320/1440 px confirmou tamanho do jogador, amplificadores 30×50 com imagem carregada dentro do jogo, game over por colisão e fallback visível com pedido de imagem deliberadamente bloqueado.

### Ranking visível antes e durante a partida

Por pedido posterior, o top 10 aparece automaticamente sobre o jogo antes de Jogar. Durante a partida é substituído pelo top 3 no canto superior esquerdo, sem captar cliques, mantendo pontos no canto direito. No game over o formulário mantém-se e o top 10 pode ser consultado pela divulgação existente. Browser com dez pontuações simuladas: ranking inicial completo e botão Jogar sem colisão a 320×568, 390×844, 1440×900 e 844×390, sem scroll; durante a partida três entradas e sem ranking inicial, sem sobreposição com o chão. Formulário de nick confirmado no fim. Build e 61 testes passaram; persistência real continua pendente da migração.

### Layout compacto pedido na revisão

Retirados os três parágrafos indicados pelo utilizador, reduzidos 404/cabeçalho/espaçamentos. Ranking recolhido por defeito, expansível sobre a área do jogo; formulário de nick dentro da área de game over. Sem `overflow:hidden` na página: zoom/teclado virtual e ecrãs extremos podem exigir scroll para preservar acessibilidade. Browser sem scroll a 320×568, 390×844, 1440×900, 1366×768 e 844×390; a 320×568 também sem scroll com top 10 simulado aberto e formulário de nick visível. Em ecrãs baixos o logo e a nota secundária são omitidos; navegação de regresso e rodapé preservados.

### Áudio acrescentado ao PR #192

- `/home/noct2600/feedbook/public/feedbook_404_arcade_loop.ogg`: música de 8 s em loop durante a partida, volume 30%, sem autoplay ao abrir a página.
- `/home/noct2600/feedbook/public/feedbook_404_jump.ogg`: efeito de 0,32 s por salto aceite, volume 60%.
- Botão Som ON/OFF (PT/EN), pausa em separador oculto, paragem/reset no game over e desmontagem; falhas de reprodução não bloqueiam o jogo. Sem pré-carregamento de áudio antes de jogar.
- Build e 61 testes passaram (três testes novos de áudio). Browser confirmou ausência de autoplay, música em reprodução, efeito concluído, mute e paragem no game over. Não substitui audição e teste em dispositivos físicos; codecs/bloqueios podem variar.
- Os dois ficheiros de áudio fornecidos pelo utilizador estão agora incluídos no commit.

- `npm run build`: passou; `npm test`: 58 testes, incluindo 13 novos para física/dificuldade/nicks, assinatura/validação e endpoint com Supabase simulado.
- Browser Vite com API simulada: 320/390/760/1440 px sem overflow da página; salto por Espaço, colisão/game over, nick não captura atalhos, conversão para maiúsculas, guardar, limite 429, ranking indisponível/jogo offline e idioma inglês.
- Corrigido pattern HTML com hífen escapado após erro detetado no browser; validade confirmada para `ABC-12`.
- Preview do build de produção a 320×740: página 404 abre, jogo inicia por clique e termina por colisão, sem overflow horizontal. API simulada; não prova persistência real.
- Migração SQL **não executada**: PostgreSQL local sem serviço/servidor e Docker sem permissões. RLS, grants, concorrência e integração Supabase real continuam pendentes em ambiente de teste. Testes do endpoint usam mocks, não validam SQL.
- Telemóvel físico e balanceamento com jogadores reais ficam para revisão manual. Sem dependências novas nem alterações a reservas/admin.