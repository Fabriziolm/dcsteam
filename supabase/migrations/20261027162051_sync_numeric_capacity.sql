-- Preserve imported financial and odometer values without the 10^10 ceiling
-- imposed by numeric(12,2). Existing values remain exact when the typmod is
-- removed; this does not round, truncate, or delete rows.
alter table public.invoices
  alter column amount_without_tax type numeric using amount_without_tax::numeric,
  alter column amount_with_tax type numeric using amount_with_tax::numeric,
  alter column withholding_amount type numeric using withholding_amount::numeric,
  alter column paid_amount type numeric using paid_amount::numeric;

alter table public.expenses
  alter column amount type numeric using amount::numeric;

alter table public.cash_movements
  alter column amount type numeric using amount::numeric;

alter table public.cash_balance_snapshots
  alter column balance type numeric using balance::numeric;

alter table public.services
  alter column km_start type numeric using km_start::numeric,
  alter column km_end type numeric using km_end::numeric;

notify pgrst, 'reload schema';
