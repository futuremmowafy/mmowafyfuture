-- ============================================================
-- FUTURE AIR ERP - COMPLETE DATABASE SCHEMA
-- For new Supabase Project: fsdgiebjkymenayboodg
-- ============================================================

-- 1. Technicians Table (الفنيين وموظفي التركيب)
CREATE TABLE IF NOT EXISTS public.technicians (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  monthly_salary numeric NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  role text DEFAULT 'فني',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Attendance Table (الحضور والغياب اليومي وساعة الوصول)
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  technician_id uuid REFERENCES public.technicians(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT current_date,
  status text NOT NULL CHECK (status IN ('حاضر', 'غائب', 'تأخير')),
  arrival_time time without time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (technician_id, date)
);

-- 3. Suppliers Table (الموردين والتجار)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Devices / Inventory & Sales Table (الأجهزة والمخزن والعملاء والأقساط)
CREATE TABLE IF NOT EXISTS public.devices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL,
  capacity text NOT NULL,
  serial_number text NOT NULL UNIQUE,
  outdoor_serial text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cost_price numeric NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  status text NOT NULL DEFAULT 'متاح' CHECK (status IN ('متاح', 'جاري التركيب عهدة مع الفني', 'تم التركيب')),
  technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  assistant_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  second_technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_address text,
  sale_price numeric NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_remaining numeric NOT NULL DEFAULT 0 CHECK (amount_remaining >= 0),
  installment_monthly numeric,
  installment_months integer,
  installment_notes text,
  contract_images text[] DEFAULT '{}' NOT NULL,
  assigned_at timestamp with time zone,
  installed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Supplier Transactions Table (حسابات الموردين والمعاملات المالية)
CREATE TABLE IF NOT EXISTS public.supplier_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('شراء', 'دفع', 'بيع', 'تحصيل')),
  amount numeric NOT NULL CHECK (amount >= 0),
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Salary Advances Table (سلفيات الفنيين والموظفين)
CREATE TABLE IF NOT EXISTS public.salary_advances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  technician_id uuid REFERENCES public.technicians(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  date date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Cash Flow Table (الخزنة وحركة اليومية وحسابات البنوك)
CREATE TABLE IF NOT EXISTS public.cash_flow (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('إيراد', 'مصروف')),
  amount numeric NOT NULL CHECK (amount >= 0),
  description text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Bot Sessions Table (جلسات البوت ومفاتيح الذكاء الاصطناعي والسيولة الدائمة)
CREATE TABLE IF NOT EXISTS public.bot_sessions (
  chat_id bigint PRIMARY KEY,
  state text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_devices_serial_number ON public.devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_outdoor_serial ON public.devices(outdoor_serial);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_supplier_id ON public.devices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_devices_technician_id ON public.devices(technician_id);
CREATE INDEX IF NOT EXISTS idx_devices_created_at ON public.devices(created_at);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_technician ON public.attendance(technician_id);

CREATE INDEX IF NOT EXISTS idx_supplier_transactions_supplier ON public.supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_device ON public.supplier_transactions(device_id);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_created_at ON public.supplier_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_salary_advances_tech ON public.salary_advances(technician_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_date ON public.cash_flow(date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_created_at ON public.cash_flow(created_at);

-- Disable Row Level Security (RLS) so the frontend & bot have unrestricted, blazing fast access
ALTER TABLE public.technicians DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions DISABLE ROW LEVEL SECURITY;

-- Storage Bucket for Contract Photos & Documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Direct SQL execution helper function
CREATE OR REPLACE FUNCTION execute_sql_raw(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;
