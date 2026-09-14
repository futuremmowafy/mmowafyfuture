-- 1. Drop existing transaction type check constraint if it exists
alter table public.supplier_transactions 
  drop constraint if exists supplier_transactions_transaction_type_check;

-- 2. Add updated transaction type check constraint to include 'بيع' (sale to trader) and 'تحصيل' (collection from trader)
alter table public.supplier_transactions 
  add constraint supplier_transactions_transaction_type_check 
  check (transaction_type in ('شراء', 'دفع', 'بيع', 'تحصيل'));

-- 3. Add device_id column to supplier_transactions to link financial records directly to specific inventory items
alter table public.supplier_transactions 
  add column if not exists device_id uuid references public.devices(id) on delete set null;

-- Index for querying transactions by device
create index if not exists idx_supplier_transactions_device on public.supplier_transactions(device_id);

-- 4. Create salary_advances table for tracking technician loans/advances
create table if not exists public.salary_advances (
  id uuid default gen_random_uuid() primary key,
  technician_id uuid references public.technicians(id) on delete cascade,
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for querying advances by technician
create index if not exists idx_salary_advances_tech on public.salary_advances(technician_id);

-- 5. Add arrival_time to attendance table to log exact arrival time (to the minute)
alter table public.attendance 
  add column if not exists arrival_time time without time zone;

-- 6. Add driver_id and assistant_id columns to devices table for delivery batch team tracking
alter table public.devices 
  add column if not exists driver_id uuid references public.technicians(id) on delete set null;

alter table public.devices 
  add column if not exists assistant_id uuid references public.technicians(id) on delete set null;

-- Indexes for querying devices by driver/assistant
create index if not exists idx_devices_driver on public.devices(driver_id);
create index if not exists idx_devices_assistant on public.devices(assistant_id);

-- 7. Add second_technician_id column to devices table for dual technician tracking
alter table public.devices 
  add column if not exists second_technician_id uuid references public.technicians(id) on delete set null;

create index if not exists idx_devices_second_technician on public.devices(second_technician_id);

-- 8. Add installment tracking columns to devices table
alter table public.devices 
  add column if not exists installment_monthly numeric,
  add column if not exists installment_months integer,
  add column if not exists installment_notes text;

-- 9. Add outdoor_serial column to devices table for dual serial tracking
alter table public.devices 
  add column if not exists outdoor_serial text;

create index if not exists idx_devices_outdoor_serial on public.devices(outdoor_serial);

