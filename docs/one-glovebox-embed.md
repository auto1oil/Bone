# Putting the fleet program inside another app

One Glovebox's fleet program (trips, IFTA miles, fuel logging, receipts,
maintenance, registrations, repairs, documents) can run **inside another
company's app**, so drivers use one app instead of two. The host app shows
One Glovebox in a frame. There is one copy of the fleet code, so every fix
and new feature reaches every company at once.

Bone's side of this: the **Fleet** tab (`app/fleet/page.tsx`) frames the link
below; the fleet ID is set once on Tickets → Setup and read through
`/api/fleet/embed`. Brand is `Bone`, color is the brand red `8e1414`.

## 1. The link

```
https://oneglovebox.com/app?embed=1&fleet=FLEET_ID&brand=COMPANY%20NAME&color=HEX
```

| Part | What it does | Required |
|---|---|---|
| `embed=1` | Turns on embedded mode | Yes |
| `fleet=` | Locks the panel to this company's fleet and hides the fleet switcher. Find the ID in One Glovebox: **Settings → Admin → All users**, on the owner's row ("Fleet ID", tap to copy). | Recommended |
| `brand=` | Company name shown in place of "One Glovebox" (URL-encode spaces as `%20`) | Optional |
| `color=` | Accent color as a hex code without `#` (e.g. `c8102e`) | Optional |

Example for one company:

```
https://oneglovebox.com/app?embed=1&fleet=00000000-0000-0000-0000-000000000000&brand=Stallion%20Tank&color=c8102e
```

### What changes in embedded mode
- The session always stays in a fleet: no personal garage, no "create a fleet".
- With `fleet=`, drivers who aren't on that fleet see "You're not on
  COMPANY's fleet yet" with a button to join using an invite code.
- No ads, no "share One Glovebox", no "use offline" option.
- Billing and checkout are hidden. The fleet owner manages billing at
  oneglovebox.com in a regular browser.
- When the panel has loaded it sends the host page a message:
  `{ type: 'ogb:ready' }` (via `postMessage`), so the host can hide its spinner.

## 2. Web apps (React, Next.js, plain HTML)

Add a page or tab (for example "Fleet") that fills the screen with:

```html
<iframe
  src="https://oneglovebox.com/app?embed=1&fleet=FLEET_ID&brand=COMPANY&color=HEX"
  style="width:100%;height:100%;border:0;"
  allow="geolocation; camera; clipboard-write; web-share; fullscreen">
</iframe>
```

The `allow` list matters:
- `geolocation`: trip tracking (IFTA miles) needs the phone's location.
- `camera`: scanning receipts, documents and odometers.
- `clipboard-write` and `web-share`: copying and sharing links and PDFs.

Optional, to hide a loading spinner:

```js
window.addEventListener('message', (e) => {
  if (e.origin === 'https://oneglovebox.com' && e.data && e.data.type === 'ogb:ready') hideSpinner();
});
```

## 3. iPhone apps (Swift / WKWebView)

Load the link in a `WKWebView` that fills a tab or screen. The web view must:

1. **Allow JavaScript pop-ups.** The fleet program uses `alert`, `confirm`
   and `prompt` (for example "Delete this?" and "Enter the invite code").
   A `WKWebView` ignores them unless the app implements the three
   `WKUIDelegate` methods: `runJavaScriptAlertPanelWithMessage`,
   `runJavaScriptConfirmPanelWithMessage` and
   `runJavaScriptTextInputPanelWithPrompt`. Show a `UIAlertController` in each.
2. **Have location and camera permission text** in `Info.plist`:
   `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription` and
   `NSPhotoLibraryUsageDescription`.
3. **Keep website data** (the default `WKWebsiteDataStore.default()`), so
   drivers stay signed in between launches.
4. **Open links in Safari** when they leave oneglovebox.com (Stripe, a
   shared PDF): implement `decidePolicyFor navigationAction` and hand
   other hosts to `UIApplication.shared.open`.

React Native: `react-native-webview` with `geolocationEnabled`,
`javaScriptCanOpenWindowsAutomatically`, and the same `Info.plist` keys.

## 4. Android apps (Kotlin / WebView)

```kotlin
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true      // keeps drivers signed in
webView.settings.setGeolocationEnabled(true)
webView.webChromeClient = object : WebChromeClient() {
    override fun onGeolocationPermissionsShowPrompt(origin: String, cb: GeolocationPermissions.Callback) {
        cb.invoke(origin, true, false)
    }
    // Also override onShowFileChooser so photo / PDF pickers open.
}
webView.loadUrl("https://oneglovebox.com/app?embed=1&fleet=FLEET_ID&brand=COMPANY&color=HEX")
```

Add `ACCESS_FINE_LOCATION`, `CAMERA` and `INTERNET` to the manifest.

## 5. Signing in

Drivers sign in to the fleet panel once with their One Glovebox account (the
one their fleet invite went to), and stay signed in. A later step can pass
the host app's sign-in through so drivers never see a second login screen.

## 6. Known limits
- **Push notifications** can't be delivered to a page inside another app.
  Reminder emails still go out.
- **Trip tracking** works the same way it does in the One Glovebox web
  app; it needs the location permission above.
- **Safari on iPhone** may clear sign-ins for embedded pages that haven't
  been used for a while, so a driver may occasionally need to sign in again.
