INSERT INTO default_tag_templates (name, color, sort_order)
VALUES ('Not billable', '#8E8E93', 30)
ON CONFLICT (name) DO NOTHING;

-- Existing users receive the default tag so they can mark stored sessions as excluded from overtime calculations.
INSERT INTO tags (user_id, name, color, is_default)
SELECT id, 'Not billable', '#8E8E93', false
FROM users
ON CONFLICT (user_id, name) DO NOTHING;
