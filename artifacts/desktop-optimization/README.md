# Desktop optimization — рабочий отчёт

Исходный опубликованный checkpoint: `7cedc7b7955b918df9247c1ed3e9eba96a25a6ef`. Этот отчёт сопровождает следующий checkpoint оптимизации; дальнейшие изменения проверяются отдельно.

## Проверенная исходная среда

Обе команды выполнялись через настоящий CheerpX 1.4.0 и фиксированный Alpine base, в новых изолированных Playwright contexts. Личный профиль браузера и личный диск не использовались; reset не выполнялся.

- `npx tsx scripts/inspect-desktop.ts` — status 0; 106 507 мс на открытие страницы, boot до host-ready и read-only инспекцию вместе. Это **не** время открытия приложения и не отдельный замер boot.
- `npx tsx scripts/inspect-desktop.ts --session` — status 0; 99 426 мс на такой же составной сценарий.
- Гость: i3 4.21.1, Xorg `:0`, пользователь `user` с uid/gid 1000, auth-file `/home/user/.Xauthority`. Содержимое auth-file не читалось и не сохранялось.
- Наличие `/usr/bin/i3-msg`, `/usr/bin/rofi`, `/usr/bin/xterm`, `/usr/bin/thunar`, `/usr/bin/pcmanfm` подтверждено гостевым `command -v`.
- `i3 --get-socketpath` и `i3-msg -t get_version/get_tree/get_outputs` успешно выполнены в настоящей сессии. У `Linux.run` следует задавать существующий `cwd`: default cwd дал предупреждение `getcwd`.
- `/proc/<i3pid>/environ` отсутствует в этом userspace; его нельзя делать обязательным способом поиска окружения.
- В исходном Polybar: `screenchange-reload = true`. Частые изменения framebuffer могут приводить к его перезапуску. Это найденная конфигурация, а не замер количества перезапусков.
- Исходный Apps → Files запускает Thunar; Launcher — `rofi -show drun`. Закрытие окна — `Alt + Shift + Q`; middle-click kill в конфиге помечен как неработающий.

JSON и screenshots рядом содержат реальные результаты read-only инспекции; они не являются доказательством уже исправленного desktop.

## Проверки новой реализации

На checkpoint 22 ноября 2026 выполнены:

- `npm run typecheck`, `npm run lint`, `npm run build` — успешно.
- `npm test` — 55/55 успешно.
- `npx playwright test --project=chromium tests/browser/guest-controls.spec.ts` — 11/11 успешно. Это mock-тесты оболочки, не доказательство работы Linux.
- Предыдущий `npx tsx scripts/check-guest-controls.ts` — ошибка discovery после реального boot; `guest-controls-console.txt` содержит успешный framed probe после незавершённого `login:`. Host parser ожидал prefix в начале строки и потерял ответ. Добавлено исправление и unit regression; настоящий повторный прогон на момент checkpoint ещё не выполнен.

Полный актуальный deterministic E2E и настоящие floating / launcher / close / hide / restore остаются под проверкой. Успешных сравнительных app-latency серий нет; ускорение не заявляется. Файл `guest-controls-measurements.json` сохраняет неуспешную попытку, а не положительный benchmark.

Для замеров actual `setKmsCanvas` opt-in observer записывает вызовы в `window.__pocketKmsBindings`, вызывая оригинальный метод SDK. Это не FPS и не счётчик guest frames. Playwright routing в диагностическом режиме отключает HTTP cache: повторный boot в этом режиме проверяет warm overlay, но не обычный warm HTTP cache.

Задержки browser panel и запуска гостевого приложения должны измеряться отдельно. При запуске приложения одного IPC acknowledgment или появления процесса недостаточно: нужна проверка реального окна.
