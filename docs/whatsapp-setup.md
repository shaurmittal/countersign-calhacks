# WhatsApp setup (P2)

Countersign takes payment requests over WhatsApp through Meta's WhatsApp Cloud API. A message
opens a case like any other channel, and the reply goes back on WhatsApp. Nothing on this path can
approve a request or move money. A message from a vendor's own number proves nothing either:
R2 and R3 still call the number on file.

`<SITE>` below means the Convex HTTP URL, `https://<deployment>.convex.site`.

**Status:** tested in memory only (`shared/whatsapp.test.ts`, `convex/channels/whatsapp.test.ts`).
Nothing has talked to a real Meta app yet.

## Convex env vars

| Env var | Where it comes from |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Meta app → WhatsApp → **API Setup** → **Generate access token**. This temporary token expires after about 24 hours. |
| `WHATSAPP_PHONE_NUMBER_ID` | **API Setup**: the **Phone number ID** shown with the test number. It is an id, not the phone number. |
| `WHATSAPP_APP_SECRET` | **App settings → Basic → App secret** (click Show). It checks `X-Hub-Signature-256`. |
| `WHATSAPP_VERIFY_TOKEN` | Any random string. Paste the same string into Meta's webhook settings below. |
| `WHATSAPP_GRAPH_VERSION` | Optional. Defaults to `v26.0`, the newest Graph API version on 2026-10-24. |

Set them on the deployment the webhook points at. The values never go in the repo.

```bash
npx convex env set WHATSAPP_ACCESS_TOKEN EAA...
npx convex env set WHATSAPP_PHONE_NUMBER_ID 1234567890
npx convex env set WHATSAPP_APP_SECRET <app secret>
npx convex env set WHATSAPP_VERIFY_TOKEN "$(openssl rand -hex 24)"
npx convex env get WHATSAPP_VERIFY_TOKEN     # paste this into Meta's "Verify token" field
```

## Meta app

1. Create the app at developers.facebook.com with the WhatsApp product. Meta gives it a free test number.
2. **API Setup:** under **To**, add the phones that will message the test number. Each one
   confirms with a code that Meta sends it. The test number reaches at most **5** registered recipients.
3. **Configuration** (WhatsApp → Configuration, or Use cases → Customize → Configuration for apps on
   the "Connect with customers through WhatsApp" use case): under **Webhook**, click Edit and enter
   - Callback URL: `<SITE>/whatsapp/webhook`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`

   Then click **Verify and save**. Meta calls `GET <SITE>/whatsapp/webhook`, which echoes
   `hub.challenge` only if the token matches. So that deployment must already run this code and
   have `WHATSAPP_VERIFY_TOKEN` set.
4. Under **Webhook fields**, subscribe to `messages`.
5. Test: click **Test** next to `messages`. Meta posts a sample message, which should open a
   WhatsApp case in the War Room. Its reply fails, because the sample sender isn't a registered
   recipient. Then send a WhatsApp message from a registered phone to the test number.

## How it behaves

- `POST <SITE>/whatsapp/webhook` checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body, keyed
  with the app secret) before reading anything. A bad or missing signature gets 401. Once the
  signature is valid the answer is always 200, because Meta retries anything else for up to 7 days.
- A text message opens a case with `channel: "whatsapp"`. Its `fromAddress` is the sender in E.164
  (`+16505551234`), so P3 matches it against `phoneOnFile`. Its `externalId` is `wa:<message id>`,
  so a repeat delivery doesn't open a second case.
- Past 10 messages a minute from one sender: no case, and a "slow down" reply.
- Images, documents, voice notes and other non-text messages: no case, and a reply asking for text
  (spec §8.1). Reactions, system notices and delivery or read receipts are ignored.
- The decision's `replyText` goes back through the Graph API (`channels/reply.ts`). A failed send
  is logged without the token and doesn't affect the case.
- A sender who uses a WhatsApp username can arrive without a phone number. Their `fromAddress` is
  then their business-scoped user id (like `US.13491208655302741918`), which never matches a phone
  on file. Replies to them go in the `recipient` field.

## Limits and troubleshooting

Errors from Meta show in `npx convex logs` as `[whatsapp] reply to …1234 failed: HTTP <status> code=<code>`.

- **Code 131030:** the free test number only messages the phones registered under API Setup.
  The case itself still decides normally.
- **Code 190:** the temporary access token expired (about 24 hours). Generate a new one and set
  `WHATSAPP_ACCESS_TOKEN` again. A System User token lasts longer.
- **Code 131047:** WhatsApp allows free-form replies only within 24 hours of the person's last
  message, so a reply after that (an owner approval the next day, say) can't be delivered.
- **Verify and save fails:** the deployment doesn't run this code yet, `WHATSAPP_VERIFY_TOKEN` isn't
  set there, or the two tokens differ. The Convex log then says `webhook verification rejected`.
- **`webhook rejected: bad or missing X-Hub-Signature-256`:** `WHATSAPP_APP_SECRET` doesn't match
  the app's secret.
- **Nothing arrives:** check that `messages` is subscribed. Meta holds back some webhooks while an
  app is in Development mode; switch it to Live if messages still don't come through.
