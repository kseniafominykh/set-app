// Рисует иконку «Ленты» 1024×1024 без альфы.
// Запуск: xcrun swift Tools/MakeIcon.swift Lenta/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png
//
// Идея: одна картинка-закат (небо, солнце, море с дорожкой) разрезана на три слайда карусели.
// Зазоры между слайдами видны, но картинка читается цельной - ровно то, что делает приложение.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let side = 1024
let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.png"
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: sRGB, components: [
        CGFloat((hex >> 16) & 0xFF) / 255, CGFloat((hex >> 8) & 0xFF) / 255, CGFloat(hex & 0xFF) / 255, alpha,
    ])!
}

func gradient(_ stops: [(UInt32, CGFloat)]) -> CGGradient {
    CGGradient(colorsSpace: sRGB, colors: stops.map { color($0.0) } as CFArray, locations: stops.map(\.1))!
}

guard let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                          space: sRGB, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
    fatalError("нет контекста")
}
// Дальше координаты «сверху вниз», как на экране.
ctx.translateBy(x: 0, y: CGFloat(side))
ctx.scaleBy(x: 1, y: -1)
let S = CGFloat(side)

// Фон: тёплый крем с лёгким переходом.
ctx.drawLinearGradient(gradient([(0xF7F2EA, 0), (0xEDE3D4, 1)]),
                       start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: S), options: [])

// Три слайда 4:5... чуть вытянутые для силуэта, встык с зазором.
let gap: CGFloat = 24
let panelW: CGFloat = 290
let panelH: CGFloat = 470
let stripW = panelW * 3 + gap * 2
let x0 = (S - stripW) / 2
let y0 = (S - panelH) / 2 + 6
let radius: CGFloat = 46
let panels = (0..<3).map { CGRect(x: x0 + CGFloat($0) * (panelW + gap), y: y0, width: panelW, height: panelH) }
let strip = CGRect(x: x0, y: y0, width: stripW, height: panelH)

// Мягкая тень под слайдами.
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 18), blur: 44, color: color(0x5B4636, 0.28))
for p in panels {
    ctx.addPath(CGPath(roundedRect: p, cornerWidth: radius, cornerHeight: radius, transform: nil))
}
ctx.setFillColor(color(0x23253F))
ctx.fillPath()
ctx.restoreGState()

// Всё дальнейшее - внутри слайдов.
ctx.saveGState()
for p in panels {
    ctx.addPath(CGPath(roundedRect: p, cornerWidth: radius, cornerHeight: radius, transform: nil))
}
ctx.clip()

let horizon = y0 + panelH * 0.6

// Небо: персик → коралл → роза у горизонта.
ctx.drawLinearGradient(gradient([(0xB9A3D9, 0), (0xF2A88A, 0.45), (0xFBD3A6, 1)]),
                       start: CGPoint(x: 0, y: y0), end: CGPoint(x: 0, y: horizon), options: [])

// Солнце садится прямо на втором стыке - его половинки на соседних слайдах и дают «бесшовность».
let sunCenter = CGPoint(x: x0 + panelW * 2 + gap * 1.5 - 40, y: horizon)
let sunR: CGFloat = 132
ctx.saveGState()
ctx.setShadow(offset: .zero, blur: 60, color: color(0xFFE9C7, 0.9))
ctx.setFillColor(color(0xFFF4E2))
ctx.fillEllipse(in: CGRect(x: sunCenter.x - sunR, y: sunCenter.y - sunR, width: sunR * 2, height: sunR * 2))
ctx.restoreGState()

// Холм слева - тянется через первый стык.
ctx.beginPath()
ctx.move(to: CGPoint(x: x0 - 10, y: horizon - 70))
ctx.addCurve(to: CGPoint(x: x0 + panelW * 1.45, y: horizon),
             control1: CGPoint(x: x0 + panelW * 0.45, y: horizon - 112),
             control2: CGPoint(x: x0 + panelW * 0.95, y: horizon - 18))
ctx.addLine(to: CGPoint(x: x0 - 10, y: horizon))
ctx.closePath()
ctx.setFillColor(color(0x8C6F86))
ctx.fillPath()

// Море.
ctx.saveGState()
ctx.clip(to: CGRect(x: strip.minX, y: horizon, width: strip.width, height: strip.maxY - horizon))
ctx.drawLinearGradient(gradient([(0x6F6A9A, 0), (0x3C3F66, 0.55), (0x23253F, 1)]),
                       start: CGPoint(x: 0, y: horizon), end: CGPoint(x: 0, y: strip.maxY), options: [])

// Солнечная дорожка: короткие светлые штрихи, сужаются книзу.
let rows = 9
for i in 0..<rows {
    let t = CGFloat(i) / CGFloat(rows - 1)
    let y = horizon + 16 + t * (strip.maxY - horizon - 40)
    let w = sunR * (1.5 - t * 0.9) * (i.isMultiple(of: 2) ? 1 : 0.72)
    let h: CGFloat = 9 + t * 3
    let rect = CGRect(x: sunCenter.x - w / 2, y: y, width: w, height: h)
    ctx.setFillColor(color(0xFFE2C2, 0.85 - t * 0.45))
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: h / 2, cornerHeight: h / 2, transform: nil))
    ctx.fillPath()
}
ctx.restoreGState()
ctx.restoreGState()

// Тонкий светлый кант по краю каждого слайда - чтобы стыки читались на тёмном море.
for p in panels {
    ctx.addPath(CGPath(roundedRect: p.insetBy(dx: 1.5, dy: 1.5), cornerWidth: radius - 1.5, cornerHeight: radius - 1.5,
                       transform: nil))
}
ctx.setStrokeColor(color(0xFFFFFF, 0.22))
ctx.setLineWidth(3)
ctx.strokePath()

guard let image = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("не удалось создать PNG") }
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("не удалось записать \(outPath)") }
print("иконка: \(outPath)")
