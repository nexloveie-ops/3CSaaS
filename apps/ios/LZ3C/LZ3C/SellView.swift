import SwiftUI
import UIKit

struct SellView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @Environment(\.scenePhase) private var scenePhase

    @State private var categories: [CatalogCategory] = []
    @State private var catalogCache: [String: [ProductRow]] = [:]
    @State private var selectedCategory: CatalogCategory?
    @State private var showRepairs = false
    @State private var products: [ProductRow] = []
    @State private var repairs: [WorkOrderRow] = []
    @State private var repairProductId = ""
    @State private var query = ""
    @State private var serialHits: [SerialSearchHit] = []
    @State private var searchGeneration = 0
    @State private var cart: [CartLine] = []
    @State private var tendered = ""
    @State private var qtyDraft: [UUID: String] = [:]
    @State private var priceDraft: [UUID: String] = [:]
    @FocusState private var editor: CartEditor?
    @State private var busy = false
    @State private var message: String?
    @State private var messageIsError = false
    @State private var showCart = false
    @State private var showCashFields = false
    @State private var confirmCard = false
    @State private var showTapScreen = false
    @State private var tapStatus = ""
    @State private var tapToken = 0
    @State private var tapAfterCartDismiss: Int?
    @State private var variantParent: ProductRow?
    @State private var variants: [VariantList.Item] = []
    @State private var variantDimensions: [VariantDimension] = []
    @State private var variantPicks: [String] = []
    @State private var variantsLoading = false
    @State private var serialProduct: ProductRow?
    @State private var serialOptions: [SerialOption] = []
    @State private var serialFilter = ""
    @State private var serialLoading = false
    @State private var scanningProduct = false
    @State private var showQuickSale = false

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    private var total: Double { cart.reduce(0) { $0 + liveLineTotal($1) } }
    private var itemCount: Int { cart.reduce(0) { $0 + $1.quantity } }
    private var searching: Bool { query.trimmingCharacters(in: .whitespaces).count >= 2 }
    private var visibleProducts: [ProductRow] {
        products.filter { $0.productType != "service" && $0.posSalable != false }
    }

    private func sellableCount(_ product: ProductRow) -> Int {
        let onHand = Int((product.quantity ?? 0).rounded())
        let reserved: Int
        if product.productType == "serialized" {
            reserved = cart.filter { $0.productId == product.id && $0.serialUnitId != nil }.count
        } else {
            reserved = cart
                .filter { $0.productId == product.id && $0.workOrderId == nil && $0.serialUnitId == nil }
                .reduce(0) { $0 + $1.quantity }
        }
        return max(0, onHand - reserved)
    }

    var body: some View {
        VStack(spacing: 0) {
            ShopHeader { Task { await reload() } }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    searchField
                    if searching {
                        searchResults
                    } else if showRepairs {
                        repairGrid
                    } else if selectedCategory != nil {
                        productGrid(empty: language.t("pos.noProducts"))
                    } else {
                        catalogGrid
                    }
                }
                .padding(16)
            }
            .background(ScrollTouchFix())
            .overlay(alignment: .leading) { edgeBack { goBack() } }
        }
        .background(ShopTheme.canvas.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) { cartBar }
        .overlay { if showTapScreen { tapScreen } }
        .toolbar(showTapScreen ? .hidden : .visible, for: .tabBar)
        .sheet(isPresented: $showCart, onDismiss: {
            guard let token = tapAfterCartDismiss else { return }
            tapAfterCartDismiss = nil
            guard token == tapToken, showTapScreen else { return }
            Task { await payCard(token: token) }
        }) { cartSheet }
        .sheet(item: $variantParent) { parent in variantSheet(parent) }
        .sheet(item: $serialProduct) { product in serialSheet(product) }
        .sheet(isPresented: $showQuickSale) {
            QuickSaleSheet { name, price, taxId, cost in
                cart.append(CartLine(
                    productId: "",
                    name: name,
                    unitPrice: price,
                    quantity: 1,
                    adHoc: true,
                    taxCategoryId: taxId,
                    costPreTax: cost
                ))
                tendered = String(format: "%.2f", total)
                showQuickSale = false
            }
            .environmentObject(language)
            .environmentObject(model)
        }
        .fullScreenCover(isPresented: $scanningProduct) {
            BarcodeScanner { code in
                query = code.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .environmentObject(language)
        }
        .task { await reload() }
        .onAppear(perform: loadCart)
        .onChange(of: cart) { _ in saveCart() }
        .onChange(of: scenePhase) { phase in
            guard phase != .active else { return }
            commitCartDrafts()
            saveCart()
        }
    }

    private var cartStorageKey: String {
        "lz3c.cart.\(model.companyId ?? "").\(model.storeId ?? "")"
    }

    private func loadCart() {
        guard cart.isEmpty,
              let data = UserDefaults.standard.data(forKey: cartStorageKey),
              let saved = try? JSONDecoder().decode([CartLine].self, from: data),
              !saved.isEmpty
        else { return }
        cart = saved
        tendered = String(format: "%.2f", saved.reduce(0) { $0 + $1.lineTotal })
    }

    private func saveCart() {
        if cart.isEmpty {
            UserDefaults.standard.removeObject(forKey: cartStorageKey)
            return
        }
        guard let data = try? JSONEncoder().encode(cart) else { return }
        UserDefaults.standard.set(data, forKey: cartStorageKey)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Button { showQuickSale = true } label: {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(ShopTheme.indigo)
                    .frame(width: 44, height: 44)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(ShopTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(language.t("pos.quickSale"))
            searchBox
        }
    }

    private var searchBox: some View {
        HStack(spacing: 8) {
            if selectedCategory != nil || showRepairs {
                Button {
                    selectedCategory = nil
                    showRepairs = false
                    products = []
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(ShopTheme.indigo)
                }
                .buttonStyle(.plain)
            }
            Image(systemName: "magnifyingglass").foregroundStyle(ShopTheme.muted)
            TextField(language.t("pos.search"), text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await search() } }
                .onChange(of: query) { _ in
                    if searching { Task { await search() } }
                }
            Button {
                scanningProduct = true
            } label: {
                Image(systemName: "barcode.viewfinder")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(ShopTheme.indigo)
            }
            .buttonStyle(.plain)
            if !query.isEmpty {
                Button {
                    query = ""
                    products = []
                    serialHits = []
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(ShopTheme.muted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 44)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(ShopTheme.border, lineWidth: 1))
    }

    private var catalogGrid: some View {
        Group {
            if categories.isEmpty && repairs.isEmpty {
                Text(language.t("pos.noCatalogs")).foregroundStyle(ShopTheme.muted)
            } else {
                LazyVGrid(columns: columns, spacing: 12) {
                    if !repairs.isEmpty {
                        Button {
                            showRepairs = true
                            selectedCategory = nil
                        } label: {
                            Text(language.t("pos.repairs"))
                                .font(.headline)
                                .foregroundStyle(ShopTheme.indigo)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, minHeight: 96)
                                .padding(8)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(ShopTileButtonStyle())
                    }
                    ForEach(categories) { category in
                        Button { openCategory(category) } label: {
                            Text(category.name)
                                .font(.headline)
                                .foregroundStyle(ShopTheme.ink)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, minHeight: 96)
                                .padding(8)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(ShopTileButtonStyle())
                    }
                }
            }
        }
    }

    private var repairGrid: some View {
        Group {
            if repairs.isEmpty {
                Text(language.t("pos.noRepairs")).foregroundStyle(ShopTheme.muted)
            } else {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(repairs) { order in
                        let taken = cart.contains { $0.workOrderId == order.id }
                        Button { addRepair(order) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(order.docNumber).font(.headline).foregroundStyle(ShopTheme.ink)
                                Text(repairSubtitle(order))
                                    .font(.caption)
                                    .foregroundStyle(ShopTheme.muted)
                                    .lineLimit(3)
                                Spacer(minLength: 0)
                                Text(money(order.quotedPriceIncVat))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ShopTheme.indigo)
                                if !(order.photoIds ?? []).isEmpty {
                                    Color.clear.frame(height: 72)
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 110, alignment: .leading)
                            .padding(12)
                            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(ShopTileButtonStyle())
                        .disabled(taken)
                        .overlay(alignment: .bottomLeading) {
                            OrderPhotos(orderId: order.id, photoIds: order.photoIds ?? [])
                                .padding(12)
                        }
                    }
                }
            }
        }
    }

    private var matchedProducts: [ProductRow] {
        let taken = Set(serialHits.map(\.productId))
        return visibleProducts.filter { !taken.contains($0.id) }
    }

    private var searchResults: some View {
        Group {
            if serialHits.isEmpty && matchedProducts.isEmpty {
                Text(language.t("pos.searchEmpty")).foregroundStyle(ShopTheme.muted)
            } else {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(serialHits) { hit in
                        let taken = cart.contains { $0.serialUnitId == hit.id }
                        Button {
                            addProduct(
                                id: hit.productId,
                                name: hit.productName,
                                price: hit.retailPrice ?? 0,
                                serialUnitId: hit.id,
                                sn: hit.sn
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(hit.productName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(taken ? ShopTheme.muted : ShopTheme.ink)
                                    .lineLimit(2)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(hit.sn)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(ShopTheme.slate)
                                Spacer(minLength: 0)
                                HStack {
                                    Text(language.t("pos.serialTitle"))
                                        .font(.caption)
                                        .foregroundStyle(ShopTheme.muted)
                                    Spacer()
                                    if let price = hit.retailPrice {
                                        Text(money(price))
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(ShopTheme.indigo)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
                            .padding(12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(ShopTileButtonStyle())
                        .disabled(taken)
                    }
                    ForEach(matchedProducts) { product in
                        productTile(product)
                    }
                }
            }
        }
    }

    private var productGrid: some View { productGrid(empty: language.t("pos.noProducts")) }

    private func productGrid(empty: String) -> some View {
        Group {
            if visibleProducts.isEmpty {
                Text(empty).foregroundStyle(ShopTheme.muted)
            } else {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(visibleProducts) { product in
                        productTile(product)
                    }
                }
            }
        }
    }

    private var cartBar: some View {
        VStack(spacing: 0) {
            if let message {
                Text(message)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(messageIsError ? ShopTheme.danger : ShopTheme.success)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background((messageIsError ? Color.red : Color.green).opacity(0.08))
            }
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(cart.isEmpty ? language.t("pos.noItems") : language.tf("pos.nItems", itemCount))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(ShopTheme.muted)
                    Text(money(total))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(ShopTheme.ink)
                }
                Spacer()
                Button(language.t("pos.cart")) { showCart = true }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .frame(height: 40)
                    .background(Capsule().fill(cart.isEmpty ? ShopTheme.muted : ShopTheme.indigo))
                    .disabled(cart.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.white)
        }
        .overlay(alignment: .top) { Rectangle().fill(ShopTheme.border).frame(height: 1) }
    }

    private var cartSheet: some View {
        NavigationStack {
            List {
                ForEach(cart) { line in
                    cartRow(line)
                }
                .onDelete { cart.remove(atOffsets: $0) }
            }
            .scrollDismissesKeyboard(.immediately)
            .onChange(of: editor) { _ in commitCartDrafts() }
            .safeAreaInset(edge: .bottom, spacing: 0) { paymentBar }
            .navigationTitle(language.t("pos.cart"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button(language.t("pos.close")) { showCart = false }
            }
            .onAppear {
                showCashFields = false
                if tendered.isEmpty { tendered = String(format: "%.2f", total) }
            }
            .confirmationDialog(
                language.tf("pos.confirmCard", money(total)),
                isPresented: $confirmCard,
                titleVisibility: .visible
            ) {
                Button(language.t("pos.confirmCardYes")) {
                    Task { await payRecordedCard() }
                }
                Button(language.t("pos.cancel"), role: .cancel) {}
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var paymentBar: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(language.t("pos.total"))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(ShopTheme.slate)
                Spacer()
                Text(money(total))
                    .font(.title2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(ShopTheme.ink)
            }
            if showCashFields {
                TextField(language.t("pos.received"), text: $tendered)
                    .focused($editor, equals: .cash)
                    .keyboardType(.decimalPad)
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .background(ShopTheme.canvas)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                if changeDue > 0.001 {
                    Text(language.tf("pos.change", changeDue))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ShopTheme.success)
                }
                Button(busy ? language.t("pos.working") : language.t("pos.confirmCash")) {
                    Task { await payCash() }
                }
                .buttonStyle(ShopPrimaryButtonStyle(enabled: !busy && !cart.isEmpty))
                .disabled(busy || cart.isEmpty)
            }
            HStack(spacing: 8) {
                Button {
                    showCashFields = true
                    if tendered.isEmpty { tendered = String(format: "%.2f", total) }
                } label: {
                    Text(language.t("pos.cash"))
                }
                .buttonStyle(ShopSecondaryButtonStyle())
                .disabled(busy || cart.isEmpty)

                Button {
                    confirmCard = true
                } label: {
                    Text(language.t("pos.card"))
                }
                .buttonStyle(ShopSecondaryButtonStyle())
                .disabled(busy || cart.isEmpty)
            }
            Button {
                beginTapToPay()
            } label: {
                Text(language.t("pos.tapToPay"))
            }
            .buttonStyle(ShopPrimaryButtonStyle(enabled: !busy && !cart.isEmpty))
            .disabled(busy || cart.isEmpty)
        }
        .padding(16)
        .background(Color.white)
        .overlay(alignment: .top) { Rectangle().fill(ShopTheme.border).frame(height: 1) }
    }

    private var tapScreen: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "wave.3.right.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(ShopTheme.indigo)
            Text(language.t("pos.tapToPay"))
                .font(.title2.weight(.semibold))
                .foregroundStyle(ShopTheme.ink)
            Text(money(total))
                .font(.system(size: 40, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(ShopTheme.ink)
            Text(tapStatus.isEmpty ? language.t("pos.tapPrompt") : tapStatus)
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(ShopTheme.slate)
                .padding(.horizontal, 28)
            Spacer()
            Button(language.t("pos.cancel")) { cancelTap() }
                .buttonStyle(ShopSecondaryButtonStyle())
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ShopTheme.canvas.ignoresSafeArea())
    }

    private var changeDue: Double {
        max(0, (receivedAmount * 100 - total * 100).rounded() / 100)
    }

    private var receivedAmount: Double {
        Double(tendered.replacingOccurrences(of: ",", with: ".")) ?? total
    }

    private func edgeBack(action: @escaping () -> Void) -> some View {
        Color.clear
            .frame(width: 12)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 12, coordinateSpace: .local)
                    .onEnded { value in
                        let dx = value.translation.width
                        let dy = value.translation.height
                        guard dx > 50, abs(dx) > abs(dy) else { return }
                        action()
                    }
            )
    }

    private func goBack() {
        guard selectedCategory != nil || showRepairs else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            selectedCategory = nil
            showRepairs = false
            products = []
            serialHits = []
            query = ""
        }
    }

    private func productTile(_ product: ProductRow) -> some View {
        let stock = product.hasVariants ? nil : sellableCount(product)
        return Button { pick(product) } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(product.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(stock == 0 ? ShopTheme.muted : ShopTheme.ink)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
                HStack {
                    if product.hasVariants {
                        Text(language.t("pos.variants")).font(.caption).foregroundStyle(ShopTheme.muted)
                    } else if let stock {
                        Text(language.tf("pos.stock", stock))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(stock == 0 ? ShopTheme.muted : ShopTheme.slate)
                    }
                    Spacer()
                    if let price = product.retailPrice, !product.hasVariants {
                        Text(money(price))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ShopTheme.indigo)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(ShopTileButtonStyle())
        .disabled(stock == 0)
    }

    private var filteredSerials: [SerialOption] {
        let term = serialFilter.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return serialOptions }
        return serialOptions.filter { $0.sn.lowercased().contains(term) }
    }

    private func serialSheet(_ product: ProductRow) -> some View {
        NavigationStack {
            List {
                if serialLoading {
                    ProgressView()
                } else if filteredSerials.isEmpty {
                    Text(language.t("pos.noSerials")).foregroundStyle(ShopTheme.muted)
                } else {
                    ForEach(filteredSerials) { unit in
                        let taken = cart.contains { $0.serialUnitId == unit.id }
                        Button {
                            addProduct(
                                id: product.id,
                                name: product.name,
                                price: product.retailPrice ?? 0,
                                serialUnitId: unit.id,
                                sn: unit.sn
                            )
                            serialProduct = nil
                        } label: {
                            HStack {
                                Text(unit.sn)
                                    .foregroundStyle(taken ? ShopTheme.muted : ShopTheme.ink)
                                Spacer()
                                if taken {
                                    Text(language.t("pos.serialInCart"))
                                        .font(.caption)
                                        .foregroundStyle(ShopTheme.muted)
                                }
                            }
                        }
                        .disabled(taken)
                    }
                }
            }
            .searchable(text: $serialFilter, prompt: language.t("pos.serialField"))
            .navigationTitle(language.t("pos.serialTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button(language.t("pos.close")) { serialProduct = nil }
            }
            .task { await loadSerials(product.id) }
        }
    }

    private var inStockVariants: [VariantList.Item] {
        variants.filter { ($0.quantity ?? 0) > 0 && $0.posSalable != false }
    }

    private var variantStep: Int { variantPicks.count }

    private var currentVariantOptions: [String] {
        guard variantStep < variantDimensions.count else { return [] }
        let defined = variantDimensions[variantStep].values ?? []
        let available = Set(
            inStockVariants
                .filter { variantMatches($0, prefix: variantPicks) }
                .compactMap { $0.variantValues?[variantStep] }
        )
        let ordered = defined.filter { available.contains($0) }
        let extras = available.subtracting(defined).sorted()
        return ordered + extras
    }

    private func variantMatches(_ item: VariantList.Item, prefix: [String]) -> Bool {
        let values = (item.variantValues ?? []).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let wanted = prefix.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard values.count >= wanted.count else { return false }
        return zip(wanted, values).allSatisfy { $0.0.caseInsensitiveCompare($0.1) == .orderedSame }
    }

    private var isLastVariantStep: Bool {
        !variantDimensions.isEmpty && variantStep == variantDimensions.count - 1
    }

    private func variantStock(for value: String) -> Int {
        let rows = inStockVariants.filter { variantMatches($0, prefix: variantPicks + [value]) }
        let onHand = rows.reduce(0.0) { $0 + ($1.quantity ?? 0) }
        let reserved = rows.reduce(0) { sum, row in
            sum + cart
                .filter { $0.productId == row.id && $0.workOrderId == nil && $0.serialUnitId == nil }
                .reduce(0) { $0 + $1.quantity }
        }
        return max(0, Int(onHand.rounded()) - reserved)
    }

    private func variantPriceLabel(for value: String) -> String? {
        let rows = inStockVariants.filter { variantMatches($0, prefix: variantPicks + [value]) }
        let prices = rows.compactMap(\.retailPrice)
        guard let min = prices.min(), let max = prices.max() else { return nil }
        if abs(min - max) < 0.001 { return money(min) }
        return "\(money(min)) – \(money(max))"
    }

    private func variantSheet(_ parent: ProductRow) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !variantPicks.isEmpty {
                        Text(variantPicks.joined(separator: " · "))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ShopTheme.indigo)
                    }
                    if variantStep < variantDimensions.count {
                        Text(variantDimensions[variantStep].name ?? language.t("pos.variants"))
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(ShopTheme.ink)
                        if variantDimensions.count > 1 {
                            Text(language.tf("pos.variantStep", variantStep + 1, variantDimensions.count))
                                .font(.caption)
                                .foregroundStyle(ShopTheme.muted)
                        }
                    }
                    if variantsLoading {
                        ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                    } else if currentVariantOptions.isEmpty {
                        Text(language.t("pos.noVariants")).foregroundStyle(ShopTheme.muted)
                    } else {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(currentVariantOptions, id: \.self) { value in
                                let stock = isLastVariantStep ? variantStock(for: value) : nil
                                Button { chooseVariant(value, parent: parent) } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(value)
                                            .font(.headline)
                                            .foregroundStyle(stock == 0 ? ShopTheme.muted : ShopTheme.ink)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                        if let price = variantPriceLabel(for: value) {
                                            Text(price)
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(ShopTheme.indigo)
                                        }
                                        if let stock {
                                            Text(language.tf("pos.stock", stock))
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(stock == 0 ? ShopTheme.muted : ShopTheme.slate)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                                    .padding(12)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(ShopTileButtonStyle())
                                .disabled(stock == 0)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(ShopTheme.canvas)
            .overlay(alignment: .leading) { edgeBack { stepBackVariant() } }
            .navigationTitle(parent.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if !variantPicks.isEmpty {
                        Button { stepBackVariant() } label: {
                            Image(systemName: "chevron.left")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(language.t("pos.close")) { variantParent = nil }
                }
            }
            .task(id: parent.id) { await loadVariants(parent) }
        }
    }

    private func chooseVariant(_ value: String, parent: ProductRow) {
        let next = variantPicks + [value]
        guard next.count >= variantDimensions.count else {
            variantPicks = next
            return
        }
        guard let item = inStockVariants.first(where: { variantMatches($0, prefix: next) }) else {
            show(language.t("pos.noVariants"), error: true)
            return
        }
        addProduct(id: item.id, name: item.name, price: item.retailPrice ?? parent.retailPrice ?? 0)
        variantPicks = next
        Task { @MainActor in variantParent = nil }
    }

    private func stepBackVariant() {
        if variantPicks.isEmpty {
            variantParent = nil
        } else {
            variantPicks.removeLast()
        }
    }

    private func reload() async {
        do {
            let rows = try await model.client.catalogCategories()
            categories = rows
                .filter { $0.isActive != false }
                .sorted { ($0.sortOrder ?? 0, $0.name) < ($1.sortOrder ?? 0, $1.name) }
            let page = try await model.client.payable()
            repairProductId = page.repairProductId
            repairs = page.orders
            await prefetchProducts()
            if searching { await search() }
            else if let selectedCategory { openCategory(selectedCategory) }
        } catch {
            show(error.localizedDescription, error: true)
        }
    }

    private func loadVariants(_ product: ProductRow) async {
        variantsLoading = true
        defer { variantsLoading = false }
        do {
            let page = try await model.client.variants(parentId: product.id)
            variants = page.variants
            variantDimensions = page.parent?.variantDimensions ?? product.variantDimensions ?? []
        } catch {
            variants = []
            show(error.localizedDescription, error: true)
        }
    }

    private func openCategory(_ category: CatalogCategory) {
        selectedCategory = category
        showRepairs = false
        if let cached = catalogCache[category.id] {
            products = cached
            return
        }
        products = []
        Task { await loadCategory(category) }
    }

    private func prefetchProducts() async {
        do {
            let rows = try await model.client.products()
            var grouped: [String: [ProductRow]] = [:]
            for row in rows {
                guard let id = row.catalogCategoryId else { continue }
                grouped[id, default: []].append(row)
            }
            catalogCache = grouped
        } catch {
            show(error.localizedDescription, error: true)
        }
    }

    private func loadCategory(_ category: CatalogCategory) async {
        do {
            let rows = try await model.client.products(catalogCategoryId: category.id)
            catalogCache[category.id] = rows
            if selectedCategory?.id == category.id { products = rows }
        } catch {
            show(error.localizedDescription, error: true)
        }
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.count >= 2 else { return }
        searchGeneration += 1
        let generation = searchGeneration
        do {
            async let found = model.client.products(query: term)
            async let units = model.client.searchSerials(query: term)
            let rows = try await found
            let hits = (try? await units) ?? []
            guard generation == searchGeneration else { return }
            products = rows
            serialHits = hits
        } catch {
            guard generation == searchGeneration else { return }
            show(error.localizedDescription, error: true)
        }
    }

    private func pick(_ product: ProductRow) {
        if product.hasVariants {
            variants = []
            variantDimensions = product.variantDimensions ?? []
            variantPicks = []
            variantsLoading = true
            variantParent = product
            return
        }
        if product.productType == "serialized" {
            let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
            let looksLikeSerial =
                !term.contains(where: \.isWhitespace) && term.contains(where: \.isNumber)
            serialFilter = looksLikeSerial ? term : ""
            serialOptions = []
            serialProduct = product
            return
        }
        addProduct(id: product.id, name: product.name, price: product.retailPrice ?? 0)
    }

    private func addProduct(id: String, name: String, price: Double, serialUnitId: String? = nil, sn: String? = nil) {
        if serialUnitId == nil,
           let index = cart.firstIndex(where: { $0.productId == id && $0.workOrderId == nil && $0.serialUnitId == nil }) {
            cart[index].quantity += 1
        } else {
            cart.append(CartLine(productId: id, name: name, unitPrice: price, quantity: 1, serialUnitId: serialUnitId, sn: sn))
        }
        tendered = String(format: "%.2f", total)
    }

    private func addRepair(_ order: WorkOrderRow) {
        guard !repairProductId.isEmpty else { return }
        let name = [order.docNumber, order.deviceLabel, order.issueDescription].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        cart.append(CartLine(productId: repairProductId, name: name, unitPrice: order.quotedPriceIncVat, quantity: 1, workOrderId: order.id))
        tendered = String(format: "%.2f", total)
    }

    private func loadSerials(_ productId: String) async {
        serialLoading = true
        defer { serialLoading = false }
        do {
            serialOptions = try await model.client.serials(productId: productId)
                .sorted { $0.sn.localizedStandardCompare($1.sn) == .orderedAscending }
        } catch {
            serialOptions = []
            show(error.localizedDescription, error: true)
        }
    }

    private enum CartEditor: Hashable {
        case qty(UUID)
        case price(UUID)
        case cash
    }

    private func cartRow(_ line: CartLine) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(line.name).foregroundStyle(ShopTheme.ink)
            if line.adHoc {
                Text(language.t("pos.quickSale"))
                    .font(.caption)
                    .foregroundStyle(ShopTheme.indigo)
            }
            if let sn = line.sn {
                Text(sn).font(.caption).foregroundStyle(ShopTheme.muted)
            }
            HStack(spacing: 10) {
                if line.workOrderId == nil && line.serialUnitId == nil {
                    HStack(spacing: 8) {
                        Button { changeQty(line, by: -1) } label: { Image(systemName: "minus.circle") }
                        TextField("1", text: qtyText(line))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .frame(width: 44)
                            .focused($editor, equals: .qty(line.id))
                        Button { changeQty(line, by: 1) } label: { Image(systemName: "plus.circle") }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(ShopTheme.indigo)
                } else {
                    Text("×\(line.quantity)").foregroundStyle(ShopTheme.muted)
                }
                Spacer(minLength: 8)
                HStack(spacing: 2) {
                    Text("€").foregroundStyle(ShopTheme.muted)
                    TextField("0.00", text: priceText(line))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 72)
                        .focused($editor, equals: .price(line.id))
                        .disabled(line.workOrderId != nil)
                }
                Text(money(liveLineTotal(line)))
                    .fontWeight(.semibold)
                    .frame(width: 72, alignment: .trailing)
            }
        }
        .padding(.vertical, 4)
    }

    private func liveLineTotal(_ line: CartLine) -> Double {
        liveUnitPrice(line) * Double(liveQuantity(line))
    }

    private func liveUnitPrice(_ line: CartLine) -> Double {
        if let raw = priceDraft[line.id]?.replacingOccurrences(of: ",", with: "."),
           let parsed = Double(raw), parsed >= 0 {
            return (parsed * 100).rounded() / 100
        }
        return line.unitPrice
    }

    private func liveQuantity(_ line: CartLine) -> Int {
        if line.workOrderId != nil || line.serialUnitId != nil { return line.quantity }
        guard let raw = qtyDraft[line.id] else { return line.quantity }
        let digits = raw.filter(\.isNumber)
        guard let parsed = Int(digits), parsed > 0 else { return line.quantity }
        return min(parsed, maxQty(line))
    }

    private func qtyText(_ line: CartLine) -> Binding<String> {
        Binding(
            get: { qtyDraft[line.id] ?? "\(line.quantity)" },
            set: { newValue in
                qtyDraft[line.id] = newValue
                let digits = newValue.filter(\.isNumber)
                if let parsed = Int(digits), parsed > 0,
                   let index = cart.firstIndex(where: { $0.id == line.id }) {
                    cart[index].quantity = min(parsed, maxQty(cart[index]))
                    tendered = String(format: "%.2f", total)
                }
            }
        )
    }

    private func priceText(_ line: CartLine) -> Binding<String> {
        Binding(
            get: { priceDraft[line.id] ?? String(format: "%.2f", line.unitPrice) },
            set: { newValue in
                priceDraft[line.id] = newValue
                guard line.workOrderId == nil,
                      let parsed = Double(newValue.replacingOccurrences(of: ",", with: ".")),
                      parsed >= 0,
                      let index = cart.firstIndex(where: { $0.id == line.id })
                else { return }
                cart[index].unitPrice = (parsed * 100).rounded() / 100
                tendered = String(format: "%.2f", total)
            }
        )
    }

    private func commitCartDrafts() {
        let qtyIds = Array(qtyDraft.keys)
        for id in qtyIds where editor != .qty(id) {
            applyQty(id, qtyDraft[id] ?? "")
            qtyDraft[id] = nil
        }
        let priceIds = Array(priceDraft.keys)
        for id in priceIds where editor != .price(id) {
            applyPrice(id, priceDraft[id] ?? "")
            priceDraft[id] = nil
        }
    }

    private func applyQty(_ id: UUID, _ raw: String) {
        guard let index = cart.firstIndex(where: { $0.id == id }) else { return }
        let digits = raw.filter(\.isNumber)
        let parsed = Int(digits) ?? cart[index].quantity
        if parsed <= 0 {
            cart.remove(at: index)
        } else {
            cart[index].quantity = min(parsed, maxQty(cart[index]))
        }
        tendered = String(format: "%.2f", total)
    }

    private func applyPrice(_ id: UUID, _ raw: String) {
        guard let index = cart.firstIndex(where: { $0.id == id }) else { return }
        guard cart[index].workOrderId == nil else { return }
        let parsed = Double(raw.replacingOccurrences(of: ",", with: "."))
        if let parsed, parsed >= 0 {
            cart[index].unitPrice = (parsed * 100).rounded() / 100
        }
        tendered = String(format: "%.2f", total)
    }

    private func maxQty(_ line: CartLine) -> Int {
        if line.adHoc { return 999 }
        let onHand = catalogCache.values
            .compactMap { rows in rows.first { $0.id == line.productId }?.quantity }
            .first
            .map { Int($0.rounded()) }
        guard let onHand else { return 999 }
        let reserved = cart
            .filter { $0.id != line.id && $0.productId == line.productId && $0.workOrderId == nil && $0.serialUnitId == nil }
            .reduce(0) { $0 + $1.quantity }
        return max(1, onHand - reserved)
    }

    private func changeQty(_ line: CartLine, by delta: Int) {
        guard let index = cart.firstIndex(where: { $0.id == line.id }) else { return }
        qtyDraft[line.id] = nil
        let next = cart[index].quantity + delta
        if next <= 0 {
            cart.remove(at: index)
        } else {
            cart[index].quantity = min(next, maxQty(cart[index]))
        }
        tendered = String(format: "%.2f", total)
    }

    private func payCash() async {
        editor = nil
        commitCartDrafts()
        await checkout(method: "cash", tendered: receivedAmount, paymentId: nil)
    }

    private func payRecordedCard() async {
        editor = nil
        commitCartDrafts()
        await checkout(method: "card", tendered: nil, paymentId: nil)
    }

    private func beginTapToPay() {
        tapToken += 1
        let token = tapToken
        tapStatus = language.t("pos.tapConnecting")
        showTapScreen = true
        TapToPay.shared.onReaderMessage = { text in
            if self.tapToken == token { self.tapStatus = text }
        }
        tapAfterCartDismiss = token
        showCart = false
    }

    private func cancelTap() {
        tapToken += 1
        tapAfterCartDismiss = nil
        TapToPay.shared.cancelCollect()
        showTapScreen = false
        busy = false
    }

    private func payCard(token: Int) async {
        guard token == tapToken else { return }
        guard let location = model.store?.stripeLocationId, !location.isEmpty else {
            tapStatus = language.t("pos.needLocation")
            return
        }
        busy = true
        tapStatus = language.t("pos.tapPrompt")
        do {
            let paymentId = try await TapToPay.shared.charge(
                euros: total,
                locationId: location,
                merchantName: model.store?.name ?? "LZ3C",
                client: model.client
            )
            guard token == tapToken else { return }
            showTapScreen = false
            await checkout(method: "card", tendered: nil, paymentId: paymentId)
        } catch {
            guard token == tapToken else { return }
            busy = false
            tapStatus = language.tf("pos.cardFailed", error.localizedDescription)
        }
    }

    private func checkout(method: String, tendered: Double?, paymentId: String?) async {
        busy = true
        defer { busy = false }
        var lines: [[String: Any]] = []
        var workOrderIds: [String] = []
        for line in cart {
            var row: [String: Any] = [
                "quantity": line.quantity,
                "unitPriceIncVat": line.unitPrice,
            ]
            if line.adHoc {
                row["adHocDescription"] = line.name
                row["taxCategoryId"] = line.taxCategoryId ?? ""
                if let cost = line.costPreTax { row["costPreTax"] = cost }
            } else {
                row["productId"] = line.productId
            }
            if let workOrderId = line.workOrderId {
                row["workOrderId"] = workOrderId
                workOrderIds.append(workOrderId)
            }
            if let serialUnitId = line.serialUnitId { row["serialUnitId"] = serialUnitId }
            if let sn = line.sn { row["sn"] = sn }
            lines.append(row)
        }
        var body: [String: Any] = ["lines": lines, "paymentMethod": method, "workOrderIds": workOrderIds]
        if method == "cash" { body["amountTendered"] = tendered ?? total }
        do {
            let sale = try await model.client.createSale(body)
            cart = []
            self.tendered = ""
            showCart = false
            do {
                try await model.client.printSale(id: sale._id)
                show(language.t("pos.paidPrinted"), error: false)
            } catch {
                show(language.tf("pos.paidPrintFailed", error.localizedDescription), error: true)
            }
            await reload()
        } catch {
            if method == "card" {
                show(language.tf("pos.cardNotSaved", paymentId ?? "", error.localizedDescription), error: true)
            } else {
                show(error.localizedDescription, error: true)
            }
        }
    }

    private func show(_ text: String, error: Bool) {
        message = text
        messageIsError = error
    }

    private func money(_ value: Double) -> String { String(format: "€%.2f", value) }

    private func repairSubtitle(_ order: WorkOrderRow) -> String {
        [order.deviceLabel, order.issueDescription, order.notes].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

private struct QuickSaleSheet: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @Environment(\.dismiss) private var dismiss
    var onAdd: (String, Double, String, Double?) -> Void

    @State private var name = ""
    @State private var price = ""
    @State private var cost = ""
    @State private var taxes: [TaxCategoryRow] = []
    @State private var taxId = ""
    @State private var error: String?

    private var selectedTax: TaxCategoryRow? { taxes.first { $0.id == taxId } }
    private var needsCost: Bool { selectedTax?.scheme == "margin_23" }

    private var unitPrice: Double? {
        let parsed = Double(price.replacingOccurrences(of: ",", with: "."))
        guard let parsed, parsed >= 0 else { return nil }
        return (parsed * 100).rounded() / 100
    }

    private var costPrice: Double? {
        let parsed = Double(cost.replacingOccurrences(of: ",", with: "."))
        guard let parsed, parsed >= 0 else { return nil }
        return (parsed * 100).rounded() / 100
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(language.t("pos.quickSaleName"), text: $name)
                        .textInputAutocapitalization(.words)
                    HStack {
                        Text("€").foregroundStyle(ShopTheme.muted)
                        TextField(language.t("pos.quickSalePrice"), text: $price)
                            .keyboardType(.decimalPad)
                    }
                    Picker(language.t("pos.quickSaleTax"), selection: $taxId) {
                        Text("—").tag("")
                        ForEach(taxes) { tax in
                            Text(tax.name).tag(tax.id)
                        }
                    }
                    if needsCost {
                        HStack {
                            Text("€").foregroundStyle(ShopTheme.muted)
                            TextField(language.t("pos.quickSaleCost"), text: $cost)
                                .keyboardType(.decimalPad)
                        }
                    }
                }
                if let error {
                    Text(error).foregroundStyle(ShopTheme.danger)
                }
            }
            .navigationTitle(language.t("pos.quickSale"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("pos.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(language.t("pos.quickSaleAdd")) { submit() }
                        .disabled(
                            name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                || unitPrice == nil
                                || taxId.isEmpty
                                || (needsCost && costPrice == nil)
                        )
                }
            }
            .task { await loadTaxes() }
        }
    }

    private func loadTaxes() async {
        do {
            let rows = try await model.client.taxCategories()
            taxes = rows
            if taxId.isEmpty {
                taxId = rows.first { $0.isDefault == true }?.id ?? ""
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func submit() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let unitPrice else { return }
        guard !taxId.isEmpty else {
            error = language.t("pos.quickSaleNeedTax")
            return
        }
        if needsCost {
            guard let costPrice else {
                error = language.t("pos.quickSaleNeedCost")
                return
            }
            onAdd(trimmed, unitPrice, taxId, costPrice)
            return
        }
        onAdd(trimmed, unitPrice, taxId, nil)
    }
}

/// Scroll views wait to see if a touch is a drag before delivering the tap. A product grid should tap immediately.
private struct ScrollTouchFix: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            var current: UIView? = uiView
            while let next = current?.superview {
                if let scroll = next as? UIScrollView {
                    scroll.delaysContentTouches = false
                    break
                }
                current = next
            }
        }
    }
}
