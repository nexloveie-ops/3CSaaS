import SwiftUI
import UIKit

@main
struct LZ3CApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var language = LanguageStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(language)
                .background(KeyboardDismissInstaller())
        }
    }
}

/// A tap outside a text field resigns it and hides the keyboard, without blocking the tap.
private struct KeyboardDismissInstaller: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            guard let window = uiView.window,
                  !(window.gestureRecognizers ?? []).contains(where: { $0.name == "lz3c.dismissKeyboard" })
            else { return }
            let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.dismiss))
            tap.cancelsTouchesInView = false
            tap.delegate = context.coordinator
            tap.name = "lz3c.dismissKeyboard"
            window.addGestureRecognizer(tap)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        @objc func dismiss() {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view = touch.view
            while let current = view {
                if current is UITextField || current is UITextView { return false }
                view = current.superview
            }
            return true
        }
    }
}
