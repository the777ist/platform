-- Avatars bucket for the direct-to-Storage upload demo.
-- Public read; users may write ONLY under their own <auth.uid()>/ prefix.
--
-- App tables are Alembic-managed (schema changes ONLY via Alembic — DB conventions);
-- Supabase Storage buckets/policies live HERE because the storage schema is
-- Supabase-managed, not the app's SQLModel tables.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- read: anyone can read public avatars
create policy "avatars_public_read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- write/update/delete: only the owning user (path is "<uid>/...")
create policy "avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
