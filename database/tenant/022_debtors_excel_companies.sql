-- Align corporate account names with Hotel Messiah Debtors Ledger (Excel)
-- Idempotent renames + ensure Individual exists

UPDATE `corporate_accounts`
SET `name` = 'Goldcrest Mining',
    `notes` = COALESCE(NULLIF(`notes`, ''), 'Corporate travel account — Excel ledger')
WHERE `property_id` = 1 AND `name` IN ('Goldcrest Ltd', 'Goldcrest Mining');

UPDATE `corporate_accounts`
SET `name` = 'Blue Wave Logistics',
    `notes` = COALESCE(NULLIF(`notes`, ''), 'Corporate travel account — Excel ledger')
WHERE `property_id` = 1 AND `name` IN ('Blue Wave Travel', 'Blue Wave Logistics');

UPDATE `corporate_accounts`
SET `name` = 'Sunrise Telecom',
    `notes` = COALESCE(NULLIF(`notes`, ''), 'Corporate travel account — Excel ledger')
WHERE `property_id` = 1 AND `name` IN ('Sunrise Motors', 'Sunrise Telecom');

-- Ensure Excel company set exists when property 1 already has some accounts under other names
INSERT INTO `corporate_accounts` (`property_id`, `name`, `contact_name`, `email`, `phone`, `credit_limit`, `notes`, `is_active`)
SELECT 1, v.name, v.contact_name, v.email, v.phone, v.credit_limit, v.notes, 1
FROM (
  SELECT 'Goldcrest Mining' AS name, 'Accounts Payable' AS contact_name, 'accounts@goldcrest.example' AS email, '+233200000001' AS phone, 10000.00 AS credit_limit, 'Corporate travel account — Excel ledger' AS notes
  UNION ALL SELECT 'Blue Wave Logistics', 'Travel Desk', 'billing@bluewave.example', '+233200000002', 8000.00, 'Corporate travel account — Excel ledger'
  UNION ALL SELECT 'Sunrise Telecom', 'Fleet Office', 'fleet@sunrise.example', '+233200000003', 5000.00, 'Corporate travel account — Excel ledger'
  UNION ALL SELECT 'Individual', NULL, NULL, NULL, 0.00, 'Walk-in / individual debtors'
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM `corporate_accounts` ca
  WHERE ca.property_id = 1 AND ca.name = v.name
);
