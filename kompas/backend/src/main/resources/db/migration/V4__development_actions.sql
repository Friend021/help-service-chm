-- Развивающие действия приоритета — блок «Инструмент развития / Конкретное
-- действие / Планируемый срок / Статус выполнения» формы «ПЛАН РАЗВИТИЯ».
--
-- Заменяет таблицу milestone и колонку activity_codes: в форме это одна
-- таблица на приоритет, а не отдельно активности и отдельно реперные точки.

create table development_action (
    id               bigserial primary key,
    idp_priority_id  bigint not null references idp_priority (id) on delete cascade,
    order_no         integer not null,
    instrument       varchar(30) not null,
    activity_code    varchar(50),
    action           text not null,
    due_date         date,
    status           varchar(30) not null
);

create index ix_development_action_priority on development_action (idp_priority_id, order_no);

drop table milestone;

alter table idp_priority drop column activity_codes;
