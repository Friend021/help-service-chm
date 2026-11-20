-- Описание роли (профиль должности: опыт + ключевые функции) идёт в RAG-grounding
-- целиком и не помещается в varchar(500). Расширяем до text.
alter table job_position
    alter column job_description_ref type text;
