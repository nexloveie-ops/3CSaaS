import Foundation
import StripeTerminal

/// Tap to Pay on iPhone. The Stripe secret stays on the server; this only receives a connection token.
final class TapToPay: NSObject, ConnectionTokenProvider, TapToPayReaderDelegate {
    static let shared = TapToPay()

    private var client = APIClient(baseURL: "", token: nil, companyId: nil, storeId: nil)
    private var started = false
    private var locationId: String?
    private var collectCancelable: Cancelable?
    var onReaderMessage: ((String) -> Void)?

    func cancelCollect() {
        collectCancelable?.cancel { _ in }
        collectCancelable = nil
    }

    func charge(
        euros: Double,
        locationId: String,
        merchantName: String,
        client: APIClient
    ) async throws -> String {
        self.client = client
        return try await runCharge(euros: euros, locationId: locationId, merchantName: merchantName)
    }

    @MainActor
    private func runCharge(euros: Double, locationId: String, merchantName: String) async throws -> String {
        prepare()
        if self.locationId != locationId {
            if Terminal.shared.connectedReader != nil {
                try await Terminal.shared.disconnectReader()
            }
            Terminal.shared.clearCachedCredentials()
            self.locationId = locationId
        }
        if Terminal.shared.connectionStatus != .connected {
            let discoveryBuilder = TapToPayDiscoveryConfigurationBuilder()
            #if targetEnvironment(simulator)
            discoveryBuilder.setSimulated(true)
            #endif
            let discovery = try discoveryBuilder.build()
            let connection = try TapToPayConnectionConfigurationBuilder(
                delegate: self,
                locationId: locationId
            )
            .setMerchantDisplayName(merchantName)
            .build()
            let easy = TapToPayEasyConnectConfiguration(
                discoveryConfiguration: discovery,
                connectionConfiguration: connection
            )
            _ = try await Terminal.shared.easyConnect(easy)
        }
        let created = try await client.paymentIntent(amount: euros)
        let intent = try await Terminal.shared.retrievePaymentIntent(clientSecret: created.clientSecret)
        let collected = try await collect(intent)
        let confirmed = try await Terminal.shared.confirmPaymentIntent(collected)
        guard confirmed.status == .succeeded else {
            throw APIFailure(message: "刷卡未完成")
        }
        return created.paymentIntentId
    }

    @MainActor
    private func collect(_ intent: PaymentIntent) async throws -> PaymentIntent {
        try await withCheckedThrowingContinuation { cont in
            collectCancelable = Terminal.shared.collectPaymentMethod(intent) { collected, error in
                self.collectCancelable = nil
                if let error {
                    cont.resume(throwing: error)
                } else if let collected {
                    cont.resume(returning: collected)
                } else {
                    cont.resume(throwing: APIFailure(message: "刷卡未完成"))
                }
            }
        }
    }

    private func prepare() {
        if started { return }
        Terminal.initWithTokenProvider(self)
        started = true
    }

    func fetchConnectionToken() async throws -> String {
        try await client.connectionToken()
    }

    func tapToPayReader(
        _ reader: Reader,
        didStartInstallingUpdate update: ReaderSoftwareUpdate,
        cancelable: Cancelable?
    ) {}

    func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {}

    func tapToPayReader(
        _ reader: Reader,
        didFinishInstallingUpdate update: ReaderSoftwareUpdate?,
        error: Error?
    ) {}

    func tapToPayReader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions = []) {
        let text = Terminal.stringFromReaderInputOptions(inputOptions)
        Task { @MainActor in self.onReaderMessage?(text) }
    }

    func tapToPayReader(_ reader: Reader, didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage) {
        let text = Terminal.stringFromReaderDisplayMessage(displayMessage)
        Task { @MainActor in self.onReaderMessage?(text) }
    }
}
