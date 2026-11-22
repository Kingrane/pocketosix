<div align="center">
  <img src="public/icon.svg" width="88" height="88" alt="Логотип pocketosix" />
  <h1>pocketosix</h1>
  <p><strong>real unix vibe right in your browser!</strong></p>
</div>

[English](README.md) · **Русский**

Настоящий Alpine Linux userspace, Xorg и i3 на вашем устройстве через CheerpX — не имитация терминала. Браузер показывает desktop и хранит локальный изменяемый диск; сеть гостя через Tailscale необязательна.

## Быстрый старт

Нужны **Node.js ≥ 20.9** (рекомендуется Node.js 24), npm и современный desktop Chrome или Edge.

```powershell
npm install
npm run dev
```

Откройте **[localhost:3000/run](http://localhost:3000/run)** без лендинга и нажмите **`> boot`**. Само открытие страницы не запускает Linux. Для гостевого GUI аккаунт Tailscale не нужен.

## Открыть локальный desktop

После установки зависимостей используйте вместо `npm run dev`:

```powershell
npm run desktop
```

Команда запускает установленный Next.js dev server с webpack на порту **3000** и открывает `/run` в браузере по умолчанию только после сообщения готовности сервера и ответа маршрута HTTP 200. **`> boot`** по-прежнему нажимаете вы.

Занятый порт — ошибка: launcher не переиспользует другой сервер и не меняет origin вашего диска. Если сервер уже работает, откройте `/run` вручную. **Ctrl+C** останавливает только собственный сервер launcher.

[Локальный запуск, ярлык браузера и ручная настройка floating в i3 →](docs/desktop.md)

## Три важных ограничения

- **Экспериментальный x86-32 userspace, не Linux kernel и не полная VM.** Не все Linux-приложения совместимы; успешность каждого запуска не гарантируется.
- **Локально сохраняются записанные изменения диска, не RAM и процессы.** Запись асинхронна: немедленный reload может потерять последние изменения. Хранилище привязано к профилю и origin, это не резервная копия.
- **Нужны сетевые загрузки.** CheerpX и блоки базового диска приходят с внешних серверов. Локальное исполнение не означает offline или скачиваемую самостоятельную ОС.

## Документация

- [Desktop, терминалы и плавающие окна](docs/desktop.md)
- [Сохранение диска, сброс и необязательная сеть](docs/storage-network.md)
- [Разработка, проверки и развёртывание](docs/development.md)
- [Архитектура и границы runtime](docs/architecture.md)
- [Съёмка настоящего продукта](docs/media-capture.md)
- [Прежний технический справочник](docs/reference-redesign2.md) · [исторический отчёт проверок](artifacts/redesign2/README.md)

В приложении маршрут `/docs` также содержит справку English / Русский без загрузки runtime.

## Участие

См. [CONTRIBUTING.md](CONTRIBUTING.md) и [инварианты сопровождения](AGENTS.md). Репозиторий: [Kingrane/pocketosix](https://github.com/Kingrane/pocketosix).

## Лицензии

**Оригинальный код и документация PocketOSix — [MIT](LICENSE)**. CheerpX SDK / runtime proprietary и подчиняется [собственной лицензии](https://github.com/leaningtech/cheerpx-meta/blob/main/LICENSE.txt); для production-использования организацией требуется коммерческое соглашение с Leaning Technologies. MIT не разрешает распространение или self-host runtime. У Alpine, пакетов, шрифтов и обоев отдельные условия: см. [third-party notices](THIRD_PARTY_NOTICES.md). Владелец подтвердил право распространения обоев; MIT проекта на них **не распространяется**.

PocketOSix — независимый проект, не официальный продукт Leaning Technologies или Tailscale.
