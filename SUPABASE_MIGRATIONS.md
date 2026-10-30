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
| `supabase_migration_contact_requests.sql` | Após a migração de segurança | Issue #34: modo de sala `booking`/`contact`, tabela de pedidos de contacto e RLS para inserção pública e gestão pela equipa. |
| `supabase_migration_contact_request_replies.sql` | Após `supabase_migration_contact_requests.sql` | Issue #125: campos para persistir a mensagem, o canal e a data da resposta enviada a um pedido de contacto. |
| `supabase_migration_fix_booking_rls.sql` | Após a migração de segurança | Correção de RLS para marcações públicas: GRANTs para service_role, leitura pública mínima em bookings, políticas idempotentes. |
| `supabase_migration_developer_notifications.sql` | Após a migração de segurança | Issue #121: flag `profiles.isDeveloper`, trigger de criação e função administrativa de atualização de utilizadores. |
| `supabase_migration_admin_onboarding.sql` | Após a migração de segurança | Issue #135: progresso do walkthrough administrativo por utilizador, com RLS por `auth.uid()`. |
| `supabase_migration_room_sort_order.sql` | Após `supabase_rooms_services.sql` | Issue #145: coluna `rooms.sortOrder`, preenchimento da ordem atual e índice para persistir a sequência dos cards na front page. |
| `supabase_seed_audit.sql` | — | Seed opcional do histórico de `audit_logs`. **Sem** hashes de password. |

## Como aplicar

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
