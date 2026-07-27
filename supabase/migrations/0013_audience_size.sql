-- Slice 12, migration 0013: per-webinar audience size knob — scales chat
-- line density and roster size in the generator.

alter table webinars add column if not exists chat_audience_size int default 240;
