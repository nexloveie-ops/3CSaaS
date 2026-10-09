import Foundation

struct APIFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct APIClient: Sendable {
    var baseURL: String
    var token: String?
    var companyId: String?
    var storeId: String?

    func login(email: String, password: String) async throws -> LoginResponse {
        try await send(
            "POST",
            "/auth/login",
            body: ["email": email, "password": password],
            auth: false
        )
    }

    func companies() async throws -> [CompanyRow] {
        try await send("GET", "/companies")
    }

    func stores() async throws -> [StoreRow] {
        try await send("GET", "/stores")
    }

    func taxCategories() async throws -> [TaxCategoryRow] {
        try await send("GET", "/tax-categories")
    }

    func catalogCategories() async throws -> [CatalogCategory] {
        try await send("GET", "/catalog-categories")
    }

    func products(query: String = "", catalogCategoryId: String? = nil) async throws -> [ProductRow] {
        var parts: [String] = []
        let term = query.trimmingCharacters(in: .whitespaces)
        if !term.isEmpty {
            let q = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term
            parts.append("q=\(q)")
        }
        if let catalogCategoryId {
            parts.append("catalogCategoryId=\(catalogCategoryId)")
        }
        let path = parts.isEmpty ? "/products" : "/products?\(parts.joined(separator: "&"))"
        return try await send("GET", path)
    }

    func searchSerials(query: String) async throws -> [SerialSearchHit] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let q = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term
        return try await send("GET", "/serials?status=in_stock&q=\(q)")
    }

    func productsMissingBarcode() async throws -> [ProductRow] {
        try await send("GET", "/products?productType=sku&missingBarcode=1")
    }

    func saveBarcode(productId: String, barcode: String) async throws {
        let _: ProductRow = try await send("PATCH", "/products/\(productId)", json: ["barcode": barcode])
    }

    func variants(parentId: String) async throws -> VariantList {
        try await send("GET", "/products/\(parentId)/variants/in-stock")
    }

    func serials(productId: String, status: String = "in_stock") async throws -> [SerialOption] {
        let id = productId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? productId
        let state = status.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? status
        return try await send("GET", "/serials?productId=\(id)&status=\(state)")
    }

    func lookupSerial(sn: String) async throws -> SerialLookup {
        let encoded = sn.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sn
        return try await send("GET", "/serials/lookup/\(encoded)")
    }

    func priceBrands() async throws -> [PriceBrand] {
        try await send("GET", "/price-list/brands")
    }

    func priceModels(brandId: String) async throws -> [PriceModelName] {
        try await send("GET", "/price-list/brands/\(brandId)/models")
    }

    func priceList() async throws -> [PriceListRow] {
        try await send("GET", "/price-list")
    }

    func workOrders() async throws -> [WorkOrderRow] {
        try await send("GET", "/work-orders")
    }

    func workOrder(id: String) async throws -> WorkOrderRow {
        try await send("GET", "/work-orders/\(id)")
    }

    func updateWorkOrderPrice(id: String, price: Double, issue: String) async throws -> PriceUpdateResult {
        try await send(
            "PATCH",
            "/work-orders/\(id)",
            json: ["quotedPriceIncVat": price, "issueDescription": issue]
        )
    }

    func createBuyIn(_ body: [String: Any]) async throws -> CreatedId {
        try await send("POST", "/buy-ins", json: body)
    }

    func updateBuyIn(id: String, _ body: [String: Any]) async throws -> BuyInRow {
        try await send("PATCH", "/buy-ins/\(id)", json: body)
    }

    func buyIns(status: String = "pending_inspection") async throws -> [BuyInRow] {
        try await send("GET", "/buy-ins?status=\(status)")
    }

    func uploadBuyInPhoto(id: String, slot: Int, jpeg: Data) async throws {
        _ = try await raw("POST", "/buy-ins/\(id)/photos/\(slot)", body: jpeg, contentType: "image/jpeg")
    }

    func buyInPhoto(id: String, slot: Int) async throws -> Data {
        try await raw("GET", "/buy-ins/\(id)/photos/\(slot)")
    }

    func completeBuyIn(id: String) async throws -> BuyInRow {
        try await send("POST", "/buy-ins/\(id)/complete")
    }

    func salesReport(from: String, to: String) async throws -> SalesReport {
        try await send("GET", "/reports/sales?from=\(from)&to=\(to)")
    }

    func salesTaxLines(from: String, to: String, scheme: String) async throws -> SalesTaxDetail {
        let encoded = scheme.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? scheme
        return try await send("GET", "/reports/sales/lines?from=\(from)&to=\(to)&scheme=\(encoded)")
    }

    func stockInBuyIn(
        id: String,
        retailPrice: Double,
        catalogCategoryId: String,
        taxCategoryId: String
    ) async throws -> BuyInRow {
        try await send(
            "POST",
            "/buy-ins/\(id)/stock-in",
            json: [
                "retailPrice": retailPrice,
                "catalogCategoryId": catalogCategoryId,
                "taxCategoryId": taxCategoryId,
            ]
        )
    }

    func uploadWorkOrderPhoto(id: String, jpeg: Data) async throws {
        let data = try await raw("POST", "/work-orders/\(id)/photos", body: jpeg, contentType: "image/jpeg")
        struct Created: Decodable { let photoId: String }
        _ = try JSONDecoder().decode(Created.self, from: data)
    }

    func workOrderPhoto(id: String, photoId: String) async throws -> Data {
        try await raw("GET", "/work-orders/\(id)/photos/\(photoId)")
    }

    func payable() async throws -> PayableRepairs {
        try await send("GET", "/work-orders/payable")
    }

    func createWorkOrder(_ body: [String: Any]) async throws -> CreatedId {
        try await send("POST", "/work-orders", json: body)
    }

    func transitionWorkOrder(id: String, status: String, result: String?) async throws -> TransitionResult {
        var body: [String: Any] = ["status": status]
        if let result { body["completionResult"] = result }
        return try await send("POST", "/work-orders/\(id)/transition", json: body)
    }

    func printWorkOrder(id: String) async throws {
        let _: OkResponse = try await send("POST", "/work-orders/\(id)/feie-print")
    }

    func createSale(_ body: [String: Any]) async throws -> CreatedId {
        try await send("POST", "/pos/sales", json: body)
    }

    func searchReceipts(from: String, to: String, query: String) async throws -> [RefundHit] {
        var items = [
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to),
        ]
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            items.append(URLQueryItem(name: "q", value: trimmed))
        }
        var components = URLComponents()
        components.queryItems = items
        let queryText = components.percentEncodedQuery ?? ""
        return try await send("GET", "/pos/orders/search?\(queryText)")
    }

    func receiptDetail(id: String) async throws -> RefundDetail {
        try await send("GET", "/pos/orders/\(id)")
    }

    func refundOrder(id: String, amount: Double, paymentMethod: String, lineIndexes: [Int]) async throws -> RefundResult {
        try await send("POST", "/pos/orders/\(id)/refund", json: [
            "amount": (amount * 100).rounded() / 100,
            "paymentMethod": paymentMethod,
            "lineIndexes": lineIndexes,
        ])
    }

    func printSale(id: String) async throws {
        let _: OkResponse = try await send("POST", "/pos/orders/\(id)/feie-print")
    }

    func connectionToken() async throws -> String {
        let res: SecretResponse = try await send("POST", "/stores/\(storeId ?? "")/terminal/connection-token")
        return res.secret
    }

    func paymentIntent(amount: Double) async throws -> TerminalPayment {
        try await send(
            "POST",
            "/stores/\(storeId ?? "")/terminal/payment-intent",
            json: ["amount": (amount * 100).rounded() / 100]
        )
    }

    private struct OkResponse: Decodable { let ok: Bool }
    private struct SecretResponse: Decodable { let secret: String }

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        body: [String: String]? = nil,
        json: [String: Any]? = nil,
        auth: Bool = true
    ) async throws -> T {
        let root = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: root + path) else {
            throw APIFailure(message: "服务器地址不正确")
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if auth, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let companyId {
            request.setValue(companyId, forHTTPHeaderField: "X-Company-Id")
        }
        if let storeId {
            request.setValue(storeId, forHTTPHeaderField: "X-Store-Id")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } else if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIFailure(message: "连不上服务器。请检查登录页里的服务器地址。")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) {
            throw APIFailure(message: Self.explain(data: data, status: status))
        }
        if T.self == EmptyBody.self, data.isEmpty {
            return EmptyBody() as! T
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw APIFailure(message: "无法解析服务器返回 \(raw.prefix(160))")
        }
    }

    private func raw(_ method: String, _ path: String, body: Data? = nil, contentType: String? = nil) async throws -> Data {
        let root = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: root + path) else {
            throw APIFailure(message: "服务器地址不正确")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let companyId { request.setValue(companyId, forHTTPHeaderField: "X-Company-Id") }
        if let storeId { request.setValue(storeId, forHTTPHeaderField: "X-Store-Id") }
        request.httpBody = body
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIFailure(message: "连不上服务器。请检查登录页里的服务器地址。")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) {
            throw APIFailure(message: Self.explain(data: data, status: status))
        }
        return data
    }

    private struct EmptyBody: Decodable {}

    private static func explain(data: Data, status: Int) -> String {
        let raw: String
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let text = obj["message"] as? String {
                raw = text
            } else if let list = obj["message"] as? [String] {
                raw = list.joined(separator: "\n")
            } else {
                raw = "请求失败 (\(status))"
            }
        } else {
            raw = "请求失败 (\(status))"
        }
        if raw.hasPrefix("SN already exists") { return "这个 IMEI / SN 已经录过" }
        switch raw {
        case "feie_not_configured": return "请先在网页的公司设置里填写飞鹅账号和 UKEY"
        case "feie_printer_missing": return "请先在网页的店铺设置里填写飞鹅打印机编号"
        case "feie_unreachable": return "连不上飞鹅打印服务"
        case "stripe_not_configured": return "请先在网页的店铺设置里填写 Stripe 密钥"
        case "stripe_location_missing": return "请先在网页的店铺设置里填写 Stripe Location ID"
        case "stripe_location_format": return "Stripe Location ID 应以 tml_ 开头"
        case "stripe_connection_token_failed": return "Stripe 连接失败，请检查店铺密钥和 Location"
        case "stripe_payment_intent_failed": return "Stripe 创建收款失败，请检查店铺密钥"
        case "Add a Margin VAT tax category first": return "请先在网页添加 Margin VAT 税类"
        case "Buy-in needs all 3 photos": return "需要拍齐 3 张照片"
        default: return raw
        }
    }
}
