import SwiftUI

private enum ReportDateField: String, Identifiable {
    case from
    case to
    var id: String { rawValue }
    var titleKey: String { self == .from ? "report.from" : "report.to" }
}

struct ReportView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore

    @State private var unlocked = false
    @State private var code = ""
    @State private var codeError = ""
    @State private var from = Date()
    @State private var to = Date()
    @State private var report: SalesReport?
    @State private var busy = false
    @State private var error = ""
    @State private var picking: ReportDateField?

    var body: some View {
        VStack(spacing: 0) {
            ShopHeader {
                guard unlocked else { return }
                Task { await load() }
            }
            ShopPageTitle(title: language.t("report.title"))
            if unlocked {
                reportBody
            } else {
                lock
            }
        }
        .background(ShopTheme.canvas)
        .onDisappear {
            unlocked = false
            code = ""
            codeError = ""
            report = nil
        }
    }

    private var lock: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                SecureField(language.t("report.password"), text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(size: 22, weight: .semibold))
                    .monospacedDigit()
                    .onChange(of: code) { value in
                        let digits = value.filter(\.isNumber)
                        if digits != value || digits.count > 4 {
                            code = String(digits.prefix(4))
                        }
                    }
                if !codeError.isEmpty {
                    Text(codeError)
                        .font(.subheadline)
                        .foregroundStyle(ShopTheme.danger)
                }
                Button(language.t("report.unlock")) { unlock() }
                    .buttonStyle(.borderedProminent)
                    .tint(ShopTheme.indigo)
                    .disabled(code.count != 4)
            }
            .padding(16)
            .shopCard()
            .padding(16)
            Spacer()
        }
    }

    private var reportBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                dates
                presets
                if fromDay > toDay {
                    Text(language.t("report.invalid"))
                        .font(.subheadline)
                        .foregroundStyle(ShopTheme.danger)
                }
                if busy && report == nil {
                    ProgressView().frame(maxWidth: .infinity)
                }
                if !error.isEmpty {
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(ShopTheme.danger)
                }
                if let report {
                    figures(report)
                    payments(report)
                    taxes(report)
                }
            }
            .padding(16)
        }
        .onChange(of: rangeKey) { _ in Task { await load() } }
        .sheet(item: $picking) { field in
            NavigationStack {
                DatePicker(
                    "",
                    selection: dateBinding(field),
                    displayedComponents: .date
                )
                .datePickerStyle(.graphical)
                .labelsHidden()
                .padding()
                .navigationTitle(language.t(field.titleKey))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(language.t("report.done")) { picking = nil }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var dates: some View {
        VStack(spacing: 8) {
            dateRow(language.t("report.from"), field: .from, date: from)
            dateRow(language.t("report.to"), field: .to, date: to)
        }
        .padding(12)
        .shopCard()
    }

    private var presets: some View {
        HStack(spacing: 8) {
            preset(language.t("report.today")) {
                from = Date()
                to = Date()
            }
            preset(language.t("report.week")) {
                from = Calendar.current.date(byAdding: .day, value: -6, to: Date()) ?? Date()
                to = Date()
            }
            preset(language.t("report.month")) {
                let now = Date()
                from = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: now)) ?? now
                to = now
            }
        }
    }

    private func figures(_ report: SalesReport) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            kpi(language.t("report.turnover"), money(report.turnoverIncVat), emphasis: true)
            Text(language.tf("report.counts", report.receiptCount, report.itemsSold))
                .font(.caption)
                .foregroundStyle(ShopTheme.muted)
            kpi(language.t("report.net"), money(report.turnoverExVat))
            kpi(language.t("report.vat"), money(report.vatTotal))
            kpi(language.t("report.cost"), money(report.costTotal))
            kpi(language.t("report.profit"), money(report.grossProfit), emphasis: true)
            Text(language.tf("report.margin", report.profitMarginPct))
                .font(.caption)
                .foregroundStyle(ShopTheme.muted)
            kpi(language.t("report.open"), "\(report.openWorkOrders)")
            if report.repairRevenueIncVat > 0 {
                kpi(language.t("report.repair"), money(report.repairRevenueIncVat))
            }
        }
        .padding(12)
        .shopCard()
    }

    private func payments(_ report: SalesReport) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(language.t("report.payments"))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(ShopTheme.ink)
            if report.payments.total <= 0 {
                Text(language.t("report.none"))
                    .font(.subheadline)
                    .foregroundStyle(ShopTheme.muted)
            } else {
                if report.payments.cash > 0 {
                    payRow(language.t("report.cash"), report.payments.cash, report.payments.total)
                }
                if report.payments.card > 0 {
                    payRow(language.t("report.card"), report.payments.card, report.payments.total)
                }
                if report.payments.other > 0 {
                    payRow(language.t("report.other"), report.payments.other, report.payments.total)
                }
                HStack {
                    Text(language.t("report.paymentTotal"))
                    Spacer()
                    Text(money(report.payments.total)).fontWeight(.semibold)
                }
                .foregroundStyle(ShopTheme.ink)
            }
        }
        .padding(12)
        .shopCard()
    }

    private func taxes(_ report: SalesReport) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(language.t("report.tax"))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(ShopTheme.ink)
            if report.repairRevenueIncVat > 0 {
                Text(language.t("report.repairNote"))
                    .font(.caption)
                    .foregroundStyle(ShopTheme.muted)
            }
            ForEach(report.taxBreakdown) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ShopTheme.ink)
                    taxLine(language.t("report.inc"), row.revenueIncVat)
                    taxLine(language.t("report.ex"), row.revenueExVat)
                    taxLine(language.t("report.vatCol"), row.vat)
                    taxLine(language.t("report.costCol"), row.cost)
                    taxLine(language.t("report.profitCol"), row.profit)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(language.t("report.total"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ShopTheme.ink)
                taxLine(language.t("report.inc"), report.turnoverIncVat)
                taxLine(language.t("report.ex"), report.turnoverExVat)
                taxLine(language.t("report.vatCol"), report.vatTotal)
                taxLine(language.t("report.costCol"), report.costTotal)
                taxLine(language.t("report.profitCol"), report.grossProfit)
            }
        }
        .padding(12)
        .shopCard()
    }

    private func unlock() {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let expected = String(format: "%02d%02d", parts.hour ?? 0, parts.minute ?? 0)
        guard code == expected else {
            code = ""
            codeError = language.t("report.wrong")
            return
        }
        code = ""
        codeError = ""
        unlocked = true
        Task { await load() }
    }

    private func load() async {
        guard unlocked, fromDay <= toDay else { return }
        busy = true
        error = ""
        defer { busy = false }
        do {
            report = try await model.client.salesReport(from: fromDay, to: toDay)
        } catch {
            report = nil
            self.error = error.localizedDescription
        }
    }

    private var fromDay: String { dayString(from) }
    private var toDay: String { dayString(to) }
    private var rangeKey: String { "\(fromDay)|\(toDay)" }

    private func dayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func money(_ value: Double) -> String { String(format: "€%.2f", value) }

    private func dateRow(_ title: String, field: ReportDateField, date: Date) -> some View {
        Button {
            picking = field
        } label: {
            HStack(spacing: 12) {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(ShopTheme.slate)
                Spacer(minLength: 8)
                Text(dayString(date))
                    .font(.system(size: 16, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(ShopTheme.indigo)
                Image(systemName: "calendar")
                    .foregroundStyle(ShopTheme.indigo)
            }
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func dateBinding(_ field: ReportDateField) -> Binding<Date> {
        switch field {
        case .from: return $from
        case .to: return $to
        }
    }

    private func preset(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(ShopTheme.indigo)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.white)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(ShopTheme.border, lineWidth: 1))
    }

    private func kpi(_ label: String, _ value: String, emphasis: Bool = false) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(ShopTheme.slate)
            Spacer()
            Text(value)
                .font(.system(size: emphasis ? 20 : 16, weight: .semibold))
                .foregroundStyle(emphasis ? ShopTheme.indigo : ShopTheme.ink)
                .monospacedDigit()
        }
    }

    private func payRow(_ label: String, _ amount: Double, _ total: Double) -> some View {
        let share = total > 0 ? (amount / total * 1000).rounded() / 10 : 0
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).foregroundStyle(ShopTheme.ink)
                Spacer()
                Text(money(amount)).fontWeight(.semibold).foregroundStyle(ShopTheme.ink)
            }
            Text(String(format: "%.1f%%", share))
                .font(.caption)
                .foregroundStyle(ShopTheme.muted)
        }
    }

    private func taxLine(_ label: String, _ amount: Double) -> some View {
        HStack {
            Text(label).foregroundStyle(ShopTheme.slate)
            Spacer()
            Text(money(amount)).foregroundStyle(ShopTheme.ink).monospacedDigit()
        }
        .font(.subheadline)
    }
}
