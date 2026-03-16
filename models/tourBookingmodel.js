import mongoose from "mongoose";

const tourBookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  tourId: { type: mongoose.Schema.Types.ObjectId, ref: "tour", required: true },
  tnr: {
    type: String,
    unique: true, // ← very important for production safety
    sparse: true, // allows existing docs without tnr to stay valid
    trim: true,
    uppercase: true,
    minlength: 6,
    maxlength: 6,
  },

  userData: { type: Object, required: true },
  tourData: { type: Object, required: true },

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
        enum: ["double", "triple", "withBerth", "withoutBerth"],
        required: true,
      },
      packageType: {
        type: String,
        enum: ["main", "variant"],
        default: "main",
        required: true,
      },
      variantPackageIndex: {
        type: Number,
        default: null,
      },
      selectedAddon: {
        name: { type: String },
        price: { type: Number },
      },
      boardingPoint: {
        stationCode: { type: String },
        stationName: { type: String },
      },
      deboardingPoint: {
        stationCode: { type: String },
        stationName: { type: String },
      },
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

      seatNumber: {
        type: String,
        default: null,
        trim: true,
      },
      seatLocked: {
        type: Boolean,
        default: false,
      },
      seatLockedAt: { type: Date },
      vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "tourVehicle",
        default: null,
      },
      vehicleName: {
        type: String,
        default: null,
        trim: true,
      },

      staffRemarks: { type: String },
      remarks: { type: String },
      cancelled: {
        byAdmin: { type: Boolean, default: false },
        byTraveller: { type: Boolean, default: false },
        cancelledAt: { type: Date },
        releaseddAt: { type: Date },
        reason: { type: String },
      },
    },
  ],

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
      trim: true,
      match: [/^[\d+\-\s()]{7,25}$/, "Invalid phone number format"],
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

  cancelled: {
    byAdmin: { type: Boolean, default: false },
    byTraveller: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    releaseddAt: { type: Date },
    reason: { type: String },
  },

  bookingDate: { type: Date, default: Date.now },
  gvCancellationPool: { type: Number },
  irctcCancellationPool: { type: Number },
  manageBooking: { type: Boolean, default: false },

  // New independent field - specifically for advance payment related admin remarks
  advanceAdminRemarks: [
    {
      remark: { type: String },
      amount: { type: Number, default: 0 },
      addedAt: { type: Date, default: Date.now },
    },
  ],

  cancellationReceipt: { type: Boolean, default: false },
  manageBookingReceipt: { type: Boolean, default: false },

  // General admin remarks (kept separate)
  adminRemarks: [
    {
      remark: { type: String },
      amount: { type: Number, default: 0 },
      addedAt: { type: Date, default: Date.now },
    },
  ],
  cancellationRequest: { type: Boolean, default: false },
  emergencyContact: {
    type: String,
    match: [/^[\d+\-\s()]{7,25}$/, "Invalid phone number format"],
    default: null, // or "" if you prefer empty string
  },

  termsAgreed: {
    type: Boolean,
    default: false,
  },

  termsAgreedAt: {
    type: Date,
    default: null, // null = never agreed / confirmed
  },
});

const tourBookingModel =
  mongoose.models.tourBooking ||
  mongoose.model("tourBooking", tourBookingSchema);

export default tourBookingModel;
