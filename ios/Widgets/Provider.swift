import WidgetKit
import Foundation

struct SETEntry: TimelineEntry {
    let date: Date
    let snap: Snapshot?
}

extension Snapshot {
    /// съёмки, которые ещё не закончились к моменту `date`
    func upcoming(at date: Date) -> [Shoot] {
        let cal = Calendar.current
        return shoots.filter { s in
            guard let day = s.day else { return false }
            let over = s.endDate ?? cal.date(byAdding: .day, value: 1, to: day)!
            return over > date
        }
    }

    /// съёмка для «Тайминга дня»: сегодняшняя (пока не кончилась), иначе ближайшая с таймингом
    func timingShoot(at date: Date) -> Shoot? {
        let list = upcoming(at: date)
        if let today = list.first(where: { s in s.day.map { Calendar.current.isDate($0, inSameDayAs: date) } ?? false }) {
            return today
        }
        return list.first(where: { !$0.timing.isEmpty }) ?? list.first
    }
}

/// Один поставщик на все виджеты: моменты перерисовки - начала и концы пунктов тайминга, сбор,
/// конец съёмки, за 10 минут до пункта и полночь (меняются «Сегодня» и «Завтра»).
struct SETProvider: TimelineProvider {
    func placeholder(in context: Context) -> SETEntry { SETEntry(date: .now, snap: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (SETEntry) -> Void) {
        let snap = SharedStore.load()
        completion(SETEntry(date: .now, snap: context.isPreview && (snap?.shoots.isEmpty ?? true) ? .sample : snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SETEntry>) -> Void) {
        let now = Date()
        let snap = SharedStore.load()
        let cal = Calendar.current
        let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now))!
        var moments: Set<Date> = [now, midnight]
        for s in snap?.upcoming(at: now).prefix(3) ?? [] {
            if let c = s.callDate { moments.insert(c) }
            if let e = s.endDate { moments.insert(e) }
            for r in s.timedRows {
                moments.insert(r.start)
                moments.insert(r.start.addingTimeInterval(-600))
                if let e = r.end { moments.insert(e) }
            }
        }
        let horizon = now.addingTimeInterval(36 * 3600)
        let sorted = moments.filter { $0 >= now && $0 <= horizon }.sorted().prefix(60)
        let entries = sorted.map { SETEntry(date: $0, snap: snap) }
        let refresh = min(midnight.addingTimeInterval(60), now.addingTimeInterval(6 * 3600))
        completion(Timeline(entries: entries, policy: .after(max(refresh, sorted.last ?? now))))
    }
}

extension Snapshot {
    /// пример для галереи виджетов, пока в приложении нет своих съёмок
    static var sample: Snapshot {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        let tomorrow = f.string(from: Date().addingTimeInterval(86_400))
        return Snapshot(v: 1, lang: Locale.preferredLanguages.first?.hasPrefix("ru") == false ? "en" : "ru", name: nil, shoots: [
            Shoot(id: "sample", title: "Lime · лукбук", kind: "brand", glow: "pink", kindLabel: "Для бренда",
                  date: tomorrow, call: "09:00", end: "19:00", place: "Студия «Свет»", address: "", team: 7, own: false,
                  timing: [
                    Row(t: "09:00", t2: "", w: "Сбор, кофе, распаковка вещей", who: ""),
                    Row(t: "09:30", t2: "", w: "Грим и волосы", who: "Аня, Лиза"),
                    Row(t: "11:00", t2: "", w: "Образ 01", who: ""),
                    Row(t: "13:00", t2: "", w: "Обед", who: ""),
                    Row(t: "14:00", t2: "", w: "Образы дальше по списку", who: ""),
                    Row(t: "18:30", t2: "", w: "Сбор вещей, возврат", who: "")
                  ])
        ], income: Income(month: 84_000, owed: 25_000, year: 612_000, shootsMonth: 6, monthLabel: "Ноябрь", yearLabel: "2026"))
    }
}
