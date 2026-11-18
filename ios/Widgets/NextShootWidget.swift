import SwiftUI
import WidgetKit

/// «Ближайшая съёмка»: на экран Домой (маленький и средний) и на экран блокировки.
struct NextShootWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SETNextShoot", provider: SETProvider()) { entry in
            NextShootView(entry: entry)
        }
        .configurationDisplayName("Ближайшая съёмка")
        .description("Когда следующая съёмка, во сколько сбор и где.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

struct NextShootView: View {
    let entry: SETEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    private var snap: Snapshot? { entry.snap }
    private var shoot: Snapshot.Shoot? { snap?.upcoming(at: entry.date).first }
    private var en: Bool { snap?.en ?? false }
    private var ink: Ink { Ink(scheme: scheme) }
    private func t(_ ru: String, _ en: String) -> String { self.en ? en : ru }

    var body: some View {
        Group {
            switch family {
            case .accessoryInline: inline
            case .accessoryCircular: circular
            case .accessoryRectangular: rectangular
            case .systemMedium: medium
            default: small
            }
        }
        .widgetURL(URL(string: shoot.map { "setshoot://p/\($0.id)" } ?? (snap == nil ? "setshoot://today" : "setshoot://new")))
    }

    // MARK: Экран Домой

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(kicker).font(.system(size: 13, weight: .semibold)).foregroundStyle(ink.second).lineLimit(1)
                Spacer(minLength: 4)
                SetMark(ink: ink)
            }
            Spacer(minLength: 2)
            if let s = shoot {
                bigWhen(s, size: 40)
                Text(s.title).font(.head(15, .semibold)).foregroundStyle(ink.main).lineLimit(2).padding(.top, 4)
                if !s.call.isEmpty {
                    Text("\(t("сбор", "call")) \(s.call)").font(.mono(12)).foregroundStyle(ink.second).padding(.top, 2)
                }
            } else {
                empty
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .setWidgetBackground(shoot?.glow ?? "pink")
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 14) {
            if let s = shoot {
                VStack(alignment: .leading, spacing: 0) {
                    SetMark(ink: ink)
                    Spacer(minLength: 0)
                    bigWhen(s, size: 52)
                }
                .frame(width: 104, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(kicker).font(.system(size: 13, weight: .semibold)).foregroundStyle(ink.second).lineLimit(1)
                        if !s.kindLabel.isEmpty && !s.own {
                            Text(s.kindLabel).font(.system(size: 10, weight: .semibold))
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(Capsule().fill(ink.main.opacity(0.08)))
                                .foregroundStyle(ink.main).lineLimit(1)
                        }
                    }
                    Text(s.title).font(.head(18, .semibold)).foregroundStyle(ink.main).lineLimit(2)
                    if !s.placeLine.isEmpty {
                        Text(s.placeLine).font(.system(size: 12)).foregroundStyle(ink.second).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if let row = nowOrNext(s) {
                        HStack(spacing: 6) {
                            Text(row.label).font(.system(size: 11, weight: .semibold)).foregroundStyle(ink.third)
                            Text(row.row.t).font(.mono(12, .medium)).foregroundStyle(ink.main)
                            Text(row.row.w).font(.system(size: 12)).foregroundStyle(ink.main).lineLimit(1)
                        }
                    } else {
                        Text(footer(s)).font(.mono(12)).foregroundStyle(ink.second).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    SetMark(ink: ink)
                    Spacer()
                    empty
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .setWidgetBackground(shoot?.glow ?? "pink")
    }

    /// крупно: число и месяц, а в день съёмки - время сбора
    @ViewBuilder private func bigWhen(_ s: Snapshot.Shoot, size: CGFloat) -> some View {
        if let day = s.day, Calendar.current.isDate(day, inSameDayAs: entry.date), !s.call.isEmpty {
            Text(s.call).font(.system(size: size * 0.78, weight: .medium, design: .monospaced))
                .tracking(-1).foregroundStyle(ink.main).minimumScaleFactor(0.6).lineLimit(1)
        } else if let day = s.day {
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text("\(Calendar.current.component(.day, from: day))").font(.head(size)).tracking(-size * 0.03)
                Text(Words.monthShort(day, en: en).uppercased()).font(.head(size * 0.42))
            }
            .foregroundStyle(ink.main).lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snap == nil ? t("Откройте SET", "Open SET") : t("Съёмок пока нет", "No shoots yet"))
                .font(.head(17, .semibold)).foregroundStyle(ink.main)
            Text(snap == nil ? t("и здесь появится ближайшая съёмка", "to see your next shoot here") : t("Нажмите, чтобы создать", "Tap to create one"))
                .font(.system(size: 12)).foregroundStyle(ink.second).lineLimit(2)
        }
    }

    private var kicker: String {
        guard let s = shoot, let day = s.day else { return t("Ближайшая", "Next") }
        if let start = s.callDate, let end = s.endDate, entry.date >= start, entry.date < end { return t("Идёт съёмка", "Shooting now") }
        return Words.relativeDay(day, from: entry.date, en: en)
    }

    private func footer(_ s: Snapshot.Shoot) -> String {
        var parts: [String] = []
        if !s.call.isEmpty { parts.append("\(t("сбор", "call")) \(s.call)") }
        if s.team > 0 { parts.append(en ? "\(s.team) crew" : "\(s.team) \(Words.plural(s.team, "человек", "человека", "человек"))") }
        return parts.joined(separator: " · ")
    }

    private struct RowNow { let label: String; let row: Snapshot.Row }

    /// в день съёмки - что идёт сейчас или что дальше по таймингу
    private func nowOrNext(_ s: Snapshot.Shoot) -> RowNow? {
        guard let day = s.day, Calendar.current.isDate(day, inSameDayAs: entry.date) else { return nil }
        let rows = s.timedRows
        if let cur = rows.last(where: { $0.start <= entry.date && ($0.end ?? .distantFuture) > entry.date }) {
            return RowNow(label: t("СЕЙЧАС", "NOW"), row: cur.row)
        }
        if let next = rows.first(where: { $0.start > entry.date }) { return RowNow(label: t("ДАЛЕЕ", "NEXT"), row: next.row) }
        return nil
    }

    // MARK: Экран блокировки

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let s = shoot {
                Text([kicker, s.call].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 13, weight: .semibold)).widgetAccentable()
                Text(s.title).font(.system(size: 14, weight: .medium)).lineLimit(1)
                if let row = nowOrNext(s) {
                    Text("\(row.row.t) \(row.row.w)").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                } else if !s.place.isEmpty {
                    Text(s.place).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
            } else {
                Text("SET").font(.system(size: 13, weight: .semibold)).widgetAccentable()
                Text(t("Съёмок пока нет", "No shoots yet")).font(.system(size: 13))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color.clear }
    }

    private var inline: some View {
        Group {
            if let s = shoot {
                Text("\(kicker) \(s.call) · \(s.title)")
            } else {
                Text(t("SET: съёмок нет", "SET: no shoots"))
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let s = shoot, let day = s.day {
                let left = Words.daysLeft(day, from: entry.date)
                VStack(spacing: -1) {
                    if left <= 0 {
                        Text(t("сбор", "call")).font(.system(size: 10, weight: .medium))
                        Text(s.call.isEmpty ? "—" : s.call).font(.system(size: 14, weight: .semibold, design: .rounded)).minimumScaleFactor(0.6)
                    } else {
                        Text("\(left)").font(.system(size: 22, weight: .semibold, design: .rounded))
                        Text(en ? (left == 1 ? "day" : "days") : Words.plural(left, "день", "дня", "дней")).font(.system(size: 9, weight: .medium))
                    }
                }
                .widgetAccentable()
            } else {
                Text("set").font(.system(size: 15, weight: .medium, design: .rounded))
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}
