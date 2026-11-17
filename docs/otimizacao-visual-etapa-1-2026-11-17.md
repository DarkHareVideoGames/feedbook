# Otimização visual gradual — etapa 1

- Issue: #181. Auditoria de referência: #179 / PR #180.
- Base: `8183ab0` (`origin/main`); o PR documental #180 ainda não estava integrado ao iniciar esta etapa.
- Branch: `fix/181-visual-gradual`.
- Sem redesign, dependências novas, alterações a dados, deploy ou merge.

## Alterações

1. Consolidação local de três pares CSS adjacentes: `.booking-form`, `.gear-list` dentro do media móvel e `.admin-message-error`. Mesmos valores, contexto e ordem das declarações.
2. Overrides de movimento reduzido depois dos overrides desktop: scroll CSS automático, sem transições dos cartões públicos nem animação de entrada dos passos de reserva quando a preferência está ativa.
3. Helper `/home/noct2600/feedbook/src/helpers/motion.ts`, consultado em cada ação de scroll. Mantém `smooth` normalmente e usa `instant` com movimento reduzido para não herdar scroll suave de CSS. Aplicado à mudança de passo e ao foco/scroll da confirmação pública.
4. Onboarding: a configuração inicial de animação e scroll suave passa a usar a mesma preferência. Não altera timers, persistência, conteúdo, permissões ou progressão do tutorial. A preferência é lida ao iniciar cada tutorial; esta etapa não reconfigura um tutorial já em curso ao mudar a preferência.
5. Cinco testes unitários do helper e um teste de proteção da ordem/declarações CSS.

## Validação executada

- `npm run build`: passou, saída 0.
- `npm test`: **40 testes passaram**, quatro ficheiros, saída 0 (34 anteriores + 6 novos).
- `git diff --check`: sem erros.
- Parsing CSS antes/depois com PostCSS já instalado: **todas as declarações fora dos blocos de movimento reduzido mantêm seletor/contexto, propriedade, valor, importância e ordem**. A verificação foi executada localmente, sem adicionar dependências.
- Baseline antes da edição e comparação depois em Vite: página pública, login e 404 × 390/720/980/981/1440 px, altura 900 px, pt-PT. **15 cenários, 110 elementos selecionados, zero diferenças** nos retângulos e propriedades de estilo capturados em modo normal. Foram medidos cabeçalhos, cartões, botões, inputs, rodapé, cabeçalho “Quem somos” e cartão de login. Não é comparação pixel a pixel nem cobertura de todos os elementos/estados.
- Matriz de interação pública: 390 e 1440 px × preferência normal/reduzida. Modal abriu com foco interno; Escape fechou, restaurou foco e limpou a posição do body em todos os quatro casos. Escolher sala abriu calendário.
- Chamadas reais de scroll instrumentadas no browser: normal mantém `smooth`; reduzido usa `instant`, no scroller móvel e na janela desktop. CSS reduzido apresenta `scroll-behavior: auto`, transições de cartões `0s` e animação de passo `none`. Normal mantém a animação `booking-step-in` e scroll desktop `smooth`.
- Alteração da preferência durante a sessão pública: scroll CSS e transições atualizaram sem reload. O teste unitário também verifica a releitura da preferência em ações seguintes.
- Smoke test no build de produção local (`vite preview`, porta 5181): quatro salas, sem overflow horizontal do documento a 1440 px, scroll/animação normais e reduzidos corretos.
- CSS de produção: 92,38 → 92,31 kB; gzip 17,71 → 17,69 kB. Chunk principal JS: 270,30 → 270,36 kB; gzip 75,67 → 75,69 kB. São diferenças pequenas; **não se reivindica melhoria de desempenho medida**.

## Limites e próximos passos

Não se fez autenticação, submissão de reservas, alterações de dados, confirmação real, exportação PNG/PDF, impressão, tutorial autenticado completo ou testes em dispositivos físicos. O helper da confirmação e a configuração do tutorial foram revistos no código, mas esses fluxos não foram exercitados integralmente. A preferência normal não foi comparada pixel a pixel. Não se afirma ausência universal de regressões.

Para manter o risco e o diff limitados, **não** foram alterados nesta etapa: prompt PWA, diagnóstico administrativo, preload/loaders, slideshow, arquitetura de scroll/sticky, estrutura de componentes ou minijogo 404. Seguem como etapas independentes com baseline própria; não misturar a correção visual do prompt com alterações de carregamento.

## Teste manual para revisão

1. Em desktop e mobile, abrir a página pública, escolher sala, avançar/voltar entre passos e abrir/fechar os detalhes; confirmar aspeto, sticky, rodapé e posição/foco.
2. Ativar “reduzir movimento” nas preferências do sistema/browser e repetir: navegação sem scroll suave e passos sem animação de entrada. Desativar e confirmar comportamento normal.
3. Com conta de teste autorizada, iniciar o tutorial nos dois modos e confirmar progressão/foco/scroll. Esta verificação autenticada continua pendente.
4. Antes de merge, validar dispositivos físicos e confirmação/PNG se houver preocupação com esses fluxos. Não fazer operações reais apenas para testar.

O utilizador faz revisão e merge; não ativar auto-merge. Reverter esta etapa implica reverter o commit do PR, não tocar na limpeza anterior.