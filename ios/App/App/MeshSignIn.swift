import AuthenticationServices
import Capacitor
import CryptoKit
import UIKit

/// The app's own view controller: Capacitor's, plus Mesh's native plugins.
class MeshViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MeshSignInPlugin())
    }
}

/// Google and Apple sign-in for the app (src/lib/native.js). Google won't sign
/// anyone in inside an app's web view, so its page opens in iOS's sign-in
/// sheet, and Apple's is the native one. Each hands back an ID token, and the
/// web app signs in to Firebase with it. Nothing here is kept.
@objc(MeshSignInPlugin)
public class MeshSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MeshSignInPlugin"
    public let jsName = "MeshSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "google", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "apple", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?
    private var appleCall: CAPPluginCall?
    private var appleNonce = ""

    // MARK: Google, by OAuth with PKCE (the way Google asks native apps to)

    @objc func google(_ call: CAPPluginCall) {
        let suffix = ".apps.googleusercontent.com"
        guard let clientId = call.getString("clientId"), clientId.hasSuffix(suffix) else {
            call.reject("Google sign-in isn't set up in this app", "unavailable")
            return
        }
        // Google's address back to an iOS app is its client ID, reversed.
        let scheme = "com.googleusercontent.apps." + clientId.dropLast(suffix.count)
        let redirect = scheme + ":/oauth2redirect"
        let verifier = randomString(64)
        let state = randomString(24)
        var page = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        page.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: base64url(Data(SHA256.hash(data: Data(verifier.utf8))))),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        DispatchQueue.main.async {
            // Holding self until it finishes is fine: the plugin lasts as long as the app.
            let session = ASWebAuthenticationSession(url: page.url!, callbackURLScheme: scheme) { url, error in
                self.session = nil
                if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                    call.reject("Cancelled", "cancelled")
                    return
                }
                let items = url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems } ?? []
                let value = { (name: String) in items.first(where: { $0.name == name })?.value }
                if value("error") == "access_denied" {
                    call.reject("Cancelled", "cancelled")
                    return
                }
                guard value("state") == state, let code = value("code") else {
                    call.reject("Google didn't sign you in", "failed")
                    return
                }
                self.redeem(code: code, clientId: clientId, redirect: redirect, verifier: verifier, call: call)
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Couldn't open Google sign-in", "failed")
            }
        }
    }

    /// Swaps the one-time code for Google's ID token.
    private func redeem(code: String, clientId: String, redirect: String, verifier: String, call: CAPPluginCall) {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let form = [
            "code": code,
            "client_id": clientId,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        ]
        request.httpBody = form.map { "\($0.key)=\(formEncode($0.value))" }.joined(separator: "&").data(using: .utf8)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let idToken = json["id_token"] as? String else {
                call.reject("Google didn't sign you in", "failed")
                return
            }
            call.resolve(["idToken": idToken])
        }.resume()
    }

    // MARK: Apple

    @objc func apple(_ call: CAPPluginCall) {
        // Firebase checks the token was made for this sign-in: Apple gets the
        // nonce's hash, Firebase the nonce itself.
        let nonce = randomString(32)
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
        DispatchQueue.main.async {
            self.appleCall?.reject("Cancelled", "cancelled")
            self.appleCall = call
            self.appleNonce = nonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    // MARK: Helpers

    private func randomString(_ length: Int) -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return String(bytes.map { chars[Int($0) % chars.count] })
    }

    private func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func formEncode(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private var anchor: ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

extension MeshSignInPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor }
}

extension MeshSignInPlugin: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        appleCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }) else {
            call.reject("Apple didn't sign you in", "failed")
            return
        }
        call.resolve(["idToken": token, "rawNonce": appleNonce])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        appleCall = nil
        if (error as? ASAuthorizationError)?.code == .canceled {
            call.reject("Cancelled", "cancelled")
        } else {
            call.reject("Apple didn't sign you in", "failed")
        }
    }
}
