-- Поля, нужные контракту нового фронта (/api/v1), которых нет в исходной модели:
--   * ключевая цель плана целиком (idp.main_goal, Gap #4);
--   * комментарий к конкретному действию с автором и временем (Gap #3).
-- Round-trip плана фронт ⇄ бэк не теряет эти значения.

alter table idp add column main_goal text;

alter table development_action add column comment text;
alter table development_action add column comment_author text;
alter table development_action add column comment_created_at timestamp;
