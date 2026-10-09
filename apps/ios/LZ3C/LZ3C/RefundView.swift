import SwiftUI

struct RefundView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore

    @State private var from = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
    @State private var to = Date()
    @State private var query = ""
    @State private var hits: [RefundHit] = []
    @State private var selected: RefundHit?
    @State private var scanning = false
    @State private var busy = false
    @State private var error = ""
    @State private var notice = ""

    var body: some View {
        VStack(spacing: 0) {
            ShopHeader { Task { await search() } }
            ShopPageTitle(title: language.t("refund.title"))
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    filters
                    if !notice.isEmpty {
                        Text(notice)
                            .font(.subheadline)
                            .foregroundStyle(ShopTheme.success)
                    }
                    if !error.isEmpty {
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(ShopTheme.danger)
                    }
                    if hits.isEmpty && !busy {
                        Text(language.t("refund.empty"))
                            .foregroundStyle(ShopTheme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                    }
                    ForEach(hits) { hit in
                        Button { selected = hit } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(hit.docNumber)
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(ShopTheme.ink)
                                    Spacer()
                                    Text(money(hit.totalIncVat))
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(ShopTheme.ink)
                                }
                                HStack(spacing: 8) {
                                    Text(hit.businessDate ?? "")
                                    if hit.refundStatus == "refunded" {
                                        Text(language.t("refund.statusRefunded"))
                                    } else if hit.refundStatus == "partial" {
                                        Text(language.t("refund.partial"))
                                    }
                                }
                                .font(.system(size: 13))
                                .foregroundStyle(ShopTheme.muted)
                                Text(hit.summary)
                                    .font(.system(size: 14))
                                    .foregroundStyle(ShopTheme.slate)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                if let name = hit.customerName, !name.isEmpty {
                                    Text(name)
                                        .font(.system(size: 13))
                                        .foregroundStyle(ShopTheme.muted)
                                }
                                if hit.refundedTotalIncVat > 0 {
                                    Text("\(language.t("refund.refunded")) \(money(hit.refundedTotalIncVat))")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(ShopTheme.danger)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                        }
                        .buttonStyle(ShopTileButtonStyle())
                    }
                }
                .padding(16)
            }
            .background(ShopTheme.canvas)
        }
        .background(ShopTheme.canvas)
        .fullScreenCover(isPresented: $scanning) {
            BarcodeScanner { code in
                query = code.trimmingCharacters(in: .whitespacesAndNewlines)
                Task { await search() }
            }
            .environmentObject(language)
        }
        .sheet(item: $selected) { hit in
            RefundDetailSheet(orderId: hit.id) {
                notice = language.tf("refund.done", money($0))
                error = ""
                selected = nil
                Task { await search() }
            }
            .environmentObject(model)
            .environmentObject(language)
        }
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 10) {
            dateRow(language.t("refund.from"), selection: $from)
            dateRow(language.t("refund.to"), selection: $to)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(ShopTheme.muted)
                TextField(language.t("refund.search"), text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
                Button { scanning = true } label: {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(ShopTheme.indigo)
                }
                .buttonStyle(.plain)
            }
            Button(busy ? language.t("pos.working") : language.t("refund.find")) {
                Task { await search() }
            }
            .buttonStyle(.borderedProminent)
            .tint(ShopTheme.indigo)
            .disabled(busy)
        }
        .padding(12)
        .shopCard()
    }

    private func dateRow(_ title: String, selection: Binding<Date>) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(ShopTheme.slate)
                .frame(width: 80, alignment: .leading)
            Spacer(minLength: 8)
            Text(dayString(selection.wrappedValue))
                .font(.system(size: 16, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(ShopTheme.ink)
        }
        .frame(minHeight: 36)
        .overlay {
            DatePicker("", selection: selection, displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .opacity(0.02)
        }
        .accessibilityElement(children: .combine)
    }

    private func search() async {
        busy = true
        error = ""
        var start = from
        var end = to
        if start > end { swap(&start, &end) }
        do {
            hits = try await model.client.searchReceipts(
                from: dayString(start),
                to: dayString(end),
                query: query
            )
        } catch {
            hits = []
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func dayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func money(_ value: Double) -> String {
        String(format: "€%.2f", value)
    }
}

private struct RefundDetailSheet: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @Environment(\.dismiss) private var dismiss

    let orderId: String
    var onRefunded: (Double) -> Void

    @State private var detail: RefundDetail?
    @State private var selected: Set<Int> = []
    @State private var amountText = ""
    @State private var method = "cash"
    @State private var confirm = false
    @State private var busy = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let detail {
                        Text(detail.docNumber)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(ShopTheme.ink)
                        Text(detail.businessDate ?? "")
                            .font(.subheadline)
                            .foregroundStyle(ShopTheme.muted)
                        if let customer = customerLine(detail) {
                            labeled(language.t("refund.customer"), customer)
                        }
                        labeled(language.t("refund.paid"), payLabel(detail.paymentMethod))
                        labeled(language.t("pos.total"), money(detail.totalIncVat))
                        if detail.refundedTotalIncVat > 0 {
                            labeled(language.t("refund.refunded"), money(detail.refundedTotalIncVat))
                        }
                        labeled(language.t("refund.remaining"), money(detail.refundableAmount))
                        if refundState(detail) == "refunded" {
                            Text(language.t("refund.statusRefunded"))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ShopTheme.danger)
                        } else if refundState(detail) == "partial" {
                            Text(language.t("refund.partial"))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ShopTheme.indigo)
                        }

                        Text(language.t("refund.pick"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ShopTheme.ink)
                        ForEach(detail.lines) { line in
                            Button {
                                toggle(line)
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: line.refunded
                                          ? "checkmark.circle.fill"
                                          : (selected.contains(line.lineIndex) ? "checkmark.circle.fill" : "circle"))
                                        .font(.system(size: 20))
                                        .foregroundStyle(line.refunded ? ShopTheme.muted : ShopTheme.indigo)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(line.productName)
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundStyle(line.refunded ? ShopTheme.muted : ShopTheme.ink)
                                        if let sn = line.sn, !sn.isEmpty {
                                            Text(sn)
                                                .font(.system(size: 13, design: .monospaced))
                                                .foregroundStyle(ShopTheme.muted)
                                        }
                                        Text("\(line.quantity) × \(money(line.unitPriceIncVat))")
                                            .font(.system(size: 13))
                                            .foregroundStyle(ShopTheme.slate)
                                        if line.refunded {
                                            Text(language.t("refund.refundedLine"))
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundStyle(ShopTheme.danger)
                                        }
                                    }
                                    Spacer(minLength: 8)
                                    Text(money(line.refunded ? line.lineTotalIncVat : line.refundableAmount))
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(line.refunded ? ShopTheme.muted : ShopTheme.ink)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                            }
                            .buttonStyle(ShopTileButtonStyle())
                            .disabled(line.refunded)
                        }

                        Text(language.t("refund.amount"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ShopTheme.ink)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .padding(12)
                            .shopCard()

                        Text(language.t("refund.method"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ShopTheme.ink)
                        Picker(language.t("refund.method"), selection: $method) {
                            Text(language.t("pos.cash")).tag("cash")
                            Text(language.t("pos.card")).tag("card")
                        }
                        .pickerStyle(.segmented)

                        if detail.refundableAmount <= 0.001 {
                            Text(language.t("refund.none"))
                                .foregroundStyle(ShopTheme.muted)
                        }
                    } else if error.isEmpty {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 24)
                    }
                    if !error.isEmpty {
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(ShopTheme.danger)
                    }
                }
                .padding(16)
            }
            .background(ShopTheme.canvas)
            .navigationTitle(language.t("refund.detail"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(language.t("pos.close")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? language.t("pos.working") : language.t("refund.submit")) {
                        confirm = true
                    }
                    .disabled(busy || selected.isEmpty || amountCap <= 0.001)
                }
            }
            .confirmationDialog(
                language.tf("refund.confirm", money(parsedAmount), payLabel(method)),
                isPresented: $confirm,
                titleVisibility: .visible
            ) {
                Button(language.t("refund.submit")) { Task { await submit() } }
                Button(language.t("pos.cancel"), role: .cancel) {}
            }
            .task { await load() }
        }
    }

    private var parsedAmount: Double {
        let raw = amountText.replacingOccurrences(of: ",", with: ".")
        return ((Double(raw) ?? 0) * 100).rounded() / 100
    }

    private var selectedTotal: Double {
        guard let detail else { return 0 }
        return detail.lines
            .filter { selected.contains($0.lineIndex) && !$0.refunded }
            .reduce(0) { $0 + $1.refundableAmount }
    }

    private var amountCap: Double {
        guard let detail else { return 0 }
        return min(selectedTotal, detail.refundableAmount)
    }

    private func refundState(_ detail: RefundDetail) -> String {
        let open = detail.lines.filter { !$0.refunded }.count
        if open == 0 { return "refunded" }
        if open == detail.lines.count { return "open" }
        return "partial"
    }

    private func toggle(_ line: RefundLineDetail) {
        guard !line.refunded else { return }
        if selected.contains(line.lineIndex) {
            selected.remove(line.lineIndex)
        } else {
            selected.insert(line.lineIndex)
        }
        amountText = String(format: "%.2f", max(0, amountCap))
    }

    private func load() async {
        do {
            let loaded = try await model.client.receiptDetail(id: orderId)
            detail = loaded
            selected = Set(loaded.lines.filter { !$0.refunded }.map(\.lineIndex))
            if loaded.paymentMethod == "card" { method = "card" }
            amountText = String(format: "%.2f", max(0, amountCap))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func submit() async {
        guard let detail else { return }
        let indexes = detail.lines
            .filter { selected.contains($0.lineIndex) && !$0.refunded }
            .map(\.lineIndex)
        if indexes.isEmpty {
            error = language.t("refund.needPick")
            return
        }
        let amount = parsedAmount
        if amount < 0.01 || amount - amountCap > 0.001 {
            error = language.t("refund.remaining") + " " + money(amountCap)
            return
        }
        busy = true
        error = ""
        do {
            _ = try await model.client.refundOrder(
                id: orderId,
                amount: amount,
                paymentMethod: method,
                lineIndexes: indexes
            )
            onRefunded(amount)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func customerLine(_ detail: RefundDetail) -> String? {
        let parts = [detail.customerName, detail.customerPhone].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(ShopTheme.muted)
            Spacer()
            Text(value).foregroundStyle(ShopTheme.ink)
        }
        .font(.subheadline)
    }

    private func payLabel(_ method: String) -> String {
        if method == "cash" { return language.t("pos.cash") }
        if method == "card" { return language.t("pos.card") }
        if method == "tap_to_pay" { return language.t("pos.tapToPay") }
        return method
    }

    private func money(_ value: Double) -> String {
        String(format: "€%.2f", value)
    }
}
