import UIKit
import WebKit
import WidgetKit
import UserNotifications

/// Экран приложения: веб-версия SET из бандла (setapp://localhost/...) + мост к iOS (native-shim.js).
final class WebViewController: UIViewController {
    static weak var shared: WebViewController?
    /// раздел, который надо открыть, когда страница загрузится (виджет, уведомление)
    static var pendingRoute: String?

    private var webView: WKWebView!
    private var loaded = false
    private(set) var currentHash = ""
    private var darkStatusBar = false
    private var lang = "ru"

    static func open(route: String) {
        if let vc = shared, vc.loaded { vc.go(route) } else { pendingRoute = route }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { darkStatusBar ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        Self.shared = self
        view.backgroundColor = .setPaper
        lang = SharedStore.load()?.lang ?? (Locale.preferredLanguages.first?.hasPrefix("ru") == false ? "en" : "ru")

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(LocalScheme(), forURLScheme: LocalScheme.scheme)
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        let controller = WKUserContentController()
        controller.add(WeakHandler(self), name: "set")
        Task { @MainActor in
            let script = await Self.bootScript()
            controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            self.load()
        }
        config.userContentController = controller

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = .setPaper
        webView.underPageBackgroundColor = .setPaper
        webView.scrollView.backgroundColor = .setPaper
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        view.addSubview(webView)
    }

    private func load() {
        var url = LocalScheme.startURL
        if let route = Self.pendingRoute, var c = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            c.fragment = "/" + route
            url = c.url ?? url
            Self.pendingRoute = nil
        }
        webView.load(URLRequest(url: url))
    }

    private func go(_ route: String) {
        let safe = route.replacingOccurrences(of: "'", with: "")
        webView.evaluateJavaScript("window.__setNative && window.__setNative.route('\(safe)')")
    }

    /// приложение снова на экране: пересчитать виджеты (наступил новый день и т.п.)
    func refreshFromWeb() {
        guard loaded else { return }
        webView.evaluateJavaScript("window.__setNative && window.__setNative.push()")
    }

    private func call(_ js: String) {
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func reply(_ id: String?, ok: Bool, value: String? = nil) {
        guard let id else { return }
        let v = value.map { "'\($0)'" } ?? "undefined"
        call("window.__setNative && window.__setNative.done('\(id)', \(ok), \(v))")
    }

    // MARK: - Данные для app.js до его запуска

    private static func bootScript() async -> String {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let notif: String
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: notif = "granted"
        case .denied: notif = "denied"
        default: notif = "default"
        }
        var boot: [String: Any] = [
            "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "notif": notif
        ]
        if let backup = StateBackup.load() { boot["backup"] = backup }
        let json = (try? JSONSerialization.data(withJSONObject: boot)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let shim = Bundle.main.url(forResource: "native-shim", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        // JSONSerialization не экранирует U+2028/2029, а в старом JS это конец строки
        let safe = json.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "window.__SET_BOOT = \(safe);\n" + shim
    }

    // MARK: - Сообщения из native-shim.js

    fileprivate func handle(_ body: [String: Any]) {
        let id = body["id"] as? String
        switch body["type"] as? String {
        case "state":
            if let json = body["json"] as? String { StateBackup.save(json) }
            if let raw = body["snap"], !(raw is NSNull),
               let data = try? JSONSerialization.data(withJSONObject: raw),
               let snap = try? JSONDecoder().decode(Snapshot.self, from: data) {
                lang = snap.lang
                if SharedStore.save(snap) { WidgetCenter.shared.reloadAllTimelines() }
                Reminders.reschedule(snap)
            }
        case "clear":
            StateBackup.clear()
            SharedStore.clear()
            WidgetCenter.shared.reloadAllTimelines()
            Reminders.removeAll()
        case "route":
            currentHash = body["hash"] as? String ?? ""
            let dark = currentHash.contains("/onset")
            if dark != darkStatusBar {
                darkStatusBar = dark
                UIView.animate(withDuration: 0.25) { self.setNeedsStatusBarAppearanceUpdate() }
                let bg: UIColor = dark ? .setInk : .setPaper
                view.backgroundColor = bg
                webView.backgroundColor = bg
                webView.underPageBackgroundColor = bg
                webView.scrollView.backgroundColor = bg
            }
        case "notify":
            // SET открыт - app.js уже показал подсказку; напоминания в фоне ставит Reminders
            break
        case "notifRequest":
            Task { @MainActor in
                let center = UNUserNotificationCenter.current()
                let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
                let state = granted ? "granted" : "denied"
                self.call("window.__setNative && window.__setNative.permission('\(state)')")
                self.reply(id, ok: true, value: state)
                if granted, let snap = SharedStore.load() { Reminders.reschedule(snap) }
            }
        case "wake":
            UIApplication.shared.isIdleTimerDisabled = body["on"] as? Bool ?? false
        case "haptic":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "copy":
            UIPasteboard.general.string = body["text"] as? String ?? ""
        case "print":
            printPage(title: body["title"] as? String)
        case "share":
            share(text: body["text"] as? String, url: body["url"] as? String,
                  files: body["files"] as? [[String: Any]] ?? [], id: id)
        case "save":
            let file: [String: Any] = ["name": body["name"] ?? "file", "data": body["data"] ?? ""]
            share(text: nil, url: nil, files: [file], id: nil)
        default:
            break
        }
    }

    private func printPage(title: String?) {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = title ?? "SET"
        let printer = UIPrintInteractionController.shared
        printer.printInfo = info
        printer.printFormatter = webView.viewPrintFormatter()
        printer.present(animated: true)
    }

    private func share(text: String?, url: String?, files: [[String: Any]], id: String?) {
        var items: [Any] = []
        if let text, !text.isEmpty { items.append(text) }
        if let url, let u = URL(string: url), !url.isEmpty { items.append(u) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for f in files {
            guard let b64 = f["data"] as? String, let data = Data(base64Encoded: b64) else { continue }
            let raw = (f["name"] as? String) ?? "file"
            let name = raw.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
            let fileURL = dir.appendingPathComponent(name.isEmpty ? "file" : name)
            if (try? data.write(to: fileURL)) != nil { items.append(fileURL) }
        }
        guard !items.isEmpty else { reply(id, ok: false); return }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.completionWithItemsHandler = { [weak self] _, completed, _, _ in
            self?.reply(id, ok: completed)
            try? FileManager.default.removeItem(at: dir)
        }
        sheet.popoverPresentationController?.sourceView = view
        topPresenter().present(sheet, animated: true)
    }

    private func topPresenter() -> UIViewController {
        var vc: UIViewController = self
        while let next = vc.presentedViewController { vc = next }
        return vc
    }

    private func t(_ ru: String, _ en: String) -> String { lang == "en" ? en : ru }
}

// MARK: - Навигация: всё чужое открывается в Safari, Telegram, WhatsApp...

extension WebViewController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.cancel) }
        if [LocalScheme.scheme, "about", "blob", "data"].contains(scheme) { return decisionHandler(.allow) }
        if action.targetFrame?.isMainFrame == false && scheme.hasPrefix("http") { return decisionHandler(.allow) }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        if let route = Self.pendingRoute { Self.pendingRoute = nil; go(route) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loaded = false
        load()
    }

    // window.open и target="_blank"
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // alert / confirm / prompt из app.js
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert: a) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: t("Отмена", "Cancel"), style: .cancel) { _ in completionHandler(false) })
        let destructive = message.lowercased().contains("удал") || message.lowercased().contains("delete")
        a.addAction(UIAlertAction(title: destructive ? t("Удалить", "Delete") : "OK",
                                  style: destructive ? .destructive : .default) { _ in completionHandler(true) })
        present(alert: a) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { field in
            field.text = defaultText
            field.keyboardType = .URL
            field.autocapitalizationType = .none
            field.clearButtonMode = .whileEditing
        }
        a.addAction(UIAlertAction(title: t("Отмена", "Cancel"), style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: t("Готово", "Done"), style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(alert: a) { completionHandler(nil) }
    }

    private func present(alert: UIAlertController, otherwise: () -> Void) {
        guard view.window != nil else { return otherwise() }
        topPresenter().present(alert, animated: true)
    }
}

/// WKUserContentController держит обработчик сильной ссылкой - без прокладки контроллер не освободится.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WebViewController?
    init(_ target: WebViewController) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any] else { return }
        target?.handle(body)
    }
}
