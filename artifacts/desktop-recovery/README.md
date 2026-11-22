# Восстановление desktop — 22 ноября 2026

Работа начата от `96ac198` (tree восстановленного `59fff04`). Личный диск,
SDK 1.4.0, base и стандартный overlay ID не менялись. Localhost:3000 и личная
вкладка не перезапускались в этой итерации. Тесты используют новые browser contexts.
Сырые observation.json / console logs / screenshots — локальные диагностические
файлы; в коммит включён этот отчёт, код сценария и regression tests, не весь архив.

## Измеренное поведение исходной сборки

`npx tsx scripts/check-desktop-recovery.ts`, настоящий Chrome / CheerpX,
без network interception, reset и подмены SDK:

| Операция | Время | Результат |
| --- | ---: | --- |
| Первый неоднородный кадр | 184 493 мс | кадр появился; не доказательство полной готовности приложений |
| `/bin/sh` + Alpine release | 43 мс | exit 0 |
| Первый Python + импорты | 30 068 мс | exit 0 |
| Чтение i3 config / pidof | 255 мс | exit 0 |

Данные: `2026-11-22T17-15-55-798Z/observation.json`. Реальный конфиг содержит
`set $mod Mod1` и `bindsym $mod+Shift+space floating toggle`.
Это подтверждает binding, но не доставку клавиш в пользовательском браузере.

30 секунд первого Python объясняют преждевременный 20-секундный deadline
первичной проверки. Причины общего boot-разброса полностью не установлены.
Увеличение ожидания до 90 секунд — не ускорение Linux.

## Изменения

- Одно закрываемое уведомление вместо наложенных pending/error. Dismiss
  не отменяет команду, не снимает busy gate и не удаляет ошибку из Apps.
- Только discovery ожидает 90 секунд; остальные конечные команды — 20.
  Старые / поздние ответы не публикуются после timeout; повтор не запускается,
  пока прежний процесс не завершён.
- Одна автоматическая попытка floating после первого настоящего кадра.
  Live i3 discovery, один subscriber, idempotent enable; без переписывания config.
- Из `public/assets/Без названия.png` подготовлен lossless RGB8-кандидат
  `alpine_bg_rgb.png`, 1420×799, 1 038 045 байт, SHA-256
  `77bbd116eb2ebfa5ced8c59371f94add29a28f7cc5f2dc65e5524f2e31f3c254`.
  Все RGB-пиксели совпадают, alpha оригинала везде 255. Оригинал не изменён.
  После успешной проверки реального ввода в прогоне `17-51-42-936Z`
  стандартный `alpine_bg.png` заменён этой RGB-копией в рабочем коде.
  Прежний asset сохранён как `wallpaper-before-rgb.png` в резервной папке;
  SHA-256 `ecffeb2c4d42ebd08d7e94ca44ea91ec7991eca72534fa468c1fab04603642da`.
- Большие container ID нельзя передавать ни unsigned, ни signed decimal:
  [`src/util.c` i3 4.21.1](https://github.com/i3/i3/blob/4.21.1/src/util.c)
  отвергает отрицательные значения и `LONG_MAX`. Предыдущий signed-ID вариант
  отклонён реальной проверкой (`Invalid match: invalid con_id`), а не признан
  исправлением по результатам mock-тестов.
- Текущий вариант использует общий Python guard для таких окон: canonical
  container/XID сверяются до и после добавления случайного mark. Затем действие
  адресуется по XID + точному mark; `finally` удаляет только этот mark. Existing
  пользовательские marks не заменяются. XID вне диапазона парсера отклоняется.

## Проверки и ограничения

- `npm run typecheck`, `npm run lint` — успешно после исправления test-only type.
- `npm test` — 65/65, включая cold discovery / 90-second gate, единственную
  default-floating попытку, guarded high-bit targets, asynchronous close,
  отказ закрытия без повторной команды и hash/RGB8 asset.
- `npm run build` — успешно в изолированной копии `verify-current` в резервной
  папке. Production localhost:3000 продолжает обслуживать исходную сборку.
- `npx playwright test --config playwright.recovery.config.ts` против
  production-копии на localhost:3002 до mark guard — 93 passed / 1 skipped. Это mock
  contracts, а не доказательство работы Linux. Следующий полный прогон с mark
  guard: 92 passed / 1 failed / 1 skipped — live reduced-motion landing test
  оставил 4 unrevealed элемента. Landing-код не менялся; требуется повторная
  проверка без параллельного тяжёлого real-VM прогона. Первый dev-прогон:
  26 passed / 1 failed — fullscreen-кнопку перекрыла Next dev overlay.
- Последний полный mock E2E на production-копии с asynchronous close,
  без параллельного real-VM: **94 passed / 1 skipped**, exit 0.
  Reduced-motion test в этом прогоне прошёл; причина прежнего intermittent
  failure не установлена. Optional hero-video test пропущен, не признан успехом.
- Реальный dev-прогон на localhost:3001: frame timeout 240 000 мс, exit 1,
  controller state потерян. Не считается успешным boot.
- Реальный production-прогон `17-28-37-786Z`: кадр за 65 024 мс,
  live discovery и floating enabled подтверждены; запуск XTerm за 10 454 мс,
  затем subscriber exit 1, окно осталось tiled. Успешного default floating
  для новых окон этим прогоном НЕТ. Обои и native keys не проверялись.
  Данные находятся в `verify-current/artifacts/desktop-recovery` резервной папки.
- Прогоны `17-35-22-153Z` и `17-41-50-069Z`: native Alt+Shift+Space
  переключил настоящий XTerm, `feh` RGB завершился exit 0; shell marker после
  фона не подтвердился. Скриншот последнего показывает `rintf`, а не `printf`.
- `17-51-42-936Z`: RGB feh exit 0 и native input marker exit 0, то есть
  команда действительно создала файл, не просто отобразилась в терминале.
  Signed-ID вариант по-прежнему не включил default floating и не спрятал окно;
  прогон exit 1. Это проверка обоев/ввода, не успешная проверка всех controls.
- AST/model execution общего Python guard: 5/5 сценариев (success,
  XID reuse, absent target, rejected action, close) — мутация при подмене
  identity не выполняется, user mark сохранён, собственный mark удалён.
  Это проверка алгоритма, не исполнение в настоящем i3.
- `18-00-50-349Z`: default floating нового настоящего XTerm подтверждён;
  native Alt+Shift+Space, targeted floating, RGB feh, shell marker после фона,
  hide / restore — успешно. Close ACK получен, но первый tree ещё содержал
   окно, поэтому прогон exit 1. В controller добавлено ожидание реального
   исчезновения до 10 секунд без повторного `kill`.
- `18-07-32-732Z`: frame 69 175 мс, XTerm 9 249 мс, RGB feh 2 302 мс / exit 0;
  default floating, native input, targeted floating, hide и restore подтверждены.
  Close ACK получен, но окно осталось открытым после 10 секунд: controller
  вернул `false` с честной ошибкой, прогон exit 1. Stop и storage не достигнуты.
- `18-13-34-488Z`: тот же адресный close не подтверждён; native diagnostic
  остановился на ошибке test-only парсинга `get_config` (i3-msg по умолчанию
  печатает текст, не JSON). Парсинг исправлен; это не свидетельство отсутствия binding.
- `18-17-17-054Z`: frame 59 947 мс, XTerm 8 184 мс, RGB feh 1 892 мс / exit 0.
  Адресный close не подтверждён; binding Alt+Shift+Q проверен по настоящему config,
  после этого native close также не убрал окно. Причина не установлена, не
  добавлялись принудительный kill или автоматические повторные закрытия.
  Stop floating подтверждён и вернул окно в tiling; второй writer отклонён lock.
  Тестовый marker найден в committed SDK IDB store. После reload первый кадр
  появился, но discovery завершился 90-секундным timeout и pending `stalled`;
  диагностическое ожидание 150 секунд тоже истекло. Чтение файла после reload
  и reset не достигнуты, персистентность этим прогоном не подтверждена, exit 1.
- `--diagnose-close` сохраняет exit 1 при ошибке адресного close даже при успехе
  следующих проверок. `--storage` проверяет lock, committed marker,
  reload/reopen и подтверждённый reset **только нового тестового context**;
  пропущенные / не достигнутые шаги не считаются успехом.

65 секунд другого boot нельзя сравнивать с 184 секундами как доказанное
ускорение: разные contexts и состояние внешнего cache, без контролируемой серии.
Изменения оформляются отдельным локальным коммитом; push/deployment и перезапуск
localhost:3000 не выполнялись. Личный диск не сбрасывался.

## Безопасное повторение проверок

Production-проверки выполняются из отдельной копии
`D:\REDMI\vscodik\pocketosix-recovery-20261122\verify-current`, на порту 3002,
чтобы не пересобирать `.next` работающего localhost:3000.

```powershell
$env:POCKETOSIX_CHECK_URL = 'http://localhost:3002/run'
npx tsx scripts/check-desktop-recovery.ts --controls --storage
```

Сценарий сам создаёт новый browser context, не подключается к личной вкладке.
`--controls` изменяет окна и пишет тестовый shell marker; `--storage` дополнительно
создаёт тестовый файл, проверяет reload и **подтверждает reset тестового диска**.
Не переносите эти операции в личный profile. Скрипт не открывает Tailscale,
не меняет base/overlay ID и не сбрасывает origin storage целиком.

Временный `playwright.recovery.config.ts` удалён из основного проекта после
полного прогона; его копия и проверенная сборка сохранены в `verify-current`.
Чтобы повторить mock E2E, выполните там
`npx playwright test --config playwright.recovery.config.ts` против порта 3002.

## Дополнительная диагностика после `a8231e5`

- `18-32-01-406Z`, настоящий isolated Chrome/CheerpX, `--storage`: первый кадр
  65 153 мс; shell / Python / чтение i3 config — exit 0. Lock второй вкладки
  и committed marker подтверждены. После reload discovery увидел два сокета:
  первый прошёл `get_version` / `get_tree`, второй остановился на `get_version`;
  console сообщил `Unexpected exit ... Program exited with code 71`.
  Ожидание 150 секунд истекло, exit 1. Reopen файла и reset не достигнуты.
- Добавлены реальные этапы probe в логи и неблокирующий AF_UNIX connect preflight:
  ошибочное / незавершённое подключение пропускается до `i3-msg`. Это защита от
  старых сокетов, а не очистка `/tmp` или изменение диска. Корректные version/tree
  и единственная отвечающая сессия по-прежнему обязательны. Реальная проверка
  устранения reload-сбоя новым вариантом на момент этого коммита ещё выполняется.
- Диагностический скрипт теперь ждёт окончания controller-команд перед прямым
  `vm.run` и без `--controls`. `--diagnose-close` читает XTerm version, проверяет
  исполнение shell после отказа закрытия и существование её process group через
  signal **0**, затем отдельно вводит `exit` только в disposable тестовом XTerm.
  Ошибка штатного закрытия сохраняет exit 1; production fallback / forced kill нет.
- Read-only исследование upstream старого XTerm показало, что `WM_DELETE` ждёт
  завершения shell после группового SIGHUP. Это возможное объяснение отказа,
  не доказанный сбой сигналов CheerpX и не исправление закрытия.
- `npm run typecheck`, `npm run lint`, `git diff --check` — успешно;
  `npm test` — **66/66**. `npm run build` — успешно в `verify-current`.
  Локальная Python-модель нового probe — 6/6 сценариев, включая dead-before-live,
  dead-after-live, incomplete connect и неоднозначность. Это модель протокола,
  не реальный Linux. Mock E2E после connect preflight пока не повторялся.
- Новый настоящий прогон `--controls --storage --diagnose-close` выполняется
  только на localhost:3002 в новом browser context. До его завершения нельзя
  заявлять успех reload/reset или исправление XTerm. Публикация текущего кода
  не означает, что все проверки Linux прошли. Localhost:3000, личная вкладка,
  SDK/base/overlay ID и пользовательский диск не изменялись в этой итерации.

### Результат нового настоящего прогона

`18-40-11-408Z`, `--controls --storage --diagnose-close`, завершился **exit 1**:
кадр за 69 637 мс; default floating, native Alt+Shift+Space, кнопочное floating,
RGB feh / исполненный shell marker, hide / restore, stop floating, lock второй
вкладки и committed marker — подтверждены. Адресное и native закрытие XTerm
не сработали; shell после них исполнила диагностическую команду, а отдельный
явный `exit` действительно закрыл окно. После reload ожидание 150 секунд снова
истекло: финальный лог содержит `imports` и `sockets=2`, но не `connect=`.
**Connect preflight этим прогоном не исправил reload.** Чтение сохранённого
файла и reset не достигнуты. Первичный boot не означает успешный reopen.
До reload журнал не сохранён отдельно, поэтому номер XTerm version и результат
проверки process group из данного артефакта восстановить нельзя; exit 0 этой
диагностики не доказывает успешность групповых сигналов. Автоматический forced
kill не добавлялся. Текущий код опубликован с этими известными ограничениями.
