-- Knockout predictions are graded on the 90-minute (regulation) scoreline,
-- before any extra time or penalty shootout. home_score/away_score keep holding
-- the full/running result (used for display and to decide who advances); these
-- new columns hold the regulation score used for grading.
--
-- For group matches and knockouts decided in normal time, the regulation score
-- equals home_score/away_score. For matches that go to extra time or penalties
-- they differ, so the 90-minute score is recorded separately — never derived
-- from the extra-time-inclusive number our data provider reports.

begin;

alter table public.matches
  add column reg_home_score int check (reg_home_score between 0 and 99),
  add column reg_away_score int check (reg_away_score between 0 and 99);

alter table public.matches
  add constraint matches_reg_score_pairing
  check ((reg_home_score is null) = (reg_away_score is null));

commit;
