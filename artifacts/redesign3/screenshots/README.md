# Скриншоты REDESIGN3

Landing снят с текущего production server, без mock SDK и без запуска гостя. Hero — обычный motion; full-page — reduced motion, чтобы весь текст был видим. Оригинальный реальный poster не менялся.

| Кадр | 1440 px | 390 px |
| --- | --- | --- |
| Hero EN | [PNG](landing-hero-1440.png) | [PNG](landing-hero-390.png) |
| Full landing EN | [PNG](landing-full-1440.png) | [PNG](landing-full-390.png) |
| Hero RU | [PNG](landing-hero-1440-ru.png) | [PNG](landing-hero-390-ru.png) |
| Full landing RU | [PNG](landing-full-1440-ru.png) | [PNG](landing-full-390-ru.png) |

## Настоящий `/run`

Снято opt-in capture в прошедшем полном SDK suite (4/4), в отдельном чистом Playwright profile. Проверены реальный непустой framebuffer, гостевой процесс i3 и чтение wallpaper через syscalls. Кадры — сборка перед последними input-fix, без mock canvas. Геометрия панелей / pill после исправлений не менялась. Ширина 390 px — адаптивное окно desktop Chromium, не реальное мобильное устройство.

| Кадр | 1440 px | 390 px |
| --- | --- | --- |
| Docked, rail collapsed | [PNG](docked-1440.png) | [PNG](docked-390.png) |
| Docked, Disk panel | [PNG](disk-1440.png) | [PNG](disk-390.png) |
| Immersive, pill visible | [PNG](immersive-1440.png) | [PNG](immersive-390.png) |
| Leave / Stay | [PNG](leave-1440.png) | [PNG](leave-390.png) |
| Boot | [PNG](boot-1440.png) | [PNG](boot-390.png) |

В Disk указаны реальные origin usage / quota тестового профиля, не размер базового образа и не постоянные продуктовые числа. Личные файлы и Tailscale account не использовались. Обои разрешены владельцем для публикации, но не становятся MIT. [Provenance и SHA256 всех 18 PNG](../capture-provenance.json).
