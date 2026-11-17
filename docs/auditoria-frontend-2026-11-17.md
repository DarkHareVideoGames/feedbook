# Auditoria do frontend — código e CSS não utilizados

- **Data:** 17 de novembro de 2026.
- **Issue:** #175.
- **Base auditada:** `origin/main`, commit `bf038a6` (merge de 16/11/2026, 23:48 UTC).
- **Branch:** `docs/175-auditoria-frontend`.
- **Entrega:** apenas este relatório. Não foi removido ou alterado código, CSS, dependências, traduções, assets ou configuração da aplicação.
- **Decisão:** qualquer limpeza depende de aprovação posterior do utilizador.

As referências abaixo usam caminhos absolutos do workspace e linhas da base auditada; podem mudar após alterações futuras.

## 1. Conclusão executiva

**Existe código não utilizado e CSS sem consumidores no frontend atual.** Os resultados mais sólidos são:

1. Um painel administrativo legado, `/home/noct2600/feedbook/src/AdminPage.tsx`, com **1818 linhas**, não é alcançável a partir do ponto de entrada.
2. Cinco exports de runtime em `/home/noct2600/feedbook/src/api.ts` não têm consumidores no grafo ativo: dois não têm chamadas no código pesquisado e três só são usados pelo painel legado.
3. Vários grupos de CSS sobreviveram a versões anteriores da interface: hero, grelhas antigas de horários, extras do histórico, navegação lateral pública e partes do editor/financeiro.
4. Quatro nomes de variáveis CSS não têm consumidores encontrados (cinco declarações no total).
5. `react-router-dom` não é importado pela aplicação, mas permanece nas dependências e na configuração explícita de chunks. É um candidato a revisão conjunta, não uma dependência a apagar isoladamente.
6. Há **11 repetições de seletor no mesmo contexto de media**, mas nem todas são redundantes: algumas complementam propriedades e outras fazem overrides intencionais.

**Não é possível concluir uma percentagem fiável de CSS removível** apenas com pesquisa estática ou com os ecrãs iniciais. Não há aqui uma promessa de redução do bundle: módulos e exports mortos podem já ser eliminados pelo bundler.

## 2. Âmbito e método

### Inspeção efetuada

- Estado inicial do Git limpo; branch anterior preservada, sem reset, stash ou descarte de trabalho.
- Atualização de `origin/main` e criação da branch própria a partir da branch principal configurada.
- Comparação das alterações de 16/11/2026 com `ef4ba7f`, anterior às alterações desse dia na main.
- Leitura do ponto de entrada, imports/reexports, rotas, funções da camada de dados, componentes, estilos e configuração.
- Análise local com a API do TypeScript instalada: grafo de imports/reexports e resolução de símbolos dos exports. Pesquisa complementar de imports dinâmicos e referências em ficheiros versionados.
- Parsing dos dois ficheiros CSS locais com o PostCSS já instalado transitivamente: regras, classes, repetições de seletores, custom properties e keyframes. Sem instalação de ferramentas ou dependências novas.
- Cruzamento textual dos candidatos com o código ativo e com o painel legado, seguido de revisão das classes dinâmicas e de terceiros.
- Build, testes existentes e smoke tests em browser local. Nenhuma escrita funcional, autenticação, criação de reserva ou alteração de dados foi feita no browser.

### Inventário e métricas

| Elemento | Resultado |
| --- | --- |
| Módulos TS/TSX/JS de runtime em `src` | 31 (exclui testes e declarações) |
| Módulos de runtime não alcançáveis desde `main.tsx` | 1: `AdminPage.tsx` |
| CSS local | `index.css`: 7023 linhas; `brand-overrides.css`: 65 linhas |
| Regras CSS locais analisadas, excluindo passos de keyframes | 1056 |
| Nomes distintos de classes nas regras | 540 |
| Regras sinalizadas pela primeira pesquisa textual | 170, **antes** de eliminar falsos positivos; não são 170 regras removíveis |
| Repetições de seletor no mesmo contexto | 11 ocorrências adicionais |
| Keyframes sem referências encontrados | 0; não equivale a prova de utilização de todas as animações |
| CSS de produção, incluindo CSS importado de dependências | 103,73 kB; gzip 19,88 kB |

A contagem de regras não inclui o CSS do Driver.js em `node_modules`; o tamanho de produção inclui-o. O `wc -l` inicial contou 7022 terminadores de linha em `index.css`; o ficheiro termina na linha lógica 7023 sem newline final.

## 3. Código não utilizado — confirmação elevada

### F01 — Painel administrativo legado fora do grafo ativo

- **Ficheiro:** `/home/noct2600/feedbook/src/AdminPage.tsx:1–1818`.
- **Prova:** `/home/noct2600/feedbook/src/main.tsx:4,68–79` importa e monta `AdminHistoryPage` para os caminhos `/admin*`. Nenhum import/reexport encontrado aponta para `AdminPage`.
- `/home/noct2600/feedbook/tsconfig.app.json:21` exclui explicitamente este ficheiro. O build passar não certifica a validade deste painel antigo.
- **Impacto:** manutenção desnecessária, duplicação de fluxos administrativos e consumidores aparentes de API/CSS que já não existem no produto atual.
- **Recomendação sujeita a aprovação:** remover o ficheiro e rever a exclusão do tsconfig, depois validar que todos os fluxos relevantes estão no painel ativo. Não remover componentes partilhados importados pelo painel antigo: `RoomPhotoEditor`, por exemplo, também é usado pelo painel ativo.
- **Limite:** conclusão relativa aos entrypoints versionados atuais; não avalia consumidores externos que importem diretamente este ficheiro.

### F02 — Exports de runtime sem consumidores ativos

| Export | Localização absoluta | Evidência | Ação proposta, não executada |
| --- | --- | --- | --- |
| `updateContactRequestStatus` | `/home/noct2600/feedbook/src/api.ts:643–666` | Sem chamadas encontradas no código versionado pesquisado | Confirmar se o fluxo de estados deve existir; remover apenas se não fizer parte de funcionalidade prevista |
| `servicesToPricingExtras` | `/home/noct2600/feedbook/src/api.ts:1256–1265` | Sem chamadas encontradas | Candidato de baixo risco a remoção após aprovação |
| `updatePricing` | `/home/noct2600/feedbook/src/api.ts:1542–1598` | Consumidor apenas em `AdminPage.tsx:593` | Rever juntamente com o painel legado; não alterar tabelas nem migrações |
| `auditLogs` | `/home/noct2600/feedbook/src/api.ts:1979` | Consumidor apenas em `AdminPage.tsx:430` | Rever intenção de produto antes de remover; ausência de interface não significa que auditoria deixou de ser necessária |
| `staffFunctionLabels` | `/home/noct2600/feedbook/src/api.ts:29–36` | Consumidor apenas em `AdminPage.tsx:949`; o painel ativo tem o seu próprio mapa em `AdminHistoryPage.tsx:23` | Remover export legado ou consolidar mapa, mas não fazer refatoração transversal sem aprovação |

Não confundir `auditLogs` com a gravação de auditoria: `recordAudit` é usado por operações ativas e não é proposto para remoção. Não foram identificados imports/locais não utilizados pelo build TypeScript na configuração atual; isto não deteta, por si só, exports mortos ou CSS.

## 4. CSS sem consumidores — grupos prioritários

**Confiança elevada estática** significa que não foi encontrado consumidor nem montagem dinâmica correspondente no código inspecionado; não significa cobertura integral de todos os estados em execução. Todas as linhas seguintes pertencem a `/home/noct2600/feedbook/src/index.css`.

| Grupo | Linhas de referência | Avaliação / cuidado |
| --- | --- | --- |
| `.history-extras-*` e `.history-extras` | 129–183 | Sem consumidores no frontend inspecionado; 9 regras específicas |
| `.hero`, `.hero-metrics`, `.hero-panel`, `.topbar-note`, `.policy-box` | 261, 289, 345, 378–432, 2034, 5454, 5928, 5957, 5969, 6112 | Restos de layout anterior; alguns seletores estão em listas com classes ativas, como `.gear-list`, `.booking-grid` e `.room-card` |
| `.room-card-long`, `.room-image-preview` | 482, 519, 753–765, 6136 | Sem consumidores encontrados; preservar o modal e slideshow atuais |
| `.icon-button`, `.duration-field`, `.slot-grid*`, `.slot-button*`, `.calendar-hint` | 876–896, 917, 946–957, 1085, 1119–1156, 2146–2152, 5939–5944, 6155–6201 | Controlo antigo de horários; não remover regras partilhadas com botões ativos |
| `.wa-optin*` | 1219–1255, 6217 | Sem consumidor encontrado; não confundir com funcionalidades ativas de WhatsApp do admin |
| `.confirmation-box`, `.confirmation-id-row`, `.booking-summary-badges`, `.booking-summary-extras` | 1490, 1500, 1615, 1627, 6912 | Markup atual usa outros elementos; há duas definições de `.booking-summary-extras`, ambas sem consumidor encontrado |
| Navegação `.explore-navigation*` | 1727–1728, 6456, 6526–6580 | `ExploreNavigation.tsx:12` retorna `null`; não produz links/dots/labels. **Preservar o componente**, que aplica a classe ativa `public-explore` em `documentElement` |
| Admin antigo: `.admin-collapsible*`, `.admin-session-*`, `.admin-logout-inline`, `.admin-pricing-grid`, `.admin-user-card-head`, `.team-actions`, `.admin-booking-list`, `.admin-booking-actions`, `.admin-controls-hub`, `.admin-audit-list`, `.audit-label`, `.admin-approval-row` | 659–677, 2217–2264, 2377, 2399, 3175, 3511–3521, 3731–3752, 3936–3943, 4405–4410, 6217–6230 | Consumidores encontrados apenas no painel legado; remover CSS só juntamente com decisão sobre F01. Não remover `.admin-role-*`, que é dinâmico e ativo |
| `.admin-message-ok` | 2176–2182 | Usado apenas pelo painel legado; a regra agrupada também contém `.admin-message-error`, que deve ser preservada |
| `.catalog-form`, `.admin-beta-text`, `.history-actions`, `.state-refunded` | 2972, 3041, 3949–3956, 4047, 6155 | Sem consumidor textual/dinâmico correspondente encontrado; validar estados administrativos antes de remover |
| Financeiro antigo: `.finance-month-picker`, `.finance-month-toggle`, `.finance-bookings-list`, `.finance-print-list*` | 4129–4148, 4270–4278, 4313–4317, 5719, 5877–5901, 6018–6027 | Candidatos estáticos; requer revisão autenticada e de impressão/PDF antes de uma limpeza |
| `.admin-reschedule-wa`, `.admin-modal-body`, `.admin-modal-footer` | 4371, 4656–4667 | Sem consumidor encontrado; não confundir com modal/backdrop/card ativos |
| `.room-editor-image-section`, `.room-editor-section-heading`, `.room-editor-image-grid`, `.room-editor-image-preview`, `.room-editor-image-controls` | 4895–4939, 5116–5131 | Sem consumidor encontrado; preservar `RoomPhotoEditor` e as suas classes atuais |
| `.booking-detail-reference` | 5320 | A regra também contém `.booking-detail-email`; não apagar o bloco completo |
| `.global-loading-message` | 6959–6964 | `GlobalLoading.tsx:10–29` não renderiza mensagem; logo, overlay e anel continuam ativos |

### F03 — Variáveis CSS sem consumidores encontrados

| Nome | Declarações em `/home/noct2600/feedbook/src/index.css` |
| --- | --- |
| `--surface-strong` | 6 e 6076 |
| `--room-card-meta-color` | 17 |
| `--room-card-more-icon-color` | 20 |
| `--room-card-more-hover-background` | 21 |

Pesquisa de `var(...)` nos estilos e dos nomes no código não encontrou consumidores. São candidatos pequenos e de confiança elevada, sem estimativa relevante de ganho de desempenho.

## 5. Falsos positivos identificados — preservar

| Classe / família | Origem comprovada |
| --- | --- |
| `driver-popover*` | DOM gerado pelo Driver.js, inicializado em `/home/noct2600/feedbook/src/onboarding/useOnboarding.ts:156–169`; CSS da biblioteca importado por `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:10` |
| `site-footer-link-site`, `site-footer-link-instagram`, `site-footer-link-youtube` | Template `site-footer-link-${id}` em `/home/noct2600/feedbook/src/App.tsx:1380` e `/home/noct2600/feedbook/src/NotFoundPage.tsx:338`; IDs em `/home/noct2600/feedbook/src/constants/footerLinks.ts:4–8` |
| `admin-role-*` | Template em `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:3031` |
| `admin-user-role-*` | Nomes dependentes de role; não autorizar remoção com base na ausência da string completa sem validar a composição e os ecrãs de utilizadores |
| `is-pending`, `is-contacted`, `is-closed`, `is-confirmed` | Templates `is-${booking.status}` e `is-${request.status}` em `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:4188,4228` |
| `history-row-pending`, `history-row-rejected` | Templates `history-row-${b.status}` em `/home/noct2600/feedbook/src/AdminHistoryPage.tsx:4486,4537` |
| `.about-scroll-cue` | Renderizado em `/home/noct2600/feedbook/src/components/ui/AboutSection.tsx:111`; partilha regras com a navegação antiga |
| `public-explore`, `public-booking-page` e variáveis de progresso | Efeitos em `ExploreNavigation`, `App` e `AboutSection`; são parte do comportamento de scroll atual |

As classes `admin-user-role-*` ficam conservadoramente fora da lista de remoção até validação específica; não se presume que todo o prefixo dinâmico seja sempre usado.

## 6. CSS repetido / sobreposto — não é automaticamente código morto

As 11 ocorrências adicionais detetadas no mesmo contexto pertencem a `/home/noct2600/feedbook/src/index.css`:

| Seletor | Pares de linhas | Interpretação |
| --- | --- | --- |
| `.room-details-actions` | 554 / 631 | `justify-content: space-between` é substituído por `flex-end`; restantes propriedades do primeiro bloco continuam necessárias |
| `.page-shell` | 216 / 1401 | Rever por propriedade; não remover o primeiro bloco integralmente |
| `.gear-list`, media `max-width:480px` | 2129 / 2133 | Blocos complementares (`margin-bottom` versus `gap`/`padding-left`); consolidação estética, não remoção de código morto |
| `.admin-user-list` | 2382 / 3062 | Mesmo conjunto de propriedades; `gap` passa de 12px para 10px. Primeiro bloco é candidato a consolidação |
| `.admin-user-list li` | 2390 / 3070 | Propriedades antigas redefinidas; segundo bloco acrescenta `transition`. Rever regras intermédias e especificidade ao consolidar |
| `.admin-modal-backdrop` | 4540 / 4670 | Background/z-index redefinidos; layout do primeiro bloco permanece necessário |
| `.admin-modal-card` | 4550 / 4676 | `max-height` e overflow redefinidos; restantes propriedades continuam necessárias |
| `.admin-modal-card-wide` | 4559 / 4683 | Width e max-height complementares |
| `.confirmation-page .public-topbar`, media `screen and (max-width:720px)` | 6287 / 6301 | Rever por propriedade; mesma media não implica redundância completa |
| `.booking-summary-extras` | 1627 / 6912 | Sem consumidor encontrado; tratar como grupo legado, não apenas duplicação |
| `.page-shell`, media `screen` | 6082 / 7020 | Background e padding complementares; última regra reserva espaço do rodapé fixo |

`/home/noct2600/feedbook/src/brand-overrides.css` é importado depois de `index.css` em `/home/noct2600/feedbook/src/main.tsx:8–9`. Os seus overrides de marca e layout não devem ser apagados por comparação superficial de seletores. Não foram sinalizadas regras com classes ausentes neste ficheiro pela pesquisa efetuada.

## 7. Dependências e assets

### F04 — `react-router-dom`: candidato de confiança elevada quanto à ausência de imports

- Declarado em `/home/noct2600/feedbook/package.json:27`.
- Sem imports encontrados em `src`, `api`, `lib` ou `server`.
- O roteamento atual usa `window.location.pathname` em `/home/noct2600/feedbook/src/main.tsx:18,73–78`.
- Ainda está explicitamente referenciado em `/home/noct2600/feedbook/vite.config.ts:62` no chunk `react-vendor`. Uma eventual remoção exige rever package.json, lockfile e configuração juntos, e medir o bundle antes/depois.
- As restantes dependências de produção têm referências encontradas: Supabase, React/ReactDOM, Driver.js, html-to-image, jsPDF/autotable e ícones no frontend; Express, cors, nodemailer e web-push no backend. **Não remover dependências do backend por não aparecerem no frontend.**

### Assets — análise complementar, não autorização de remoção

- `/home/noct2600/feedbook/public/feedbook-pwa-assets/logo-loading.png` e `/home/noct2600/feedbook/public/feedbook-pwa-assets/logo-original.png`: sem referências textuais encontradas no código/configuração versionados pesquisados. Validar uso externo ou como originais de marca antes de remover.
- Os ícones `icon-192.png` e `icon-512.png` **são usados** por `/home/noct2600/feedbook/public/admin-manifest.webmanifest:14,20`.
- `/home/noct2600/feedbook/public/robots.txt` é um endpoint convencional público e não precisa de import; não classificado como morto.
- Não foi feita auditoria de imagens guardadas no Supabase nem consulta de logs de acesso de produção. URLs públicas podem ter consumidores externos.

## 8. Alterações de ontem — 16/11/2026

- `ec4e843`, `ac9dc8e`, `e24f08d` e merge `6d03b14`: correções da relação entre título de marcação e logótipo; offset desktop e máscara/sticky mobile.
- `d29d226` e merge `bf038a6`: metadados/idiomas e reposição de pull-to-refresh mobile.
- O diff desse período em `index.css` altera regras que têm consumidores atuais: `public-booking-page`, `public-booking-frame`, `public-explore`, `booking-heading` e `about-header`.
- **Não encontrei evidência de que estas correções sejam código morto.** O inventário legado não deve ser atribuído às alterações de ontem sem análise histórica adicional de cada grupo.
- As regras de overscroll, dialog aberto, heading sticky e máscara do about devem ser preservadas. A regressão de gestos nativos exige ensaio num dispositivo real; viewport em Chromium não equivale a Android/iOS.

## 9. Verificações executadas e limites

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Passou: TypeScript e Vite 5.4.21; 2392 módulos transformados |
| `npm test` | Passou: 2 ficheiros, 18 testes (preços e nomes de salas) |
| Browser local `/`, 1440×900 e 390×900 | Conteúdo renderizado; loading deixou de estar visível; `public-explore` presente; 3 links de rodapé; nenhum elemento `.explore-navigation` |
| Browser local `/admin`, sem sessão | Login renderizado, com campo de password |
| Browser local rota inexistente | Conteúdo 404 e 3 links de rodapé renderizados |
| Inspeção de consola disponível no fim do smoke test | Sem erros devolvidos nessa consulta; não constitui captura persistente de todas as navegações |

**Não executado:** sessão administrativa autenticada, onboarding completo, todas as combinações de permissões/estados, submissões de formulários, exportação efetiva de PNG/PDF, impressão, instalação PWA, push e cobertura CSS cumulativa de todas as jornadas. Não foi feito deploy nem executada migração. Os testes existentes não são testes E2E nem de regressão visual.

A análise de símbolos foca exports de runtime; não é um catálogo exaustivo de tipos/interfaces, propriedades de objetos ou chaves de tradução não utilizadas. Nenhum dicionário foi reduzido. A pesquisa textual é conservadora: uma string presente pode ser comentário ou prefixo e não prova que um seletor completo consiga fazer match. Inversamente, uma classe ausente literalmente pode ser composta dinamicamente ou criada por uma biblioteca.

## 10. Proposta para decisão do utilizador — não executada

1. **Lote A — pequeno e verificável:** remover o painel legado F01 e os exports comprovadamente exclusivos desse painel, se já não houver intenção de o recuperar. Decidir separadamente se `updateContactRequestStatus` é uma funcionalidade futura.
2. **Lote B — CSS com evidência elevada:** extras antigos do histórico, hero/layout antigo, navegação pública sem markup, mensagem de loading ausente e variáveis F03. Retirar apenas os seletores mortos de listas mistas.
3. **Lote C — CSS administrativo/financeiro/editor:** só após testar perfis, estados, modais, mobile e PDF/impressão; evitar purga automática com uma lista incompleta de classes dinâmicas.
4. **Lote D — manutenção opcional:** consolidar overrides por propriedade, rever `react-router-dom` com a configuração de chunks e decidir se os assets originais devem ficar versionados.

Cada lote deve ter uma alteração independente e verificável, com build/testes e comparação visual. Não propor uma reescrita do CSS nem novas dependências nesta fase.

### Checklist manual para uma futura limpeza

- [ ] Página pública PT-PT/EN, cookies, sala com/sem fotografia e modal de detalhes.
- [ ] Marcação: sala, data, horário, duração, extras, erros, confirmação e guardar PNG.
- [ ] Desktop e mobile; scroll até «Sobre», título/logo, rodapé, dialog aberto e pull-to-refresh em dispositivo real.
- [ ] Login/logout, convite/reset de password e 404.
- [ ] Admin por role: reservas e estados, pagamentos/reembolsos, contactos e reagendamento.
- [ ] Utilizadores/roles, editor de salas/fotografias e serviços.
- [ ] Financeiro, PDF e impressão; onboarding, reduced-motion e PWA.
- [ ] Comparar tamanhos de produção antes/depois sem confundir tree-shaking existente com ganho novo.

**Estado final desta tarefa:** relatório para revisão; nenhuma limpeza autorizada ou aplicada.