-- Орг-иерархия должности для дерева выбора целевой должности (Блок → Дирекция → семейство → грейд).
ALTER TABLE job_position ADD COLUMN IF NOT EXISTS org_block VARCHAR(255);
ALTER TABLE job_position ADD COLUMN IF NOT EXISTS org_direction VARCHAR(255);

-- Для уже засеянных баз (сид не перезапускается при непустой таблице): проставляем орг-путь
-- по семейству должности. На пустой базе таблица ещё не заполнена — UPDATE отработает вхолостую,
-- а значения приедут из seed/reference-data.yml.
UPDATE job_position SET org_block = 'Бизнес', org_direction = 'Продуктовая дирекция'
  WHERE career_track IN ('Инженер-проектировщик', 'Инженер-технолог');
UPDATE job_position SET org_block = 'Бизнес', org_direction = 'Дирекция разработки продуктов'
  WHERE career_track IN ('Менеджер проектов', 'Системный инженер-тестировщик');
