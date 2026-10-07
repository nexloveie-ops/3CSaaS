import AVFoundation
import SwiftUI

struct BarcodeScanner: View {
    @EnvironmentObject private var language: LanguageStore
    @Environment(\.dismiss) private var dismiss
    var onCode: (String) -> Void

    @State private var denied = false

    var body: some View {
        ZStack {
            ScannerPreview(onCode: { code in
                onCode(code)
                dismiss()
            }, onDenied: { denied = true })
            .ignoresSafeArea()

            VStack {
                Spacer()
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.9), lineWidth: 2)
                    .frame(width: 260, height: 140)
                Spacer()
                if denied {
                    Text(language.t("repair.cameraDenied"))
                        .font(.subheadline)
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 12)
                }
                Button(language.t("pos.cancel")) { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .padding(.bottom, 36)
            }
        }
        .background(Color.black.ignoresSafeArea())
    }
}

private struct ScannerPreview: UIViewControllerRepresentable {
    var onCode: (String) -> Void
    var onDenied: () -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onCode = onCode
        controller.onDenied = onDenied
        return controller
    }

    func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}
}

private final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?
    var onDenied: (() -> Void)?

    private let session = AVCaptureSession()
    private let preview = AVCaptureVideoPreviewLayer()
    private var didScan = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        preview.videoGravity = .resizeAspectFill
        preview.session = session
        view.layer.addSublayer(preview)

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configure()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
                DispatchQueue.main.async {
                    if allowed { self?.configure() } else { self?.onDenied?() }
                }
            }
        default:
            onDenied?()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview.frame = view.bounds
        if let connection = preview.connection {
            if #available(iOS 17.0, *), connection.isVideoRotationAngleSupported(90) {
                connection.videoRotationAngle = 90
            } else if connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stop()
    }

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .high
        defer { session.commitConfiguration() }
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input)
        else {
            onDenied?()
            return
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        let wanted: [AVMetadataObject.ObjectType] = [
            .code128, .code39, .code93, .ean13, .ean8, .qr, .pdf417, .dataMatrix, .itf14, .interleaved2of5, .aztec,
        ]
        output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !didScan,
              let value = metadataObjects
                .compactMap({ $0 as? AVMetadataMachineReadableCodeObject })
                .compactMap(\.stringValue)
                .first?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty
        else { return }
        didScan = true
        stop()
        onCode?(value)
    }

    private func stop() {
        guard session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.stopRunning()
        }
    }
}
