-- Migration 039: Add compatibility columns to payment_transactions if they don't exist
ALTER TABLE IF EXISTS public.payment_transactions 
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS vendor_bank_account_no text,
  ADD COLUMN IF NOT EXISTS vendor_promptpay text,
  ADD COLUMN IF NOT EXISTS cash_source text;
