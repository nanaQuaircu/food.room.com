-- Add Paystack as a payment method on folio payments
ALTER TABLE `payments`
  MODIFY `method` ENUM(
    'cash',
    'card',
    'mobile_money',
    'bank_transfer',
    'other',
    'paystack'
  ) NOT NULL DEFAULT 'cash';
