# iOS Shortcut — SMS Auto-Tracking Setup

This guide walks you through creating an iOS Shortcut automation that automatically forwards bank SMS messages to WealthWise, which uses Gemini AI to extract the transaction details and log them as expenses.

---

## Prerequisites

1. **Generate your API key** — Go to the WealthWise dashboard → click **SMS Setup** → click **Generate API Key**. Copy the key.
2. **Copy your User ID** — Shown in the same SMS Setup panel.
3. **Note the endpoint URL:**
   ```
   https://parsesms-ig3bn6r6ta-uc.a.run.app
   ```

---

## Step 1: Create the Shortcut

1. Open the **Shortcuts** app on your iPhone.
2. Tap the **Automation** tab at the bottom.
3. Tap **+ New Automation**.
4. Select **Message**.
5. Configure the trigger:
   - **Message Contains:** enter your bank's sender name (e.g. `bank muscat`, or whatever name appears in your bank SMS).
   - Set **When I Receive** to be selected.
   - Set **Run Immediately** (not "Ask Before Running") so it works automatically in the background.

## Step 2: Build the Actions

Add the following actions in order:

### Action 1: Get Contents of URL

1. Tap **New Blank Automation** or **Add Action**.
2. Search for **Get Contents of URL** and add it.
3. Configure it:

   | Field | Value |
   |-------|-------|
   | **URL** | `https://parsesms-ig3bn6r6ta-uc.a.run.app` |
   | **Method** | `POST` |
   | **Request Body** | `JSON` |

4. Add three JSON fields by tapping **Add new field** → **Text** for each:

   | Key | Value |
   |-----|-------|
   | `sms` | Tap the value field → select **Shortcut Input** (this is the message body) |
   | `apiKey` | Paste your API key from the dashboard |
   | `userId` | Paste your User ID from the dashboard |

That's it — just one action is needed.

## Step 3: Final Settings

1. At the top of the automation, make sure it says **Run Immediately** (no confirmation prompt).
2. Tap **Done** to save.

---

## How It Works

```
Bank sends SMS → iOS Automation triggers → Shortcut POSTs to endpoint
    → Cloud Function validates API key
    → Gemini AI extracts: amount, currency, merchant, date
    → Expense entry is created in Firestore
    → Shows up on your dashboard
```

The AI handles any SMS format — you don't need to worry about the exact wording your bank uses.

---

## Example

**SMS received:**
> Dear Customer, Your debit card ending with XX0770 has been used at MACRO EXPRESS AL MAWALEH for OMR 1.050 on 14-04-2026. Your Available Balance is OMR 38.408

**What gets extracted:**
| Field | Value |
|-------|-------|
| Amount | `1.050` |
| Currency | `OMR` |
| Merchant | `MACRO EXPRESS AL MAWALEH` |
| Date | `2026-04-14` |

**What gets created:**
- An expense entry of **OMR 1.050** under the matched expense (or "SMS Expenses" catch-all) with the note `MACRO EXPRESS AL MAWALEH (SMS)`.

---

## JSON Payload Reference

The shortcut sends this POST request:

```json
{
  "sms": "Dear Customer, Your debit card ending with XX0770 has been used at MACRO EXPRESS AL MAWALEH for OMR 1.050 on 14-04-2026...",
  "apiKey": "your-api-key-here",
  "userId": "your-user-id-here"
}
```

**Success response (200):**
```json
{
  "success": true,
  "parsed": {
    "amount": 1.05,
    "currency": "OMR",
    "merchant": "MACRO EXPRESS AL MAWALEH",
    "date": "2026-04-14T00:00:00.000Z",
    "raw": "..."
  },
  "entryId": "abc123",
  "expenseId": "def456",
  "message": "Added 1.05 OMR expense for MACRO EXPRESS AL MAWALEH"
}
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Automation doesn't trigger | Make sure **Message Contains** matches your bank's sender name exactly. Check that the automation is enabled. |
| 403 "Invalid API key" | Re-copy the API key and User ID from the dashboard SMS Setup panel. |
| 422 "Could not parse amount" | The SMS didn't contain a recognizable transaction. This is expected for non-transaction messages (e.g. OTP codes). |
| 500 "AI parsing failed" | Temporary Gemini API issue. The next SMS should work fine. |
| Expense shows under "SMS Expenses" instead of the right category | Create an expense in WealthWise with the merchant name (e.g. "MACRO EXPRESS AL MAWALEH") — future SMS from that merchant will match it automatically. |

---

## Tips

- **Merchant matching:** If you create an expense named "Lulu" in WealthWise, any SMS with merchant containing "Lulu" (e.g. "LULU HYPERMARKET") will automatically be filed under that expense.
- **Multiple banks:** You can create multiple automations with different "Message Contains" triggers for different banks — they all use the same endpoint, API key, and User ID.
- **Balance SMS:** Non-transaction messages (balance inquiries, OTP codes, etc.) will be rejected with a 422 since no amount is found — this is expected and harmless.
