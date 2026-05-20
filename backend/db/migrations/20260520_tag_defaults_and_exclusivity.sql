UPDATE tags
SET is_default = CASE WHEN lower(name::text) = 'presence' THEN true ELSE false END,
    updated_at = now()
WHERE lower(name::text) IN ('presence', 'smart working', 'not billable');
