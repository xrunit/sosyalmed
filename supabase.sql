-- Supabase > SQL Editor'da bir kez çalıştır.
create table if not exists docs(
  collection text not null,
  id text not null,
  data jsonb not null default '{}',
  owner uuid not null default auth.uid(),
  created_at timestamptz default now(),
  primary key (collection, id)
);
alter table docs enable row level security;
create policy "oku" on docs for select to authenticated using (true);
create policy "ekle" on docs for insert to authenticated
  with check (owner = auth.uid() and (data->>'uid' is null or data->>'uid' = auth.uid()::text));
create policy "guncelle" on docs for update to authenticated using (owner = auth.uid())
  with check (owner = auth.uid() and (data->>'uid' is null or data->>'uid' = auth.uid()::text));
create policy "sil" on docs for delete to authenticated using (owner = auth.uid());
alter publication supabase_realtime add table docs;

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
create policy "medya yukle" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "medya oku" on storage.objects for select using (bucket_id = 'media');
