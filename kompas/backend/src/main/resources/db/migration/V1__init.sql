-- «Компас»: начальная схема (раздел 6 ТЗ).
-- Источник истины по схеме — Flyway; Hibernate работает с ddl-auto=none.

create table job_position (
    id                   bigserial primary key,
    title                varchar(300) not null,
    type                 varchar(30)  not null,
    job_description_ref  varchar(500),
    career_track         varchar(200)
);

create unique index ux_job_position_title on job_position (title);

create table employee (
    id                   bigserial primary key,
    external_id          varchar(100) not null,
    full_name            varchar(300) not null,
    current_position_id  bigint references job_position (id),
    manager_full_name    varchar(300),
    manager_external_id  varchar(100)
);

create unique index ux_employee_external_id on employee (external_id);

create table competency (
    id            bigserial primary key,
    code          varchar(50)  not null,
    name          varchar(300) not null,
    description   text,
    role_id       bigint references job_position (id),
    target_level  integer
);

create unique index ux_competency_code on competency (code);
create index ix_competency_role on competency (role_id);

create table development_activity (
    id                        bigserial primary key,
    code                      varchar(50)  not null,
    title                     varchar(400) not null,
    description               text,
    type                      varchar(40),
    source_ref                varchar(500),
    related_competency_codes  text
);

create unique index ux_development_activity_code on development_activity (code);

create table dialog_session (
    id                   bigserial primary key,
    employee_id          bigint not null references employee (id),
    current_position_id  bigint references job_position (id),
    target_role_id       bigint references job_position (id),
    stage                varchar(30) not null,
    status               varchar(30) not null,
    created_at           timestamp with time zone not null,
    updated_at           timestamp with time zone not null
);

create index ix_dialog_session_employee on dialog_session (employee_id);

create table dialog_message (
    id          bigserial primary key,
    session_id  bigint not null references dialog_session (id),
    role        varchar(20) not null,
    content     text not null,
    created_at  timestamp with time zone not null,
    meta        text
);

create index ix_dialog_message_session on dialog_message (session_id, id);

create table idp (
    id              bigserial primary key,
    employee_id     bigint not null references employee (id),
    session_id      bigint references dialog_session (id),
    idp_date        date not null,
    status          varchar(30) not null,
    target_role_id  bigint references job_position (id),
    created_at      timestamp with time zone not null,
    updated_at      timestamp with time zone not null
);

create index ix_idp_employee on idp (employee_id);
create unique index ux_idp_session on idp (session_id);

create table idp_priority (
    id                bigserial primary key,
    idp_id            bigint not null references idp (id) on delete cascade,
    order_no          integer not null,
    development_goal  text not null,
    competency_codes  text,
    activity_codes    text
);

create index ix_idp_priority_idp on idp_priority (idp_id, order_no);

-- Трекинг реперных точек — [POST-MVP], таблица создаётся сейчас (раздел 3.2 ТЗ).
create table milestone (
    id               bigserial primary key,
    idp_priority_id  bigint not null references idp_priority (id) on delete cascade,
    title            varchar(500) not null,
    due_date         date,
    status           varchar(30) not null
);

create index ix_milestone_priority on milestone (idp_priority_id);

-- RAG-хранилище. Вектор хранится текстом (CSV float) за интерфейсом VectorStore:
-- pgvector не требуется, при переходе на него меняется только реализация.
create table reference_chunk (
    id           bigserial primary key,
    source_type  varchar(40)  not null,
    source_ref   varchar(500),
    text         text not null,
    embedding    text,
    meta         text
);

create index ix_reference_chunk_source on reference_chunk (source_type);
