import Foundation
import Security

@MainActor
final class AppModel: ObservableObject {
    @Published var baseURL: String
    @Published var token: String?
    @Published var companies: [CompanyRow] = []
    @Published var stores: [StoreRow] = []
    @Published var companyId: String?
    @Published var storeId: String?
    @Published var busy = false
    @Published var banner: String?

    private let defaults = UserDefaults.standard

    init() {
        let saved = defaults.string(forKey: "lz3c.baseURL")
        #if targetEnvironment(simulator)
        baseURL = saved ?? Self.simulatorServer
        #else
        if let saved, !Self.shouldReplace(saved) {
            baseURL = saved
        } else {
            baseURL = Self.deviceServer
            defaults.set(baseURL, forKey: "lz3c.baseURL")
        }
        #endif
        token = TokenStore.load()
        companyId = defaults.string(forKey: "lz3c.companyId")
        storeId = defaults.string(forKey: "lz3c.storeId")
    }

    #if targetEnvironment(simulator)
    private static let simulatorServer = "http://127.0.0.1:3000/api"
    #else
    private static let deviceServer = "https://lz3csaas-972911409379.europe-west1.run.app/api"
    private static let retiredServers = [
        "http://192.168.1.10:3000/api",
    ]
    private static func shouldReplace(_ url: String) -> Bool {
        let value = url.lowercased()
        if value.contains("127.0.0.1") || value.contains("localhost") { return true }
        let trimmed = url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return retiredServers.contains(trimmed) || retiredServers.contains(url)
    }
    #endif

    var store: StoreRow? { stores.first { $0.id == storeId } }

    var client: APIClient {
        APIClient(baseURL: baseURL, token: token, companyId: companyId, storeId: storeId)
    }

    func saveServer(_ url: String) {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        #if targetEnvironment(simulator)
        let fallback = Self.simulatorServer
        #else
        let fallback = Self.deviceServer
        #endif
        baseURL = trimmed.isEmpty ? fallback : trimmed
        defaults.set(baseURL, forKey: "lz3c.baseURL")
    }

    func login(email: String, password: String) async {
        busy = true
        banner = nil
        defer { busy = false }
        do {
            let res = try await client.login(email: email, password: password)
            token = res.accessToken
            TokenStore.save(res.accessToken)
            try await loadContext(keepSelection: false)
        } catch {
            banner = error.localizedDescription
        }
    }

    func restore() async {
        guard token != nil else { return }
        do {
            try await loadContext(keepSelection: true)
        } catch {
            logout()
        }
    }

    func selectCompany(_ id: String) async {
        companyId = id
        storeId = nil
        defaults.set(id, forKey: "lz3c.companyId")
        defaults.removeObject(forKey: "lz3c.storeId")
        busy = true
        defer { busy = false }
        do {
            stores = try await client.stores()
            if stores.count == 1 { selectStore(stores[0].id) }
        } catch {
            banner = error.localizedDescription
        }
    }

    func selectStore(_ id: String) {
        storeId = id
        defaults.set(id, forKey: "lz3c.storeId")
        banner = nil
    }

    func switchStore() {
        storeId = nil
        defaults.removeObject(forKey: "lz3c.storeId")
    }

    func logout() {
        token = nil
        companyId = nil
        storeId = nil
        companies = []
        stores = []
        TokenStore.clear()
        defaults.removeObject(forKey: "lz3c.companyId")
        defaults.removeObject(forKey: "lz3c.storeId")
    }

    private func loadContext(keepSelection: Bool) async throws {
        companies = try await client.companies()
        if companies.isEmpty {
            banner = "这个账号还没有公司"
            return
        }
        let savedCompany = keepSelection ? companyId : nil
        let company = companies.first { $0.id == savedCompany } ?? (companies.count == 1 ? companies[0] : nil)
        guard let company else {
            companyId = nil
            storeId = nil
            return
        }
        companyId = company.id
        defaults.set(company.id, forKey: "lz3c.companyId")
        stores = try await client.stores()
        let savedStore = keepSelection ? storeId : nil
        if let match = stores.first(where: { $0.id == savedStore }) {
            storeId = match.id
        } else if stores.count == 1 {
            selectStore(stores[0].id)
        } else {
            storeId = nil
        }
    }
}

enum TokenStore {
    private static let service = "com.lz3c.pos"
    private static let account = "accessToken"

    static func save(_ token: String) {
        clear()
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
