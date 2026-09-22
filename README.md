# Mesh Rider NMS feedback page

A public page showing what the team has said about the alpha, and a Feedback button that writes straight into the existing Google Sheet - the same sheet the product's own Feedback button uses.

Nothing new to run or maintain. The sheet is still the store.

---

## What is here

```
index.html          the page
api/feedback.js     a small relay that talks to the Google Sheet
vercel.json         tells Vercel to serve index.html at /
```

## Why a relay rather than calling the sheet directly

The Google Apps Script behind the sheet is deployed with **"Who has access: Anyone"**.
That means its `/exec` address is the only thing standing between your sheet and anyone who feels like filling it with rubbish.

If the page called the sheet directly, that address would be in the page source for every visitor to read.

So it is not. It lives in a Vercel setting, on the server, and the page only ever talks to its own address.

The relay also takes only the fields the sheet has columns for and caps their length, so a malformed or hostile submission cannot reach the Apps Script with anything it was not written for.

---

## Deploying it (about five minutes, once)

You need a Vercel account. The free tier covers this comfortably.

1. **Install the Vercel command-line tool and sign in**

   ```
   npm i -g vercel
   vercel login
   ```

2. **Deploy, from this folder**

   ```
   cd data/feedback-page
   vercel
   ```

   Accept the defaults. It will give you a preview address.

3. **Give it the sheet's address**

   ```
   vercel env add FEEDBACK_WEBHOOK_URL production
   ```

   Paste the same `/exec` URL the product uses for `FEEDBACK_WEBHOOK_URL`.
   It is stored by Vercel and never appears in the page.

4. **Publish it**

   ```
   vercel --prod
   ```

   That address is the one to share.

### Or without the command line

Push this folder to a GitHub repository, then on vercel.com choose **Add New, Project**, pick the repository, and add `FEEDBACK_WEBHOOK_URL` under **Settings, Environment Variables** before the first deploy.

---

## Checking it worked

Open the address. You should see the team's feedback, then **Feedback inbox** filling with what is already in the sheet.

If the inbox says it cannot reach the store, the environment variable is missing or wrong. Set it and redeploy.

---

## What people can do on it

- **Read** everything the team has said, with where each item stands
- **Add feedback** from the button, bottom right - it appears as a new row in the sheet, and emails whoever the Apps Script notifies
- **Reply** to anything already in the sheet - replies are kept in that row's `Replies` column, as a thread
- **Change a status** - written back to the row's `Status` column

Everything anyone does on the page ends up in the sheet. There is no second copy of the data anywhere.

---

## Things worth knowing before you share the link

**The page is public.** Anyone with the address can read it, including people outside Doodle Labs. It names Mathew, Cory and Kenny, carries their criticism of the product, and lists our own open defects. That was a deliberate choice; it is worth re-reading the page once with that in mind before circulating the link.

**Anyone who can open it can also post.** There is no sign-in. That is the trade for a link anyone can use. If the page ever attracts nuisance submissions, the answer is to put it behind Vercel's password protection or an access rule, not to change the page.

**Names are typed, not verified.** Someone can put any name in the box. Fine for a team page; do not treat it as attribution that would survive a dispute.

---

## The sheet's contract

Documented in the product repository at `docs/runbooks/Feedback_Webhook_and_Responses.md`. In short:

| | |
| --- | --- |
| `GET` | returns `{feedback: [...]}`, newest first |
| `POST` a submission | `{screen, type, priority, comment, name, email, role}` |
| `POST` a reply | `{action: "reply", id, text, by, status?}` |

Columns: `ID, Received, Screen, Type, Priority, Comment, Name, Email, Role, Status, Replies`.

If the Apps Script is ever redeployed, keep the same `/exec` address (Deploy, Manage deployments, Edit, New version) or this page and the product both stop reaching it.
