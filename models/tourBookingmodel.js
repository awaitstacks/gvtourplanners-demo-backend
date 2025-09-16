import mongoose from "mongoose";

const tourBookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  tourId: { type: mongoose.Schema.Types.ObjectId, ref: "tour", required: true },

  userData: { type: Object, required: true },
  tourData: { type: Object, required: true },

  // 👤 Multiple travellers
  travellers: [
    {
      title: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      age: { type: Number, required: true },
      gender: {
        type: String,
        enum: ["Male", "Female", "Other"],
        required: true,
      },
      sharingType: {
        type: String,
        enum: ["double", "triple"],
        required: true,
      },

      // Add-on per traveller
      selectedAddon: {
        name: { type: String },
        price: { type: Number },
      },

      // Boarding Point per traveller
      boardingPoint: {
        stationCode: { type: String },
        stationName: { type: String },
      },

      // 👇 New fields for dynamic name list

      // ✅ Updated fields for dynamic name list
      trainSeats: [
        {
          trainName: { type: String },
          seatNo: { type: String },
        },
      ],
      flightSeats: [
        {
          flightName: { type: String },
          seatNo: { type: String },
        },
      ],

      staffRemarks: { type: String },
      // Remarks per traveller (optional)
      remarks: { type: String },

      // ⛔ Traveller-level cancel status (same shape as booking.cancelled)
      cancelled: {
        byAdmin: { type: Boolean, default: false },
        byTraveller: { type: Boolean, default: false },
        cancelledAt: { type: Date },
        releaseddAt: { type: Date }, // kept same key as booking-level
        reason: { type: String },
      },
    },
  ],

  // Billing address per booking
  billingAddress: {
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    country: { type: String, default: "India" },
  },

  contact: {
    email: {
      type: String,
      required: true,
      match: [/.+@.+\..+/, "Please enter a valid email address"],
    },
    mobile: {
      type: String,
      required: true,
      match: [/^[0-9]{10}$/, "Please enter a valid 10-digit mobile number"],
    },
  },

  bookingType: {
    type: String,
    enum: ["online", "offline"],
    required: true,
  },

  payment: {
    advance: {
      amount: { type: Number, required: true },
      paid: { type: Boolean, default: false },
      paymentVerified: { type: Boolean, default: false },
      paidAt: { type: Date },
    },
    balance: {
      amount: { type: Number, required: true },
      paid: { type: Boolean, default: false },
      paymentVerified: { type: Boolean, default: false },
      paidAt: { type: Date },
    },
  },
  receipts: {
    advanceReceiptSent: { type: Boolean, default: false },
    advanceReceiptSentAt: { type: Date },
    balanceReceiptSent: { type: Boolean, default: false },
    balanceReceiptSentAt: { type: Date },
  },
  isTripCompleted: { type: Boolean, default: false },
  isBookingCompleted: { type: Boolean, default: false },

  // 🔴 Booking-level cancel status (unchanged)
  cancelled: {
    byAdmin: { type: Boolean, default: false },
    byTraveller: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    releaseddAt: { type: Date },
    reason: { type: String },
  },

  bookingDate: { type: Date, default: Date.now },
});

const tourBookingModel =
  mongoose.models.tourBooking ||
  mongoose.model("tourBooking", tourBookingSchema);

export default tourBookingModel;
