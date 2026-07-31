# Connect Your Google Form to Version 1.6.3

The website is complete, but it cannot know your Google Form address until you create the form.

## Step 1 — Create the form

1. Open Google Forms and choose **Blank form**.
2. Title it **Quantum YiJing Academy Enquiry Form**.
3. Add the questions listed in `GOOGLE-FORM-TEMPLATE.md`.
4. In the **Responses** tab, click the green Google Sheets icon to create your lead database.

## Step 2 — Copy the public form link

1. Click **Send** in Google Forms.
2. Select the link icon.
3. Copy the link. It will look similar to:

```text
https://forms.gle/AbCdEf123456
```

## Step 3 — Put the link into the website

Open `script.js` and find:

```javascript
const GOOGLE\_FORM\_URL='';
```

Paste your link between the quotation marks:

```javascript
const GOOGLE\_FORM\_URL='https://forms.gle/AbCdEf123456';
```

Save the file and upload it to GitHub. All enquiry buttons will then open the same form.

Until a link is added, the buttons continue to open an email enquiry, so the website will not break.

