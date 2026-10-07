import SwiftUI

enum ShopTheme {
    static let indigo = Color(red: 0.388, green: 0.357, blue: 1.0)
    static let ink = Color(red: 0.039, green: 0.145, blue: 0.251)
    static let slate = Color(red: 0.259, green: 0.329, blue: 0.400)
    static let muted = Color(red: 0.416, green: 0.451, blue: 0.510)
    static let canvas = Color(red: 0.965, green: 0.976, blue: 0.988)
    static let border = Color(red: 0.898, green: 0.922, blue: 0.945)
    static let danger = Color(red: 0.867, green: 0.149, blue: 0.220)
    static let success = Color(red: 0.114, green: 0.667, blue: 0.376)
}

struct ShopCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(ShopTheme.border, lineWidth: 1)
            )
    }
}

extension View {
    func shopCard() -> some View { modifier(ShopCard()) }
}

/// Tile buttons must accept taps on the whole card, including the empty area around the label.
struct ShopTileButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(configuration.isPressed ? ShopTheme.canvas : Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(ShopTheme.border, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct ShopPrimaryButtonStyle: ButtonStyle {
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(enabled ? (configuration.isPressed ? ShopTheme.indigo.opacity(0.82) : ShopTheme.indigo) : ShopTheme.indigo.opacity(0.35))
            )
    }
}

struct ShopSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(ShopTheme.ink)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(configuration.isPressed ? ShopTheme.canvas : Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(ShopTheme.border, lineWidth: 1)
            )
    }
}
