# PocketOSix — правила сопровождения

Эти инструкции действуют для всего репозитория. Делайте небольшие изменения в пределах задачи, соблюдайте существующий стиль и не удаляйте чужую работу. Пользовательский интерфейс и основная документация — на русском; бренд: **pocketosix — real unix vibe right in your browser!**

## Инварианты продукта

1. Показываем **настоящий Linux userspace** через официальный CheerpX. Не заменяйте загрузку гостя симулированным desktop, фальшивым терминалом, canned output или таймером «успешного запуска».
2. Стек: Next.js 16 App Router, React 19, TypeScript. SDK — официальный `@leaningtech/cheerpx` **1.4.0**. Не обновляйте версию без явной задачи, изучения API / лицензии и реальной проверки интеграции.
3. Импорт SDK — browser-only dynamic `import`. Runtime загружает официальный npm loader с CDN Leaning Technologies. Не копируйте runtime в `public/`, не перепаковывайте и не self-host без соответствующего лицензионного разрешения.
4. Не выдумывайте API. Проверяйте свойства, сигнатуры, события и методы завершения в установленном SDK, его типах и официальной документации. `types/cheerpx.d.ts` не должен маскировать несуществующие методы через `any` или неподтвержденные объявления.
5. Гостевой экран — Xorg / i3 через `setKmsCanvas`; ввод уже обрабатывает SDK. Не добавляйте дублирующую ручную пересылку keyboard / mouse событий. Сочетания i3 сверяйте с конфигом образа: upstream использует `Mod1` (обычно Alt), не Super.
6. Не называйте окружение настоящим Linux kernel, Docker, systemd или полной аппаратной VM. Это syscall compatibility для 32-битного x86 userspace; совместимость ограничена.

## Диск: безопасность важнее удобства

- Фиксированный base: `wss://disks.webvm.io/alpine_20251007.ext2`; HTTPS fallback: `https://disks.webvm.io/alpine_20251007.ext2`, по схеме официального WebVM.
- Writable root: `OverlayDevice(base, IDBDevice)`; стандартный ID: `pocketosix-alpine-20251007-v1`.
- **Никогда не меняйте base, оставляя прежний overlay ID.** Обновление образа требует нового ID, документации и явного решения о переносе данных. Изменяемое содержимое по прежнему URL также считается сменой образа.
- Для custom image `NEXT_PUBLIC_DISK_URL` / `NEXT_PUBLIC_DISK_BACKEND` (`cloud|bytes`) должен использоваться отдельный `NEXT_PUBLIC_DISK_ID`. Не допускайте тихого открытия стандартного overlay с другим base.
- Mounts: `/` → `ext2`, `/dev` → `devs`, `/dev/pts` → `devpts`, `/proc` → `proc`, `/sys` → `sys`. Init: `/sbin/init`, `uid: 0`, `gid: 0`.
- Удерживайте эксклюзивный `navigator.locks` lock для диска **весь срок записи**, включая загрузку, завершение и сброс. Не допускайте второго writer. Если блокировку нельзя обеспечить, не переходите молча к небезопасной записи.
- Закрытие компонентов, освобождение runtime, `dispose`, HMR и React cleanup **не сбрасывают диск**. Метод reset не является способом освобождения ресурсов.
- Reset — только по явному подтверждению пользователя, с предупреждением о потере файлов, пакетов и настроек. До удаления остановите writers / освободите подключения безопасным поддерживаемым способом. Удаляйте только выбранную собственную IDB-базу; не очищайте все origin storage и чужие базы.
- Не сбрасывайте пользовательский диск автоматически после ошибки. При blocked IDB deletion объясните необходимость закрыть другую вкладку, а не скрывайте проблему.
- `navigator.storage.persist()` вызывается по запросу пользователя. Показывайте фактический grant / отказ, учитывайте quota и eviction. Не обещайте бессрочную сохранность и offline.
- Персистентность ограничена одним profile и origin; RAM и процессы не сохраняются. Reload сохраняет диск, но не работающую сессию.

## Жизненный цикл и изоляция

- Browser side effects — внутри клиентского жизненного цикла: не обращайтесь к `window`, `navigator`, IndexedDB, canvas или SDK при SSR / module evaluation.
- Attach / release должны быть безопасны для React StrictMode: повторные effect setup / cleanup не создают параллельные boots, writers, callbacks и listeners.
- Асинхронная загрузка не должна привязывать runtime к уже размонтированному canvas. Отделяйте владение сессией от конкретной React-подписки, игнорируйте устаревшие результаты и корректно освобождайте ресурсы.
- Отписывайте собственные callbacks, observers и listeners. Не освобождайте lock, пока старый runtime еще может записывать. Для завершения используйте только реально поддерживаемые SDK механизмы; если требуется reload, обозначьте это честно.
- Держите `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp` согласованными в `next.config.ts` и `vercel.json`.
- Проверяйте secure context и фактический `crossOriginIsolated`. Не решайте проблему CDN отключением COEP. Не проксируйте огромные образы через serverless functions.

## Сеть и секреты

- Tailscale опционален, подключение — только по действию пользователя. Для запуска GUI не требуйте логин или гостевую сеть.
- Публичный интернет гостя требует аккаунта, внешнего exit node и подходящей политики tailnet. Не обещайте интернет только по факту появления Tailscale IP.
- Никогда не коммитьте auth keys, tokens, пароли, приватные `.env` или персональные логи. `NEXT_PUBLIC_*` публичны и не являются secret storage.
- Не добавляйте общий публичный authkey, автоматический логин или встроенный exit node. Не помещайте секреты в URL, тестовые fixtures и сообщения об ошибках.
- Не утверждайте, что внешняя инфраструктура отсутствует: compute локален, но runtime / диск CDN и Tailscale внешние.

## Архитектура и UI

- `lib/webvm.ts` — адаптер runtime; `lib/webvm-config.ts` — конфигурация диска; `lib/webvm-state.ts` — состояния; `hooks/use-linux-desktop.ts` — интеграция с React.
- Компоненты оболочки находятся в `components/linux/`: `linux-desktop`, `desktop-toolbar`, `desktop-dialog`, `boot-screen`. Не помещайте SDK orchestration в toolbar / dialog.
- Не добавляйте backend compute, snapshot RAM или экспорт целой VM без отдельной задачи.
- Используйте настоящие кнопки, доступные имена, заметный keyboard focus и понятные статусы ошибок. Диалоги должны иметь корректное управление фокусом и возврат фокуса; browser UI не должен отправлять ввод в гостя при активном диалоге.
- Состояние «запускается» не равно доказательству работающего i3. Логи, прогресс и ошибки должны отражать реальные события, без искусственных процентов.

## Проверки и отчетность

Базовые команды: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Unit tests выполняются через `tsx`. Для browser tests: `npx playwright install chromium`, затем `npm run test:e2e`.

Детерминированные tests веб-оболочки могут использовать изолированный тестовый адаптер, но не подменять production runtime и не заявляться доказательством загрузки Linux. Реальный SDK проверяется отдельно через opt-in `npm run test:vm`: нужен сетевой доступ и ресурсы для тяжелого WebAssembly.

При изменении runtime / диска отдельно проверяйте настоящий boot, доставку ввода, reload / повторное открытие диска, lock второй вкладки и подтвержденный reset в **тестовом** origin / profile. Пользовательский диск не используйте для разрушающих тестов. Точный автоматизированный охват определяют существующие assertions, а не этот список.

В отчете указывайте фактически выполненные команды и результаты. Пропуск, timeout или недоступность CDN не считаются успехом. Не публикуйте badges «passing», проценты покрытия и заявления о совместимости без подтверждения. Изменения API, storage semantics, env и UI отражайте в README и тестах.

## Лицензионная граница

MIT в `LICENSE` относится только к оригинальному коду / документации PocketOSix. CheerpX SDK / runtime proprietary, Alpine и пакеты имеют отдельные лицензии. Для production организации требуется соответствующее коммерческое соглашение с Leaning Technologies. Не трактуйте MIT как разрешение распространять или self-host runtime. При переносе WebVM-кода / assets сохраняйте их Apache-2.0 notices и исходную атрибуцию.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
