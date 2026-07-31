-- Per-webinar Facebook (Meta) Pixel ID for ad tracking.
alter table webinars
  add column if not exists fb_pixel_id text;
