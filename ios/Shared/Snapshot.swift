import Foundation

/// Данные для виджетов и напоминаний. Собирает их app.js (`nativeSnapshot()`), приложение кладёт
/// их в общую связку ключей (см. SharedStore), виджеты читают их оттуда.
struct Snapshot: Codable, Equatable {
    var v: Int
    var lang: String
    var name: String?
    var shoots: [Shoot]
    var income: Income?

    struct Shoot: Codable, Equatable, Identifiable {
        var id: String
        var title: String
        var kind: String
        var glow: String
        var kindLabel: String
        var date: String
        var call: String
        var end: String
        var place: String
        var address: String
        var team: Int
        var own: Bool
        var timing: [Row]
    }

    struct Row: Codable, Equatable {
        var t: String
        var t2: String
        var w: String
        var who: String
    }

    struct Income: Codable, Equatable {
        var month: Double
        var owed: Double
        var year: Double
        var shootsMonth: Int
        var monthLabel: String
        var yearLabel: String
    }

    var en: Bool { lang == "en" }
    func t(_ ru: String, _ en: String) -> String { self.en ? en : ru }
}

/// Общая связка ключей приложения и виджетов (keychain-access-groups).
/// Не App Group: группу приложений Apple не даёт завести ключом App Store Connect API, а связка ключей
/// с префиксом команды входит в любой профиль подписи и ничего не требует в кабинете разработчика.
/// Группа - `SETKeychainGroup` в Info.plist обоих таргетов: $(AppIdentifierPrefix)com.naumkogan.set.shared.
enum SharedStore {
    private static let service = "com.naumkogan.set.widget"
    private static let account = "snapshot"

    private static var accessGroup: String? {
        Bundle.main.object(forInfoDictionaryKey: "SETKeychainGroup") as? String
    }

    private static func query() -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false
        ]
        if let group = accessGroup, !group.isEmpty { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    private static func loadData() -> Data? {
        var q = query()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    static func load() -> Snapshot? {
        guard let data = loadData() else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    /// true - если данные поменялись и виджеты надо перерисовать
    @discardableResult
    static func save(_ snap: Snapshot) -> Bool {
        guard let data = try? JSONEncoder().encode(snap) else { return false }
        if loadData() == data { return false }
        // экран блокировки рисует виджеты и при заблокированном телефоне - читать можно после первой разблокировки
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(query() as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var add = query()
            attrs.forEach { add[$0.key] = $0.value }
            status = SecItemAdd(add as CFDictionary, nil)
        }
        return status == errSecSuccess
    }

    static func clear() {
        SecItemDelete(query() as CFDictionary)
    }
}

// MARK: - Время съёмки

extension Snapshot.Shoot {
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// начало дня съёмки
    var day: Date? { Self.dayFormatter.date(from: date) }

    static func minutes(_ hhmm: String) -> Int? {
        let p = hhmm.trimmingCharacters(in: .whitespaces).split(separator: ":")
        guard p.count == 2, let h = Int(p[0]), let m = Int(p[1]), (0...23).contains(h), (0...59).contains(m) else { return nil }
        return h * 60 + m
    }

    /// Время на день съёмки. Как dayKey() в app.js: всё, что раньше сбора больше чем на 2 часа, - уже после полуночи.
    func at(_ hhmm: String) -> Date? {
        guard let day, let m = Self.minutes(hhmm) else { return nil }
        let callM = Self.minutes(call) ?? 0
        let shifted = m < callM - 120 ? m + 1440 : m
        return Calendar.current.date(byAdding: .minute, value: shifted, to: day)
    }

    var callDate: Date? { at(call) }

    var endDate: Date? {
        guard let start = callDate, let e = at(end) else { return nil }
        return e > start ? e : Calendar.current.date(byAdding: .day, value: 1, to: e)
    }

    struct TimedRow: Identifiable {
        let id: Int
        let row: Snapshot.Row
        let start: Date
        let end: Date?
    }

    /// пункты тайминга по порядку; конец пункта - t2 или начало следующего
    var timedRows: [TimedRow] {
        let starts = timing.compactMap { r in at(r.t).map { (r, $0) } }
        return starts.enumerated().map { i, pair in
            let explicitEnd = pair.0.t2.isEmpty ? nil : at(pair.0.t2)
            let next = i + 1 < starts.count ? starts[i + 1].1 : endDate
            return TimedRow(id: i, row: pair.0, start: pair.1, end: explicitEnd ?? next)
        }
    }

    var placeLine: String { [place, address].filter { !$0.isEmpty }.joined(separator: ", ") }
}

// MARK: - Подписи

enum Words {
    static func plural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
        let k = n % 10, h = n % 100
        if k == 1 && h != 11 { return one }
        if (2...4).contains(k) && !(12...14).contains(h) { return few }
        return many
    }

    private static func monthNames(_ en: Bool) -> [String] {
        en ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
           : ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
    }

    static func monthShort(_ date: Date, en: Bool) -> String {
        monthNames(en)[Calendar.current.component(.month, from: date) - 1]
    }

    /// «Сегодня», «Завтра», «через 3 дня», «24 ноя»
    static func relativeDay(_ day: Date, from now: Date, en: Bool) -> String {
        let cal = Calendar.current
        let n = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: day)).day ?? 0
        switch n {
        case 0: return en ? "Today" : "Сегодня"
        case 1: return en ? "Tomorrow" : "Завтра"
        case 2: return en ? "In 2 days" : "Послезавтра"
        case 3...13: return en ? "In \(n) days" : "Через \(n) \(plural(n, "день", "дня", "дней"))"
        default: return "\(cal.component(.day, from: day)) \(monthShort(day, en: en))"
        }
    }

    static func daysLeft(_ day: Date, from now: Date) -> Int {
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: day)).day ?? 0
    }

    static func money(_ v: Double) -> String {
        let n = Int(v.rounded())
        let s = String(abs(n))
        var out = ""
        for (i, ch) in s.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { out.append("\u{2009}") }
            out.append(ch)
        }
        return (n < 0 ? "-" : "") + String(out.reversed()) + " ₽"
    }
}
