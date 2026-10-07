import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var language: LanguageStore
    @State private var server: String = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image("Logo")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 220)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .accessibilityLabel("LZ3C")
                }
                .listRowBackground(Color.clear)
                Section(language.t("login.server")) {
                    TextField("http://127.0.0.1:3000/api", text: $server)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Text(language.t("login.serverHint"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
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
                    model.saveServer(server)
                    Task { await model.login(email: email, password: password) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.busy || email.isEmpty || password.isEmpty)
                .padding()
            }
            .onAppear { server = model.baseURL }
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
