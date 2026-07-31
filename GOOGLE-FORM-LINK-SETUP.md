# Connect the Academy Google Form — Version 1.6.4

1. Create the form using `GOOGLE-FORM-TEMPLATE.md`.
2. In Google Forms, open **Responses** and click **Link to Sheets**. This creates the Google Sheets lead register.
3. Click **Send** → **Link** and copy the published form URL. It normally begins with `https://forms.gle/` or `https://docs.google.com/forms/`.
4. Open `script.js` and find:

```javascript
const GOOGLE_FORM_URL='';
```

5. Paste the URL between the quotation marks, for example:

```javascript
const GOOGLE_FORM_URL='https://forms.gle/YourFormLink';
```

6. Save `script.js`, upload it to GitHub, and wait for Cloudflare Pages to deploy.

All buttons labelled **Complete Enquiry Form**, **Start Your Journey**, **Request Consultation**, and related enquiry links will then open the Google Form. Responses will be stored in the linked Google Sheet.
