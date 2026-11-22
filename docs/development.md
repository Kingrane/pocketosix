# Разработка, проверки и развёртывание

[README](../README.ru.md) · [Архитектура](architecture.md) · [Диск и сеть](storage-network.md) · [CONTRIBUTING.md](../CONTRIBUTING.md)

Нужны Node.js **≥ 20.9** (рекомендуется 24), npm и desktop Chrome / Edge. Устанавливайте закреплённый `@leaningtech/cheerpx` **1.4.0**; обновление SDK или гостевого образа — отдельная задача с проверкой API и лицензии.

## Команды

```powershell
npm install
npm run dev
```

`dev` использует webpack. `/` — лендинг, `/run` — рабочая область с явным **`> boot`**, `/docs` — справка без runtime. `npm run desktop` запускает свой Next dev server на фиксированном порту 3000 и открывает `/run` после реальной HTTP-готовности; [подробности и timeout](desktop.md#без-лендинга).

Для production:

```powershell
npm run build
npm start
```

Изменение runtime-адаптера / конфигурации в dev вызывает полную перезагрузку документа: активный WASM-гость не заменяется через HMR. Уже committed файлы остаются, процессы запускаются заново; незавершённые записи могут потеряться.

## Конфигурация

По умолчанию env не нужны. Для отдельного custom image:

```powershell
Copy-Item ".env.example" ".env.local"
```

| Переменная | Назначение |
| --- | --- |
| `NEXT_PUBLIC_DISK_URL` | URL совместимого собственного `ext2` |
| `NEXT_PUBLIC_DISK_BACKEND` | `cloud` или `bytes`, в соответствии с источником |
| `NEXT_PUBLIC_DISK_ID` | Отдельный ID overlay для этой версии base; префикс `pocketosix-`, далее буквы, цифры, `-` / `_` |
| `SITE_URL` | Настоящий origin для OG/Twitter, robots, sitemap; server-side build-time настройка |

Custom image требует всех трёх `NEXT_PUBLIC_DISK_*` и **нового ID**, например `pocketosix-my-alpine-v1`. Нельзя открывать стандартный overlay на другом base. Обновление содержимого по старому URL тоже требует нового ID; base должен быть неизменяемым. `bytes` использует `HttpBytesDevice` и HTTP(S), не WSS. Проверьте CORS / COEP и совместимость источника с backend; не обещайте автоматический перенос данных.

`NEXT_PUBLIC_*` публичны, это не место для секретов; после изменения production-конфигурации пересоберите приложение. Если `SITE_URL` не задан, используется `VERCEL_PROJECT_PRODUCTION_URL`, локально — `http://localhost:3000`. Перед публикацией вне Vercel задайте настоящий origin и пересоберите приложение.

## Браузер и изоляция

Целевая среда — desktop Chrome / Edge. Другие браузеры и реальные мобильные устройства не заявляются проверенными. Нужны WebAssembly, SharedArrayBuffer, IndexedDB, Web Locks, secure context (**HTTPS или localhost**) и фактический `crossOriginIsolated`.

Сохраняйте согласованные заголовки `next.config.ts` / `vercel.json`:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Проверяйте HTTP-ответ и `window.crossOriginIsolated`, а не только файлы конфигурации. Внешние ресурсы при COEP должны удовлетворять CORS / CORP. Не отключайте COEP для обхода CDN-проблемы.

### Vercel и другой хостинг

1. Импортируйте как Next.js-проект; подходящий Node.js, команда `npm run build`.
2. Сохраните заголовки из `vercel.json` и эквивалентную локальную конфигурацию.
3. Используйте **постоянный production-домен**: каждый preview origin хранит отдельный диск, смена домена не переносит IndexedDB.
4. Проверьте HTTPS, isolation, CORS / CORP runtime и base image.
5. Не проксируйте многогигабайтный base через serverless functions; используйте прямой совместимый источник.
6. Оставьте официальный CDN CheerpX; self-host требует отдельного лицензионного разрешения.

Deployment веб-оболочки не означает Linux compute на Vercel. Успешная сборка также не доказывает реальный boot или работоспособность гостевой сети.

Для Vercel импортируйте `Kingrane/pocketosix`, ветку `main`, с корнем проекта `/`, preset **Next.js** и стандартной командой `npm run build`. Для стандартного Alpine-диска переменные `NEXT_PUBLIC_DISK_*` не нужны. После deployment откройте `/run` в desktop Chrome / Edge; проверьте реальные заголовки и `window.crossOriginIsolated === true`, затем boot. Новый домен имеет отдельный диск: локальные файлы с `localhost` туда автоматически не переносятся.

**GitHub Pages не подходит для текущего приложения без переделки.** Нужен static export, тогда как текущие страницы используют server-side rendering; кроме того, Pages не предоставляет настройку обязательных HTTP COOP/COEP-заголовков через `next.config.ts` или `vercel.json`. Сам по себе экспорт HTML не обеспечит SharedArrayBuffer / CheerpX. Service-worker обход здесь не реализован и не проверен; отключать изоляцию нельзя. Для рабочего Linux desktop предпочтительнее Vercel либо хостинг с поддержкой Next.js и пользовательских response headers.

## Проверки

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run test:vm
```

| Команда | Что действительно проверяет |
| --- | --- |
| `typecheck` | TypeScript |
| `lint` | Статические правила |
| `test` | Node unit tests через `tsx`; helpers launcher не открывают порт / браузер |
| `test:e2e` | Детерминированная веб-оболочка с изолированным тестовым адаптером; не Linux |
| `test:vm` | Отдельный opt-in настоящий CheerpX, сетевой доступ и тяжёлый WebAssembly |

Точный охват определяется assertions в `tests/`, не наличием команды. Shell tests включают явный boot, StrictMode, lock, EN/RU cookie, UI-фокус, native KMS textarea и HTTP assets; mock SDK и его кадры не доказывают выполнение Linux.

Реальная VM-suite отдельно проверяет tty1 login / anti-echo shell marker, committed persistence / reload / confirmed reset, гостевой WebDevice stat / listing / PNG, GUI Apps → Terminal и KMS-команды, resize / fullscreen, lock второй вкладки. GUI-приложения должны запускаться реальными кликами, а не диагностическим SDK `run()`. File oracle проверяет результат команды через read-only чтение и exit status, не случайный вывод неактивной tty1. Не меняйте runtime-адаптер во время прогона; предпочтителен заранее запущенный production `npm start`.

**Reset-тесты — только в отдельном test profile / origin**, не на пользовательском диске. При изменениях runtime / storage отдельно проверяйте настоящий boot, ввод, reload / повторное открытие, second-writer lock и подтверждённый reset. Timeout, пропуск или недоступный CDN не считаются успехом.

### Диагностика настоящего гостя

По умолчанию используется Chromium Playwright; `chrome` / `msedge` выбирают установленный канал, всё равно с отдельным тестовым профилем:

```powershell
$env:POCKETOSIX_VM_BROWSER = "chrome" # или msedge
$env:POCKETOSIX_VM_DIAGNOSTICS = "1"
$env:POCKETOSIX_VM_CAPTURE = "1" # необязательный capture
npm run test:vm -- --headed --trace=off
Remove-Item Env:POCKETOSIX_VM_BROWSER, Env:POCKETOSIX_VM_DIAGNOSTICS, Env:POCKETOSIX_VM_CAPTURE
```

Это env тестового runner, не `NEXT_PUBLIC_*` и не настройки deployment. Диагностика сохраняет guest / browser console, настоящий framebuffer и размеры в HTML-отчёте. `observe-sdk.ts` загружает неизменённый официальный runtime только в тестовой странице; после ошибки ограниченно пытается прочитать guest logs документированным `run()`. Такая попытка не подтверждает готовность и не входит в production.

Для ввода opt-in `POCKETOSIX_VM_INPUT_TRACE=1` сохраняет DOM focus / key events и неизменённые сообщения SDK worker в тестовом отчёте, без дополнительной пересылки событий. Не публикуйте персональные логи.

Отдельная tty1-проверка:

```powershell
$env:POCKETOSIX_VM_BROWSER = "chrome"
$env:POCKETOSIX_VM_DIAGNOSTICS = "1"
npm run test:vm -- --headed --trace=off --grep "real tty1"
Remove-Item Env:POCKETOSIX_VM_BROWSER, Env:POCKETOSIX_VM_DIAGNOSTICS
```

Она ждёт вывод `/dev/tty1` и login, проверяет anti-echo marker; успех не означает готовый GUI. Opt-in capture сохраняется в `test-results`, не устанавливается на лендинг автоматически. [Правила съёмки](media-capture.md).

## Исторические результаты, не текущий passing badge

Прежний [отчёт REDESIGN2](../artifacts/redesign2/README.md), [скриншоты](../artifacts/redesign2/screenshots/README.md) и [полный прежний README](reference-redesign2.md) сохранены отдельно. Последний описанный полный VM-прогон был **3/4**, не passing: основные GUI assertions завершились, optional capture второго xterm упал. Его shell prompt, `Alt + Enter`, Tailscale / exit node и deployment не следует объявлять подтверждёнными. Последующий floating capture также достигал timeout на `starting`.

Смена теста на ожидание committed IDB-маркера не устранила асинхронную границу записи. Отчёт о новой проверке должен перечислять фактически выполненные команды, браузер, окружение, успехи, ошибки и пропуски; не переносите старые проценты и Lighthouse-числа как новые результаты.
