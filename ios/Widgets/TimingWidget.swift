import SwiftUI
import WidgetKit

/// «Тайминг дня»: пункты тайминга сегодняшней (или ближайшей) съёмки, текущий подсвечен.
struct TimingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SETTiming", provider: SETProvider()) { entry in
            TimingView(entry: entry)
        }
        .configurationDisplayName("Тайминг дня")
        .description("Что сейчас идёт на площадке и что дальше по таймингу.")
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct TimingView: View {
    let entry: SETEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    private var snap: Snapshot? { entry.snap }
    private var shoot: Snapshot.Shoot? { snap?.timingShoot(at: entry.date) }
    private var en: Bool { snap?.en ?? false }
    private var ink: Ink { Ink(scheme: scheme) }
    private func t(_ ru: String, _ en: String) -> String { self.en ? en : ru }

    private var isToday: Bool {
        guard let day = shoot?.day else { return false }
        return Calendar.current.isDate(day, inSameDayAs: entry.date)
    }

    var body: some View {
        Group {
            if family == .accessoryRectangular { rectangular } else { list }
        }
        .widgetURL(URL(string: shoot.map { "setshoot://p/\($0.id)" + (isToday ? "/onset" : "") } ?? "setshoot://today"))
    }

    private var list: some View {
        let rows = shoot?.timedRows ?? []
        let limit = family == .systemLarge ? 9 : 3
        let currentIndex = rows.lastIndex(where: { $0.start <= entry.date && ($0.end ?? .distantFuture) > entry.date })
        let nextIndex = rows.firstIndex(where: { $0.start > entry.date })
        let focus = currentIndex ?? nextIndex ?? 0
        // окно пунктов: текущий и дальше, а если места хватает - и один прошедший
        let start = max(0, min(focus - (family == .systemLarge ? 1 : 0), rows.count - limit))
        let window = Array(rows.dropFirst(start).prefix(limit))

        return VStack(alignment: .leading, spacing: family == .systemLarge ? 8 : 6) {
            header
            if let s = shoot, !rows.isEmpty {
                ForEach(window) { r in
                    row(r, current: r.id == currentIndex.map { rows[$0].id }, past: (r.end ?? r.start) <= entry.date && isToday)
                }
                if family == .systemLarge && rows.count > window.count {
                    Text(t("ещё \(rows.count - window.count) в приложении", "\(rows.count - window.count) more in the app"))
                        .font(.system(size: 11)).foregroundStyle(ink.third)
                }
                Spacer(minLength: 0)
                if family == .systemLarge && !s.placeLine.isEmpty {
                    Text(s.placeLine).font(.system(size: 12)).foregroundStyle(ink.second).lineLimit(1)
                }
            } else {
                Spacer(minLength: 0)
                Text(shoot == nil ? t("Ближайших съёмок нет", "No upcoming shoots") : t("Тайминга пока нет - добавьте пункты в съёмке", "No schedule yet - add items in the shoot"))
                    .font(.system(size: 13)).foregroundStyle(ink.second)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .setWidgetBackground(isToday ? "lemon" : (shoot?.glow ?? "pink"))
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            VStack(alignment: .leading, spacing: 1) {
                Text(kicker).font(.system(size: 12, weight: .semibold)).foregroundStyle(ink.second).lineLimit(1)
                if let s = shoot {
                    Text(s.title).font(.head(family == .systemLarge ? 20 : 16, .semibold)).foregroundStyle(ink.main).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            SetMark(ink: ink)
        }
    }

    private var kicker: String {
        guard let s = shoot, let day = s.day else { return t("Тайминг", "Schedule") }
        let when = Words.relativeDay(day, from: entry.date, en: en)
        return "\(t("Тайминг", "Schedule")) · \(when)" + (s.call.isEmpty ? "" : " · \(t("сбор", "call")) \(s.call)")
    }

    private func row(_ r: Snapshot.Shoot.TimedRow, current: Bool, past: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(r.row.t).font(.mono(13, current ? .semibold : .regular)).foregroundStyle(ink.main).frame(width: 46, alignment: .leading)
            VStack(alignment: .leading, spacing: 0) {
                Text(r.row.w).font(.system(size: 13, weight: current ? .semibold : .regular)).foregroundStyle(ink.main).lineLimit(1)
                if !r.row.who.isEmpty && (current || family == .systemLarge) {
                    Text(r.row.who).font(.system(size: 11)).foregroundStyle(ink.second).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if current {
                Text(t("сейчас", "now")).font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.paper)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(Capsule().fill(Palette.ink))
            }
        }
        .padding(.horizontal, current ? 8 : 0)
        .padding(.vertical, current ? 5 : 0)
        .background(RoundedRectangle(cornerRadius: 12).fill(current ? ink.chip : .clear))
        .opacity(past ? 0.45 : 1)
    }

    // экран блокировки: «Сейчас: Обед», «Далее 14:00 Образ 02»
    private var rectangular: some View {
        let rows = shoot?.timedRows ?? []
        let cur = rows.last(where: { $0.start <= entry.date && ($0.end ?? .distantFuture) > entry.date })
        let next = rows.first(where: { $0.start > entry.date })
        return VStack(alignment: .leading, spacing: 1) {
            if isToday, cur != nil || next != nil {
                if let cur {
                    Text("\(t("Сейчас", "Now")): \(cur.row.w)").font(.system(size: 14, weight: .semibold)).lineLimit(1).widgetAccentable()
                }
                if let next {
                    Text("\(next.row.t) \(next.row.w)").font(.system(size: 13)).lineLimit(cur == nil ? 2 : 1)
                }
                Text(shoot?.title ?? "").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
            } else if let s = shoot, let day = s.day {
                Text(Words.relativeDay(day, from: entry.date, en: en) + (s.call.isEmpty ? "" : " · \(s.call)"))
                    .font(.system(size: 13, weight: .semibold)).widgetAccentable()
                Text(s.title).font(.system(size: 14)).lineLimit(1)
                if let first = rows.first(where: { $0.start > (s.callDate ?? .distantPast) }) {
                    Text("\(first.row.t) \(first.row.w)").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
            } else {
                Text("SET").font(.system(size: 13, weight: .semibold)).widgetAccentable()
                Text(t("Ближайших съёмок нет", "No upcoming shoots")).font(.system(size: 13))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color.clear }
    }
}
