import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

initializeApp();
const db = getFirestore();
const ai = new GoogleGenAI({ vertexai: true, project: "soushians-4d02a", location: "us-central1" });

// ── SMS Parser (Gemini AI) ────────────────────────────────────
async function parseSMS(text) {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Extract transaction details from this bank SMS message.
Return a JSON object with exactly these fields:
- "amount": number (the transaction amount, e.g. 1.050)
- "currency": string (e.g. "OMR", "USD", "AED". Use "OMR" if "RO" is mentioned)
- "merchant": string or null (the merchant/store name only, without "POS -" prefix)
- "date": string in "YYYY-MM-DD" format, or null if not found. Today is ${today}.
- "cardLast4": string or null (the last 4 digits of the card/account used, e.g. "7592")

SMS: "${text}"`;

    const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
    });
    const responseText = result.text;
    const parsed = JSON.parse(responseText);

    let parsedDate = null;
    if (parsed.date) {
        const d = new Date(parsed.date);
        if (!isNaN(d.getTime())) parsedDate = d;
    }

    return {
        amount: typeof parsed.amount === "number" ? parsed.amount : null,
        currency: parsed.currency || "OMR",
        merchant: parsed.merchant || null,
        cardLast4: parsed.cardLast4 || null,
        date: parsedDate,
        raw: text,
    };
}

// ── Cloud Function: POST /parseSms ────────────────────────────
export const parseSms = onRequest(
    { cors: true, region: "us-central1" },
    async (req, res) => {
        try {
            // Only POST
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }

            console.log("parseSms called, content-type:", req.headers["content-type"], "body type:", typeof req.body);

            const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
            const { sms, apiKey, userId } = body;

            if (!sms || !apiKey) {
                res.status(400).json({ error: "Missing sms or apiKey" });
                return;
            }

            // ── Validate API key ──
            // Stored in Firestore: users/{userId}/settings/smsApiKey
            if (!userId) {
                res.status(400).json({ error: "Missing userId" });
                return;
            }

            let keyDoc;
            try {
                keyDoc = await db.doc(`users/${userId}/settings/smsApiKey`).get();
            } catch (err) {
                console.error("Firestore API key lookup failed:", err);
                res.status(500).json({ error: "Failed to validate API key", detail: err.message });
                return;
            }
            if (!keyDoc.exists || keyDoc.data().key !== apiKey) {
                res.status(403).json({ error: "Invalid API key" });
                return;
            }

            // ── Parse SMS with Gemini ──
            let parsed;
            try {
                parsed = await parseSMS(sms);
            } catch (err) {
                res.status(500).json({ error: "AI parsing failed", detail: err.message });
                return;
            }
            if (!parsed.amount || parsed.amount <= 0) {
                res.status(422).json({ error: "Could not parse amount from SMS", parsed });
                return;
            }

            const entryDate = parsed.date || new Date();

            try {
                // ── Find or create the single "SMS Expenses" expense ──
                const expensesRef = db.collection(`users/${userId}/expenses`);
                let smsExpenseId;

                const existing = await expensesRef.where("name", "==", "SMS Expenses").limit(1).get();
                if (!existing.empty) {
                    smsExpenseId = existing.docs[0].id;
                } else {
                    const newExp = await expensesRef.add({
                        kind: "one-time",
                        name: "SMS Expenses",
                        amount: 0,
                        frequency: "one-time",
                        category: "Other",
                        isUnexpected: false,
                        weeklyBudget: null,
                        dueDay: null,
                        dueDate: null,
                        estimatedTotal: null,
                        deadline: null,
                        notes: "Auto-created for SMS-parsed expenses",
                        createdAt: Timestamp.now(),
                    });
                    smsExpenseId = newExp.id;
                }

                // ── Write expense entry ──
                const entryRef = await db.collection(`users/${userId}/expenseEntries`).add({
                    expenseId: smsExpenseId,
                    amount: parsed.amount,
                    date: Timestamp.fromDate(entryDate),
                    notes: parsed.merchant
                        ? `${parsed.merchant} (SMS)`
                        : `SMS: ${sms.substring(0, 80)}`,
                    type: "purchase",
                    createdAt: Timestamp.now(),
                });

                // ── Deduct from linked bank account ──
                let transactionId = null;
                const smsSettings = keyDoc.data();
                let deductAccountId = smsSettings.accountId || null;

                // If SMS contains a card number, find the matching account
                if (parsed.cardLast4) {
                    const accountsSnap = await db.collection(`users/${userId}/accounts`).get();
                    for (const accDoc of accountsSnap.docs) {
                        const acc = accDoc.data();
                        if (acc.cards && Array.isArray(acc.cards) && acc.cards.includes(parsed.cardLast4)) {
                            deductAccountId = accDoc.id;
                            break;
                        }
                    }
                }

                if (deductAccountId) {
                    const txnRef = await db.collection(`users/${userId}/transactions`).add({
                        accountId: deductAccountId,
                        amount: -parsed.amount,
                        bucket: "deposit",
                        date: Timestamp.fromDate(entryDate),
                        notes: parsed.merchant
                            ? `SMS: ${parsed.merchant}`
                            : `SMS expense`,
                        createdAt: Timestamp.now(),
                    });
                    transactionId = txnRef.id;
                }

                res.status(200).json({
                    success: true,
                    parsed,
                    entryId: entryRef.id,
                    expenseId: smsExpenseId,
                    transactionId,
                    message: `Added ${parsed.amount} ${parsed.currency || "OMR"} expense${parsed.merchant ? ` for ${parsed.merchant}` : ""}${transactionId ? " (deducted from account)" : ""}`,
                });

            } catch (err) {
                console.error("Firestore write error in parseSms:", err);
                res.status(500).json({ error: "Firestore write failed", detail: err.message });
            }

        } catch (err) {
            console.error("Unhandled error in parseSms:", err);
            res.status(500).json({ error: "Internal server error", detail: err.message });
        }
    }
);

// ── Scheduled: Auto-Record Weekly Income ──────────────────────
// Runs every Saturday at 00:05 Oman time (after the Sat–Fri week ends).
// For each user with depositAccountId set, creates missing deposit
// transactions for all completed weeks since startDate.
export const autoRecordIncome = onSchedule(
    {
        schedule: "5 0 * * 6", // Saturday 00:05
        timeZone: "Asia/Muscat",
        region: "us-central1",
    },
    async () => {
        const usersSnap = await db.collection("users").listDocuments();

        for (const userRef of usersSnap) {
            const incomeDoc = await db.doc(`users/${userRef.id}/settings/income`).get();
            if (!incomeDoc.exists) continue;
            const income = incomeDoc.data();
            if (!income.depositAccountId || !income.startDate || !income.weeklyAmount) continue;

            const startDate = new Date(income.startDate);
            const now = new Date();
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;
            const totalWeeks = Math.floor((now.getTime() - startDate.getTime()) / msPerWeek);
            if (totalWeeks <= 0) continue;

            // Get existing auto-deposits to avoid duplicates
            const autoSnap = await db
                .collection(`users/${userRef.id}/transactions`)
                .where("notes", ">=", "Auto: Weekly income #")
                .where("notes", "<=", "Auto: Weekly income #\uf8ff")
                .get();

            const existingWeeks = new Set();
            autoSnap.docs.forEach((d) => {
                const match = d.data().notes?.match(/Auto: Weekly income #(\d+)/);
                if (match) existingWeeks.add(parseInt(match[1]));
            });

            // Create missing deposits
            const batch = db.batch();
            let count = 0;
            for (let w = 1; w <= totalWeeks; w++) {
                if (existingWeeks.has(w)) continue;
                // Deposit date = last day of the week (startDate + w*7 - 1 day)
                const depositDate = new Date(startDate.getTime() + w * msPerWeek);
                depositDate.setDate(depositDate.getDate() - 1);
                depositDate.setHours(23, 0, 0, 0);

                const ref = db.collection(`users/${userRef.id}/transactions`).doc();
                batch.set(ref, {
                    accountId: income.depositAccountId,
                    amount: income.weeklyAmount,
                    bucket: "deposit",
                    date: Timestamp.fromDate(depositDate),
                    notes: `Auto: Weekly income #${w}`,
                    createdAt: FieldValue.serverTimestamp(),
                });
                count++;
                // Firestore batches limited to 500 writes
                if (count >= 450) break;
            }

            if (count > 0) {
                await batch.commit();
                console.log(`autoRecordIncome: Created ${count} deposits for user ${userRef.id}`);
            }
        }
    }
);
