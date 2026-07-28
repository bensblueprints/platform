-- "As seen on" press badges for the waiting room (comma-separated names).
alter table webinars
  add column if not exists waiting_badges text;
