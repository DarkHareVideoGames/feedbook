# Limpeza segura do frontend — issue #177

## Base e âmbito

Aplicada sobre `bf038a6` da main, após autorização para limpar os resultados da auditoria #175 / PR #176. A auditoria permanece no PR original, ainda não integrado na main quando esta branch foi criada. Não houve refatoração das funcionalidades ativas, deploy, migração ou alterações de dados.

## Removido

- `/home/noct2600/feedbook/src/AdminPage.tsx`: painel legado sem imports, 1818 linhas; removida também a exclusão obsoleta em `/home/noct2600/feedbook/tsconfig.app.json`.
- De `/home/noct2600/feedbook/src/api.ts`: `staffFunctionLabels`, `updateContactRequestStatus`, `servicesToPricingExtras`, `updatePricing`, `auditLogs` e o tipo exclusivo `ApiAuditEntry`. Sem consumidores no grafo ativo. A gravação de auditoria (`recordAudit`) permanece intacta.
- De `/home/noct2600/feedbook/src/index.css`: 158 seletores individuais órfãos, correspondentes a 66 nomes de classes; 114 regras completas desapareceram. Inclui hero/layout antigo, extras antigos do histórico, controlos antigos de horários, navegação pública sem markup, painel administrativo legado e fragmentos antigos do financeiro/editor.
- Quatro nomes de custom properties sem consumidores, em cinco declarações.
- `react-router-dom`, respetiva referência em `/home/noct2600/feedbook/vite.config.ts` e quatro pacotes exclusivos no lockfile/instalação. Nenhuma atualização das dependências restantes.

Os seletores foram revistos individualmente: nas listas mistas foram retirados apenas os membros órfãos. A comparação estrutural com o CSS anterior confirmou que todas as declarações das regras mantidas, exceto as custom properties mortas, permanecem na mesma ordem e sem alterações.

## Preservado por segurança

- Classes dinâmicas de perfis, disponibilidade, estados de reservas e rodapés; seletores do DOM criado pelo Driver.js.
- `ExploreNavigation`: continua a aplicar `public-explore`, embora não renderize navegação.
- Overrides/repetições de seletores ativos, estilos de marca, media queries, animações e regras recentes de scroll/sticky/dialog.
- Assets públicos sem prova suficiente de ausência de consumidores externos, incluindo os originais de marca; ícones PWA e `robots.txt`.
- Backend, gravação de auditoria, migrações, dicionários PT-PT/EN e todas as funcionalidades ativas.

Não se afirma que deixou de existir qualquer código redundante no projeto. A análise pós-limpeza não encontrou módulos de runtime órfãos nem exports de runtime sem referências no grafo analisado; propriedades, traduções e cenários externos não são cobertos exaustivamente.

## Verificações

- `npm run build`: passou (TypeScript + Vite).
- `npm test`: 34 testes passaram em 3 ficheiros, incluindo 16 novos testes em `/home/noct2600/feedbook/src/helpers/frontendStyles.test.js` para proteger seletores dinâmicos, terceiros, listas mistas e scroll. Estes testes verificam presença de estilos, não substituem E2E.
- O teste de estilos lê o CSS diretamente do disco: o import CSS `?raw` era esvaziado pelo runner na primeira tentativa. A versão JS evita introduzir tipos Node no projeto TypeScript do browser. As tentativas iniciais foram corrigidas e build/testes foram repetidos com sucesso.
- Smoke tests locais em Chromium: `/`, `/admin` sem sessão e rota 404; larguras 1440 e 390, altura 900.
- Comparação controlada na mesma página/DOM, alternando CSS anterior e atual com animações/transições suspensas durante a medição: **zero diferenças nas propriedades calculadas** dos elementos inspecionados, nos seis cenários. A primeira comparação entre carregamentos mostrou variação de geometria no desktop devido ao estado temporal do layout; a comparação controlada eliminou essa variável.
- Sem mudanças nas propriedades/ordem de regras CSS mantidas, verificado por parsing local.
- `git diff --check`: passou.

### Dimensão do CSS de produção

| | Antes | Depois | Redução aproximada |
| --- | --- | --- | --- |
| CSS minificado | 103,73 kB | 92,38 kB | 11,35 kB / 10,9% |
| CSS gzip | 19,88 kB | 17,71 kB | 2,17 kB / 10,9% |

Os chunks JavaScript mantiveram os tamanhos arredondados apresentados pelo Vite. Não há ganho de JS anunciado: o código removido já podia ser eliminado pelo tree-shaking.

## Validação manual antes do merge

- [ ] Público PT-PT/EN: cookies, salas, slideshow/modal, etapas da marcação, extras, validações, confirmação e guardar PNG.
- [ ] Desktop/mobile: título/logótipo, scroll até «Sobre», rodapé, dialog aberto e pull-to-refresh em Android/iOS real.
- [ ] Admin autenticado com cada role: reservas/estados, contactos, pagamentos, reembolsos, reagendamento e utilizadores.
- [ ] Editor de salas/fotografias, serviços, financeiro, PDF e impressão.
- [ ] Onboarding, reduced-motion, PWA e push.

Não foram efetuadas autenticação ou submissões que alterassem dados. Fluxos autenticados, PDF/PNG real, impressão, PWA/push e gestos em dispositivo físico não foram testados nesta sessão. O utilizador revê, testa e faz merge; a otimização funcional será uma tarefa separada.