import SwiftUI

struct SkuFillView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @State private var products: [ProductRow] = []
    @State private var selected: ProductRow?
    @State private var loading = false
    @State private var message: String?
    @State private var messageIsError = false

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        VStack(spacing: 0) {
            ShopHeader { Task { await load() } }
            ShopPageTitle(title: language.t("sku.fillTitle"))
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let message {
                        Text(message)
                            .font(.subheadline)
                            .foregroundStyle(messageIsError ? ShopTheme.danger : ShopTheme.success)
                    }
                    if loading && products.isEmpty {
                        ProgressView()
                    } else if products.isEmpty {
                        Text(language.t("sku.fillEmpty"))
                            .font(.subheadline)
                            .foregroundStyle(ShopTheme.muted)
                    } else {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(products) { product in
                                Button {
                                    selected = product
                                } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(product.name)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(ShopTheme.ink)
                                            .multilineTextAlignment(.leading)
                                        Text(product.skuCode ?? "—")
                                            .font(.caption)
                                            .foregroundStyle(ShopTheme.muted)
                                        Text(euro(product.retailPrice ?? product.costPrice))
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(ShopTheme.indigo)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(12)
                                }
                                .buttonStyle(ShopTileButtonStyle())
                            }
                        }
                    }
                }
                .padding(16)
            }
        }
        .background(ShopTheme.canvas.ignoresSafeArea())
        .task { await load() }
        .sheet(item: $selected) { product in
            SkuBarcodeSheet(product: product) {
                products.removeAll { $0.id == product.id }
                selected = nil
            }
        }
    }

    private func load() async {
        loading = true
        message = nil
        defer { loading = false }
        do {
            products = try await model.client.productsMissingBarcode()
        } catch {
            messageIsError = true
            message = error.localizedDescription
        }
    }

    private func euro(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "€%.2f", value)
    }
}

private struct SkuBarcodeSheet: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    let product: ProductRow
    var onSaved: () -> Void

    @State private var barcode = ""
    @State private var scanning = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent(language.t("sku.fillSku"), value: product.skuCode ?? "—")
                    LabeledContent(language.t("sku.fillCost"), value: euro(product.costPrice))
                    LabeledContent(language.t("sku.fillWholesale"), value: euro(product.wholesalePrice))
                    LabeledContent(language.t("sku.fillRetail"), value: euro(product.retailPrice))
                }
                Section(language.t("sku.barcode")) {
                    TextField(language.t("sku.barcode"), text: $barcode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button {
                        scanning = true
                    } label: {
                        Label(language.t("sku.fillScan"), systemImage: "barcode.viewfinder")
                    }
                }
                if let error {
                    Text(error)
                        .foregroundStyle(ShopTheme.danger)
                }
            }
            .navigationTitle(product.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("sku.fillSave")) { Task { await save() } }
                        .disabled(barcode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving)
                }
            }
            .fullScreenCover(isPresented: $scanning) {
                BarcodeScanner { code in
                    barcode = code.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                .environmentObject(language)
            }
        }
    }

    private func save() async {
        let value = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await model.client.saveBarcode(productId: product.id, barcode: value)
            onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func euro(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "€%.2f", value)
    }
}
