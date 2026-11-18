import SwiftUI
import WidgetKit

/// «Доход»: заработано за месяц, сколько ещё должны и итог за год - как на экране «Мои съёмки».
struct IncomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SETIncome", provider: SETProvider()) { entry in
            IncomeView(entry: entry)
        }
        .configurationDisplayName("Доход")
        .description("Сколько заработано за месяц и сколько ещё должны заплатить.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

struct IncomeView: View {
    let entry: SETEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    private var ink: Ink { Ink(scheme: scheme) }
    private var snap: Snapshot? { entry.snap }
    private var income: Snapshot.Income? { snap?.income }
    private func t(_ ru: String, _ en: String) -> String { (snap?.en ?? false) ? en : ru }

    var body: some View {
        Group {
            if family == .accessoryRectangular { rectangular } else { small }
        }
        .widgetURL(URL(string: "setshoot://me"))
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top) {
                Text(t("Заработано", "Earned")).font(.system(size: 13, weight: .semibold)).foregroundStyle(ink.second)
                Spacer(minLength: 4)
                SetMark(ink: ink)
            }
            Text(income?.monthLabel ?? "").font(.system(size: 12)).foregroundStyle(ink.third)
            Spacer(minLength: 0)
            Text(Words.money(income?.month ?? 0)).font(.system(size: 26, weight: .medium, design: .monospaced))
                .tracking(-0.8).foregroundStyle(ink.main).lineLimit(1).minimumScaleFactor(0.5)
            if let owed = income?.owed, owed > 0 {
                Text("\(t("ещё должны", "still owed")) \(Words.money(owed))").font(.system(size: 11, weight: .medium))
                    .foregroundStyle(ink.main).lineLimit(1).minimumScaleFactor(0.7)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Capsule().fill(ink.chip))
            }
            Text("\(t("за", "in")) \(income?.yearLabel ?? "") · \(Words.money(income?.year ?? 0))")
                .font(.mono(11)).foregroundStyle(ink.second).lineLimit(1).minimumScaleFactor(0.7).padding(.top, 2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .setWidgetBackground("pink")
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("\(t("Заработано", "Earned")) · \(income?.monthLabel ?? "")").font(.system(size: 13, weight: .semibold)).widgetAccentable()
            Text(Words.money(income?.month ?? 0)).font(.system(size: 17, weight: .semibold, design: .monospaced)).lineLimit(1)
            if let owed = income?.owed, owed > 0 {
                Text("\(t("ещё должны", "still owed")) \(Words.money(owed))").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color.clear }
    }
}

@main
struct SETWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextShootWidget()
        TimingWidget()
        IncomeWidget()
    }
}
