-- Isolated test-mode tables in the existing Loopmuse project; no extra project is needed.
-- Same constraints/RPC behavior as the production migration. No anonymous schema access.
create schema moodies_test;
revoke all on schema moodies_test from public,anon,authenticated;
grant usage on schema moodies_test to service_role;

-- Moodies tables are namespaced to coexist with another Supabase application.
create table moodies_test.moodies_products (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, stripe_product_id text not null unique check (stripe_product_id like 'prod_%'),
  active boolean not null default true, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table moodies_test.moodies_product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references moodies_test.moodies_products(id),
  sku text not null unique check (sku ~ '^[A-Za-z0-9_-]{1,80}$'), name text not null,
  stripe_price_id text not null unique check (stripe_price_id like 'price_%'),
  inventory_quantity integer not null default 0 check (inventory_quantity >= 0),
  inventory_policy text not null default 'deny' check (inventory_policy in ('deny','unlimited')),
  active boolean not null default true, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table moodies_test.moodies_checkout_attempts (
  id uuid primary key, cart_hash text not null check (cart_hash ~ '^[a-f0-9]{64}$'),
  public_token_hash text not null unique check (public_token_hash ~ '^[a-f0-9]{64}$'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  stripe_params jsonb not null, stripe_checkout_session_id text unique,
  created_at timestamptz not null default now()
);
create table moodies_test.moodies_orders (
  id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity (start with 1001) unique,
  checkout_attempt_id uuid not null unique references moodies_test.moodies_checkout_attempts(id),
  stripe_checkout_session_id text not null unique, stripe_payment_intent_id text unique,
  stripe_customer_id text, customer_email text, customer_name text, shipping_address jsonb,
  subtotal bigint not null check (subtotal >= 0), shipping_amount bigint not null check (shipping_amount >= 0),
  tax_amount bigint not null check (tax_amount >= 0), discount_amount bigint not null check (discount_amount >= 0),
  total bigint not null check (total >= 0), currency text not null check (currency ~ '^[a-z]{3}$'),
  payment_status text not null check (payment_status in ('pending','paid','failed','cancelled','partially_refunded','refunded')),
  fulfillment_status text not null default 'awaiting_payment' check (fulfillment_status in ('awaiting_payment','unfulfilled','on_hold','shipped')),
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','on_hold','cancelled','refunded')),
  inventory_processed boolean not null default false, inventory_shortfalls jsonb not null default '[]',
  refunded_amount bigint not null default 0 check (refunded_amount >= 0 and refunded_amount <= total),
  tracking_number text, tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  fulfillment_provider text, provider_shipment_id text, shipped_at timestamptz,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table moodies_test.moodies_order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references moodies_test.moodies_orders(id),
  product_id uuid not null references moodies_test.moodies_products(id), variant_id uuid not null references moodies_test.moodies_product_variants(id),
  sku text not null, product_name text not null, variant_name text not null,
  quantity integer not null check (quantity between 1 and 20), unit_amount bigint not null check (unit_amount >= 0),
  subtotal_amount bigint not null check (subtotal_amount >= 0), total_amount bigint not null check (total_amount >= 0),
  stripe_price_id text not null, metadata jsonb not null default '{}', unique(order_id,variant_id)
);
create table moodies_test.moodies_stripe_events (
  stripe_event_id text primary key, event_type text not null, processed_at timestamptz not null default now()
);
create index moodies_variants_product_idx on moodies_test.moodies_product_variants(product_id);
create index moodies_items_order_idx on moodies_test.moodies_order_items(order_id);
create index moodies_orders_fulfillment_idx on moodies_test.moodies_orders(created_at) where payment_status = 'paid' and fulfillment_status = 'unfulfilled';
create index moodies_orders_created_idx on moodies_test.moodies_orders(created_at desc);
create index moodies_attempts_created_idx on moodies_test.moodies_checkout_attempts(created_at);

create function moodies_test.moodies_touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger moodies_products_updated before update on moodies_test.moodies_products for each row execute function moodies_test.moodies_touch_updated_at();
create trigger moodies_variants_updated before update on moodies_test.moodies_product_variants for each row execute function moodies_test.moodies_touch_updated_at();
create trigger moodies_orders_updated before update on moodies_test.moodies_orders for each row execute function moodies_test.moodies_touch_updated_at();

-- All client access goes through server routes. No anonymous or customer direct-table policies.
alter table moodies_test.moodies_products enable row level security;
alter table moodies_test.moodies_product_variants enable row level security;
alter table moodies_test.moodies_checkout_attempts enable row level security;
alter table moodies_test.moodies_orders enable row level security;
alter table moodies_test.moodies_order_items enable row level security;
alter table moodies_test.moodies_stripe_events enable row level security;
revoke all on moodies_test.moodies_products, moodies_test.moodies_product_variants, moodies_test.moodies_checkout_attempts, moodies_test.moodies_orders, moodies_test.moodies_order_items, moodies_test.moodies_stripe_events from public, anon, authenticated;
grant all on moodies_test.moodies_products, moodies_test.moodies_product_variants, moodies_test.moodies_checkout_attempts, moodies_test.moodies_orders, moodies_test.moodies_order_items, moodies_test.moodies_stripe_events to service_role;
revoke all on sequence moodies_test.moodies_orders_order_number_seq from public, anon, authenticated;
grant usage, select on sequence moodies_test.moodies_orders_order_number_seq to service_role;

-- Event receipt, order, item snapshots and inventory commit together or roll back together.
create function moodies_test.moodies_apply_checkout_event(p_event_id text, p_event_type text, p_order jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_attempt moodies_test.moodies_checkout_attempts%rowtype;
  v_order moodies_test.moodies_orders%rowtype;
  v_variant moodies_test.moodies_product_variants%rowtype;
  v_item jsonb; v_snapshot jsonb; v_shortfalls jsonb := '[]';
  v_status text := p_order->>'payment_status'; v_inserted text;
begin
  insert into moodies_test.moodies_stripe_events(stripe_event_id,event_type) values(p_event_id,p_event_type)
    on conflict do nothing returning stripe_event_id into v_inserted;
  if v_inserted is null then return jsonb_build_object('duplicate',true); end if;
  if v_status not in ('pending','paid','failed','cancelled') then raise exception 'Invalid payment status'; end if;
  select * into strict v_attempt from moodies_test.moodies_checkout_attempts where id = (p_order->>'attempt_id')::uuid for update;
  if v_attempt.stripe_checkout_session_id is not null and v_attempt.stripe_checkout_session_id <> p_order->>'stripe_checkout_session_id' then raise exception 'Session mismatch'; end if;
  update moodies_test.moodies_checkout_attempts set stripe_checkout_session_id = p_order->>'stripe_checkout_session_id' where id = v_attempt.id;
  if jsonb_array_length(p_items) <> jsonb_array_length(v_attempt.items) then raise exception 'Item count mismatch'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select value into strict v_snapshot from jsonb_array_elements(v_attempt.items) where value->>'variant_id' = v_item->>'variant_id';
    if v_snapshot <> (v_item - 'subtotal_amount' - 'total_amount') then raise exception 'Item snapshot mismatch'; end if;
  end loop;
  if (select sum((value->>'subtotal_amount')::bigint) from jsonb_array_elements(p_items)) <> (p_order->>'subtotal')::bigint then raise exception 'Subtotal mismatch'; end if;
  insert into moodies_test.moodies_orders(checkout_attempt_id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_customer_id,
    customer_email,customer_name,shipping_address,subtotal,shipping_amount,tax_amount,discount_amount,total,currency,payment_status)
  values(v_attempt.id,p_order->>'stripe_checkout_session_id',p_order->>'stripe_payment_intent_id',p_order->>'stripe_customer_id',
    p_order->>'customer_email',p_order->>'customer_name',p_order->'shipping_address',(p_order->>'subtotal')::bigint,
    (p_order->>'shipping_amount')::bigint,(p_order->>'tax_amount')::bigint,(p_order->>'discount_amount')::bigint,
    (p_order->>'total')::bigint,p_order->>'currency',v_status)
  on conflict (checkout_attempt_id) do nothing;
  select * into strict v_order from moodies_test.moodies_orders where checkout_attempt_id = v_attempt.id for update;
  -- Paid and refunded states never regress on late failed/expired/completed events.
  if v_order.inventory_processed then return jsonb_build_object('order_id',v_order.id,'duplicate',false); end if;
  update moodies_test.moodies_orders set payment_status=v_status, stripe_payment_intent_id=p_order->>'stripe_payment_intent_id',
    stripe_customer_id=p_order->>'stripe_customer_id', customer_email=p_order->>'customer_email',
    customer_name=p_order->>'customer_name', shipping_address=p_order->'shipping_address',
    order_status=case when v_status in ('failed','cancelled') then 'cancelled' else 'pending' end
  where id=v_order.id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into moodies_test.moodies_order_items(order_id,product_id,variant_id,sku,product_name,variant_name,quantity,unit_amount,subtotal_amount,total_amount,stripe_price_id)
    values(v_order.id,(v_item->>'product_id')::uuid,(v_item->>'variant_id')::uuid,v_item->>'sku',v_item->>'product_name',v_item->>'variant_name',
      (v_item->>'quantity')::integer,(v_item->>'unit_amount')::bigint,(v_item->>'subtotal_amount')::bigint,(v_item->>'total_amount')::bigint,v_item->>'stripe_price_id')
    on conflict(order_id,variant_id) do nothing;
  end loop;
  if v_status = 'paid' then
    -- Lock in deterministic order to avoid deadlocks across multi-SKU purchases.
    for v_item in select value from jsonb_array_elements(p_items) order by value->>'variant_id' loop
      select * into strict v_variant from moodies_test.moodies_product_variants where id=(v_item->>'variant_id')::uuid for update;
      if v_variant.inventory_policy = 'deny' then
        if v_variant.inventory_quantity < (v_item->>'quantity')::integer then
          v_shortfalls := v_shortfalls || jsonb_build_array(jsonb_build_object('sku',v_variant.sku,'missing',(v_item->>'quantity')::integer-v_variant.inventory_quantity));
        end if;
        update moodies_test.moodies_product_variants set inventory_quantity=greatest(0,inventory_quantity-(v_item->>'quantity')::integer) where id=v_variant.id;
      end if;
    end loop;
    update moodies_test.moodies_orders set inventory_processed=true,inventory_shortfalls=v_shortfalls,
      subtotal=(p_order->>'subtotal')::bigint,shipping_amount=(p_order->>'shipping_amount')::bigint,
      tax_amount=(p_order->>'tax_amount')::bigint,discount_amount=(p_order->>'discount_amount')::bigint,total=(p_order->>'total')::bigint,
      fulfillment_status=case when jsonb_array_length(v_shortfalls)>0 then 'on_hold' else 'unfulfilled' end,
      order_status=case when jsonb_array_length(v_shortfalls)>0 then 'on_hold' else 'confirmed' end
    where id=v_order.id;
    -- Refresh line totals from the confirmed Session, e.g. after an asynchronous payment.
    for v_item in select value from jsonb_array_elements(p_items) loop
      update moodies_test.moodies_order_items set subtotal_amount=(v_item->>'subtotal_amount')::bigint,total_amount=(v_item->>'total_amount')::bigint
      where order_id=v_order.id and variant_id=(v_item->>'variant_id')::uuid;
    end loop;
  end if;
  return jsonb_build_object('order_id',v_order.id,'duplicate',false);
end; $$;

create function moodies_test.moodies_apply_refund(p_event_id text,p_payment_intent_id text,p_refunded_amount bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order moodies_test.moodies_orders%rowtype; v_inserted text;
begin
  insert into moodies_test.moodies_stripe_events(stripe_event_id,event_type) values(p_event_id,'charge.refunded')
    on conflict do nothing returning stripe_event_id into v_inserted;
  if v_inserted is null then return; end if;
  select * into strict v_order from moodies_test.moodies_orders where stripe_payment_intent_id=p_payment_intent_id for update;
  if not v_order.inventory_processed then raise exception 'Paid order not yet recorded'; end if;
  if p_refunded_amount < 0 or p_refunded_amount > v_order.total then raise exception 'Invalid refund amount'; end if;
  -- Cumulative refunds are monotonic. Never automatically restock a shipped or refunded item.
  if p_refunded_amount > v_order.refunded_amount then
    update moodies_test.moodies_orders set refunded_amount=p_refunded_amount,
      payment_status=case when p_refunded_amount=total then 'refunded' else 'partially_refunded' end,
      order_status=case when p_refunded_amount=total then 'refunded' else 'on_hold' end,
      fulfillment_status=case when fulfillment_status='shipped' then 'shipped' else 'on_hold' end
    where id=v_order.id;
  end if;
end; $$;

create function moodies_test.moodies_mark_shipped(p_order_number bigint,p_tracking_number text,p_tracking_url text,p_provider text default 'manual',p_shipment_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order moodies_test.moodies_orders%rowtype;
begin
  select * into strict v_order from moodies_test.moodies_orders where order_number=p_order_number for update;
  if v_order.payment_status <> 'paid' or v_order.fulfillment_status not in ('unfulfilled','shipped') then raise exception 'Order is not ready for shipping'; end if;
  if length(trim(p_tracking_number)) not between 1 and 120 or p_tracking_url !~ '^https://' then raise exception 'Invalid tracking'; end if;
  if v_order.fulfillment_status='shipped' then
    if v_order.tracking_number=p_tracking_number and v_order.tracking_url=p_tracking_url then return; end if;
    raise exception 'Shipment already recorded';
  end if;
  update moodies_test.moodies_orders set fulfillment_status='shipped',tracking_number=p_tracking_number,tracking_url=p_tracking_url,
    fulfillment_provider=p_provider,provider_shipment_id=p_shipment_id,shipped_at=now() where id=v_order.id;
end; $$;
revoke all on function moodies_test.moodies_touch_updated_at() from public,anon,authenticated;
revoke all on function moodies_test.moodies_apply_checkout_event(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function moodies_test.moodies_apply_refund(text,text,bigint) from public,anon,authenticated;
revoke all on function moodies_test.moodies_mark_shipped(bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function moodies_test.moodies_apply_checkout_event(text,text,jsonb,jsonb),moodies_test.moodies_apply_refund(text,text,bigint),moodies_test.moodies_mark_shipped(bigint,text,text,text,text) to service_role;
