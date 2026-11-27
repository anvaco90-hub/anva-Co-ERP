-- 046_dual_quotation_types.sql
-- Support dual quotation types ('project' vs 'product') on single quotations table
-- plus whole-quotation markup_percent, discount modes, total_cost, issuer tracking,
-- and snapshot item base_cost/item_code columns.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS markup_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS header_discount_type text NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS header_discount_value numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_by_name text,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_type_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_type_check CHECK (type IN ('project', 'product'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_markup_percent_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_markup_percent_check CHECK (markup_percent >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_discount_mode_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_discount_mode_check CHECK (discount_mode IN ('none', 'whole_bill', 'per_item'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_header_discount_type_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_header_discount_type_check CHECK (header_discount_type IN ('amount', 'percent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_header_discount_value_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_header_discount_value_check CHECK (header_discount_value >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotations_type ON public.quotations (type);

UPDATE public.quotations
SET type = 'project'
WHERE type IS NULL;

ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS base_cost numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_code text;
