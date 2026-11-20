-- Флаг подтверждения контекста (текущая/целевая должности) сотрудником.
-- Пока не подтверждён — фронт всегда показывает шаг ввода/подтверждения должностей
-- (STAGE_1_2_ONBOARDING), даже если должности уже известны. После подтверждения
-- (applyManualContext) сессия переходит к опроснику.

alter table dialog_session
    add column context_confirmed boolean not null default false;
