/**
 * migrate-all-to-gvbill.js
 * --------------------------------------
 * ONE-TIME script — run from the backend folder:
 *   node scripts/migrate-all-to-gvbill.js
 *
 * What it does:
 * Finds EVERY booking where payment.advance.paid === true, and gives it
 * a proper sequential GVBILL#### invoice number — covers BOTH cases:
 *
 *   1. Bookings that never got an invoiceNumber at all (very old ones,
 *      from before this feature existed)
 *   2. Bookings that already have an OLD-FORMAT number (e.g. "W52418",
 *      "A00686" from the earlier random generator)
 *
 * Bookings that already have a proper GVBILL#### number are left alone.
 *
 * Numbers are assigned in order of bookingDate (oldest first), continuing
 * from whatever the highest existing GVBILL number already is — so it
 * never collides with numbers already in use.
 *
 * Safe to run more than once.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import tourBookingModel from "../models/tourBookingmodel.js"; // adjust path if needed

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);

    console.log("Connected. Finding advance-paid bookings needing a GVBILL number...");

    const bookingsToFix = await tourBookingModel
      .find({
        "payment.advance.paid": true,
        invoiceNumber: { $not: /^GVBILL\d{4}$/ }, // missing, null, empty, or old-format
      })
      .sort({ bookingDate: 1 }); // oldest first, keeps numbering chronological

    console.log(`Found ${bookingsToFix.length} booking(s) to fix.`);

    // Continue counting up from the highest GVBILL number already in use.
    const lastGvbill = await tourBookingModel
      .findOne({ invoiceNumber: /^GVBILL\d{4}$/ })
      .sort({ invoiceNumber: -1 })
      .select("invoiceNumber");

    let nextNum = 1;
    if (lastGvbill?.invoiceNumber) {
      const num = parseInt(lastGvbill.invoiceNumber.replace("GVBILL", ""), 10);
      if (!isNaN(num)) nextNum = num + 1;
    }

    let updated = 0;

    for (const booking of bookingsToFix) {
      const newNumber = `GVBILL${String(nextNum).padStart(4, "0")}`;

      await tourBookingModel.updateOne(
        { _id: booking._id },
        { $set: { invoiceNumber: newNumber } },
      );

      console.log(
        `  ✓ ${booking.tnr || booking._id} : ${booking.invoiceNumber || "(none)"} → ${newNumber}`,
      );

      nextNum++;
      updated++;
    }

    console.log(`\nDone. ${updated} booking(s) updated.`);
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
