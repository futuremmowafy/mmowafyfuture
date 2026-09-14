-- 1. Technicians Table (الفنيين)
create table if not exists public.technicians (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  monthly_salary numeric not null default 0 check (monthly_salary >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Attendance Table (الحضور والغياب اليومي)
create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  technician_id uuid references public.technicians(id) on delete cascade not null,
  date date not null default current_date,
  status text not null check (status in ('حاضر', 'غائب', 'تأخير')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (technician_id, date)
);

-- 3. Suppliers Table (الموردين)
create table if not exists public.suppliers (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Supplier Transactions Table (حسابات الموردين والمعاملات المالية)
create table if not exists public.supplier_transactions (
  id uuid default gen_random_uuid() primary key,
  supplier_id uuid references public.suppliers(id) on delete cascade not null,
  transaction_type text not null check (transaction_type in ('شراء', 'دفع')),
  amount numeric not null check (amount >= 0),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Devices / Inventory & Sales Table (الأجهزة والمخزن والعملاء)
create table if not exists public.devices (
  id uuid default gen_random_uuid() primary key,
  brand text not null,
  capacity text not null,
  serial_number text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  cost_price numeric not null default 0 check (cost_price >= 0),
  status text not null default 'متاح' check (status in ('متاح', 'جاري التركيب عهدة مع الفني', 'تم التركيب')),
  technician_id uuid references public.technicians(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_address text,
  sale_price numeric not null default 0 check (sale_price >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  amount_remaining numeric not null default 0 check (amount_remaining >= 0),
  contract_images text[] default '{}' not null,
  assigned_at timestamp with time zone,
  installed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Cash Flow Table (الخزنة وحركة اليومية)
create table if not exists public.cash_flow (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('إيراد', 'مصروف')),
  amount numeric not null check (amount >= 0),
  description text not null,
  date date not null default current_date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Bot Sessions Table (جلسات البوت لحفظ الحالة المؤقتة)
create table if not exists public.bot_sessions (
  chat_id bigint primary key,
  state text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for performance
create index if not exists idx_devices_serial_number on public.devices(serial_number);
create index if not exists idx_devices_status on public.devices(status);
create index if not exists idx_attendance_date on public.attendance(date);
create index if not exists idx_supplier_transactions_supplier on public.supplier_transactions(supplier_id);
create index if not exists idx_cash_flow_date on public.cash_flow(date);
