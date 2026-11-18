import Foundation
import UserNotifications

/// Напоминания, которые приходят, даже когда SET закрыт:
/// накануне вечером, за час до сбора и за 10 минут до каждого пункта тайминга.
/// Пересчитываются при каждом сохранении данных в app.js. iOS хранит не больше 64 штук - берём ближайшие 60.
enum Reminders {
    private static let prefix = "set.r."
    private static let limit = 60

    /// Вызовы идут цепочкой: иначе два пересчёта подряд могут перемешать старые и новые напоминания.
    @MainActor private static var chain: Task<Void, Never>?

    @MainActor static func reschedule(_ snap: Snapshot) {
        let previous = chain
        chain = Task { await previous?.value; await apply(snap) }
    }

    @MainActor static func removeAll() {
        let previous = chain
        chain = Task { await previous?.value; await clear() }
    }

    private static func clear() async {
        let center = UNUserNotificationCenter.current()
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    private static func apply(_ snap: Snapshot) async {
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional else { return }

        let items = plan(snap, now: Date())
        let pending = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix(prefix) }
        // ничего не поменялось - не трогаем (сохранение идёт на каждый ввод буквы)
        let wanted = Set(items.map(\.key))
        let existing = Set(pending.map { "\($0.identifier)|\($0.content.title)|\($0.content.body)" })
        if wanted == existing { return }

        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier))
        for item in items {
            let content = UNMutableNotificationContent()
            content.title = item.title
            content.body = item.body
            content.sound = .default
            content.threadIdentifier = item.shoot
            content.userInfo = ["route": item.route, "shoot": item.shoot, "timing": item.timing]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.date)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: trigger))
        }
    }

    struct Item {
        let id: String
        let date: Date
        let title: String
        let body: String
        let route: String
        let shoot: String
        let timing: Bool
        var key: String { "\(id)|\(title)|\(body)" }
    }

    static func plan(_ snap: Snapshot, now: Date) -> [Item] {
        let cal = Calendar.current
        let horizon = now.addingTimeInterval(14 * 86_400)
        var out: [Item] = []

        for s in snap.shoots {
            guard let call = s.callDate, call > now, call < horizon else { continue }
            let place = s.place.isEmpty ? "" : " · \(s.place)"
            let stamp = s.date.replacingOccurrences(of: "-", with: "")

            if let dayBefore = cal.date(byAdding: .day, value: -1, to: cal.startOfDay(for: call)),
               let evening = cal.date(bySettingHour: 20, minute: 0, second: 0, of: dayBefore),
               evening > now, evening < call.addingTimeInterval(-3 * 3600) {
                out.append(Item(id: "\(prefix)\(s.id).\(stamp).eve", date: evening,
                                title: snap.t("Завтра съёмка", "Shoot tomorrow"),
                                body: "\(s.title) · \(snap.t("сбор", "call")) \(s.call)\(place)",
                                route: "p/\(s.id)", shoot: s.id, timing: false))
            }

            let hourBefore = call.addingTimeInterval(-3600)
            if hourBefore > now {
                out.append(Item(id: "\(prefix)\(s.id).\(stamp).call", date: hourBefore,
                                title: snap.t("Через час сбор", "Call in one hour"),
                                body: "\(s.title)\(place)",
                                route: "p/\(s.id)", shoot: s.id, timing: false))
            }

            // как в режиме площадки app.js: за 10 минут до пункта
            for r in s.timedRows where r.start > call {
                let at = r.start.addingTimeInterval(-600)
                guard at > now else { continue }
                let who = r.row.who.isEmpty ? "" : " (\(r.row.who))"
                out.append(Item(id: "\(prefix)\(s.id).\(stamp).t\(r.id)", date: at,
                                title: snap.t("Через 10 мин: \(r.row.w)", "In 10 min: \(r.row.w)"),
                                body: "\(r.row.t)\(who) · \(s.title)",
                                route: "p/\(s.id)/onset", shoot: s.id, timing: true))
            }
        }
        return Array(out.sorted { $0.date < $1.date }.prefix(limit))
    }
}
