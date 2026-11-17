# Auditoria da camada visual — otimizar sem regressões

- Data: 17 de novembro de 2026. Issue: #179.
- Base: `origin/main`, commit `8183ab0` (já inclui os PRs #176 e #178).
- Branch: `docs/179-auditoria-visual`.
- Entrega: **apenas documentação**. Nenhuma alteração à aplicação, CSS, dependências, dados ou configuração; sem deploy, migração ou merge.
- As referências usam caminhos absolutos do workspace e linhas desta base.

## 1. Conclusão e proposta

Há oportunidades de simplificação, mas **não recomendo uma reorganização global do CSS ou do painel administrativo de uma só vez**. A camada visual acumula estilos base, restyling em `@media screen`, overrides de marca e exceções de scroll. Muitas repetições são complementares e algumas mantêm comportamentos corrigidos recentemente.

Ordem recomendada, sempre com aprovação posterior e PRs pequenos:

1. Criar referências visuais e testes de interação dos estados críticos.
2. Consolidar apenas três pares de regras adjacentes e complementares, sem mudar a ordem relativa dos restantes estilos.
3. Corrigir separadamente a preferência de movimento reduzido e os estilos em falta nos componentes administrativos que usam classes utilitárias sem implementação.
4. Medir carregamento e custo de scroll antes de otimizar imagens, loaders ou renderização.
5. Só depois extrair componentes e organizar o CSS por responsabilidade, mantendo a cascata.

**Não existe nesta auditoria uma percentagem demonstrada de melhoria de desempenho.** Menos linhas não implica menos tempo de renderização; os números seguintes são inventário/base de comparação, não poupanças futuras.

## 2. Método, cobertura e limites

- Git inicialmente limpo; `fetch` e nova branch a partir de `origin/main`. Sem descarte de trabalho.
- Inventário dos módulos visuais em `/home/noct2600/feedbook/src`: ponto de entrada, páginas pública/admin/404, recuperação de password, componentes UI, onboarding, hook de imagens, traduções consumidas, CSS e assets públicos.
- Leitura dirigida dos caminhos visuais e pesquisa transversal de JSX, estados, efeitos, eventos, estilos inline, diálogos, imagens, scroll, animações, impressão e exportação.
- Contagem de JSX/hooks com a API TypeScript instalada e de CSS com o PostCSS já disponível transitivamente. Nenhuma dependência nova. Scripts de inspeção ficaram apenas em `/tmp`, fora do PR.
- Browser local via Playwright, servidor Vite em `127.0.0.1:5180`, sem autenticar, criar reservas ou executar operações de escrita nos dados da aplicação. Apenas consentimento/idioma locais do browser foram ajustados.
- Página pública a 320, 390, 720, 721, 900, 980, 981 e 1440 px; login e 404 a 320, 390, 980 e 1440 px. Altura de 900 px. O browser começou em inglês e a sequência principal pública foi realizada em pt-PT; isto **não é uma matriz completa bilingue**.
- Modal de sala, Escape, reposição de foco, entrada no calendário e emulação de movimento reduzido verificados.
- Prompt PWA montado isoladamente no browser através do módulo de desenvolvimento e de evento sintético; **não equivale a instalação real nem a teste do admin autenticado**.
- Não se executou regressão visual pixel a pixel, Lighthouse, medição de Core Web Vitals/React Profiler, auditoria completa de contraste/leitor de ecrã, teste autenticado por papel, confirmação de reserva, exportação PNG/PDF, impressão ou gestos em dispositivo físico. O minijogo não foi exercitado nesta sessão.

### Base quantitativa

| Elemento | Resultado |
| --- | --- |
| CSS principal | 6230 linhas; 956 regras incluindo passos de keyframes; 3070 declarações; 26 `!important`; 31 blocos `@media` |
| Overrides de marca | 65 linhas; 11 regras; 28 declarações |
| Repetições de seletor com contexto ancestral idêntico | 14 ocorrências adicionais no CSS principal; **não são 14 regras removíveis** |
| Página pública | 1401 linhas; 29 chamadas `useState`, 10 `useEffect`, 184 elementos JSX de abertura/autofechados |
| Painel administrativo | 5457 linhas; 65 chamadas `useState`, 21 `useEffect`, 758 elementos JSX de abertura/autofechados |
| 404 | 355 linhas; 18 atributos JSX `style` |
| Build CSS | 92,38 kB; gzip 17,71 kB |
| Chunk principal JS | 270,30 kB; gzip 75,67 kB — não representa sozinho todo o JS necessário à página |

Linhas contadas por `wc -l`; contagens de hooks são chamadas sintáticas, não número de execuções/renders. Métricas CSS incluem regras de keyframes e não são diretamente comparáveis às contagens da auditoria anterior que os excluíam.

## 3. Achados e oportunidades

Legenda: **observado** = reproduzido no browser; **estático** = evidência no código, sem comprovação em todos os estados; **hipótese** = requer perfil/medição. P1 = rever antes de uma refatoração visual ampla; P2 = otimização incremental; P3 = manutenção posterior. Não há bloqueio crítico demonstrado nesta auditoria.

### V01 — Cascata e consolidação local — P2, baixo risco apenas nos pares adjacentes

Evidência em `/home/noct2600/feedbook/src/index.css`:

- `.booking-form`, linhas 648 e 652: `padding` num bloco; grid/gap/posição no seguinte.
- `.gear-list`, linhas 1788 e 1792: `margin-bottom` e, logo a seguir no mesmo media, `gap`/`padding-left`.
- `.admin-message-error`, linhas 1824 e 1829: margem/tamanho e cor em blocos adjacentes.

**Proposta segura inicial:** juntar cada par no próprio local, sem normalizar valores nem mover regras. Benefício principal: legibilidade; poupança de bytes provavelmente pequena e ainda não medida. Confirmar equivalência de declarações e estilos computados antes/depois.

Não aplicar esta regra a todas as repetições: `.room-details-actions` (420/497), `.gear-list` (307/637), `.admin-user-list` (1985/2646) e a sua regra `li` têm contexto e consumidores a rever. Os overrides industriais nas linhas 5374–5523 são ativos. Os `!important` incluem impressão e Driver.js: **não remover em massa**.

### V02 — Movimento reduzido parcialmente anulado — P1, observado

Em `/home/noct2600/feedbook/src/index.css:1389–1392`, `prefers-reduced-motion: reduce` define `scroll-behavior: auto`. A regra desktop posterior em 5737–5740 volta a definir `smooth` com o mesmo seletor. No browser a 1440 px com preferência reduzida, o valor computado continuou **`smooth`**. A transição de passo continuou com `animation-name: booking-step-in`.

Há também scroll imperativo `smooth` em `/home/noct2600/feedbook/src/App.tsx:525–535`; o onboarding usa `animate: !prefersReducedMotion()` mas mantém `smoothScroll: true` em `/home/noct2600/feedbook/src/onboarding/useOnboarding.ts:155–160`.

Proposta: exceções finais e específicas para movimento reduzido, incluindo scroll JS, sem desligar indiscriminadamente todos os indicadores de atividade. Preservar o visual normal. Testar preferência inicial e mudança em execução, navegação entre passos, tutorial e sliders. Benefício: consistência da preferência; não é uma promessa de desempenho.

### V03 — Classes utilitárias sem CSS correspondente — P1, estático + reprodução isolada

`/home/noct2600/feedbook/src/components/ui/InstallPwaPrompt.tsx:49–124` usa classes como `fixed`, `bottom-4`, `flex`, `p-4`, `rounded-2xl` e cores arbitrárias. `/home/noct2600/feedbook/src/components/ui/AdminSetupDiagnostics.tsx:198–260` também usa classes deste tipo misturadas com classes locais.

Não foi encontrada implementação dessas utilidades nos estilos locais, dependência Tailwind ou configuração correspondente em `/home/noct2600/feedbook/package.json` e `/home/noct2600/feedbook/vite.config.ts`. A pesquisa CSSOM não encontrou `.fixed`/`.flex`. Montando isoladamente o prompt PWA, o contentor resultou em **`position: static`, fundo transparente, `display: block`, padding `0px`**.

O prompt real só é montado com utilizador autenticado (`/home/noct2600/feedbook/src/AdminHistoryPage.tsx:5452`); por isso esta reprodução **não comprova a experiência instalada nem todas as sobreposições reais**.

Proposta: classes semânticas locais, usando o sistema visual existente, sem instalar um framework CSS. Requer acordo sobre o visual esperado, screenshots autenticadas e ensaio de iOS/Android/PWA. Trata-se de correção visual, não de refatoração de aparência invariável.

### V04 — Carregamento inicial e imagens — P2, estático; ganho por medir

`/home/noct2600/feedbook/src/App.tsx:471–496` condiciona a montagem do conteúdo a dados, imagens e atraso mínimo de **800 ms**. `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:760–764` também impõe 800 ms. O preload público inclui `/loadingdb.png`, `/feedbook-logo.png` e `room.imageUrl`; não necessariamente todas as fotos em `imageUrls`.

`/home/noct2600/feedbook/src/hooks/useImageReady.ts:20–51` aguarda load/decode/erro sem timeout. O hook não repõe `ready` a `false` quando o conjunto muda: não assumir que todas as capas vindas posteriormente do backend bloquearam o loader. Uma imagem pendente pode prolongar a espera inicial; esse cenário não foi reproduzido.

`/home/noct2600/feedbook/src/components/ui/RoomPhotoSlideshow.tsx:30–62` monta todas as imagens com lazy loading e mantém um intervalo por instância com várias imagens, sem suspensão explícita por visibilidade/documento oculto. Já respeita movimento reduzido e lida com erros/cache: preservar essas proteções.

Proposta: medir com cache fria/quente, rede lenta, erro e pedido pendente; separar prontidão de dados da apresentação, discutir a intenção dos 800 ms e só depois reduzir bloqueios/preload. Avaliar capa prioritária e fotos secundárias diferidas, variantes dimensionadas e pausa fora de vista. Não prometer menos pedidos só porque existe `loading="lazy"`.

Assets locais: `/home/noct2600/feedbook/public/feedbook-logo.png` tem 102142 bytes; `/home/noct2600/feedbook/public/loadingdb.png`, 36984. Não reconverter/apagar logos de PDF, email, PWA ou social como parte desta tarefa. O peso real das fotos remotas não foi inventariado.

### V05 — Scroll/sticky e fronteiras responsivas — P1 para preservar; P2 para medir

O sistema móvel usa frame fixo e `.page-shell` como scroller em `/home/noct2600/feedbook/src/index.css:1045–1094`; desktop usa scroll de janela. O título tem sticky até 720 px e desde 981 px, mas é estático entre 721 e 980 px. **Diferença observada, não bug demonstrado.**

Em 390 px, `.booking-heading` mediu x = −8, largura = 406, limite direito = 398; `.page-shell` tinha clientWidth 390 e scrollWidth 398. A regra `margin-inline: -24px` está em 6063–6072. Não houve overflow horizontal do documento nem scroll horizontal visível demonstrado. Pode ser bleed intencional: confirmar o aspeto antes de corrigir margens.

`/home/noct2600/feedbook/src/components/ui/AboutSection.tsx:46–87` lê geometria/altura e escreve custom properties durante scroll, com agregação por `requestAnimationFrame` já existente. Ainda consulta geometria antes do retorno mobile. **Hipótese:** separar medição estável de atualização de progresso e evitar escritas de valores inalterados. Medir layout/style recalculation e frames antes de introduzir observers ou outro mecanismo.

Preservar auto-transição de entrada, primeiro gesto, scroll do modal, volta ao topo, rodapé e máscaras opacas. Não trocar globalmente `overflow`, `position`, `overscroll-behavior`, `transform: translateZ(0)` ou `:has(dialog[open])` para simplificar CSS sem testes físicos.

### V06 — Diálogos e gestão de foco heterogéneos — P1, estático; modal público validado

`/home/noct2600/feedbook/src/components/ui/RoomDetailsModal.tsx:30–85` usa `<dialog>`, restaura body/scroll/foco e distingue backdrop. No ensaio móvel: abriu, foco dentro, body fixo; Escape fechou, limpou o estilo e devolveu foco a “Ver mais”. **Manter este comportamento.**

O admin distribui handlers por diálogo em `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:1411–1595`; o modal de utilizador possui ciclo Tab e controlo de scroll específicos. `/home/noct2600/feedbook/src/SetPasswordModal.tsx:101–175` e os componentes `/home/noct2600/feedbook/src/onboarding/WelcomeModal.tsx` e `/home/noct2600/feedbook/src/onboarding/CompletionModal.tsx` usam `role="dialog"` sem gestão equivalente visível no próprio componente.

Proposta: primeiro inventariar abertura, fecho, busy, aninhamento, foco inicial/restauro, Escape e scroll de cada modal. Só depois extrair uma infraestrutura pequena. Não substituir tudo automaticamente por `<dialog>` nem uniformizar os z-index sem verificar top layer, Driver.js, toast, cookies e recuperação de password. A ausência de lógica local não comprova, isoladamente, uma falha em todos os fluxos autenticados.

### V07 — Extração de componentes e carregamento por página — P2/P3, ganho por medir

`/home/noct2600/feedbook/src/main.tsx:3–9` importa estaticamente as três páginas e o CSS global; o painel importa CSS de Driver.js. A separação de vendors já existe em `/home/noct2600/feedbook/vite.config.ts:54–66`; PDF já usa import dinâmico em `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:2417`. Não apresentar esses mecanismos como melhorias ainda não implementadas.

Proposta: avaliar lazy loading por página com fallback e recuperação de erro apropriados; medir rede de produção e execução inicial. Dividir ficheiros de CSS, por si só, não garante CSS carregado por rota. Manter o modal de recuperação global.

Extrair primeiro unidades de apresentação com props explícitas — cartão de sala, calendário, linhas/cartões de histórico, painéis de gestão — sem mover simultaneamente regras de negócio. Não espalhar `memo`/`useMemo` por tamanho do ficheiro: confirmar renders relevantes com Profiler e cenários representativos. Redução de complexidade de manutenção é mais certa que redução de renderização.

### V08 — 404, acessibilidade e alvos — P2/P3

`/home/noct2600/feedbook/src/NotFoundPage.tsx:99–114` atualiza pontuação, procura elementos e reconstrói obstáculos com `innerHTML` em cada frame do jogo. Candidato localizado a reutilizar nós/refs, animar por transform e só atualizar texto quando a pontuação inteira muda. Requer teste de colisão, velocidade e teclado/toque; **não foi medida lentidão nem exercitado o jogo nesta auditoria**. Mover os 18 estilos inline para classes só melhora organização se preservar exatamente os valores e overrides.

Nos cartões públicos, `/home/noct2600/feedbook/src/App.tsx:818–866` combina um `article role="button"` com botão interno; existe proteção explícita de eventos e teclado. Os botões “Ver mais” mediram 21 px de altura no browser móvel. São pontos para ensaio de teclado/toque/leitor de ecrã, não uma declaração automática de incumprimento: o contexto e espaçamento também precisam de avaliação.

O texto de 404 e partes administrativas são literais em português. Preservar os idiomas já suportados; internacionalizar esses trechos é uma tarefa funcional separada, não deve ser disfarçada de otimização sem mudança visual.

## 4. O que não alterar em massa

- Tokens, cores e raios: `/home/noct2600/feedbook/src/index.css:1–22` e 5375–5381 distinguem base/screen. Unificá-los pode mudar impressão. Inventariar o valor efetivo por estado antes de extrair tokens adicionais.
- `/home/noct2600/feedbook/src/brand-overrides.css` é importado depois do CSS principal; incorporar as suas regras noutro ponto pode mudar precedência.
- `/home/noct2600/feedbook/src/index.css:4991–5238` contém impressão; PNG usa captura em `/home/noct2600/feedbook/src/App.tsx:570–590`. Não validar exportações apenas pela página no ecrã.
- Classes dinâmicas de papéis/estados, Driver.js e o componente sem markup `/home/noct2600/feedbook/src/components/ui/ExploreNavigation.tsx` continuam ativos.
- `/home/noct2600/feedbook/src/components/ui/RoomPhotoEditor.tsx:18–22` já revoga object URLs; não remover esse cleanup ao extrair componentes.
- Nenhuma alteração de backend, regras de reserva, permissões, catálogo, SQL, service worker ou persistência é necessária para consolidar regras CSS locais.

## 5. Plano de execução posterior e critérios de saída

| Fase | Entrega proposta | Condição de avanço |
| --- | --- | --- |
| A — baseline | Screenshots determinísticas pt-PT/en; estados de formulário, hover/foco, busy/erro, modais; testes de navegação | Dados de teste controlados e acesso aos papéis necessários, sem publicar dados pessoais |
| B — baixo risco | Só os três pares adjacentes de V01 | Build/testes verdes; mesmas declarações e estilos computados; diferença visual nula nos cenários cobertos |
| C — correções específicas | V02 e V03 em alterações separadas | Aprovação da diferença intencional; normal inalterado; preferência reduzida e PWA/admin validados |
| D — desempenho | Uma hipótese de V04/V05/V07 por vez | Produção local, cache fria/quente e rede/CPU documentadas; várias repetições; antes/depois de pedidos/bytes, render/layout e tempos, sem regressão funcional |
| E — organização | Extração incremental de componentes/estilos | Sem alteração de regras de negócio; cascata preservada; regressão visual/autenticada e exportações verificadas |

Cada alteração posterior deve ter a sua issue/branch/PR e possibilidade simples de reversão. Não alargar o âmbito para redesign, dependências novas ou reestruturação geral sem necessidade demonstrada.

### Matriz mínima de regressão para futuras alterações

- Público: salas com/sem foto, foto falhada/lenta, várias fotos, seleção, modal/backdrop/Escape/foco, calendário, navegação de mês, indisponibilidade, contacto/serviços/erros/busy, confirmação e PNG; consentimento presente/ausente.
- Responsivo: 320/390/720/721/900/980/981/1440 px; alturas pequenas desktop; zoom 200%; textos longos em pt-PT/en; orientação e teclado virtual.
- Scroll: topo/fim de página, ida/volta entre passos, sticky sem sobreposição do logo, rodapé, leitura de “Quem somos”, modal depois de scroll e restauro da posição; Android/iOS físicos, pull-to-refresh e safe areas.
- Admin: papéis autorizados; desktop/mobile; histórico/financeiro/catálogos/utilizadores/contactos/definições; filtros, vazio, erro, pendente e busy; modais aninhados, confirmação de eliminação, Escape/Tab/Shift+Tab e foco ao fechar.
- Onboarding e recuperação: início, mudança de painel, conclusão, erro/expiração, foco e sobreposições. Movimento reduzido normal e ativado durante sessão.
- Exportações: PDF/preview de impressão, PNG, paginação, logos, contrastes e dados extensos. PWA: instalação real, standalone, update e prompt coexistindo com outros overlays. Não pedir push nem executar ações reais apenas para uma auditoria visual.

## 6. Verificações desta entrega

- `npm run build`: **passou**, código de saída 0; CSS 92,38 kB / gzip 17,71 kB.
- `npm test`: **34 testes passaram**, três ficheiros, código de saída 0.
- Os 16 testes de `/home/noct2600/feedbook/src/helpers/frontendStyles.test.js` protegem a presença textual de seletores importantes; **não comprovam cascata, geometria, acessibilidade ou fidelidade visual**.
- Browser: sem overflow horizontal do documento nos tamanhos/rotas descritos; loader desapareceu nos ensaios normais; modal público e entrada no calendário funcionaram. Identificados os resultados específicos de V02/V03/V05/V08.
- Nenhuma reserva submetida, autenticação ou escrita funcional efetuada. Sem testes autenticados/dispositivo real, não se pode afirmar que toda a interface está livre de regressões.
- O PR deve conter exclusivamente este documento. Não há melhoria de runtime entregue nesta fase; a decisão seguinte é escolher uma das fases propostas.