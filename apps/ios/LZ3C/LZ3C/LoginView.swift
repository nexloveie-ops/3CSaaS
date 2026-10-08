import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @State private var server: String = ""
    @State private var showServer = false
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        server = model.baseURL
                        showServer = true
                    } label: {
                        Image("Logo")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 220)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("LZ3C")
                }
                .listRowBackground(Color.clear)
                Section(language.t("login.account")) {
                    TextField(language.t("login.email"), text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                    SecureField(language.t("login.password"), text: $password)
                }
                if let banner = model.banner {
                    Text(banner).foregroundStyle(.red)
                }
            }
            .navigationTitle("LZ3C")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { LanguageToggle() } }
            .safeAreaInset(edge: .bottom) {
                Button(model.busy ? language.t("login.signingIn") : language.t("login.signIn")) {
                    Task { await model.login(email: email, password: password) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.busy || email.isEmpty || password.isEmpty)
                .padding()
            }
            .onAppear { server = model.baseURL }
            .alert(language.t("login.server"), isPresented: $showServer) {
                TextField("https://lz3csaas-972911409379.europe-west1.run.app/api", text: $server)
                Button(language.t("pos.cancel"), role: .cancel) {
                    server = model.baseURL
                }
                Button(language.t("login.save")) {
                    model.saveServer(server)
                }
            } message: {
                Text(language.t("login.serverHint"))
            }
        }
    }
}

struct StorePickerView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore

    var body: some View {
        NavigationStack {
            List {
                if model.companyId == nil {
                    Section(language.t("store.company")) {
                        ForEach(model.companies) { company in
                            Button(company.name) {
                                Task { await model.selectCompany(company.id) }
                            }
                        }
                    }
                } else {
                    Section(language.t("store.store")) {
                        ForEach(model.stores) { store in
                            Button(store.name) { model.selectStore(store.id) }
                        }
                    }
                }
                if let banner = model.banner {
                    Text(banner).foregroundStyle(.red)
                }
            }
            .navigationTitle(language.t("store.enter"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { LanguageToggle() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(language.t("app.logout")) { model.logout() }
                }
            }
        }
    }
}
