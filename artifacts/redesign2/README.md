# REDESIGN2 — итог проверки

22 ноября 2026, Windows / Node.js 24, production `http://localhost:3000`. Визуальная часть завершена; надёжность каждого запуска реального гостя не заявляется.

## Результаты

| Проверка | Фактический результат |
| --- | --- |
| `npm run typecheck` | Прошёл |
| `npm run lint` | Прошёл |
| `npm test` | 10/10 |
| `npm run build` | Прошёл, webpack production |
| `npm run test:e2e -- --reporter=list --output="C:\Users\REDMI\AppData\Local\Temp\opencode\pocketosix-redesign2-e2e-final"` | 40/40; детерминированная оболочка, не доказательство Linux |
| Lighthouse 13.6.0, настоящий preview + эффекты | Performance 95 mobile / 100 desktop; Accessibility, Best Practices, SEO 100 в обоих режимах |
| Лендинг 390 / 768 / 1440px, EN / RU | Проверен; нет горизонтального overflow, настоящее изображение загружено |
| Декор hero / reveal | Браузерные тесты: offscreen pause, live reduced-motion, focus reveal, SSR без JS. В настоящей скрытой вкладке Chrome также наблюдался `data-motion=paused` |
| Защищённые файлы | Все 6 SHA256 совпали с исходными; [результат](protected-hashes.json) |

Lighthouse выполнен для английского лендинга с обычным motion, в headless Chrome с `--disable-gpu`. Это локальный замер, не гарантия тех же чисел на deployment или другом устройстве. JSON: [mobile](lighthouse-mobile.json), [desktop](lighthouse-desktop.json), [краткая сводка](lighthouse-summary.json).

```powershell
npx --yes lighthouse@13.6.0 "http://localhost:3000" --output=json --output-path="artifacts\redesign2\lighthouse-mobile.json" --chrome-flags="--headless=new --disable-gpu" --quiet
npx --yes lighthouse@13.6.0 "http://localhost:3000" --preset=desktop --output=json --output-path="artifacts\redesign2\lighthouse-desktop.json" --chrome-flags="--headless=new --disable-gpu" --quiet
```

## Реальный Linux: успехи и границы

Последний полный прогон:

```powershell
$env:POCKETOSIX_VM_BROWSER = "chrome"
$env:POCKETOSIX_VM_DIAGNOSTICS = "1"
$env:POCKETOSIX_VM_CAPTURE = "1"
$env:POCKETOSIX_VM_INPUT_TRACE = "0"
npm run test:vm -- --headed --trace=off
```

**3/4 за 11,0 минуты.** tty1 login / anti-echo marker, committed persistence / reload / confirmed reset и гостевой WebDevice прошли. В GUI завершились assertions Apps → Terminal, исполнение KMS-команд с file-oracle, resize / fullscreen, lock второй вкладки, committed reload и reset. После них упал optional capture второго xterm: `real-vm.spec.ts:306`, 0 вместо >10 текстовых пикселей за 30 секунд. Это не passing всего suite. Проверки не ослаблялись.

В preview установлен неотредактированный настоящий framebuffer 1920×1200: `uname -a`, Alpine release и второй пустой терминал. `neofetch` отсутствовал. Работающая shell второго окна не заявляется; большие тайлы закрывают выбранные обои. Снимок сам по себе не доказывает все сценарии ввода.

Отдельный последующий захват плавающего терминала с видимыми обоями не получился: первая попытка остановилась до появления кадра xterm; вторая достигла таймаута 300 секунд на `starting`. Причина последнего зависания не установлена. Этот запуск не считается успешным; прежний проверенный preview оставлен.

- `Alt + Enter` в реальных прогонах не открыл терминал. Проверенный путь: дождаться гостевой панели → Apps → Terminal → shell prompt. Доступна отдельная настоящая tty1.
- Немедленный reload до IDB commit терял тестовый файл. Проверка committed persistence не устраняет задержку и не гарантирует завершение всех очередей. Поддерживаемый durable-flush API не подтверждён; Save не добавлен.
- Tailscale / exit node, production deployment, реальные мобильные устройства не проверялись. Адаптивные снимки 390px сделаны в desktop Chrome.
- Перед первым коммитом 0.0.1 владелец подтвердил право публикации обоев и скриншотов; источник и название лицензии не предоставлены, MIT проекта на обои не распространяется. Runtime остаётся proprietary и загружается с официального CDN.

## Скриншоты и изменения

[Все восемь обязательных снимков, дополнительные ширины и русский интерфейс](screenshots/README.md). Скриншоты `/run` получены с настоящим гостем в отдельном тестовом профиле; landing full-page снят с reduced motion для стабильного статического кадра.

Удалены старый prism / WebGL hero и fallback, sidebar / Tile / WorkspaceBar, «рабочие пространства» лендинга и повторяющиеся панели статуса. Новый CSS-3D / SVG-dither фон не использует WebGL. Добавлены EN/RU JSON + cookie, спокойная справка, полноэкранная оболочка, плавающая панель, drawer и корректная изоляция фокуса диалогов. Runtime, диск, сеть и COOP / COEP конфигурация не менялись.

Отчёт о проверках составлен до первого коммита: на тот момент ничего не коммитилось и не отправлялось в GitHub. Последующая начальная публикация 0.0.1 отдельно запрошена владельцем проекта; автоматического deployment отчёт не подтверждает.
