# Limpeza CSS — análise de duplicações (fase 2)

Branch: `restructure`. Esta fase é de diagnóstico; nenhuma declaração CSS foi eliminada.

## Contagem por ficheiro

| Ficheiro | Linhas | Ocorrências de seletores simples | Seletores simples distintos |
|---|---:|---:|---:|
| 01-publico-e-componentes.css | 3036 | 293 | 237 |
| 02-administracao-e-historico.css | 1961 | 195 | 170 |
| 03-cookies-e-ajustes.css | 896 | 78 | 67 |
| 04-quem-somos.css | 233 | 24 | 17 |
| 05-loading-e-pwa.css | 97 | 12 | 11 |

Contagens obtidas por pesquisa textual de seletores simples `.classe { ... }` e `#id { ... }`; não são uma análise completa da gramática CSS e não incluem seletores compostos. Um seletor repetido não significa necessariamente redundância.

## Exemplos a investigar

- Público: `.layout`, `.booking-grid`, `.room-card`, `.topbar`.
- Administração: `.admin-sidebar`, `.admin-modal-card`, `.room-editor-actions`.
- Ajustes finais: `.cookie-banner`, `.page-shell`, `.room-card`.
- Quem Somos: `.about-section`, `.about-columns`.
- Loading: `.global-loading-ring`.

A pesquisa preliminar de regras simples com corpos textualmente idênticos dentro de cada ficheiro não encontrou duplicações exatas. Isto não prova ausência de redundância: media queries, especificidade, ordem de cascata e regras compostas exigem análise com parser CSS.

## Critérios para remoção

1. Cruzar seletores com todos os TSX/TS, HTML, código dinâmico e classes de bibliotecas.
2. Inspecionar seletores repetidos no contexto dos respetivos `@media`, `@supports` e pseudoestados.
3. Separar candidatos comprovados de regras cuja utilização é incerta.
4. Remover apenas candidatos comprovados, em commits pequenos e reversíveis, após build/testes e comparação visual.

**Estado:** nenhuma regra removida; build, testes e screenshots ainda não executados nesta fase.

## Verificação direta no GitHub (sem intervenção do utilizador)

Foram consultados os ficheiros `App.tsx`, `AdminHistoryPage.tsx`, `AboutSection.tsx`, `GlobalLoading.tsx` e `NotFoundPage.tsx`, e cruzados textualmente com os estilos de `04-quem-somos.css` e `05-loading-e-pwa.css`.

- `booking-summary-extras`: não encontrado nesta amostra de componentes; **não confirmado como não utilizado**.
- `global-loading-message`: não encontrado nesta amostra; **não confirmado como não utilizado**.
- `history-row-pending`: não encontrado nesta amostra; pode ser construído dinamicamente; **não confirmado como não utilizado**.

Esta amostra não abrange todos os ficheiros nem as classes construídas em runtime. Não foram eliminadas regras CSS. A execução local de um clone foi tentada, mas falhou por indisponibilidade de resolução DNS de github.com no ambiente de execução; a leitura dos ficheiros pelo conector GitHub funcionou.

## Primeira remoção controlada

Foram removidos os blocos CSS de `.booking-summary-extras` (em `04-quem-somos.css`) e `.global-loading-message` (em `05-loading-e-pwa.css`), num total de 222 caracteres. Não foram encontradas referências na pesquisa de código do GitHub para a branch principal nem nos componentes principais consultados na branch `restructure`. A pesquisa não é uma prova absoluta de ausência de utilização dinâmica.

A classe `.history-row-pending` **foi preservada** porque integra estilos de estados administrativos e pode ser gerada dinamicamente.

**Validação pendente:** build e comparação visual do preview depois dos commits. Reverter os commits de remoção se surgir regressão.
