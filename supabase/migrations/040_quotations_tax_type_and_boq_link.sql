-- 040_quotations_tax_type_and_boq_link.sql
-- Store quotation VAT mode (`tax_type`) explicitly and link `quotations.boq_id` -> `boqs(id)`

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'vat_excluded',
  ADD COLUMN IF NOT EXISTS boq_id uuid REFERENCES public.boqs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_quotations_boq_id ON public.quotations (boq_id);
CREATE INDEX IF NOT EXISTS idx_quotations_project_id ON public.quotations (project_id);

-- Backfill tax_type for existing quotations where null
UPDATE public.quotations
SET tax_type = CASE
  WHEN COALESCE(vat_rate, 7) = 0 OR COALESCE(vat_amount, 0) = 0 THEN 'vat_exempt'
  WHEN ABS(COALESCE(grand_total, total_amount, 0) - COALESCE(after_discount, subtotal, 0)) < 0.05
       AND COALESCE(vat_amount, 0) > 0 THEN 'vat_included'
  ELSE 'vat_excluded'
END
WHERE tax_type IS NULL;

-- Backfill boq_id from existing ref_no matching boqs.boq_no
UPDATE public.quotations q
SET boq_id = b.id
FROM public.boqs b
WHERE q.boq_id IS NULL
  AND q.ref_no IS NOT NULL
  AND q.ref_no = b.boq_no;
