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
            SkuFillView()
                .tabItem {
                    Image(systemName: "barcode.viewfinder")
                    Text(language.t("tab.skuFill"))
                }
            BuyInView()
                .tabItem {
                    Image(systemName: "arrow.down.to.line")
                    Text(language.t("tab.buyIn"))
                }
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
