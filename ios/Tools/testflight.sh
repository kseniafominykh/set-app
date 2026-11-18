#!/bin/bash
# Сборка «SET» для TestFlight.
#
#   bash Tools/testflight.sh            архив → экспорт для App Store → проверки (ничего не загружает)
#   bash Tools/testflight.sh --upload   то же самое + загрузка в App Store Connect
#
# Номер сборки берётся из времени (date +%y%m%d%H%M) и всегда растёт: App Store Connect не
# принимает один номер дважды. Свой номер: BUILD_NUMBER=2610011200 bash Tools/testflight.sh
#
# Подпись и загрузка идут через ключ App Store Connect API - учётная запись Apple в Xcode НЕ нужна:
#   ~/.appstoreconnect/admin_key/AuthKey_5N6ZHDJYUQ.p8   (роль Admin: без неё нет облачной подписи)
#   ~/.appstoreconnect/issuer_id
# xcodebuild с -allowProvisioningUpdates сам заводит профили и облачный сертификат Apple Distribution.
#
# До ПЕРВОЙ загрузки приложение должно быть заведено в App Store Connect вручную (через API нельзя):
# см. node Tools/asc.mjs status.
#
# Все логи - в build/TestFlight/*.log.

set -euo pipefail

MODE=export
case "${1:-}" in
    "") ;;
    --upload) MODE=upload ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный параметр «$1». Есть только --upload." >&2; exit 64 ;;
esac

IOS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$IOS/Tools"
TEAM="T9F5DY7ZHX"
BUNDLE_ID="com.naumkogan.set"
SCHEME="SET"
KEY_ID="5N6ZHDJYUQ"
KEY_PATH="$HOME/.appstoreconnect/admin_key/AuthKey_$KEY_ID.p8"
ISSUER_FILE="$HOME/.appstoreconnect/issuer_id"
ICON="$IOS/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
INFO_PLIST="$IOS/App/Info.plist"

OUT="$IOS/build/TestFlight"
ARCHIVE="$OUT/SET.xcarchive"
EXPORT="$OUT/export"
UPLOAD="$OUT/upload"
CHECK="$OUT/ipa-check"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%y%m%d%H%M)}"

step() { printf "\n\033[1m== %s\033[0m\n" "$1"; }
ok()   { printf "  %s\n" "$1"; }
fail() { printf "\n\033[31mОСТАНОВЛЕНО: %s\033[0m\n" "$1" >&2; exit 1; }

# ВАЖНО: вывод команд сначала складываем в переменную или файл и только потом ищем в нём подстроку.
# Через конвейер `команда | grep -q` нельзя: grep -q закрывает канал на первом совпадении, пишущая
# команда получает SIGPIPE (код 141), и `set -o pipefail` считает провалившимся весь конвейер -
# проверка «падает» на исправном пакете. Поэтому ниже только `case "$VAR"` и `grep -q ... ФАЙЛ`.

# Разбор лога xcodebuild: известные отказы Apple переводим в понятное действие.
#   explain_failure <лог> <что случилось, например «архив не собрался»>
explain_failure() {
    local log="$1" what="$2"
    if grep -q "No suitable application records" "$log"; then
        fail "Сначала создайте приложение в App Store Connect: bundle id $BUNDLE_ID
  My Apps → «+» → New App: iOS, имя «SET - всё для съёмки»,
  язык Russian, bundle id $BUNDLE_ID, SKU set-app.
  Проверка: node Tools/asc.mjs status"
    fi
    if grep -Eqi "already been used|bundle version must be higher|redundant binary|ATTRIBUTE.INVALID.DUPLICATE" "$log"; then
        fail "сборка с номером $BUILD_NUMBER уже загружалась - запустите ещё раз через минуту (номер берётся из времени)"
    fi
    if grep -Eqi "license agreement|PLA Update|agreement.*(expired|has been updated|must be accepted)" "$log"; then
        fail "Apple ждёт принятия соглашения: владелец аккаунта (Account Holder) принимает его на developer.apple.com и в App Store Connect → Business"
    fi
    if grep -Eqi "NOT_AUTHORIZED|401 Unauthorized|status code 401|Failed to authenticate|Invalid authentication|authentication credentials" "$log"; then
        fail "ключ App Store Connect не принят: проверьте $ISSUER_FILE и что ключ $KEY_ID не отозван"
    fi
    if grep -Eqi "Cloud signing permission|don't have permission|does not have permission|FORBIDDEN" "$log"; then
        fail "у ключа $KEY_ID не хватает прав: для облачной подписи нужна роль Admin"
    fi
    if grep -q "No Accounts" "$log"; then
        fail "xcodebuild не увидел ключ App Store Connect (No Accounts) - проверьте $KEY_PATH"
    fi
    if grep -Eq "ITMS-90713|ITMS-90717|ITMS-90022|ITMS-90704|Missing required icon" "$log"; then
        grep -E "ITMS-|error:" "$log" | tail -5 >&2 || true
        fail "Apple не принял иконку - см. выше. Иконка: xcrun swift Tools/MakeIcon.swift <png> (1024×1024 без альфа-канала)"
    fi
    printf "\n  Последние ошибки из %s:\n" "$log" >&2
    grep -E "error:|Error Domain|ITMS-|\*\* .* FAILED \*\*|NSLocalizedDescription" "$log" | tail -15 | sed 's/^/    /' >&2 || true
    fail "$what, полный лог: $log"
}

# ------------------------------------------------------------------------------------------ 1
step "1/6  Окружение"
command -v xcodegen >/dev/null || fail "нет xcodegen: brew install xcodegen"
command -v xcodebuild >/dev/null || fail "нет xcodebuild: нужен Xcode"
[ -f "$KEY_PATH" ] || fail "нет ключа App Store Connect API: $KEY_PATH"
[ -s "$ISSUER_FILE" ] || fail "нет Issuer ID: $ISSUER_FILE (App Store Connect → Users and Access → Integrations)"
ISSUER="$(tr -d '[:space:]' < "$ISSUER_FILE")"
case "$BUILD_NUMBER" in
    ''|*[!0-9]*) fail "номер сборки должен быть числом, а не «$BUILD_NUMBER»" ;;
esac
# Ключ передаём xcodebuild путём к файлу; его содержимое нигде не печатается.
AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY_PATH"
      -authenticationKeyID "$KEY_ID"
      -authenticationKeyIssuerID "$ISSUER")
ok "ключ $KEY_ID, команда $TEAM, bundle id $BUNDLE_ID"
ok "номер сборки $BUILD_NUMBER, режим: $([ "$MODE" = upload ] && echo 'с загрузкой' || echo 'только проверка, без загрузки')"
mkdir -p "$OUT"

# ------------------------------------------------------------------------------------------ 2
step "2/6  Проект и предполётная проверка"
cd "$IOS"
xcodegen generate --quiet >"$OUT/xcodegen.log" 2>&1 || { cat "$OUT/xcodegen.log" >&2; fail "xcodegen не сгенерировал проект"; }
ok "проект сгенерирован"

[ -f "$ICON" ] || fail "нет иконки $ICON - xcrun swift Tools/MakeIcon.swift $ICON"
ICON_INFO="$(sips -g hasAlpha -g pixelWidth -g pixelHeight "$ICON" 2>&1 || true)"
case "$ICON_INFO" in
    *"hasAlpha: yes"*) fail "у иконки есть альфа-канал - App Store такую не примет (ITMS-90717)" ;;
esac
case "$ICON_INFO" in
    *"pixelWidth: 1024"*"pixelHeight: 1024"*) ;;
    *) fail "иконка должна быть 1024×1024: $ICON" ;;
esac
ok "иконка 1024×1024 без альфа-канала"

ICON_NAME="$(/usr/bin/plutil -extract CFBundleIconName raw "$INFO_PLIST" 2>/dev/null || true)"
[ "$ICON_NAME" = "AppIcon" ] || fail "в Info.plist нет CFBundleIconName = AppIcon (ITMS-90713) - см. project.yml"
ENCRYPTION="$(/usr/bin/plutil -extract ITSAppUsesNonExemptEncryption raw "$INFO_PLIST" 2>/dev/null || true)"
case "$ENCRYPTION" in
    false) ok "CFBundleIconName = AppIcon, ITSAppUsesNonExemptEncryption = false" ;;
    true)  fail "ITSAppUsesNonExemptEncryption = true - понадобятся документы об экспорте шифрования; для SET должно быть false" ;;
    *)     fail "в Info.plist нет ITSAppUsesNonExemptEncryption - App Store Connect будет спрашивать про шифрование" ;;
esac

SETTINGS="$(xcodebuild -project SET.xcodeproj -scheme "$SCHEME" -configuration Release \
    -showBuildSettings 2>/dev/null || true)"
case "$SETTINGS" in
    *"PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID"*) ;;
    *) fail "в Release bundle id не $BUNDLE_ID (см. project.yml)" ;;
esac
ok "Release: bundle id $BUNDLE_ID"

# ------------------------------------------------------------------------------------------ 3
step "3/6  Архив (Release, сборка $BUILD_NUMBER)"
rm -rf "$ARCHIVE"
xcodebuild archive -project SET.xcodeproj -scheme "$SCHEME" -configuration Release \
    -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
    -derivedDataPath "$OUT/DerivedData" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
    "${AUTH[@]}" >"$OUT/archive.log" 2>&1 || true
if ! grep -q "\*\* ARCHIVE SUCCEEDED \*\*" "$OUT/archive.log" || [ ! -d "$ARCHIVE" ]; then
    explain_failure "$OUT/archive.log" "архив не собрался"
fi
ARCHIVED_APP="$ARCHIVE/Products/Applications/SET.app"
[ -d "$ARCHIVED_APP" ] || fail "в архиве нет SET.app"
ARCHIVED_VERSION="$(/usr/bin/plutil -extract CFBundleVersion raw "$ARCHIVED_APP/Info.plist" 2>/dev/null || true)"
[ "$ARCHIVED_VERSION" = "$BUILD_NUMBER" ] || fail "в архиве номер сборки «$ARCHIVED_VERSION», а не $BUILD_NUMBER"
# Архив Xcode подписывает сертификатом разработки. Боевую подпись (Apple Distribution, App Store профиль)
# пакет получает на экспорте, и шаг 5 это проверяет.
ok "архив: $ARCHIVE"

# ------------------------------------------------------------------------------------------ 4
step "4/6  Экспорт для App Store (подпись Apple Distribution)"
rm -rf "$EXPORT"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$TOOLS/ExportOptions.plist" \
    -exportPath "$EXPORT" "${AUTH[@]}" >"$OUT/export.log" 2>&1 || true
IPA="$EXPORT/SET.ipa"
if ! grep -q "\*\* EXPORT SUCCEEDED \*\*" "$OUT/export.log" || [ ! -f "$IPA" ]; then
    explain_failure "$OUT/export.log" "экспорт не прошёл"
fi
ok "пакет: $IPA ($(du -h "$IPA" | cut -f1))"

# ------------------------------------------------------------------------------------------ 5
step "5/6  Проверка пакета"
rm -rf "$CHECK"; mkdir -p "$CHECK"
(cd "$CHECK" && unzip -q "$IPA")
APP="$CHECK/Payload/SET.app"
[ -d "$APP" ] || fail "в пакете нет Payload/SET.app"

codesign --verify --strict "$APP" 2>"$CHECK/verify.log" || { cat "$CHECK/verify.log" >&2; fail "подпись пакета не проходит проверку"; }
SIGNATURE="$(codesign -dvvv "$APP" 2>&1 || true)"
case "$SIGNATURE" in
    *"Authority=Apple Distribution"*) ;;
    *) fail "пакет подписан НЕ сертификатом Apple Distribution" ;;
esac
ok "подпись Apple Distribution, проверка codesign пройдена"

codesign -d --entitlements - --xml "$APP" >"$CHECK/entitlements.plist" 2>/dev/null || fail "не читаются entitlements пакета"
security cms -D -i "$APP/embedded.mobileprovision" >"$CHECK/profile.plist" 2>/dev/null || fail "в пакете нет профиля embedded.mobileprovision"

if ! python3 - "$APP/Info.plist" "$CHECK/entitlements.plist" "$CHECK/profile.plist" "$BUILD_NUMBER" "$TEAM.$BUNDLE_ID" <<'PY'
import plistlib, pathlib, sys
info_path, ent_path, profile_path, build, app_id = sys.argv[1:6]
info = plistlib.loads(pathlib.Path(info_path).read_bytes())
ent = plistlib.loads(pathlib.Path(ent_path).read_bytes())
profile = plistlib.loads(pathlib.Path(profile_path).read_bytes())
problems = []
if info.get("CFBundleIconName") != "AppIcon":
    problems.append("нет CFBundleIconName = AppIcon на верхнем уровне Info.plist (ITMS-90713)")
icons = info.get("CFBundleIcons", {}).get("CFBundlePrimaryIcon", {})
if icons.get("CFBundleIconName") != "AppIcon":
    problems.append("иконка не скомпилирована из Assets.xcassets (нет CFBundleIcons)")
if info.get("ITSAppUsesNonExemptEncryption") is not False:
    problems.append("ITSAppUsesNonExemptEncryption должен быть false")
if info.get("CFBundleVersion") != build:
    problems.append(f"номер сборки {info.get('CFBundleVersion')}, ожидался {build}")
if info.get("CFBundleIdentifier") != app_id.split(".", 1)[1]:
    problems.append(f"bundle id {info.get('CFBundleIdentifier')}")
if ent.get("application-identifier") != app_id:
    problems.append(f"application-identifier = {ent.get('application-identifier')!r}")
if ent.get("get-task-allow"):
    problems.append("get-task-allow = true - это отладочная подпись, App Store её отвергнет")
if profile.get("ProvisionedDevices"):
    problems.append("профиль со списком устройств - это не App Store профиль")
if problems:
    print("\n".join("  !! " + p for p in problems))
    sys.exit(1)
print(f"  версия {info['CFBundleShortVersionString']} ({info['CFBundleVersion']})")
print(f"  профиль «{profile.get('Name')}», get-task-allow нет")
print("  CFBundleIconName = AppIcon, ITSAppUsesNonExemptEncryption = false")
PY
then
    fail "пакет не прошёл проверку"
fi

# Виджеты: расширение внутри пакета, та же группа приложений у обоих, тот же номер сборки.
APPEX="$APP/PlugIns/SETWidgets.appex"
[ -d "$APPEX" ] || fail "в пакете нет виджетов PlugIns/SETWidgets.appex"
codesign -d --entitlements - --xml "$APPEX" >"$CHECK/widgets-entitlements.plist" 2>/dev/null || fail "не читаются entitlements виджетов"
for E in "$CHECK/entitlements.plist" "$CHECK/widgets-entitlements.plist"; do
    grep -q "group.com.naumkogan.set" "$E" || fail "нет группы group.com.naumkogan.set в $(basename "$E") - виджеты не увидят данные"
done
WIDGET_VERSION="$(/usr/bin/plutil -extract CFBundleVersion raw "$APPEX/Info.plist" 2>/dev/null || true)"
[ "$WIDGET_VERSION" = "$BUILD_NUMBER" ] || fail "у виджетов номер сборки «$WIDGET_VERSION», а не $BUILD_NUMBER (ITMS-90473)"
ok "виджеты внутри, группа group.com.naumkogan.set у приложения и у виджетов"

ARCHS="$(lipo -archs "$APP/SET" 2>&1 || true)"
case "$ARCHS" in
    *arm64*) ok "архитектура: $ARCHS" ;;
    *) fail "нет архитектуры arm64 (получено: $ARCHS)" ;;
esac

if [ "$MODE" != upload ]; then
    printf "\n\033[1mГотово: пакет собран и проверен, в App Store Connect ничего не отправлено.\033[0m\n"
    printf "Загрузить в TestFlight:  bash Tools/testflight.sh --upload\n\n"
    exit 0
fi

# ------------------------------------------------------------------------------------------ 6
step "6/6  Загрузка в App Store Connect"
rm -rf "$UPLOAD"
# Лог пишем целиком и разбираем файл (см. пояснение про SIGPIPE вверху).
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$TOOLS/ExportOptions-upload.plist" \
    -exportPath "$UPLOAD" "${AUTH[@]}" >"$OUT/upload.log" 2>&1 || true
if grep -q "\*\* EXPORT FAILED \*\*" "$OUT/upload.log" \
    || ! grep -Eq "Upload succeeded|\*\* EXPORT SUCCEEDED \*\*" "$OUT/upload.log"; then
    explain_failure "$OUT/upload.log" "загрузка не прошла"
fi
printf "\n\033[1mЗагружено: сборка %s. Обработка занимает 5-15 минут.\033[0m\n" "$BUILD_NUMBER"
printf "Дальше:  node Tools/asc.mjs builds   → когда «готова»:  node Tools/asc.mjs internal\n\n"
