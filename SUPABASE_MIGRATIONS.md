# Migrações da base de dados (Supabase)

Estes ficheiros **são versionados no Git de propósito**. São a única
forma de recriar e evoluir a base de dados de forma reprodutível.

## Ficheiros

| Ficheiro | Ordem | Descrição |
|---|---|---|
| `supabase_schema.sql` | 1 | Schema base (tabelas `bookings`, `profiles`, `pricing`, `audit_logs`, funções e RLS). **Atenção:** faz `drop table if exists public.bookings cascade`. |
| `supabase_migration_users.sql` | 2 | Coluna `function`, trigger de perfil, funções `admin_update_user` / `admin_delete_user`. Idempotente. |
| `supabase_rooms_services.sql` | 3 | Tabelas `rooms` e `services` + seed das salas. |
| `supabase_migration_*.sql` | 4+ | Migrações incrementais (idempotentes). Aplicar por ordem cronológica. |
| `supabase_migration_security_rls.sql` | 5+ | Endurecimento de RLS (Issue #38): remove escrita `anon`, limita PII de `bookings`, restringe `profiles`/`audit_logs` a admin/superuser, deriva ator de `auth.uid()` nas funções admin. Idempotente. |
| `supabase_migration_fix_profile_rls_recursion.sql` | Após `supabase_migration_security_rls.sql` | Issue #149: corrige a recursão RLS em `profiles` (erro PostgreSQL `42P17`) e repõe as políticas administrativas dependentes. |
| `supabase_migration_contact_requests.sql` | Após a migração de segurança | Issue #34: modo de sala `booking`/`contact`, tabela de pedidos de contacto e RLS para inserção pública e gestão pela equipa. |
| `supabase_migration_contact_request_replies.sql` | Após `supabase_migration_contact_requests.sql` | Issue #125: campos para persistir a mensagem, o canal e a data da resposta enviada a um pedido de contacto. |
| `supabase_migration_fix_booking_rls.sql` | Após a migração de segurança | Correção de RLS para marcações públicas: GRANTs para service_role, leitura pública mínima em bookings, políticas idempotentes. |
| `supabase_migration_developer_notifications.sql` | Após a migração de segurança | Issue #121: flag `profiles.isDeveloper`, trigger de criação e função administrativa de atualização de utilizadores. |
| `supabase_migration_developer_beta_mode.sql` | Após `supabase_migration_developer_notifications.sql` e a migração de segurança | Issue #147: permite a perfis `isDeveloper` gerir o modo beta e registar a alteração em auditoria. |
| `supabase_migration_admin_onboarding.sql` | Após a migração de segurança | Issue #135: progresso do walkthrough administrativo por utilizador, com RLS por `auth.uid()`. |
| `supabase_migration_room_sort_order.sql` | Após `supabase_rooms_services.sql` | Issue #145: coluna `rooms.sortOrder`, preenchimento da ordem atual e índice para persistir a sequência dos cards na front page. |
| `supabase_seed_audit.sql` | — | Seed opcional do histórico de `audit_logs`. **Sem** hashes de password. |

## Como aplicar

### Galeria de salas — Issue #154

Aplicar `supabase_migration_room_photo_gallery.sql` **depois de**
`supabase_migration_room_images.sql` e **antes de publicar o frontend** desta
funcionalidade. A migração é idempotente, preserva a foto atual em `imageUrls`
e impõe um máximo de 5 URLs por sala. Não executar novamente o schema base.
O bucket e as políticas de upload existentes mantêm-se; remover uma foto no
admin retira a referência da sala, mas não apaga o ficheiro do Storage.
A primeira foto continua a ser gravada em `imageUrl` para compatibilidade.

Depois de aplicar, validar no admin: carregar 5 fotos, guardar e reabrir a sala;
confirmar a persistência e a impossibilidade de adicionar uma sexta. Verificar
remoção individual, JPG/PNG/WebP, rejeição de ficheiros acima de 5 MB e salas
com zero/uma foto. Na página pública, verificar o ciclo de 5 segundos com
crossfade de 800 ms, seleção/reserva e movimento reduzido, em mobile e desktop.
Executar também `npm run build` e `npm test`. Validação a cargo do utilizador.

1. Abrir **Supabase → SQL Editor → New query**.
2. Colar o conteúdo do ficheiro.
3. Executar (`Run`).

## Regras de segurança

- **Nunca adicionar `*.sql` ao `.gitignore`.** As migrações são código.
- Nenhum ficheiro desta pasta pode conter credenciais, chaves de API,
  tokens ou hashes de password. Valores específicos de ambiente
  são parametrizados por variáveis de ambiente / pelo painel do Supabase.
- `supabase_seed_audit.sql` foi saneado: os campos `passwordHash` e
  `passwordSalt` foram removidos porque são credenciais derivadas e o
  repositório é público. O registo de auditoria mantém-se integralmente.
- Os hashes/salts do utilizador `admin@feedbook.local` continuaram
  presentes no histórico do Git. Como o `passwordSalt` é publicado ao
  lado do `passwordHash`, qualquer pessoa pode tentar quebrar esse
  hash por força bruta. **Se essa conta for usada em produção, defina
  uma nova password.**

## Nota sobre RLS

Os scripts de schema criam políticas públicas para `anon` com o objetivo
de facilitar os testes. **Antes de produção, restringe o `anon`** —
ver a secção 7 de `supabase_schema.sql`, que assinala explicitamente
essa limitação.
