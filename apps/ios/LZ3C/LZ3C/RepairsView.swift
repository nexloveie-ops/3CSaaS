import PhotosUI
import SwiftUI
import UIKit

struct RepairsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @State private var orders: [WorkOrderRow] = []
    @State private var phone = ""
    @State private var notifySms = false
    @State private var customer = ""
    @State private var notes = ""
    @State private var intakePhotos: [IntakePhoto] = []
    @State private var showCamera = false
    @State private var showLibrary = false
    @State private var photoChooser = false
    @State private var brand = ""
    @State private var brandId = ""
    @State private var deviceModel = ""
    @State private var imei = ""
    @State private var issue = ""
    @State private var priceListItemId = ""
    @State private var price = ""
    @State private var sendOut = false
    @State private var repairShop = ""
    @State private var intakeOpen = false
    @State private var waitingOpen = false
    @State private var brands: [PriceBrand] = []
    @State private var models: [PriceModelName] = []
    @State private var priceItems: [PriceListRow] = []
    @State private var busy = false
    @State private var message: String?
    @State private var messageIsError = false
    @State private var scanTarget: ScanTarget?
    @State private var openingId: String?
    @State private var detail: WorkOrderRow?
    @State private var historyQuery = ""
    @FocusState private var field: IntakeField?

    private var active: [WorkOrderRow] {
        orders.filter { !["completed", "cancelled", "awaiting_payment"].contains($0.status) }
    }

    private var waitingPay: [WorkOrderRow] {
        orders.filter { $0.status == "awaiting_payment" }
    }

    private var historyQueryHasText: Bool {
        !historyQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var historyMatches: [WorkOrderRow] {
        let query = historyQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        let folded = query.lowercased()
        let digits = query.filter(\.isNumber)
        return orders.filter { order in
            guard order.status == "completed" || order.status == "cancelled" else { return false }
            let name = (order.customerName ?? "").lowercased()
            if name.contains(folded) { return true }
            let phone = (order.customerPhone ?? "").filter(\.isNumber)
            if !digits.isEmpty, phone.contains(digits) { return true }
            guard folded.count >= 5 else { return false }
            let imei = (order.imeiSn ?? "").lowercased()
            let imeiDigits = imei.filter(\.isNumber)
            if imei.hasSuffix(folded) { return true }
            if digits.count >= 5, imeiDigits.hasSuffix(digits) { return true }
            return imeiDigits.count >= 5 && digits.hasSuffix(imeiDigits)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ShopHeader { Task { await reload() } }
            Button {
                withAnimation { intakeOpen.toggle() }
            } label: {
                ShopPageTitle(
                    title: language.t("repair.intake"),
                    showsChevron: true,
                    expanded: intakeOpen
                )
            }
            .buttonStyle(.plain)
            List {
                Section {
                    if intakeOpen {
                    TextField(language.t("repair.brand"), text: $brand)
                        .focused($field, equals: .brand)
                        .onChange(of: brand) { _ in syncBrand() }
                    if field == .brand {
                        ForEach(brandSuggestions) { item in
                            Button { brand = item.name } label: {
                                Text(item.name).foregroundStyle(ShopTheme.indigo)
                            }
                        }
                    }
                    TextField(language.t("repair.model"), text: $deviceModel)
                        .focused($field, equals: .model)
                        .onChange(of: deviceModel) { _ in priceListItemId = "" }
                    if field == .model {
                        ForEach(modelSuggestions) { item in
                            Button { deviceModel = item.name } label: {
                                Text(item.name).foregroundStyle(ShopTheme.indigo)
                            }
                        }
                    }
                    TextField(language.t("repair.issue"), text: $issue, axis: .vertical)
                        .focused($field, equals: .issue)
                        .onChange(of: issue) { _ in
                            guard let selected = priceItems.first(where: { $0.id == priceListItemId }) else { return }
                            if selected.issue != issue { priceListItemId = "" }
                        }
                    if field == .issue {
                        ForEach(issueSuggestions) { item in
                            Button { pickIssue(item) } label: {
                                HStack {
                                    Text(item.issue).foregroundStyle(ShopTheme.indigo)
                                    Spacer()
                                    Text(money(item.priceIncVat)).foregroundStyle(ShopTheme.muted)
                                }
                            }
                        }
                    }
                    TextField(language.t("repair.price"), text: $price)
                        .keyboardType(.decimalPad)
                        .focused($field, equals: .price)
                    HStack {
                        TextField(language.t("repair.imei"), text: $imei)
                            .focused($field, equals: .imei)
                        Button {
                            field = nil
                            scanTarget = .imei
                        } label: {
                            Image(systemName: "barcode.viewfinder")
                                .font(.title3)
                                .foregroundStyle(ShopTheme.indigo)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(language.t("repair.scan"))
                    }
                    TextField(language.t("repair.phone"), text: $phone)
                        .keyboardType(.phonePad)
                        .focused($field, equals: .phone)
                    Toggle(language.t("repair.notifySms"), isOn: $notifySms)
                    TextField(language.t("repair.name"), text: $customer)
                        .focused($field, equals: .name)
                    TextField(language.t("repair.notes"), text: $notes, prompt: Text(language.t("repair.notesHint")), axis: .vertical)
                        .lineLimit(2...4)
                        .focused($field, equals: .notes)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(intakePhotos) { shot in
                                ZStack(alignment: .topTrailing) {
                                    Image(uiImage: shot.image)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 72, height: 72)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                    Button {
                                        intakePhotos.removeAll { $0.id == shot.id }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundStyle(.white, .black.opacity(0.55))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            if intakePhotos.count < 6 {
                                Button {
                                    field = nil
                                    photoChooser = true
                                } label: {
                                    Label(language.t("repair.addPhoto"), systemImage: "camera")
                                        .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                    }
                    Toggle(language.t("repair.sendOut"), isOn: $sendOut)
                    if sendOut {
                        TextField(language.t("repair.shop"), text: $repairShop)
                            .focused($field, equals: .shop)
                    }
                    Button(busy ? language.t("repair.submitting") : language.t("repair.submit")) {
                        Task { await intake() }
                    }
                    .buttonStyle(ShopPrimaryButtonStyle(enabled: canSubmit))
                    .disabled(!canSubmit)
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    }
                } footer: {
                    if intakeOpen {
                        Text(language.t("repair.listOrType"))
                    }
                }
                if let message {
                    Section {
                        Text(message).foregroundStyle(messageIsError ? ShopTheme.danger : ShopTheme.ink)
                    }
                }
                Section {
                    if active.isEmpty {
                        Text(language.t("repair.noneActive")).foregroundStyle(.secondary)
                    }
                    ForEach(active) { order in
                        RepairCard(order: order, busy: busy, opening: openingId == order.id) { action in
                            Task { await run(action, order) }
                        } onOpen: {
                            Task { await openDetail(order) }
                        }
                    }
                } header: {
                    ShopPageTitle(title: language.t("repair.active"), horizontallyPadded: false)
                        .textCase(nil)
                }
                Section {
                    if waitingOpen {
                        if waitingPay.isEmpty {
                            Text(language.t("repair.waitingEmpty")).foregroundStyle(.secondary)
                        }
                        ForEach(waitingPay) { order in
                            Button {
                                Task { await openDetail(order) }
                            } label: {
                                OrderBrief(order: order, opening: openingId == order.id)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(openingId == order.id)
                        }
                    }
                } header: {
                    Button {
                        withAnimation { waitingOpen.toggle() }
                    } label: {
                        ShopPageTitle(
                            title: language.t("repair.waiting"),
                            count: waitingPay.count,
                            showsChevron: true,
                            expanded: waitingOpen,
                            horizontallyPadded: false
                        )
                        .textCase(nil)
                    }
                    .buttonStyle(.plain)
                }
                Section {
                    HStack {
                        TextField(language.t("repair.historyHint"), text: $historyQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button {
                            field = nil
                            scanTarget = .history
                        } label: {
                            Image(systemName: "barcode.viewfinder")
                                .font(.title3)
                                .foregroundStyle(ShopTheme.indigo)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(language.t("repair.scan"))
                    }
                    if historyQueryHasText {
                        if historyMatches.isEmpty {
                            Text(language.t("repair.historyEmpty")).foregroundStyle(.secondary)
                        }
                        ForEach(historyMatches) { order in
                            Button {
                                Task { await openDetail(order) }
                            } label: {
                                OrderBrief(order: order, opening: openingId == order.id)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(openingId == order.id)
                        }
                    }
                } header: {
                    ShopPageTitle(title: language.t("repair.history"), horizontallyPadded: false)
                        .textCase(nil)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .refreshable { await reload() }
        }
        .background(ShopTheme.canvas.ignoresSafeArea())
        .fullScreenCover(isPresented: Binding(
            get: { scanTarget != nil },
            set: { if !$0 { scanTarget = nil } }
        )) {
            BarcodeScanner { code in
                let value = code.trimmingCharacters(in: .whitespacesAndNewlines)
                if scanTarget == .history { historyQuery = value }
                else { imei = value }
            }
            .environmentObject(language)
        }
        .confirmationDialog(
            "",
            isPresented: $photoChooser,
            titleVisibility: .hidden
        ) {
            Button(language.t("buy.takePhoto")) { showCamera = true }
            Button(language.t("buy.fromPhotos")) { showLibrary = true }
            Button(language.t("pos.cancel"), role: .cancel) {}
        }
        .fullScreenCover(isPresented: $showCamera) {
            RepairCameraCapture { image in
                guard intakePhotos.count < 6 else { return }
                intakePhotos.append(IntakePhoto(image: image))
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $showLibrary) {
            RepairLibraryCapture { image in
                guard intakePhotos.count < 6 else { return }
                intakePhotos.append(IntakePhoto(image: image))
            }
            .ignoresSafeArea()
        }
        .sheet(item: $detail) { order in
            RepairPriceSheet(order: order) { price, issue in
                try await savePrice(order, price, issue)
            }
            .environmentObject(language)
            .environmentObject(model)
        }
        .task { await reload() }
    }

    private var canSubmit: Bool {
        if busy || phone.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        if sendOut && repairShop.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
        return true
    }

    private func intake() async {
        guard canSubmit else { return }
        busy = true
        message = nil
        defer { busy = false }
        let quoted = Double(price.replacingOccurrences(of: ",", with: "."))
        var body: [String: Any] = [
            "customerPhone": phone.trimmingCharacters(in: .whitespaces),
            "notifySms": notifySms,
            "flowType": sendOut ? "send_out" : "in_store",
        ]
        if let quoted, quoted >= 0 { body["quotedPriceIncVat"] = quoted }
        if !customer.trimmingCharacters(in: .whitespaces).isEmpty { body["customerName"] = customer }
        if !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["notes"] = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !brand.trimmingCharacters(in: .whitespaces).isEmpty { body["deviceBrand"] = brand }
        if !deviceModel.trimmingCharacters(in: .whitespaces).isEmpty { body["deviceModel"] = deviceModel }
        if !imei.trimmingCharacters(in: .whitespaces).isEmpty { body["imeiSn"] = imei }
        if !issue.trimmingCharacters(in: .whitespaces).isEmpty { body["issueDescription"] = issue }
        if !priceListItemId.isEmpty { body["priceListItemId"] = priceListItemId }
        if sendOut, !repairShop.trimmingCharacters(in: .whitespaces).isEmpty {
            body["repairLocation"] = repairShop
        }
        do {
            let created = try await model.client.createWorkOrder(body)
            var photoError: String?
            for shot in intakePhotos {
                guard let jpeg = shot.jpeg else { continue }
                do {
                    try await model.client.uploadWorkOrderPhoto(id: created._id, jpeg: jpeg)
                } catch {
                    photoError = error.localizedDescription
                }
            }
            let next = sendOut ? "sent_out" : "in_progress"
            try await model.client.transitionWorkOrder(id: created._id, status: next, result: nil)
            do {
                try await model.client.printWorkOrder(id: created._id)
                if let photoError {
                    note(language.tf("repair.photoFailed", photoError), error: true)
                } else {
                    note(language.t("repair.printed"), error: false)
                }
            } catch {
                note(language.tf("repair.printFailed", error.localizedDescription), error: true)
            }
            phone = ""; notifySms = false; customer = ""; notes = ""; intakePhotos = []; brand = ""; brandId = ""; deviceModel = ""
            imei = ""; issue = ""; priceListItemId = ""; price = ""; repairShop = ""; intakeOpen = false
            models = []
            await reload()
        } catch {
            note(error.localizedDescription, error: true)
        }
    }

    private func openDetail(_ order: WorkOrderRow) async {
        openingId = order.id
        defer { openingId = nil }
        do {
            detail = try await model.client.workOrder(id: order.id)
        } catch {
            note(error.localizedDescription, error: true)
        }
    }

    private func savePrice(_ order: WorkOrderRow, _ price: Double, _ issue: String) async throws {
        let result = try await model.client.updateWorkOrderPrice(id: order.id, price: price, issue: issue)
        let key = result.priceChanged != true
            ? "repair.priceUnchanged"
            : (result.smsSent == true ? "repair.priceUpdatedSms" : "repair.priceUpdatedNoSms")
        note(language.t(key), error: false)
        detail = nil
        await reload()
    }

    private func run(_ action: RepairAction, _ order: WorkOrderRow) async {
        busy = true
        message = nil
        defer { busy = false }
        do {
            switch action {
            case .checkIn:
                if order.status == "sent_out" {
                    try await model.client.transitionWorkOrder(id: order.id, status: "in_repair", result: nil)
                }
                try await model.client.transitionWorkOrder(id: order.id, status: "returned", result: nil)
                note(language.t("repair.checkedIn"), error: false)
            case .success:
                let result = try await model.client.transitionWorkOrder(id: order.id, status: "awaiting_payment", result: "successful")
                let key = result.smsSent == true
                    ? "repair.successSms"
                    : (result.notifySms == true ? "repair.successNoSms" : "repair.success")
                note(language.tf(key, order.docNumber), error: false)
            case .failure:
                try await model.client.transitionWorkOrder(id: order.id, status: "cancelled", result: "failed")
                note(language.tf("repair.failed", order.docNumber), error: false)
            case .reprint:
                try await model.client.printWorkOrder(id: order.id)
                note(language.t("repair.reprinted"), error: false)
            }
            await reload()
        } catch {
            note(error.localizedDescription, error: true)
        }
    }

    private func reload() async {
        do { orders = try await model.client.workOrders() } catch { note(error.localizedDescription, error: true) }
        if let rows = try? await model.client.priceBrands() { brands = rows }
        if let rows = try? await model.client.priceList() { priceItems = rows }
        await loadModels(brandId)
    }

    private var brandSuggestions: [PriceBrand] {
        suggestions(brands, query: brand)
    }

    private var modelSuggestions: [PriceModelName] {
        suggestions(models, query: deviceModel)
    }

    private var issueSuggestions: [PriceListRow] {
        let brandName = brand.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !brandName.isEmpty else { return [] }
        let typed = issue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return priceItems
            .filter { item in
                item.brand.caseInsensitiveCompare(brandName) == .orderedSame
                    && matchesModel(item.model, deviceModel)
                    && (typed.isEmpty || item.issue.lowercased().contains(typed))
                    && item.issue.caseInsensitiveCompare(issue.trimmingCharacters(in: .whitespacesAndNewlines)) != .orderedSame
            }
            .sorted { $0.issue.localizedStandardCompare($1.issue) == .orderedAscending }
            .prefix(8)
            .map { $0 }
    }

    private func suggestions<T: Identifiable & NamedRow>(_ rows: [T], query: String) -> [T] {
        let typed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let q = typed.lowercased()
        return rows
            .filter { row in
                row.name.caseInsensitiveCompare(typed) != .orderedSame
                    && (q.isEmpty || row.name.lowercased().contains(q))
            }
            .prefix(8)
            .map { $0 }
    }

    private func matchesModel(_ priceModel: String, _ input: String) -> Bool {
        let typed = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if typed.isEmpty || priceModel == "—" { return true }
        return priceModel.lowercased() == typed
    }

    private func syncBrand() {
        let next = brands.first {
            $0.name.caseInsensitiveCompare(brand.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
        }?.id ?? ""
        priceListItemId = ""
        guard next != brandId else { return }
        brandId = next
        deviceModel = ""
        issue = ""
        let id = next
        Task { await loadModels(id) }
    }

    private func loadModels(_ id: String) async {
        guard !id.isEmpty else { models = []; return }
        models = (try? await model.client.priceModels(brandId: id)) ?? []
    }

    private func pickIssue(_ item: PriceListRow) {
        issue = item.issue
        priceListItemId = item.id
        price = String(format: "%.2f", item.priceIncVat)
    }

    private func money(_ value: Double) -> String {
        String(format: "€%.2f", value)
    }

    private func note(_ text: String, error: Bool) {
        message = text
        messageIsError = error
    }
}

private enum IntakeField: Hashable { case phone, name, notes, brand, model, issue, imei, price, shop }

private enum ScanTarget { case imei, history }

struct IntakePhoto: Identifiable {
    let id = UUID()
    let image: UIImage

    var jpeg: Data? {
        let maxSide: CGFloat = 1280
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let rendered = UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.7)
    }
}

private protocol NamedRow { var name: String { get } }
extension PriceBrand: NamedRow {}
extension PriceModelName: NamedRow {}

enum RepairAction { case checkIn, success, failure, reprint }

private func customerInfo(_ order: WorkOrderRow) -> String {
    [order.customerName, order.customerPhone]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: " · ")
}

struct RepairCard: View {
    @EnvironmentObject private var language: LanguageStore
    let order: WorkOrderRow
    let busy: Bool
    let opening: Bool
    let onAction: (RepairAction) -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onOpen) {
                OrderBrief(order: order, opening: opening)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(opening)
            HStack {
                if order.status == "in_progress" || order.status == "returned" {
                    Button(language.t("repair.fixed")) { onAction(.success) }.buttonStyle(.borderedProminent).disabled(busy)
                    Button(language.t("repair.notFixed")) { onAction(.failure) }.tint(.red).disabled(busy)
                }
                if order.status == "sent_out" || order.status == "in_repair" {
                    Button(language.t("repair.checkIn")) { onAction(.checkIn) }.buttonStyle(.borderedProminent).disabled(busy)
                }
                Button(language.t("repair.reprint")) { onAction(.reprint) }.disabled(busy)
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
    }
}

struct OrderBrief: View {
    @EnvironmentObject private var language: LanguageStore
    let order: WorkOrderRow
    var opening = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            labeled(language.t("repair.model"), order.deviceModel)
            labeled(language.t("repair.issue"), order.issueDescription)
            HStack {
                Text(String(format: "€%.2f", order.quotedPriceIncVat)).font(.headline)
                Spacer()
                if opening { ProgressView() }
            }
            labeled(language.t("repair.customer"), customerInfo(order))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func labeled(_ title: String, _ value: String?) -> some View {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title).foregroundStyle(.secondary)
            Text(text.isEmpty ? "—" : text)
        }
        .font(.subheadline)
    }
}

private struct RepairPriceSheet: View {
    @EnvironmentObject private var language: LanguageStore
    @Environment(\.dismiss) private var dismiss
    let order: WorkOrderRow
    let onSave: (Double, String) async throws -> Void
    @State private var price: String
    @State private var issue: String
    @State private var saving = false
    @State private var errorText: String?

    init(order: WorkOrderRow, onSave: @escaping (Double, String) async throws -> Void) {
        self.order = order
        self.onSave = onSave
        _price = State(initialValue: String(format: "%.2f", order.quotedPriceIncVat))
        _issue = State(initialValue: order.issueDescription ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(order.docNumber) {
                    labeled(language.t("repair.customer"), customerInfo(order))
                    labeled(language.t("repair.brand"), order.deviceBrand)
                    labeled(language.t("repair.model"), order.deviceModel)
                    labeled(language.t("repair.imei"), order.imeiSn)
                    labeled(language.t("repair.notes"), order.notes)
                    labeled(language.t("repair.shop"), order.repairLocation)
                    if !canEdit {
                        labeled(language.t("repair.issue"), order.issueDescription)
                        labeled(language.t("repair.price"), String(format: "€%.2f", order.quotedPriceIncVat))
                    }
                    OrderPhotos(orderId: order.id, photoIds: order.photoIds ?? [])
                    Text(statusText).font(.subheadline).foregroundStyle(.secondary)
                }
                if canEdit {
                Section {
                    TextField(language.t("repair.issue"), text: $issue, axis: .vertical)
                        .lineLimit(2...4)
                    TextField(language.t("repair.price"), text: $price)
                        .keyboardType(.decimalPad)
                    if let errorText {
                        Text(errorText).foregroundStyle(ShopTheme.danger)
                    }
                    Button(saving ? language.t("repair.submitting") : language.t("repair.savePrice")) {
                        Task { await save() }
                    }
                    .buttonStyle(ShopPrimaryButtonStyle(enabled: canSave))
                    .disabled(!canSave)
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                } header: {
                    Text(language.t("repair.changePrice"))
                } footer: {
                    Text(language.t("repair.priceHint"))
                }
                }
            }
            .navigationTitle(order.docNumber)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("pos.cancel")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var canEdit: Bool {
        ["draft", "in_progress", "sent_out", "in_repair", "returned", "awaiting_payment"].contains(order.status)
    }

    private var statusText: String {
        let key = "repair.status.\(order.status)"
        let label = language.t(key)
        return label == key ? order.status : label
    }

    private var canSave: Bool {
        !saving && parsedPrice != nil
    }

    private var parsedPrice: Double? {
        let value = Double(price.replacingOccurrences(of: ",", with: "."))
        guard let value, value >= 0 else { return nil }
        return value
    }

    @ViewBuilder
    private func labeled(_ title: String, _ value: String?) -> some View {
        if let value, !value.trimmingCharacters(in: .whitespaces).isEmpty {
            LabeledContent(title) { Text(value).multilineTextAlignment(.trailing) }
        }
    }

    private func save() async {
        guard let value = parsedPrice else { return }
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            try await onSave(value, issue.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct OrderNotes: View {
    let order: WorkOrderRow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let notes = order.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
                Text(notes).font(.subheadline).foregroundStyle(.secondary)
            }
            OrderPhotos(orderId: order.id, photoIds: order.photoIds ?? [])
        }
    }
}

struct ZoomShot: Identifiable {
    let id: String
    let image: UIImage
}

struct OrderPhotos: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    let orderId: String
    let photoIds: [String]
    @State private var images: [String: UIImage] = [:]
    @State private var zoom: ZoomShot?

    var body: some View {
        if !photoIds.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(photoIds, id: \.self) { id in
                        if let image = images[id] {
                            Button {
                                zoom = ZoomShot(id: id, image: image)
                            } label: {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 72, height: 72)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(language.t("repair.viewPhoto"))
                        } else {
                            ProgressView()
                                .frame(width: 72, height: 72)
                                .background(Color.secondary.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            }
            .task(id: photoIds.joined(separator: ",")) { await load() }
            .fullScreenCover(item: $zoom) { shot in
                PhotoZoom(image: shot.image)
            }
        }
    }

    private func load() async {
        var next: [String: UIImage] = [:]
        for id in photoIds {
            let key = "\(orderId)/\(id)" as NSString
            if let cached = OrderPhotoCache.images.object(forKey: key) {
                next[id] = cached
                continue
            }
            if let data = try? await model.client.workOrderPhoto(id: orderId, photoId: id),
               let image = UIImage(data: data) {
                OrderPhotoCache.images.setObject(image, forKey: key)
                next[id] = image
            }
        }
        images = next
    }
}

private enum OrderPhotoCache {
    static let images = NSCache<NSString, UIImage>()
}

struct PhotoZoom: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var language: LanguageStore
    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .scaleEffect(scale)
                .gesture(
                    MagnificationGesture()
                        .onChanged { scale = min(max(baseScale * $0, 1), 5) }
                        .onEnded { _ in baseScale = scale }
                )
                .onTapGesture(count: 2) {
                    if scale > 1 {
                        scale = 1
                        baseScale = 1
                    } else {
                        scale = 2
                        baseScale = 2
                    }
                }
            VStack {
                HStack {
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title)
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .black.opacity(0.45))
                    }
                    .padding()
                    .accessibilityLabel(language.t("pos.cancel"))
                }
                Spacer()
            }
        }
    }
}

private struct RepairCameraCapture: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> RepairCameraHost {
        let host = RepairCameraHost()
        host.onImage = onImage
        host.onCancel = { dismiss() }
        return host
    }

    func updateUIViewController(_ host: RepairCameraHost, context: Context) {
        host.onImage = onImage
        host.onCancel = { dismiss() }
    }
}

private struct RepairLibraryCapture: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> RepairLibraryHost {
        let host = RepairLibraryHost()
        host.onImage = onImage
        host.onCancel = { dismiss() }
        return host
    }

    func updateUIViewController(_ host: RepairLibraryHost, context: Context) {
        host.onImage = onImage
        host.onCancel = { dismiss() }
    }
}

final class FullScreenCameraPicker: UIImagePickerController {
    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.backgroundColor = .black
        guard let window = view.window else { return }
        if view.frame != window.bounds {
            view.frame = window.bounds
        }
    }
}

private final class RepairCameraHost: UIViewController, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    var onImage: ((UIImage) -> Void)?
    var onCancel: (() -> Void)?
    private var started = false

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        let picker = FullScreenCameraPicker()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        picker.modalPresentationCapturesStatusBarAppearance = true
        picker.view.backgroundColor = .black
        picker.edgesForExtendedLayout = .all
        let bar = picker.navigationBar
        bar.barStyle = .black
        bar.isTranslucent = true
        bar.tintColor = .white
        bar.barTintColor = .black
        present(picker, animated: false)
    }

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        if let image = info[.originalImage] as? UIImage {
            onImage?(image)
        }
        onCancel?()
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        onCancel?()
    }
}

private final class RepairLibraryHost: UIViewController, PHPickerViewControllerDelegate {
    var onImage: ((UIImage) -> Void)?
    var onCancel: (() -> Void)?
    private var started = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        present(picker, animated: false)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
            onCancel?()
            return
        }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            DispatchQueue.main.async {
                if let image = object as? UIImage {
                    self?.onImage?(image)
                }
                self?.onCancel?()
            }
        }
    }
}
