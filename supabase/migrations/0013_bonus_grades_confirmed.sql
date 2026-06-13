begin;

alter table public.bonus_grades add column confirmed_answer text;

commit;
