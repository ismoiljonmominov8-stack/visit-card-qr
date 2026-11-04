# Visit Card QR

Create a phone-friendly digital visit card for each client, then print its QR code on their paper card.

- `admin/` is the private Card Studio. Only your business Google account can use it.
- `index.html` is the public card that opens after scanning. Visitors do not sign in.
- `apps-script/Code.gs` is the free 24/7 backend. It saves all cards in one Google Sheet.

Each QR code points to a short card ID, so you can change a client's details later without reprinting.

## Setup

Use one Google account for this business in all the steps below.

### 1. Publish the site

1. Create a **public** GitHub repository named `visit-card-qr` and upload this project.
2. Open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`.
4. Wait for the site address, for example `https://YOUR-NAME.github.io/visit-card-qr/`.

### 2. Create the Google client ID

1. Open <https://console.cloud.google.com/> and create a project.
2. Open **Google Auth Platform** and complete the basic app details. Choose **External**.
3. Under **Audience**, add your business Gmail as a test user, or publish the app.
4. Under **Clients**, create a **Web application** client.
5. Under **Authorized JavaScript origins**, add `https://YOUR-NAME.github.io`. Do not add `/visit-card-qr`.
6. Copy the client ID.

### 3. Create the backend

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script** and replace the sample code with `apps-script/Code.gs`.
3. At the top of the file, set `ADMIN_EMAIL` and `GOOGLE_CLIENT_ID`.
4. Save, choose the `setup` function, and click **Run**. Allow the requested permissions.
5. Click **Deploy > New deployment > Web app**.
6. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy it.
7. Copy the web app URL that ends in `/exec`.

### 4. Connect the site

Fill in `API_URL` and `GOOGLE_CLIENT_ID` in `config.js`, then commit and push the change.

Open `https://YOUR-NAME.github.io/visit-card-qr/admin/` and sign in.

## Before printing

1. Buy a domain and connect it in **Settings > Pages > Custom domain**.
2. Add the domain to **Authorized JavaScript origins**, for example `https://card.example.uz`.
3. Set `PUBLIC_BASE_URL` in `config.js` to that same address.
4. Print one test card at the real size, at least 2 × 2 cm. Scan it with iPhone and Android phones.
5. Test Telegram, Instagram, Call, and Save contact on those phones.

Use SVG for printing when your print shop accepts it. PNG is 2,000 px or larger.

Do not change the domain after printing unless the old domain stays online and redirects to the new one.

## Daily use

1. Open `/admin/` and sign in.
2. Fill in the card and press **Create QR code**.
3. Download the QR code for the card designer or print shop.
4. To change a card, open **Saved cards**, choose the client, and press **Edit this card**. The QR code stays the same.

Get each client's permission before publishing their phone number and photo. Anyone with the link can view the card.

To remove a card, delete its row from the `Cards` sheet. The public page can keep showing it for up to one hour because of the cache.

If you change `Code.gs`, open **Deploy > Manage deployments**, edit the deployment, and choose **New version**. This keeps the same `/exec` URL.

## Limits

Apps Script can take a few seconds to answer, especially when it has not been used recently. The first test will show the real speed.

## Credits

QR generation uses [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), stored in `assets/qrcode.js`.
