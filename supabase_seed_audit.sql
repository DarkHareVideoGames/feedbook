-- ============================================================
-- Feedback - Ensaios — Seed de dados existentes (audit_logs)
-- Correr DEPOIS do supabase_schema.sql no painel do Supabase.
-- Preserva o historico de auditoria (acoes de utilizadores).
--
-- NOTA (seguranca): os campos "passwordHash" e "passwordSalt" que
-- aqui apareciam foram REMOVIDOS. Sao credenciais derivadas e nao
-- devem ser versionadas num repositorio publico. O registo de
-- auditoria mantem-se integralmente (mesmos ids, acoes e datas).
-- ============================================================

insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msfpbrfe-A0Y9', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfpbrep-PKN', 'technician:pedroveiga.box@gmail.com', '2026-08-05T06:24:07.322Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msfpojfv-1RJI', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfpojf6-POI', 'technician:techtest1785911643@feedbook.local', '2026-08-05T06:34:03.499Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msfpq7g9-SX34', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfpq7fj-IFP', 'technician:techcheck1785911721@feedbook.local', '2026-08-05T06:35:21.273Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msfprvnf-CTDE', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfprvmp-C9O', 'technician:techcheck1785911799@feedbook.local', '2026-08-05T06:36:39.291Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msgmswg9-GETH', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfprvmp-C9O', 'technician:techcheck1785911799@feedbook.local', '2026-08-05T22:01:14.313Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msgmsxv2-FHP8', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfpq7fj-IFP', 'technician:techcheck1785911721@feedbook.local', '2026-08-05T22:01:16.142Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msgmsz0p-H6JZ', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfpojf6-POI', 'technician:techtest1785911643@feedbook.local', '2026-08-05T22:01:17.641Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msgmt1k8-0DFM', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfn8o60-2DF', 'collaborator:anticristo@feedbook.local', '2026-08-05T22:01:20.936Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUD-msgmt5pb-82JA', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","role":"admin"}'::jsonb, 'USR-msfmxp3c-9XY', 'technician:tech.persist2@feedbook.local', '2026-08-05T22:01:26.303Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-89D47C4D0B9F', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-msfpbrep-PKN', '{"name":"Pedro Veiga","role":"technician"}', '2026-10-08T01:47:42.279Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-AF2EABF25E22', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-msfpbrep-PKN', '{"name":"Pedro Veiga","role":"technician"}', '2026-10-08T01:47:55.4Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-6268273F8DFF', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-msfpbrep-PKN', '{"name":"Pedro Veiga","role":"admin"}', '2026-10-08T01:48:06.576Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-09E7B85E9C28', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-46094D9D', '{"name":"Tmp User","email":"tmp.user.6292@feedbook.local"}', '2026-10-08T01:50:05.928Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-61B58F947479', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-ADMIN-1', '{"name":"FeedBook Admin","role":"admin"}', '2026-10-08T01:50:07.439Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-D011ED9FB599', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-ADMIN-1', '{"name":"FeedBook Admin","role":"admin"}', '2026-10-08T01:50:07.473Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-6B820D38F998', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-8DBD9629', '{"name":"QA User","email":"qa.user.6252@feedbook.local"}', '2026-10-08T01:50:17.514Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-F8DDC179A29E', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-8DBD9629', '{"name":"QA User","role":"collaborator"}', '2026-10-08T01:50:17.516Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-04A112015790', 'user-created', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-0F879972', '{"name":"QA User","email":"qa.user.4264@feedbook.local"}', '2026-10-08T01:50:25.245Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-C96A7D368FDA', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-0F879972', '{"name":"QA User","role":"collaborator"}', '2026-10-08T01:50:25.248Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-86D652384275', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-msfpbrep-PKN', '{"name":"Pedro Veiga","role":"admin"}', '2026-10-08T01:53:40.324Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-7DFEF1F109A8', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-ADMIN-1', '{"name":"FeedBook Admin","role":"admin"}', '2026-10-08T01:53:40.326Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-9BCF69656228', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-46094D9D', '{"email":"tmp.user.6292@feedbook.local"}', '2026-10-08T01:54:50.166Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-CF45053AFA12', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-8DBD9629', '{"email":"qa.user.6252@feedbook.local"}', '2026-10-08T01:54:52.03Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-104EEFFC4D97', 'user-deleted', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-0F879972', '{"email":"qa.user.4264@feedbook.local"}', '2026-10-08T01:54:54.154Z');
insert into public.audit_logs (id, action, actor, target, details, "createdAt")
values ('AUDIT-C882600BB8AC', 'user-updated', '{"id":"USR-ADMIN-1","name":"FeedBook Admin","email":"admin@feedbook.local","role":"admin","createdAt":"2026-08-05T05:16:09.757Z"}'::jsonb, 'USR-msfpbrep-PKN', '{"name":"Pedro Veiga","role":"admin"}', '2026-10-08T01:55:06.017Z');

-- Nota: as passwords dos utilizadores nao sao migraveis (pbkdf2 -> bcrypt).
-- Cria os utilizadores novamente pelo painel Supabase (Authentication -> Users).
