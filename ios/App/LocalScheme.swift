import Foundation
import WebKit

/// Отдаёт веб-приложение из бандла по адресу setapp://localhost/... - свой адрес, а не file://,
/// чтобы localStorage и IndexedDB (фото) жили постоянно и не зависели от пути к бандлу.
final class LocalScheme: NSObject, WKURLSchemeHandler {
    static let scheme = "setapp"
    static let startURL = URL(string: "setapp://localhost/index.html")!

    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "webmanifest": "application/manifest+json",
        "png": "image/png",
        "jpg": "image/jpeg",
        "svg": "image/svg+xml",
        "woff2": "font/woff2"
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task) }
        var rel = url.path.removingPercentEncoding ?? url.path
        while rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "index.html" }
        guard !rel.split(separator: "/").contains(".."), let res = Bundle.main.resourceURL else { return fail(task) }
        // шрифты лежат в бандле папкой fonts/, всё остальное - в Web/ (Tools/copy-web.sh)
        let base = rel.hasPrefix("fonts/") ? res : res.appendingPathComponent("Web", isDirectory: true)
        let file = base.appendingPathComponent(rel)
        guard var data = try? Data(contentsOf: file) else { return notFound(task, url) }
        if rel == "index.html", let html = String(data: data, encoding: .utf8) {
            data = Data(Self.patchIndex(html).utf8)
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": type, "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    /// Правки страницы только для iPhone-приложения: шрифты из бандла, без масштабирования при вводе,
    /// класс html.native для стилей.
    static func patchIndex(_ html: String) -> String {
        var s = html
        s = s.replacingOccurrences(of: #"<link rel="preconnect"[^>]*>\s*"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"<link href="https://fonts\.googleapis\.com/[^"]*" rel="stylesheet">"#,
                                   with: #"<link href="fonts/fonts.css" rel="stylesheet">"#, options: .regularExpression)
        s = s.replacingOccurrences(of: #"content="width=device-width, initial-scale=1, viewport-fit=cover""#,
                                   with: #"content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover""#)
        s = s.replacingOccurrences(of: #"<html lang="ru">"#, with: #"<html lang="ru" class="native">"#)
        return s
    }

    private func notFound(_ task: WKURLSchemeTask, _ url: URL) {
        let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
        task.didReceive(response)
        task.didReceive(Data())
        task.didFinish()
    }

    private func fail(_ task: WKURLSchemeTask) {
        task.didFailWithError(URLError(.badURL))
    }
}

/// Копия localStorage в папке приложения: если WebKit когда-нибудь потеряет данные,
/// native-shim.js вернёт их до старта app.js.
enum StateBackup {
    private static var url: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("state-backup.json")
    }

    private static let queue = DispatchQueue(label: "set.backup", qos: .utility)

    static func save(_ json: String) {
        guard let url else { return }
        queue.async {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? Data(json.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    static func load() -> String? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        guard let url else { return }
        queue.async { try? FileManager.default.removeItem(at: url) }
    }
}
