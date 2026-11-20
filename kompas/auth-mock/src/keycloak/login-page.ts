function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface LoginPageInput {
  action: string;
  fields: Record<string, string | null>;
  error?: string;
}

/** Минимальная страница входа mock-Keycloak (заменяет hosted login). */
export function renderLoginPage({ action, fields, error }: LoginPageInput): string {
  const hidden = Object.entries(fields)
    .filter(([, value]) => value !== null && value !== '')
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value ?? '')}">`)
    .join('\n      ');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Единый вход (mock Keycloak)</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #F5F5F5;
      font-family: Inter, Roboto, system-ui, sans-serif; color: #101C2B; }
    .card { width: min(420px, calc(100vw - 32px)); background: #fff; border: 1px solid rgba(0,0,0,.12);
      border-radius: 8px; padding: 32px; box-shadow: 0 8px 24px rgba(16,28,43,.08); }
    .badge { display: inline-block; background: #253141; color: #fff; border-radius: 4px;
      padding: 4px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
    h1 { font-size: 20px; margin: 16px 0 4px; }
    p { margin: 0 0 20px; color: #5B6673; font-size: 14px; }
    label { display: block; font-size: 13px; margin: 14px 0 6px; color: #253141; }
    input[type=text], input[type=password] { width: 100%; padding: 10px 12px; border-radius: 4px;
      border: 1px solid rgba(0,0,0,.24); font-size: 15px; }
    button { margin-top: 24px; width: 100%; padding: 12px; border: 0; border-radius: 4px;
      background: #0961A4; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
    button:hover { background: #07538f; }
    .error { background: rgba(248,232,232,1); color: #BA1A1A; border-radius: 4px; padding: 10px 12px;
      font-size: 13px; margin-bottom: 16px; }
    .hint { margin-top: 18px; font-size: 12px; color: #5B6673; }
    code { background: #F1F3F5; padding: 1px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">Mock Keycloak</span>
    <h1>Единый вход</h1>
    <p>Общий вход в сервисы RE Team (включая «План развития» и «Компас»). Локальная эмуляция SSO — боевой Keycloak заменит эту страницу.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="${escapeHtml(action)}">
      ${hidden}
      <label for="username">Логин</label>
      <input id="username" name="username" type="text" autocomplete="username" value="demo" required>
      <label for="password">Пароль</label>
      <input id="password" name="password" type="password" autocomplete="current-password" value="demo" required>
      <button type="submit">Войти</button>
    </form>
    <div class="hint">Демо-доступ: <code>demo / demo</code> (сотрудник), <code>hr / hr</code> (HR).</div>
  </main>
</body>
</html>`;
}
