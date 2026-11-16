# Flashcard Quiz — Progressive Web App

A responsive flashcard study app for high school students, built with **HTML, CSS, and vanilla JavaScript**. It works as a static website and can be deployed to GitHub Pages or Netlify.

## Features

- Create, edit, duplicate, search, sort, and delete decks and flashcards.
- Add several flashcards in one editing session.
- Study using flip-style cards and rate each card as **Got It** or **Need More Practice**.
- Multiple-choice quizzes and written-recall quizzes with self-assessment.
- Review missed questions, track card status, and view quiz history.
- Save decks, progress, and history locally in the browser.
- Export and import JSON backups.
- PWA manifest, install guidance, application icons, service worker, and offline app-shell caching.
- Responsive layouts for desktop, tablet, and mobile.

## Project files

```text
Flashcard-Quiz/
├── index.html
├── style.css
├── script.js
├── manifest.webmanifest
├── service-worker.js
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-512-maskable.png
└── README.md
```

## Run locally in Visual Studio Code

1. Extract the project ZIP.
2. Open Visual Studio Code.
3. Select **File → Open Folder** and choose the `Flashcard-Quiz` folder.
4. Install the **Live Server** extension if it is not already installed.
5. Right-click `index.html` and choose **Open with Live Server**.
6. The app should open at a localhost address, usually similar to `http://127.0.0.1:5500`.
7. Try creating a deck, adding flashcards, studying, completing a quiz, and refreshing the page to confirm your data remains available.

Do not use `file://` by double-clicking `index.html` to test PWA features. Service workers require HTTPS or localhost.

## Local data and backup

The app uses browser **LocalStorage**. Data is saved in the browser profile on the current device. It does **not** synchronize across different browsers or devices, and there are no student accounts or cloud database.

To back up your work:

1. Open **Settings** in Flashcard Quiz.
2. Choose **Export JSON** and save the backup file somewhere safe.
3. On the device where you want to restore your work, open Flashcard Quiz.
4. Go to **Settings → Import JSON**, select the backup, and confirm the replacement.

Import replaces the current local study data. Export the current data first if you need to keep it.

## Deploy to GitHub Pages

1. Create a new repository on GitHub.
2. Upload the contents of this project folder. Make sure `index.html` is at the published root of the repository (not hidden inside an extra nested folder).
3. Commit the files.
4. Open the repository's **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select the branch (usually `main`) and folder (`/(root)`), then save.
7. Wait for GitHub Pages to publish the site and open the HTTPS URL shown in the Pages settings.

The PWA service worker and installation support work on HTTPS. For a project published in a repository subpath, the relative paths in this project are designed to work from that subpath.

## Deploy to Netlify

### Drag-and-drop deployment

1. Sign in to Netlify and choose **Add new site → Deploy manually** (the exact menu label may vary).
2. Drag the complete `Flashcard-Quiz` folder, or the extracted folder contents, into the deployment area.
3. No build command is needed. Set the publish directory to the folder containing `index.html` if Netlify asks.
4. Open the HTTPS URL Netlify provides.

### Connect GitHub

1. Push the complete project to a GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project**.
3. Select the repository.
4. Leave the **Build command** blank.
5. Set the **Publish directory** to `.` (the repository root where `index.html` lives).
6. Deploy the site. Later commits can trigger new deployments automatically.

## Install the PWA

The app is a **Progressive Web App**, not an APK and not a separate `.exe` installer. Install it from its deployed HTTPS website in a supported browser.

- **Android:** Open the site in Chrome. Use the in-app Install button when available, or open Chrome's menu and choose **Install app** / **Add to Home screen**.
- **iPhone and iPad:** Open the site in Safari, tap **Share**, choose **Add to Home Screen**, enable **Open as Web App** if offered, then tap **Add**.
- **Windows / desktop:** Open the HTTPS site in a supported browser such as Chrome or Edge. Use the browser's Install control or menu item.

Browser support and the wording of install controls can vary. When an automatic prompt is unavailable, the app displays manual instructions. The app does not claim it has installed unless the browser reports an installation event or standalone display mode is detected.

## Offline behavior

After the service worker has installed and cached the app shell while online, the main app files can load offline. The student's records remain in LocalStorage on that browser and device. Offline access is not cloud sync; a browser's site-data clearing, private browsing, or storage cleanup may remove local records. Keep JSON backups.

When updating the app, deploy the changed files and increment `CACHE_VERSION` in `service-worker.js` (for example, change `flashcard-quiz-v1.0.0` to `flashcard-quiz-v1.0.1`). The next service worker update replaces the old application cache. LocalStorage data is kept separate from the service worker cache and is not deleted by app updates.

## Technology and limitations

- HTML5, CSS3, vanilla JavaScript.
- LocalStorage for browser-local persistence.
- Web App Manifest and Service Worker for PWA behavior.
- No login, backend, database server, account system, cross-device synchronization, or automatic sharing.
- A future cloud backend would be needed for synchronized student accounts or shared decks.

## Verification checklist

- Run JavaScript syntax checks with `node --check script.js` and `node --check service-worker.js`.
- Serve the folder using Live Server or another local HTTP server.
- Check deck and card create/edit/delete, study ratings, both quiz modes, quiz history, import/export, and refresh persistence.
- Use browser DevTools → Application to inspect the manifest, service worker, and Cache Storage.
- Test offline mode after the service worker has completed its first installation while online.
- Use Lighthouse in Chrome DevTools for an additional PWA audit. Physical Android/iOS installation must be tested on the actual device and deployed HTTPS site.
