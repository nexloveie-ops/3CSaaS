import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.token == nil {
                LoginView()
            } else if model.storeId == nil {
                StorePickerView()
            } else {
                ShopTabs()
            }
        }
        .task { await model.restore() }
    }
}

struct ShopTabs: View {
    @EnvironmentObject private var language: LanguageStore

    var body: some View {
        TabView {
            SellView()
                .tabItem {
                    Image(systemName: "cart")
                    Text(language.t("tab.sales"))
                }
            RefundView()
                .tabItem {
                    Image(systemName: "arrow.uturn.backward")
                    Text(language.t("tab.refund"))
                }
            RepairsView()
                .tabItem {
                    Image(systemName: "wrench.and.screwdriver")
                    Text(language.t("tab.repairs"))
                }
            BuyInView()
                .tabItem {
                    Image(systemName: "arrow.down.to.line")
                    Text(language.t("tab.buyIn"))
                }
            MoreView()
                .tabItem {
                    Image(systemName: "ellipsis")
                    Text(language.t("tab.more"))
                }
        }
    }
}

private enum MorePage: Hashable {
    case barcodes
    case report
}

struct MoreView: View {
    @EnvironmentObject private var language: LanguageStore

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ShopHeader {}
                ShopPageTitle(title: language.t("tab.more"))
                VStack(spacing: 12) {
                    NavigationLink(value: MorePage.barcodes) {
                        moreRow(systemImage: "barcode.viewfinder", title: language.t("tab.skuFill"))
                    }
                    NavigationLink(value: MorePage.report) {
                        moreRow(systemImage: "chart.bar", title: language.t("tab.report"))
                    }
                }
                .padding(16)
                Spacer(minLength: 0)
            }
            .background(ShopTheme.canvas)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: MorePage.self) { page in
                MoreDestination(page: page)
            }
        }
    }

    private func moreRow(systemImage: String, title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(ShopTheme.indigo)
                .frame(width: 28)
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(ShopTheme.ink)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(ShopTheme.muted)
        }
        .padding(16)
        .shopCard()
    }
}

private struct MoreDestination: View {
    @Environment(\.dismiss) private var dismiss
    let page: MorePage

    var body: some View {
        Group {
            switch page {
            case .barcodes:
                SkuFillView()
            case .report:
                ReportView()
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .overlay(alignment: .leading) {
            Color.clear
                .frame(width: 16)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 12, coordinateSpace: .local)
                        .onEnded { value in
                            let dx = value.translation.width
                            let dy = value.translation.height
                            guard dx > 50, abs(dx) > abs(dy) else { return }
                            dismiss()
                        }
                )
        }
    }
}

struct ShopHeader: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    var onRefresh: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image("Logo")
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(language.t("app.cashier"))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(ShopTheme.indigo)
                Text(model.store?.name ?? "")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ShopTheme.ink)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            LanguageToggle()
            Button(action: onRefresh) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(ShopTheme.slate)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white))
                    .overlay(Circle().strokeBorder(ShopTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            Menu {
                Button(language.t("pos.switchStore")) { model.switchStore() }
                Button(language.t("app.logout")) { model.logout() }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(ShopTheme.slate)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white))
                    .overlay(Circle().strokeBorder(ShopTheme.border, lineWidth: 1))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
        .overlay(alignment: .bottom) { Rectangle().fill(ShopTheme.border).frame(height: 1) }
    }
}

struct ShopPageTitle: View {
    let title: String
    var count: Int? = nil
    var showsChevron = false
    var expanded = false
    var horizontallyPadded = true

    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(ShopTheme.ink)
                .lineLimit(1)
            if let count, count > 0 {
                Text("\(count)")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(ShopTheme.indigo)
            }
            Spacer(minLength: 0)
            if showsChevron {
                Image(systemName: "chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ShopTheme.muted)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
        .padding(.horizontal, horizontallyPadded ? 16 : 0)
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .contentShape(Rectangle())
    }
}
