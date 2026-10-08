import PhotosUI
import SwiftUI
import UIKit

struct BuyInView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore

    @State private var brand = ""
    @State private var deviceModel = ""
    @State private var capacity = ""
    @State private var color = ""
    @State private var imei = ""
    @State private var customer = ""
    @State private var phone = ""
    @State private var price = ""
    @State private var notes = ""
    @State private var payment = "cash"
    @State private var photos: [Int: Data] = [:]
    @State private var previews: [Int: UIImage] = [:]
    @State private var photoMenuSlot: Int?
    @State private var photoRequest: BuyPhotoRequest?
    @State private var draftId: String?
    @State private var pending: [BuyInRow] = []
    @State private var historyQuery = ""
    @State private var history: [BuyInRow] = []
    @State private var historyTask: Task<Void, Never>?
    @State private var historyGeneration = 0
    @State private var scanTarget: BuyScanTarget?
    @State private var selected: BuyInRow?
    @State private var busy = false
    @State private var message: String?
    @State private var messageIsError = false
    @State private var formOpen = false
    @State private var appliedDefault = false

    private var buyPrice: Double? {
        let parsed = Double(price.replacingOccurrences(of: ",", with: "."))
        guard let parsed, parsed >= 0 else { return nil }
        return (parsed * 100).rounded() / 100
    }

    private var canSubmit: Bool {
        !brand.trimmingCharacters(in: .whitespaces).isEmpty
            && !deviceModel.trimmingCharacters(in: .whitespaces).isEmpty
            && !capacity.trimmingCharacters(in: .whitespaces).isEmpty
            && !color.trimmingCharacters(in: .whitespaces).isEmpty
            && !imei.trimmingCharacters(in: .whitespaces).isEmpty
            && !customer.trimmingCharacters(in: .whitespaces).isEmpty
            && !phone.trimmingCharacters(in: .whitespaces).isEmpty
            && buyPrice != nil
            && photos[1] != nil && photos[2] != nil && photos[3] != nil
            && !busy
    }

    var body: some View {
        VStack(spacing: 0) {
            ShopHeader { Task { await load() } }
            Button {
                withAnimation { formOpen.toggle() }
            } label: {
                ShopPageTitle(
                    title: language.t("buy.title"),
                    showsChevron: true,
                    expanded: formOpen
                )
            }
            .buttonStyle(.plain)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if formOpen {
                    field(language.t("buy.brand"), text: $brand)
                    field(language.t("buy.model"), text: $deviceModel)
                    field(language.t("buy.capacity"), text: $capacity)
                    field(language.t("buy.color"), text: $color)
                    field(language.t("buy.customer"), text: $customer)
                    field(language.t("buy.phone"), text: $phone, phone: true)
                    HStack(alignment: .bottom, spacing: 8) {
                        field(language.t("buy.imei"), text: $imei)
                        Button { scanTarget = .imei } label: {
                            Image(systemName: "barcode.viewfinder")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(ShopTheme.indigo)
                                .frame(width: 44, height: 44)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(ShopTheme.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                    field(language.t("buy.price"), text: $price, number: true)
                    field(language.t("buy.notes"), text: $notes)
                    Picker(language.t("buy.pay"), selection: $payment) {
                        Text(language.t("buy.cash")).tag("cash")
                        Text(language.t("buy.transfer")).tag("bank_transfer")
                    }
                    .pickerStyle(.segmented)
                    HStack(spacing: 8) {
                        photoButton(1, language.t("buy.photo1"))
                        photoButton(2, language.t("buy.photo2"))
                        photoButton(3, language.t("buy.photo3"))
                    }
                    Button(language.t("buy.submit")) { Task { await submit() } }
                        .buttonStyle(ShopPrimaryButtonStyle(enabled: canSubmit))
                        .disabled(!canSubmit)
                    }
                    if let message {
                        Text(message)
                            .font(.subheadline)
                            .foregroundStyle(messageIsError ? ShopTheme.danger : ShopTheme.success)
                    }
                    ShopPageTitle(title: language.t("buy.pending"), count: pending.count, horizontallyPadded: false)
                    if pending.isEmpty {
                        Text(language.t("buy.empty"))
                            .font(.subheadline)
                            .foregroundStyle(ShopTheme.muted)
                    } else {
                        ForEach(pending) { row in
                            Button { selected = row } label: {
                                buyRow(row, showsStatus: false)
                            }
                            .buttonStyle(ShopTileButtonStyle())
                        }
                    }
                    ShopPageTitle(title: language.t("buy.history"), horizontallyPadded: false)
                    HStack(spacing: 8) {
                        TextField(language.t("buy.historyHint"), text: $historyQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 12)
                            .frame(height: 44)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(ShopTheme.border, lineWidth: 1))
                        Button { scanTarget = .history } label: {
                            Image(systemName: "barcode.viewfinder")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(ShopTheme.indigo)
                                .frame(width: 44, height: 44)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(ShopTheme.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                    if !historyQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        if history.isEmpty {
                            Text(language.t("buy.historyEmpty"))
                                .font(.subheadline)
                                .foregroundStyle(ShopTheme.muted)
                        } else {
                            ForEach(history) { row in
                                Button { selected = row } label: {
                                    buyRow(row, showsStatus: true)
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
        .onChange(of: historyQuery) { _ in scheduleHistorySearch() }
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
            isPresented: Binding(
                get: { photoMenuSlot != nil },
                set: { if !$0 { photoMenuSlot = nil } }
            ),
            titleVisibility: .hidden
        ) {
            Button(language.t("buy.takePhoto")) {
                if let slot = photoMenuSlot {
                    photoRequest = BuyPhotoRequest(slot: slot, library: false)
                }
            }
            Button(language.t("buy.fromPhotos")) {
                if let slot = photoMenuSlot {
                    photoRequest = BuyPhotoRequest(slot: slot, library: true)
                }
            }
            Button(language.t("pos.cancel"), role: .cancel) {}
        }
        .fullScreenCover(item: $photoRequest) { request in
            Group {
                if request.library {
                    BuyLibraryCapture { image in
                        storePhoto(image, slot: request.slot)
                    }
                } else {
                    BuyCameraCapture(
                        libraryTitle: language.t("buy.photos"),
                        onImage: { image in storePhoto(image, slot: request.slot) },
                        onLibrary: { photoRequest = BuyPhotoRequest(slot: request.slot, library: true) }
                    )
                }
            }
            .ignoresSafeArea()
        }
        .sheet(item: $selected) { row in
            BuyInStockSheet(row: row) {
                pending.removeAll { $0.id == row.id }
                history.removeAll { $0.id == row.id }
                if pending.isEmpty { formOpen = true }
                selected = nil
                messageIsError = false
                message = language.t("buy.stocked")
            }
            .environmentObject(model)
            .environmentObject(language)
        }
    }

    private func field(_ title: String, text: Binding<String>, number: Bool = false, phone: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(ShopTheme.muted)
            TextField(title, text: text)
                .keyboardType(phone ? .phonePad : (number ? .decimalPad : .default))
                .textInputAutocapitalization(number || phone ? .never : .words)
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(ShopTheme.border, lineWidth: 1))
        }
    }

    private func buyRow(_ row: BuyInRow, showsStatus: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(row.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ShopTheme.ink)
            Text(row.imeiSn)
                .font(.caption)
                .foregroundStyle(ShopTheme.muted)
            if let name = row.customerName, !name.isEmpty {
                Text([name, row.customerPhone].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(ShopTheme.muted)
            }
            HStack {
                Text(String(format: "€%.2f", row.buyPrice))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ShopTheme.indigo)
                if showsStatus {
                    Spacer()
                    Text(row.status == "stocked" ? language.t("buy.stocked") : language.t("buy.pending"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ShopTheme.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
    }

    private func photoButton(_ slot: Int, _ title: String) -> some View {
        Button { photoMenuSlot = slot } label: {
            VStack(spacing: 6) {
                if let image = previews[slot] {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(height: 72)
                        .clipped()
                } else {
                    Image(systemName: "camera")
                        .font(.title3)
                        .foregroundStyle(ShopTheme.indigo)
                        .frame(height: 72)
                }
                Text(title)
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .foregroundStyle(ShopTheme.ink)
                    .frame(maxWidth: .infinity, minHeight: 28, maxHeight: 28, alignment: .top)
            }
            .frame(maxWidth: .infinity, minHeight: 122, maxHeight: 122, alignment: .top)
            .padding(8)
        }
        .buttonStyle(ShopTileButtonStyle())
    }

    private func load() async {
        do {
            let rows = try await model.client.buyIns()
            pending = rows
            if !historyQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                await searchHistory()
            }
            if !appliedDefault {
                formOpen = rows.isEmpty
                appliedDefault = true
            }
        } catch {
            messageIsError = true
            message = error.localizedDescription
        }
    }

    private func scheduleHistorySearch() {
        historyTask?.cancel()
        let query = historyQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            history = []
            return
        }
        historyTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            if Task.isCancelled { return }
            await searchHistory()
        }
    }

    private func searchHistory() async {
        let query = historyQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            history = []
            return
        }
        historyGeneration += 1
        let generation = historyGeneration
        do {
            async let waiting = model.client.buyIns(status: "pending_inspection")
            async let stocked = model.client.buyIns(status: "stocked")
            let rows = try await waiting + stocked
            guard generation == historyGeneration else { return }
            history = rows.filter { matchesHistory($0, query: query) }
        } catch {
            guard generation == historyGeneration else { return }
            messageIsError = true
            message = error.localizedDescription
        }
    }

    private func matchesHistory(_ row: BuyInRow, query: String) -> Bool {
        let folded = query.lowercased()
        let digits = query.filter(\.isNumber)
        let description = [row.brand, row.model, row.capacity, row.color, row.notes ?? ""]
            .joined(separator: " ")
            .lowercased()
        if description.contains(folded) { return true }
        if (row.customerName ?? "").lowercased().contains(folded) { return true }
        let imei = row.imeiSn.lowercased()
        if imei.contains(folded) { return true }
        if digits.count >= 5, imei.filter(\.isNumber).contains(digits) { return true }
        let phone = (row.customerPhone ?? "").filter(\.isNumber)
        return digits.count >= 3 && phone.contains(digits)
    }

    private func submit() async {
        guard canSubmit, let buyPrice else { return }
        busy = true
        message = nil
        defer { busy = false }
        var body: [String: Any] = [
            "brand": brand.trimmingCharacters(in: .whitespaces),
            "model": deviceModel.trimmingCharacters(in: .whitespaces),
            "capacity": capacity.trimmingCharacters(in: .whitespaces),
            "color": color.trimmingCharacters(in: .whitespaces),
            "imeiSn": imei.trimmingCharacters(in: .whitespaces),
            "customerName": customer.trimmingCharacters(in: .whitespaces),
            "customerPhone": phone.trimmingCharacters(in: .whitespaces),
            "buyPrice": buyPrice,
            "paymentMethod": payment,
        ]
        let note = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty { body["notes"] = note }
        do {
            let id: String
            if let draftId {
                _ = try await model.client.updateBuyIn(id: draftId, body)
                id = draftId
            } else {
                let created = try await model.client.createBuyIn(body)
                draftId = created._id
                id = created._id
            }
            for slot in 1...3 {
                if let jpeg = photos[slot] {
                    try await model.client.uploadBuyInPhoto(id: id, slot: slot, jpeg: jpeg)
                }
            }
            _ = try await model.client.completeBuyIn(id: id)
            draftId = nil
            resetForm()
            formOpen = false
            messageIsError = false
            message = language.t("buy.done")
            await load()
        } catch {
            messageIsError = true
            message = error.localizedDescription
        }
    }

    private func resetForm() {
        brand = ""
        deviceModel = ""
        capacity = ""
        color = ""
        imei = ""
        customer = ""
        phone = ""
        price = ""
        notes = ""
        payment = "cash"
        photos = [:]
        previews = [:]
    }

    private func storePhoto(_ image: UIImage, slot: Int) {
        if let jpeg = jpegData(image) {
            photos[slot] = jpeg
            previews[slot] = image
        }
    }

    private func jpegData(_ image: UIImage) -> Data? {
        let maxSide: CGFloat = 1280
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        let rendered = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.7)
    }
}

private enum BuyScanTarget { case imei, history }

private struct BuyPhotoRequest: Identifiable {
    let slot: Int
    let library: Bool
    var id: String { "\(slot)-\(library)" }
}

private struct BuyInStockSheet: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    let row: BuyInRow
    var onStocked: () -> Void

    @State private var retail = ""
    @State private var catalogs: [CatalogCategory] = []
    @State private var catalogId = ""
    @State private var images: [Int: UIImage] = [:]
    @State private var missingSlots: Set<Int> = []
    @State private var zoom: ZoomShot?
    @State private var busy = false
    @State private var error: String?

    private var retailPrice: Double? {
        let parsed = Double(retail.replacingOccurrences(of: ",", with: "."))
        guard let parsed, parsed > 0 else { return nil }
        return (parsed * 100).rounded() / 100
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent(language.t("buy.brand"), value: row.brand)
                    LabeledContent(language.t("buy.model"), value: row.model)
                    LabeledContent(language.t("buy.capacity"), value: row.capacity)
                    LabeledContent(language.t("buy.color"), value: row.color)
                    LabeledContent(language.t("buy.imei"), value: row.imeiSn)
                    if let name = row.customerName, !name.isEmpty {
                        LabeledContent(language.t("buy.customer"), value: name)
                    }
                    if let phone = row.customerPhone, !phone.isEmpty {
                        LabeledContent(language.t("buy.phone"), value: phone)
                    }
                    LabeledContent(language.t("buy.price"), value: String(format: "€%.2f", row.buyPrice))
                    LabeledContent(language.t("buy.pay"), value: row.paymentMethod == "cash" ? language.t("buy.cash") : language.t("buy.transfer"))
                    if let notes = row.notes, !notes.isEmpty {
                        Text(notes).foregroundStyle(ShopTheme.ink)
                    }
                }
                Section {
                    ForEach(1...3, id: \.self) { slot in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(language.t("buy.photo\(slot)"))
                                .font(.caption)
                                .foregroundStyle(ShopTheme.muted)
                            if let image = images[slot] {
                                Button {
                                    zoom = ZoomShot(id: "\(slot)", image: image)
                                } label: {
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(maxWidth: .infinity)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            } else if missingSlots.contains(slot) {
                                Text(language.t("buy.photoMissing"))
                                    .font(.subheadline)
                                    .foregroundStyle(ShopTheme.muted)
                            } else {
                                ProgressView()
                                    .frame(maxWidth: .infinity, minHeight: 88)
                            }
                        }
                    }
                }
                if row.status == "pending_inspection" {
                    Section {
                        TextField(language.t("buy.retail"), text: $retail)
                            .keyboardType(.decimalPad)
                        Picker(language.t("buy.catalog"), selection: $catalogId) {
                            Text("—").tag("")
                            ForEach(catalogs) { catalog in
                                Text(catalog.name).tag(catalog.id)
                            }
                        }
                    }
                }
                if let error {
                    Text(error).foregroundStyle(ShopTheme.danger)
                }
            }
            .navigationTitle(row.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if row.status == "pending_inspection" {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(language.t("buy.stock")) { Task { await stock() } }
                            .disabled(retailPrice == nil || catalogId.isEmpty || busy)
                    }
                }
            }
            .task {
                await loadPhotos()
                if row.status == "pending_inspection" { await loadCatalogs() }
            }
            .fullScreenCover(item: $zoom) { shot in
                PhotoZoom(image: shot.image)
                    .environmentObject(language)
            }
        }
    }

    private func loadPhotos() async {
        var loaded: [Int: UIImage] = [:]
        var missing: Set<Int> = []
        for slot in 1...3 {
            if let data = try? await model.client.buyInPhoto(id: row.id, slot: slot),
               let image = UIImage(data: data) {
                loaded[slot] = image
            } else {
                missing.insert(slot)
            }
        }
        images = loaded
        missingSlots = missing
    }

    private func loadCatalogs() async {
        do {
            catalogs = try await model.client.catalogCategories()
                .filter { $0.isActive != false }
                .sorted { ($0.sortOrder ?? 0, $0.name) < ($1.sortOrder ?? 0, $1.name) }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func stock() async {
        guard let retailPrice, !catalogId.isEmpty else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await model.client.stockInBuyIn(id: row.id, retailPrice: retailPrice, catalogCategoryId: catalogId)
            onStocked()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct BuyCameraCapture: UIViewControllerRepresentable {
    var libraryTitle: String
    var onImage: (UIImage) -> Void
    var onLibrary: () -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> BuyCameraHost {
        let host = BuyCameraHost()
        host.libraryTitle = libraryTitle
        host.onImage = onImage
        host.onLibrary = onLibrary
        host.onCancel = { dismiss() }
        return host
    }

    func updateUIViewController(_ host: BuyCameraHost, context: Context) {
        host.libraryTitle = libraryTitle
        host.onImage = onImage
        host.onLibrary = onLibrary
        host.onCancel = { dismiss() }
    }
}

private struct BuyLibraryCapture: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> BuyLibraryHost {
        let host = BuyLibraryHost()
        host.onImage = onImage
        host.onCancel = { dismiss() }
        return host
    }

    func updateUIViewController(_ host: BuyLibraryHost, context: Context) {
        host.onImage = onImage
        host.onCancel = { dismiss() }
    }
}

private final class BuyCameraHost: UIViewController, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    var libraryTitle = "Photos"
    var onImage: ((UIImage) -> Void)?
    var onLibrary: (() -> Void)?
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
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            onLibrary?()
            return
        }
        let picker = FullScreenCameraPicker()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        picker.modalPresentationCapturesStatusBarAppearance = true
        picker.view.backgroundColor = .black
        let bar = picker.navigationBar
        bar.barStyle = .black
        bar.isTranslucent = false
        bar.barTintColor = .black
        bar.tintColor = .white
        bar.shadowImage = UIImage()
        bar.setBackgroundImage(UIImage(), for: .default)
        let overlay = BuyPassThroughView(frame: view.bounds)
        var config = UIButton.Configuration.plain()
        config.title = libraryTitle
        config.baseForegroundColor = .white
        config.background.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        config.background.cornerRadius = 8
        config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
        let button = UIButton(configuration: config)
        button.addTarget(self, action: #selector(openLibrary), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(button)
        NSLayoutConstraint.activate([
            button.topAnchor.constraint(equalTo: overlay.topAnchor, constant: 12),
            button.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -16),
        ])
        picker.cameraOverlayView = overlay
        present(picker, animated: false)
    }

    @objc private func openLibrary() {
        presentedViewController?.dismiss(animated: false) { self.onLibrary?() }
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

private final class BuyLibraryHost: UIViewController, PHPickerViewControllerDelegate {
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

private final class BuyPassThroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}
