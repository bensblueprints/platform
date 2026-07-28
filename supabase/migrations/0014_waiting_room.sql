-- Customizable pre-start waiting room (headline, body, optional image).
alter table webinars
  add column if not exists waiting_headline text,
  add column if not exists waiting_body text,
  add column if not exists waiting_image_url text;
