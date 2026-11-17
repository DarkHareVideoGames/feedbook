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

- `npm run build`: passou; `npm test`: 58 testes, incluindo 13 novos para física/dificuldade/nicks, assinatura/validação e endpoint com Supabase simulado.
- Browser Vite com API simulada: 320/390/760/1440 px sem overflow da página; salto por Espaço, colisão/game over, nick não captura atalhos, conversão para maiúsculas, guardar, limite 429, ranking indisponível/jogo offline e idioma inglês.
- Corrigido pattern HTML com hífen escapado após erro detetado no browser; validade confirmada para `ABC-12`.
- Preview do build de produção a 320×740: página 404 abre, jogo inicia por clique e termina por colisão, sem overflow horizontal. API simulada; não prova persistência real.
- Migração SQL **não executada**: PostgreSQL local sem serviço/servidor e Docker sem permissões. RLS, grants, concorrência e integração Supabase real continuam pendentes em ambiente de teste. Testes do endpoint usam mocks, não validam SQL.
- Telemóvel físico e balanceamento com jogadores reais ficam para revisão manual. Sem dependências novas nem alterações a reservas/admin.