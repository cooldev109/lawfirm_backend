-- Update lawyer emails
UPDATE users SET email = 'henryzhang0109@gmail.com' WHERE id = (SELECT user_id FROM lawyers WHERE id = '96e54cbd-b5a2-4627-8935-09672337b5ec');
UPDATE users SET email = 'mazenabass991@gmail.com' WHERE id = (SELECT user_id FROM lawyers WHERE id = '098042d5-ce34-42e2-94ae-47369ea430a9');
SELECT u.email, u.first_name, u.last_name FROM users u JOIN lawyers l ON l.user_id = u.id;
