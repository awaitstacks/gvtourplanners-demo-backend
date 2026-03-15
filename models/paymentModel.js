// models/paymentMethodModel.js
import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["bank", "upi"],
      required: true,
    },

    // ────────────────────────────────────────────────
    // Common / Bank fields
    // ────────────────────────────────────────────────
    bankName: {
      type: String,
      trim: true,
      required: function () {
        return this.type === "bank";
      },
      minlength: [2, "Bank name must be at least 2 characters long"],
    },

    branchName: {
      type: String,
      trim: true,
      required: function () {
        return this.type === "bank";
      },
      minlength: [2, "Branch name must be at least 2 characters long"],
    },

    accountNumber: {
      type: String,
      trim: true,
    },

    ifsc: {
      type: String,
      trim: true,
      uppercase: true,
    },

    swift: {
      type: String,
      trim: true,
    },

    beneficiary: {
      type: String,
      trim: true,
    },

    accountType: {
      type: String,
      trim: true,
      enum: ["Savings", "Current", "Other"], // optional enum
    },

    // ────────────────────────────────────────────────
    // UPI fields
    // ────────────────────────────────────────────────
    upiId: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      match: [/^[0-9]{10}$/, "Phone must be exactly 10 digits"],
    },

    qrImage: {
      type: String, // Cloudinary secure URL
    },
  },
  {
    timestamps: true,
  },
);

// Optional: Add index for faster queries
paymentMethodSchema.index({ type: 1, createdAt: -1 });

const PaymentMethod = mongoose.model("PaymentMethod", paymentMethodSchema);

export default PaymentMethod;
