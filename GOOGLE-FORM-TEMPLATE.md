# Google Form Connection — Version 1.6.5

The Academy Google Form is now connected.

## Live form URL

`https://forms.gle/xctmqDnfrKSntuNR8`

The URL is configured in `script.js`:

```javascript
const GOOGLE_FORM_URL='https://forms.gle/xctmqDnfrKSntuNR8';
```

All links with the `google-form-link` class open the form in a new browser tab. The direct **Enquire About Courses** button is also connected to the same form.

Keep this file as a maintenance reference. If the Google Form URL changes later, replace the URL in `script.js` and any direct form link in `index.html`.

