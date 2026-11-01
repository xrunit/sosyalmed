-- Supabase SQL Editor'da mevcut verileri silmeden çalıştırılabilir.
create table if not exists public.docs(
  collection text not null,
  id text not null,
  data jsonb not null default '{}',
  owner uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (collection, id)
);

drop trigger if exists vercell_guard_room_updates on public.docs;

-- Eski oda kayıtlarına görünür sahiplik ekle; mevcut mesajlar korunur.
update public.docs
set data = data || jsonb_build_object(
  'uid', coalesce(data->>'uid', owner::text),
  'owner', coalesce(data->>'owner', owner::text),
  'visibility', coalesce(data->>'visibility', 'public')
)
where collection = 'rooms'
  and (data->>'owner' is null or data->>'visibility' is null);

insert into public.docs(collection, id, data, owner)
select
  'room_members/' || room_doc.id,
  room_doc.owner::text,
  jsonb_build_object('uid', room_doc.owner::text, 'role', 'owner', 'joinedAt', extract(epoch from now()) * 1000),
  room_doc.owner
from public.docs room_doc
where room_doc.collection = 'rooms'
  and room_doc.owner is not null
on conflict (collection, id) do nothing;

alter table public.docs enable row level security;

create or replace function public.vercell_is_room_member(room_id text, member_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select room_id = 'general' or exists (
    select 1
    from public.docs membership
    where membership.collection = 'room_members/' || room_id
      and membership.id = member_id::text
      and membership.data->>'uid' = member_id::text
  );
$$;

create or replace function public.vercell_is_public_room(room_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select room_id = 'general' or exists (
    select 1
    from public.docs room_doc
    where room_doc.collection = 'rooms'
      and room_doc.id = room_id
      and coalesce(room_doc.data->>'visibility', 'public') = 'public'
  );
$$;

create or replace function public.vercell_is_room_owner(room_id text, member_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.docs room_doc
    where room_doc.collection = 'rooms'
      and room_doc.id = room_id
      and coalesce(room_doc.data->>'owner', room_doc.owner::text) = member_id::text
  );
$$;

create or replace function public.vercell_can_manage_room(room_id text, member_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.docs room_doc
    where room_doc.collection = 'rooms'
      and room_doc.id = room_id
      and (
        coalesce(room_doc.data->>'owner', room_doc.owner::text) = member_id::text
        or exists (
          select 1
          from public.docs membership
          where membership.collection = 'room_members/' || room_id
            and membership.id = member_id::text
            and membership.data->>'role' in ('owner', 'admin')
        )
      )
  );
$$;

create or replace function public.vercell_room_role(room_id text, member_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select membership.data->>'role'
  from public.docs membership
  where membership.collection = 'room_members/' || room_id
    and membership.id = member_id::text
    and membership.data->>'uid' = member_id::text
  limit 1;
$$;

create or replace function public.vercell_is_mutual_follow(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select first_user <> second_user
    and exists (
      select 1 from public.docs follow
      where follow.collection = 'follows'
        and follow.data->>'uid' = first_user::text
        and follow.data->>'target' = second_user::text
    )
    and exists (
      select 1 from public.docs follow
      where follow.collection = 'follows'
        and follow.data->>'uid' = second_user::text
        and follow.data->>'target' = first_user::text
    );
$$;

create or replace function public.vercell_is_dm_member(conversation_id text, member_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.docs conversation
    where conversation.collection = 'dm'
      and conversation.id = conversation_id
      and jsonb_typeof(conversation.data->'members') = 'array'
      and jsonb_array_length(
        case when jsonb_typeof(conversation.data->'members') = 'array'
          then conversation.data->'members' else '[]'::jsonb end
      ) = 2
      and conversation.data->'members' ? member_id::text
      and exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(conversation.data->'members') = 'array'
            then conversation.data->'members' else '[]'::jsonb end
        ) peer_id
        where peer_id <> member_id::text
          and public.vercell_is_mutual_follow(
            member_id,
            case when peer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then peer_id::uuid else null end
          )
      )
  );
$$;

create or replace function public.vercell_can_read_doc(doc_collection text, doc_id text, doc_data jsonb, doc_owner uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  room_id text;
  conversation_id text;
begin
  if auth.uid() is null then return false; end if;
  if doc_collection in ('profiles', 'posts', 'follows') then return true; end if;
  if doc_collection like 'notifications/%' then
    return doc_data->>'target' = auth.uid()::text;
  end if;

  if doc_collection = 'rooms' then
    room_id := doc_id;
    return public.vercell_is_public_room(room_id)
      or public.vercell_is_room_member(room_id, auth.uid())
      or public.vercell_can_manage_room(room_id, auth.uid());
  end if;
  room_id := substring(doc_collection from '^rooms/([^/]+)/msgs$');
  if room_id is not null then
    return public.vercell_is_public_room(room_id)
      or public.vercell_is_room_member(room_id, auth.uid())
      or public.vercell_can_manage_room(room_id, auth.uid());
  end if;
  room_id := substring(doc_collection from '^room_members/([^/]+)$');
  if room_id is not null then
    return public.vercell_is_public_room(room_id)
      or public.vercell_is_room_member(room_id, auth.uid())
      or public.vercell_can_manage_room(room_id, auth.uid());
  end if;
  if doc_collection like 'room_reactions/%' or doc_collection like 'room_reads/%' then
    room_id := substring(doc_collection from '^room_(?:reactions|reads)/([^/]+)$');
    return public.vercell_is_public_room(room_id)
      or public.vercell_is_room_member(room_id, auth.uid())
      or public.vercell_can_manage_room(room_id, auth.uid());
  end if;

  if doc_collection = 'dm' then
    return public.vercell_is_dm_member(doc_id, auth.uid());
  end if;
  conversation_id := substring(doc_collection from '^dm/([^/]+)/msgs$');
  if conversation_id is not null then
    return public.vercell_is_dm_member(conversation_id, auth.uid());
  end if;
  conversation_id := substring(doc_collection from '^dm_(?:reactions|reads)/([^/]+)$');
  if conversation_id is not null then
    return public.vercell_is_dm_member(conversation_id, auth.uid());
  end if;
  return doc_owner = auth.uid();
end;
$$;

create or replace function public.vercell_can_insert_doc(doc_collection text, doc_id text, doc_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  room_id text;
  conversation_id text;
  target_user uuid;
begin
  if auth.uid() is null then return false; end if;
  if doc_collection = 'posts' then
    return doc_data->>'uid' = auth.uid()::text;
  end if;
  if doc_collection = 'follows' then
    return doc_data->>'uid' = auth.uid()::text
      and doc_data->>'target' is not null
      and doc_data->>'target' <> auth.uid()::text
      and doc_id = (auth.uid()::text || '_' || (doc_data->>'target'));
  end if;
  if doc_collection = 'profiles' then return doc_data->>'uid' is null or doc_data->>'uid' = auth.uid()::text; end if;
  if doc_collection like 'notifications/%' then
    target_user := case
      when substring(doc_collection from '^notifications/([^/]+)$') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then substring(doc_collection from '^notifications/([^/]+)$')::uuid
      else null end;
    if target_user is null
      or doc_data->>'from' is distinct from auth.uid()::text
      or doc_data->>'target' is distinct from target_user::text then return false; end if;
    if doc_data->>'type' = 'follow' then
      return exists (
        select 1 from public.docs follow
        where follow.collection = 'follows'
          and follow.data->>'uid' = auth.uid()::text
          and follow.data->>'target' = target_user::text
      );
    end if;
    if doc_data->>'type' = 'room_invite' then
      room_id := doc_data->>'roomId';
      return room_id is not null
        and public.vercell_can_manage_room(room_id, auth.uid())
        and public.vercell_is_room_member(room_id, target_user);
    end if;
    return false;
  end if;

  if doc_collection = 'rooms' then
    return doc_data->>'uid' = auth.uid()::text
      and doc_data->>'owner' = auth.uid()::text
      and doc_data->>'visibility' = 'private'
      and doc_id <> 'general';
  end if;
  room_id := substring(doc_collection from '^rooms/([^/]+)/msgs$');
  if room_id is not null then
    return doc_data->>'uid' = auth.uid()::text
      and (public.vercell_is_public_room(room_id) or public.vercell_is_room_member(room_id, auth.uid()));
  end if;
  room_id := substring(doc_collection from '^room_members/([^/]+)$');
  if room_id is not null then
    return doc_data->>'uid' = doc_id
      and (
        (doc_id = auth.uid()::text and public.vercell_is_public_room(room_id))
        or public.vercell_can_manage_room(room_id, auth.uid())
      )
      and (
        (doc_data->>'role' = 'member'
          and (
            (doc_id = auth.uid()::text and public.vercell_is_public_room(room_id))
            or public.vercell_can_manage_room(room_id, auth.uid())
          ))
        or (doc_data->>'role' = 'owner'
          and doc_id = auth.uid()::text
          and public.vercell_is_room_owner(room_id, auth.uid()))
      );
  end if;
  room_id := substring(doc_collection from '^room_(?:reactions|reads)/([^/]+)$');
  if room_id is not null then
    return doc_data->>'uid' = auth.uid()::text
      and (public.vercell_is_public_room(room_id) or public.vercell_is_room_member(room_id, auth.uid()));
  end if;

  if doc_collection = 'dm' then
    if doc_data->>'uid' is distinct from auth.uid()::text
      or jsonb_typeof(doc_data->'members') is distinct from 'array' then return false; end if;
    if jsonb_array_length(doc_data->'members') <> 2 then return false; end if;
    select case
      when member.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (member.value #>> '{}')::uuid
      else null end into target_user
    from jsonb_array_elements(doc_data->'members') member(value)
    where member.value #>> '{}' <> auth.uid()::text
    limit 1;
    return target_user is not null and doc_data->'members' ? auth.uid()::text
      and public.vercell_is_mutual_follow(auth.uid(), target_user);
  end if;
  conversation_id := substring(doc_collection from '^dm/([^/]+)/msgs$');
  if conversation_id is not null then
    return doc_data->>'uid' = auth.uid()::text
      and public.vercell_is_dm_member(conversation_id, auth.uid());
  end if;
  conversation_id := substring(doc_collection from '^dm_(?:reactions|reads)/([^/]+)$');
  if conversation_id is not null then
    return doc_data->>'uid' = auth.uid()::text
      and public.vercell_is_dm_member(conversation_id, auth.uid());
  end if;
  return false;
end;
$$;

create or replace function public.vercell_can_update_doc(doc_collection text, doc_id text, old_data jsonb, new_data jsonb, doc_owner uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  room_id text;
begin
  if auth.uid() is null then return false; end if;
  if doc_collection like 'notifications/%' and old_data->>'target' = auth.uid()::text then
    return new_data->>'target' = auth.uid()::text
      and new_data->>'from' = doc_owner::text
      and new_data->>'uid' = auth.uid()::text
      and new_data->>'type' in ('follow', 'room_invite');
  end if;
  if doc_collection = 'follows' then
    return doc_owner = auth.uid()
      and new_data->>'uid' = auth.uid()::text
      and new_data->>'target' is not null
      and new_data->>'target' <> auth.uid()::text
      and doc_id = (auth.uid()::text || '_' || (new_data->>'target'));
  end if;
  room_id := case when doc_collection = 'rooms' then doc_id else null end;
  if room_id is not null then
    return public.vercell_can_manage_room(room_id, auth.uid())
      and (
        public.vercell_is_room_owner(room_id, auth.uid())
        or public.vercell_room_role(room_id, auth.uid()) = 'owner'
      )
      and new_data->>'uid' = doc_owner::text
      and (new_data->>'owner' is null or public.vercell_is_room_member(room_id, (new_data->>'owner')::uuid));
  end if;
  room_id := substring(doc_collection from '^room_members/([^/]+)$');
  if room_id is not null then
    if public.vercell_can_manage_room(room_id, auth.uid()) then
      return new_data->>'uid' = doc_id
        and new_data->>'role' in ('member', 'admin', 'owner')
        and (new_data->>'role' = 'member'
          or public.vercell_is_room_owner(room_id, auth.uid())
          or public.vercell_room_role(room_id, auth.uid()) = 'owner');
    end if;
    return doc_id = auth.uid()::text
      and new_data->>'uid' = auth.uid()::text
      and new_data->>'role' = public.vercell_room_role(room_id, auth.uid());
  end if;
  return doc_owner = auth.uid() and (new_data->>'uid' is null or new_data->>'uid' = auth.uid()::text);
end;
$$;

create or replace function public.vercell_can_delete_doc(doc_collection text, doc_id text, doc_data jsonb, doc_owner uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  room_id text;
begin
  if auth.uid() is null then return false; end if;
  if doc_collection like 'notifications/%' and doc_data->>'target' = auth.uid()::text then return true; end if;
  room_id := substring(doc_collection from '^room_members/([^/]+)$');
  if room_id is not null then
    if doc_id = auth.uid()::text then
      return not public.vercell_is_room_owner(room_id, auth.uid());
    end if;
    if doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.vercell_is_room_owner(room_id, doc_id::uuid) then return false; end if;
    return public.vercell_can_manage_room(room_id, auth.uid());
  end if;
  return doc_owner = auth.uid();
end;
$$;

create or replace function public.vercell_guard_room_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.collection = 'rooms' then
    if coalesce(old.data->>'visibility', 'public') is distinct from coalesce(new.data->>'visibility', 'public') then
      raise exception 'Oda görünürlüğü sonradan değiştirilemez';
    end if;
    if new.data->>'owner' is null
      or new.data->>'owner' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not public.vercell_is_room_member(old.id, (new.data->>'owner')::uuid) then
      raise exception 'Oda sahibi geçerli bir üye olmalı';
    end if;
    if old.data->>'owner' is distinct from new.data->>'owner'
      and not public.vercell_is_room_owner(old.id, auth.uid()) then
      raise exception 'Oda sahipliğini yalnızca mevcut sahip devredebilir';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.vercell_is_room_member(text, uuid) from public;
revoke all on function public.vercell_is_public_room(text) from public;
revoke all on function public.vercell_is_room_owner(text, uuid) from public;
revoke all on function public.vercell_can_manage_room(text, uuid) from public;
revoke all on function public.vercell_room_role(text, uuid) from public;
revoke all on function public.vercell_is_dm_member(text, uuid) from public;
revoke all on function public.vercell_is_mutual_follow(uuid, uuid) from public;
revoke all on function public.vercell_can_read_doc(text, text, jsonb, uuid) from public;
revoke all on function public.vercell_can_insert_doc(text, text, jsonb) from public;
revoke all on function public.vercell_can_update_doc(text, text, jsonb, jsonb, uuid) from public;
revoke all on function public.vercell_can_delete_doc(text, text, jsonb, uuid) from public;
revoke all on function public.vercell_guard_room_update() from public;
grant execute on function public.vercell_can_read_doc(text, text, jsonb, uuid) to authenticated;
grant execute on function public.vercell_can_insert_doc(text, text, jsonb) to authenticated;
grant execute on function public.vercell_can_update_doc(text, text, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.vercell_can_delete_doc(text, text, jsonb, uuid) to authenticated;

drop policy if exists "oku" on public.docs;
drop policy if exists "ekle" on public.docs;
drop policy if exists "guncelle" on public.docs;
drop policy if exists "sil" on public.docs;
drop policy if exists "vercell_docs_select" on public.docs;
drop policy if exists "vercell_docs_insert" on public.docs;
drop policy if exists "vercell_docs_update" on public.docs;
drop policy if exists "vercell_docs_delete" on public.docs;
drop trigger if exists vercell_guard_room_updates on public.docs;
create trigger vercell_guard_room_updates
before update on public.docs
for each row execute function public.vercell_guard_room_update();

create policy "vercell_docs_select" on public.docs
for select to authenticated
using (public.vercell_can_read_doc(collection, id, data, owner));

create policy "vercell_docs_insert" on public.docs
for insert to authenticated
with check (owner = auth.uid() and public.vercell_can_insert_doc(collection, id, data));

create policy "vercell_docs_update" on public.docs
for update to authenticated
using (public.vercell_can_update_doc(collection, id, data, data, owner))
with check (public.vercell_can_update_doc(collection, id, data, data, owner));

create policy "vercell_docs_delete" on public.docs
for delete to authenticated
using (public.vercell_can_delete_doc(collection, id, data, owner));

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "medya yukle" on storage.objects;
drop policy if exists "medya oku" on storage.objects;
create policy "medya yukle" on storage.objects
for insert to authenticated with check (bucket_id = 'media');
create policy "medya oku" on storage.objects
for select to authenticated using (bucket_id = 'media');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end
$$;
