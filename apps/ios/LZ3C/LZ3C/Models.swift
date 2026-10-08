import Foundation

struct LoginResponse: Decodable {
    let accessToken: String
}

struct CompanyRow: Decodable, Identifiable {
    let _id: String
    let name: String
    var id: String { _id }
}

struct StoreRow: Decodable, Identifiable {
    let _id: String
    let name: String
    let stripeLocationId: String?
    let feiePrinterSn: String?
    var id: String { _id }
}

struct CatalogCategory: Decodable, Identifiable {
    let _id: String
    let name: String
    let sortOrder: Int?
    let isActive: Bool?
    var id: String { _id }
}

struct ProductRow: Decodable, Identifiable {
    let _id: String
    let name: String
    let skuCode: String?
    let barcode: String?
    let productType: String?
    let costPrice: Double?
    let wholesalePrice: Double?
    let retailPrice: Double?
    let posSalable: Bool?
    let quantity: Double?
    let variantDimensions: [VariantDimension]?
    let catalogCategoryId: String?
    var id: String { _id }
    var hasVariants: Bool { !(variantDimensions ?? []).isEmpty }

    private enum CodingKeys: String, CodingKey {
        case _id, name, skuCode, barcode, productType, costPrice, wholesalePrice, retailPrice, posSalable, quantity, variantDimensions, catalogCategoryId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = try c.decode(String.self, forKey: ._id)
        name = try c.decode(String.self, forKey: .name)
        skuCode = try c.decodeIfPresent(String.self, forKey: .skuCode)
        barcode = try c.decodeIfPresent(String.self, forKey: .barcode)
        productType = try c.decodeIfPresent(String.self, forKey: .productType)
        costPrice = try c.decodeIfPresent(Double.self, forKey: .costPrice)
        wholesalePrice = try c.decodeIfPresent(Double.self, forKey: .wholesalePrice)
        retailPrice = try c.decodeIfPresent(Double.self, forKey: .retailPrice)
        posSalable = try c.decodeIfPresent(Bool.self, forKey: .posSalable)
        quantity = try c.decodeIfPresent(Double.self, forKey: .quantity)
        variantDimensions = try c.decodeIfPresent([VariantDimension].self, forKey: .variantDimensions)
        if let id = try? c.decode(String.self, forKey: .catalogCategoryId) {
            catalogCategoryId = id
        } else if let box = try? c.decode(IdBox.self, forKey: .catalogCategoryId) {
            catalogCategoryId = box._id
        } else {
            catalogCategoryId = nil
        }
    }

    private struct IdBox: Decodable { let _id: String }
}

struct VariantDimension: Decodable {
    let name: String?
    let values: [String]?
}

struct VariantList: Decodable {
    struct Parent: Decodable {
        let name: String
        let variantDimensions: [VariantDimension]?
    }

    struct Item: Decodable, Identifiable {
        let _id: String
        let name: String
        let variantValues: [String]?
        let retailPrice: Double?
        let quantity: Double?
        let posSalable: Bool?
        var id: String { _id }
    }

    let parent: Parent?
    let variants: [Item]
}

struct SerialSearchHit: Decodable, Identifiable {
    let _id: String
    let sn: String
    let productId: String
    let productName: String
    let retailPrice: Double?
    var id: String { _id }

    private enum CodingKeys: String, CodingKey { case _id, sn, productId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = try c.decode(String.self, forKey: ._id)
        sn = try c.decode(String.self, forKey: .sn)
        if let id = try? c.decode(String.self, forKey: .productId) {
            productId = id
            productName = sn
            retailPrice = nil
        } else {
            let box = try c.decode(ProductBox.self, forKey: .productId)
            productId = box._id
            productName = box.name
            retailPrice = box.retailPrice
        }
    }

    private struct ProductBox: Decodable {
        let _id: String
        let name: String
        let retailPrice: Double?
    }
}

struct SerialOption: Decodable, Identifiable {
    let _id: String
    let sn: String
    let status: String
    var id: String { _id }
}

struct SerialLookup: Decodable {
    struct Unit: Decodable {
        let _id: String
        let sn: String
        let status: String
    }
    let unit: Unit
}

struct WorkOrderRow: Decodable, Identifiable {
    let _id: String
    let docNumber: String
    let flowType: String
    let status: String
    let customerPhone: String?
    let customerName: String?
    let deviceBrand: String?
    let deviceModel: String?
    let imeiSn: String?
    let issueDescription: String?
    let repairLocation: String?
    let notes: String?
    let photoIds: [String]?
    let quotedPriceIncVat: Double
    let completionResult: String?
    var id: String { _id }

    var deviceLabel: String {
        [deviceBrand, deviceModel].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}

struct PriceBrand: Decodable, Identifiable {
    let _id: String
    let name: String
    var id: String { _id }
}

struct PriceModelName: Decodable, Identifiable {
    let _id: String
    let name: String
    var id: String { _id }
}

struct PriceListRow: Decodable, Identifiable {
    let _id: String
    let brand: String
    let model: String
    let issue: String
    let priceIncVat: Double
    var id: String { _id }
}

struct PayableRepairs: Decodable {
    let repairProductId: String
    let orders: [WorkOrderRow]
}

struct TransitionResult: Decodable {
    let smsSent: Bool?
    let notifySms: Bool?
}

struct PriceUpdateResult: Decodable {
    let smsSent: Bool?
    let priceChanged: Bool?
}

struct BuyInRow: Decodable, Identifiable {
    let _id: String
    let brand: String
    let model: String
    let capacity: String
    let color: String
    let imeiSn: String
    let customerName: String?
    let customerPhone: String?
    let buyPrice: Double
    let notes: String?
    let paymentMethod: String
    let status: String
    var id: String { _id }

    var title: String { [brand, model, capacity, color].filter { !$0.isEmpty }.joined(separator: " ") }
}

struct CreatedId: Decodable {
    let _id: String
}

struct TerminalPayment: Decodable {
    let paymentIntentId: String
    let clientSecret: String
}

struct CartLine: Identifiable, Codable, Equatable {
    var id = UUID()
    var productId: String
    var name: String
    var unitPrice: Double
    var quantity: Int
    var workOrderId: String?
    var serialUnitId: String?
    var sn: String?
    var adHoc = false
    var taxCategoryId: String?
    var costPreTax: Double?
    var lineTotal: Double { unitPrice * Double(quantity) }
}

struct RefundHit: Decodable, Identifiable {
    let _id: String
    let docNumber: String
    let businessDate: String?
    let totalIncVat: Double
    let refundedTotalIncVat: Double
    let refundableAmount: Double
    let refundStatus: String
    let paymentMethod: String
    let customerName: String?
    let customerPhone: String?
    let summary: String
    var id: String { _id }
}

struct RefundLineDetail: Decodable, Identifiable {
    let lineIndex: Int
    let productName: String
    let quantity: Int
    let refundableQuantity: Int
    let refundableAmount: Double
    let unitPriceIncVat: Double
    let lineTotalIncVat: Double
    let sn: String?
    var id: Int { lineIndex }
    var refunded: Bool { refundableQuantity <= 0 }
}

struct RefundDetail: Decodable {
    let _id: String
    let docNumber: String
    let businessDate: String?
    let totalIncVat: Double
    let refundedTotalIncVat: Double
    let refundableAmount: Double
    let paymentMethod: String
    let customerName: String?
    let customerPhone: String?
    let lines: [RefundLineDetail]
}

struct RefundResult: Decodable {
    let creditNote: RefundNote
}

struct RefundNote: Decodable {
    let docNumber: String
    let totalIncVat: Double
}

struct TaxCategoryRow: Decodable, Identifiable {
    let _id: String
    let name: String
    let scheme: String?
    let isDefault: Bool?
    var id: String { _id }
}

struct SalesReport: Decodable {
    let receiptCount: Int
    let itemsSold: Double
    let turnoverIncVat: Double
    let turnoverExVat: Double
    let vatTotal: Double
    let costTotal: Double
    let grossProfit: Double
    let profitMarginPct: Double
    let payments: SalesPayments
    let taxBreakdown: [SalesTaxRow]
    let openWorkOrders: Int
    let repairRevenueIncVat: Double
}

struct SalesPayments: Decodable {
    let cash: Double
    let card: Double
    let other: Double
    let total: Double
}

struct SalesTaxRow: Decodable, Identifiable {
    let scheme: String
    let label: String
    let revenueIncVat: Double
    let vat: Double
    let revenueExVat: Double
    let cost: Double
    let profit: Double
    var id: String { scheme }
}
