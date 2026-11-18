import UIKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // Уведомление пришло, пока SET открыт. Если человек уже смотрит «режим площадки» этой съёмки,
    // там и так всплывает подсказка - баннер не дублируем.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let info = notification.request.content.userInfo
        if let shoot = info["shoot"] as? String, info["timing"] as? Bool == true,
           WebViewController.shared?.currentHash.hasPrefix("#/p/\(shoot)/onset") == true {
            completionHandler([])
            return
        }
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let route = response.notification.request.content.userInfo["route"] as? String {
            WebViewController.open(route: route)
        }
        completionHandler()
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        if let url = connectionOptions.urlContexts.first?.url, let route = DeepLink.route(from: url) {
            WebViewController.pendingRoute = route
        }
        if let response = connectionOptions.notificationResponse,
           let route = response.notification.request.content.userInfo["route"] as? String {
            WebViewController.pendingRoute = route
        }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController()
        window.backgroundColor = .setPaper
        window.makeKeyAndVisible()
        self.window = window
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url, let route = DeepLink.route(from: url) else { return }
        WebViewController.open(route: route)
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        WebViewController.shared?.refreshFromWeb()
    }
}

/// Ссылки из виджетов и уведомлений: setshoot://p/<id>, setshoot://p/<id>/onset, setshoot://new, setshoot://me
enum DeepLink {
    static let scheme = "setshoot"

    static func route(from url: URL) -> String? {
        guard url.scheme == scheme else { return nil }
        let parts = ([url.host ?? ""] + url.pathComponents.filter { $0 != "/" }).filter { !$0.isEmpty }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard parts.allSatisfy({ $0.unicodeScalars.allSatisfy(allowed.contains) }) else { return nil }
        return parts.isEmpty ? "today" : parts.joined(separator: "/")
    }
}

extension UIColor {
    static let setPaper = UIColor(red: 0xF7 / 255, green: 0xF6 / 255, blue: 0xF4 / 255, alpha: 1)
    static let setInk = UIColor(red: 0x1A / 255, green: 0x1A / 255, blue: 0x22 / 255, alpha: 1)
}
