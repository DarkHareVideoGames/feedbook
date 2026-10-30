# Auditoria CSS — FEEDBACK (fase 1)

Branch: `restructure`. Objetivo: reorganizar sem alterações visuais ou funcionais.

## Inventário confirmado

- `src/index.css`: 6 347 linhas e 116 322 caracteres no estado inicial.
- `package.json`: React 18, TypeScript, Vite; `npm run build` executa `tsc -b && vite build`; `npm test` executa Vitest.
- CSS global e administrativo misturados: variáveis `:root` nas linhas 1–26, onboarding administrativo a partir da linha 28, rodapé público a partir da linha 1121, fluxo de reservas a partir da linha 1261, sidebar administrativa a partir da linha 3164, histórico a partir da linha 3382, cookies a partir da linha 5124, restyling industrial a partir da linha 5637, Quem Somos a partir da linha 6019, loading global a partir da linha 6251 e ajustes PWA no fim.
- Pelo menos 22 blocos `@media` distribuídos pelo ficheiro, incluindo regras finais que podem sobrescrever anteriores.
- Há classes partilhadas entre áreas, como `card` e `eyebrow`; o onboarding combina `admin-modal-*` e `onboarding-*`.

## Estratégia de refatorização segura

1. Inventariar todos os CSS e imports, além de todos os `className`, `classList`, strings dinâmicas, seletores usados por bibliotecas (Driver.js), pseudoestados, media queries, animações e folhas externas.
2. Registar a ordem de cascata original; nunca dividir regras em ficheiros carregados condicionalmente sem testar. Não converter automaticamente seletores globais em CSS Modules.
3. Separar gradualmente em `base/`, `shared/`, `frontend/`, `admin/` e `overrides/`, mantendo a ordem efetiva dos blocos (especialmente overrides tardios). Organizar internamente por secção apenas quando não alterar a cascata.
4. Não apagar seletores apenas por ausência de referência textual: classes podem ser dinâmicas, provenientes de bibliotecas ou de conteúdo renderizado.
5. Executar `npm run build`, `npm test` e comparação visual desktop/mobile para frontend, admin, onboarding, reservas, histórico, modais, loading e PWA. Sem testes visuais não declarar equivalência visual comprovada.
6. Remover CSS só com evidência de não utilização e revisão de cada candidato, em commits separados da reorganização.

## Estado

Esta fase é apenas documental. Nenhuma regra CSS foi movida, apagada ou alterada. Testes e screenshots ainda não executados.
