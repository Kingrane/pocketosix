# REDESIGN3 — проверка и ограничения

22 ноября 2026, локальная webpack production-сборка на `http://localhost:3000`.
Изменения не закоммичены и не отправлены в GitHub.

## Реализовано

- Лендинг: spotlight / grid, настоящий прежний poster, поддержка lazy video, честные незаполненные метрики, три media-карточки, короткие reveal и fade при Launch.
- По последнему пожеланию владельца **сохранены исходные летающие CSS-3D / SVG-логотипы**: четыре в hero и два более приглушённых у «Как это работает». Они не перехватывают ввод. Только один ambient-регион движется; offscreen, reduced motion, hidden, video и Launch останавливают декор.
- `/run`: Docked rail 48 px, одна панель 320 px, canvas inset 8 px. До 720 px панель перекрывает canvas, не сжимая его. Immersive использует Fullscreen API всего HTML-документа; pill расположен от 60 px сверху, ниже панели гостя.
- Общие компактные панели, палитра, notch, auto-hide, EN/RU, Leave / Stay с полной навигацией без reset. `Ctrl + K` не перехватывается в canvas / tty1; меню открывает `Ctrl + Alt + Shift + M`.
- Дополнительный аудит выявил потерю modifier keyup при немедленном открытии меню. Исправлено: диалог открывается только после отпускания всех клавиш, без synthetic forwarding; M / K определяются по physical code. При переходе к mobile overlay фокус передаётся панели, inert-canvas не получает восстановленный KMS-фокус. Четыре новые regression tests прошли на последней production-сборке. Проверка русских key values синтетическая, не реальная смена OS keyboard layout.
- Короткие README EN/RU, подробности в `docs/`, отдельный `npm run desktop` с фиксированным origin и явным `> boot`.

## Выполненные проверки

| Команда / сценарий | Результат |
| --- | --- |
| `npm run typecheck` | Прошёл после сборки; первоначально исправлена типизация browser fixture. Одновременный запуск с build конфликтовал с пересозданием `.next/types`, поэтому повторная проверка выполнена отдельно. |
| `npm run lint` | Прошёл без предупреждений. |
| `npm test` | 14/14. |
| `npm run build` | Прошёл, Next.js 16.4.6 / webpack. |
| `npm run test:e2e` | Последний прогон: 69 passed, 1 skipped за 2,0 минуты, включая четыре новые input-regression tests. Mock SDK проверяет только контракт оболочки, не запуск Linux. |
| Landing capture 1440 / 390, EN / RU | 8 снимков; изображения загружены, нет pageerror, guest SDK / disk запросов и горизонтального overflow. |
| `npm run desktop` при занятом 3000 | Exit 1 / `EADDRINUSE`; существующий `/run` вернул HTTP 200 до и после. Браузер не открывался. |
| `POCKETOSIX_VM_CAPTURE_UI=1`, `POCKETOSIX_VM_DIAGNOSTICS=1`, `npm run test:vm` | 4/4 за 11,8 минуты на сборке до последних input-правок. Настоящие tty1 login / shell, committed reload / reset, WebDevice / i3, GUI click / key / resize / fullscreen, lock второй вкладки. |
| `POCKETOSIX_VM_DIAGNOSTICS=1`, `npm run test:vm -- --grep 'real Alpine/i3 accepts'` | 1/1 за 5,5 минуты на последней production-сборке. Дополнительно прошли реальное исполнение KMS-команды после закрытия chord-меню и передача фокуса в mobile overlay; затем resize / fullscreen, lock, committed reload и reset. |
| Lighthouse 13.6.0, последний landing | Performance 97 mobile / 100 desktop; Accessibility, Best Practices, SEO 100 в обоих режимах. |

Скриншоты: [галерея](screenshots/README.md). Измерения capture: [JSON](landing-capture.json).
Настоящий SDK suite выполнялся отдельно в чистом Playwright profile, не на пользовательском диске: [вывод первого полного прогона](real-vm-first.log). Дополнительный GUI-сценарий на последней production-сборке также **прошёл**, включая новые проверки escape-chord / mobile overlay: [вывод](real-vm-input-final.log). Первый полный 4/4 и последний отдельный 1/1 — разные прогоны; полный suite после последних input-правок повторно не запускался. Это подтверждение конкретных assertions, не гарантия надёжности каждого будущего boot.

Lighthouse запускался последовательно, **до** повторного тяжёлого SDK-прогона, на английском landing с обычным motion, в headless Chrome с `--disable-gpu`. Первая desktop-попытка завершилась `NO_NAVSTART`; повторный запуск прошёл. Это локальный замер, не гарантия production deployment / другого устройства: [mobile JSON](lighthouse-mobile.json), [desktop JSON](lighthouse-desktop.json), [сводка](lighthouse-summary.json).

```powershell
npx --yes lighthouse@13.6.0 "http://localhost:3000" --output=json --output-path="artifacts\redesign3\lighthouse-mobile.json" --chrome-flags="--headless=new --disable-gpu" --quiet
npx --yes lighthouse@13.6.0 "http://localhost:3000" --preset=desktop --output=json --output-path="artifacts\redesign3\lighthouse-desktop.json" --chrome-flags="--headless=new --disable-gpu" --quiet
```

## Что не заявляется

- WebM/MP4 и `feature-shell.png`, `feature-disk.png`, `feature-local.png` отсутствуют. Video playback test **skipped**; placeholders не являются снимками гостя. [Точный план съёмки](../../docs/media-capture.md).
- `document.hidden` в новых детерминированных tests проверяется синтетическим visibility-сигналом, не настоящей сменой вкладки.
- Save отключён: публичный durable-flush API SDK 1.4.0 не подтверждён. Уже committed файлы и pending-записи различаются в предупреждениях.
- Успешный end-to-end сценарий launcher / default browser пока не проверен; unit tests проверяют только helpers и readiness detector.
- Нет новой проверки Tailscale / exit node, deployment, реального мобильного устройства, `Alt + Enter`, floating-конфига или shell второго xterm. Ничего из этого не симулируется.
- Требование «меньше DOM nodes» **не выполнено**: Lighthouse показывает 279 элементов против 228 в REDESIGN2; полный capture с SVG definitions — 316. Добавлены stats / media-карточки и второй исходный многослойный logo-регион. Число строк нового кода также не объявляется уменьшенным.

## Что убрано / перенесено

- Icon-only feature columns заменены media-карточками; старые hero text-entry / длительные reveal заменены коротким управляемым motion.
- Прежняя единственная fullscreen-оболочка заменена Docked / Immersive; прежний toolbar / отдельный settings drawer заменены rail, pill и общими панелями.
- Длинные объяснения панели перенесены в раскрываемую справку и docs; большой front-page README сохранён отдельно в `docs/reference-redesign2.md`.
- Логотипы **не удалены**: запрет дополнительного hero-декора в первоначальном ТЗ отменён последующим пожеланием владельца.

## Сохранённые границы

[SHA256 и точный runtime diff](protected-hashes.json): base / overlay config, VM state, session hook, SDK types, COOP/COEP, poster и wallpaper совпадают с HEAD. Единственная правка `lib/webvm.ts` — UI gate `dialog[open]` → `dialog:modal` для tty1 при немодальной Docked-панели. Boot, disk и network orchestration не менялись. SDK 1.4.0, версия проекта 0.0.1 и base image сохранены.

Неизменённый poster — реальный framebuffer REDESIGN2, не новый capture. [Provenance](../redesign2/hero-provenance.json); второй xterm в нём пустой, его shell не подтверждена. MIT проекта не распространяется на proprietary runtime и пользовательские обои.
