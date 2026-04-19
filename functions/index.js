import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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
                // ── Find or create a matching expense ──
                const expensesRef = db.collection(`users/${userId}/expenses`);
                let smsExpenseId;

                // Try to match merchant to existing expense name (case-insensitive)
                if (parsed.merchant) {
                    const allExpenses = await expensesRef.get();
                    const match = allExpenses.docs.find((d) => {
                        const name = (d.data().name || "").toLowerCase();
                        const merchant = parsed.merchant.toLowerCase();
                        return name === merchant || merchant.includes(name) || name.includes(merchant);
                    });
                    if (match) smsExpenseId = match.id;
                }

                // Fallback: create a new expense per merchant, or generic "SMS Expenses"
                if (!smsExpenseId) {
                    const expenseName = parsed.merchant || "SMS Expenses";
                    const existing = await expensesRef.where("name", "==", expenseName).limit(1).get();
                    if (!existing.empty) {
                        smsExpenseId = existing.docs[0].id;
                    } else {
                        const newExp = await expensesRef.add({
                            kind: "one-time",
                            name: expenseName,
                            amount: 0,
                            frequency: "one-time",
                            category: "Other",
                            isUnexpected: false,
                            weeklyBudget: null,
                            dueDay: null,
                            dueDate: null,
                            estimatedTotal: null,
                            deadline: null,
                            notes: parsed.merchant ? "Auto-created from SMS" : "Auto-created for SMS-parsed expenses",
                            createdAt: Timestamp.now(),
                        });
                        smsExpenseId = newExp.id;
                    }
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

                res.status(200).json({
                    success: true,
                    parsed,
                    entryId: entryRef.id,
                    expenseId: smsExpenseId,
                    message: `Added ${parsed.amount} ${parsed.currency || "OMR"} expense${parsed.merchant ? ` for ${parsed.merchant}` : ""}`,
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
