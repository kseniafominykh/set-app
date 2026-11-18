import SwiftUI
import WidgetKit

/// Цвета и «свечение» карточек как в styles.css SET (--paper, --ink, .glow-*).
enum Palette {
    static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r / 255, green: g / 255, blue: b / 255) }

    static let paper = rgb(0xF7, 0xF6, 0xF4)
    static let ink = rgb(0x1A, 0x1A, 0x22)

    static func glow(_ name: String) -> Color {
        switch name {
        case "lemon": return rgb(249, 217, 62)
        case "sky": return rgb(133, 163, 229)
        case "cobalt": return rgb(59, 79, 176)
        case "teal": return rgb(9, 118, 156)
        default: return rgb(244, 161, 195)
        }
    }

    static func strength(_ name: String) -> Double {
        switch name {
        case "lemon": return 0.6
        case "sky": return 0.5
        case "teal": return 0.28
        case "cobalt": return 0.25
        default: return 0.55
        }
    }
}

struct Ink {
    let scheme: ColorScheme
    var main: Color { scheme == .dark ? Palette.paper : Palette.ink }
    var second: Color { scheme == .dark ? Palette.rgb(0xB9, 0xB5, 0xBF) : Palette.rgb(0x4A, 0x48, 0x52) }
    var third: Color { scheme == .dark ? Palette.rgb(0x8E, 0x8A, 0x95) : Palette.rgb(0x6E, 0x6B, 0x75) }
    var chip: Color { scheme == .dark ? Color.white.opacity(0.10) : Color.white.opacity(0.62) }
}

/// Фон виджета: бумага + мягкое пятно цвета съёмки в правом верхнем углу (как .glow-pink и т.п.)
struct GlowBackground: View {
    var glow: String
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geo in
            let r = max(geo.size.width, geo.size.height) * 0.95
            let c = Palette.glow(glow)
            let k = Palette.strength(glow) * (scheme == .dark ? 0.75 : 1)
            ZStack {
                scheme == .dark ? Palette.ink : Palette.rgb(0xFC, 0xFB, 0xFA)
                RadialGradient(stops: [
                    .init(color: c.opacity(k), location: 0),
                    .init(color: c.opacity(k * 0.35), location: 0.38),
                    .init(color: c.opacity(0), location: 0.7)
                ], center: UnitPoint(x: 0.88, y: 0.08), startRadius: 0, endRadius: r)
            }
        }
    }
}

/// маленький знак «set» с огоньком, как на иконке
struct SetMark: View {
    var ink: Ink
    var body: some View {
        HStack(spacing: 3) {
            Text("set").font(.system(size: 14, weight: .medium, design: .rounded)).foregroundStyle(ink.main)
            Circle()
                .fill(RadialGradient(colors: [Palette.rgb(236, 72, 58), Palette.rgb(249, 190, 62).opacity(0.0)],
                                     center: .center, startRadius: 1, endRadius: 6))
                .frame(width: 10, height: 10)
                .offset(y: -4)
        }
    }
}

extension View {
    func setWidgetBackground(_ glow: String) -> some View {
        containerBackground(for: .widget) { GlowBackground(glow: glow) }
    }
}

extension Font {
    static func head(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font { .system(size: size, weight: weight) }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .monospaced) }
}
