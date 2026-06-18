import mongoose from "mongoose";

const balanceMethodSchema = new mongoose.Schema({

  tourId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tour',
    required: true,
  },
  type: {
    type: String,
    enum: ["bank", "upi"],
    required: true,
  },

  isActive: {
    type: Boolean,
    default: true,
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
    validate: {
      validator: function (v) {
        if (!v || v.trim() === "") return true; // allow empty/undefined
        return /^[0-9]{10}$/.test(v);
      },
      message: "Phone must be exactly 10 digits",
    },
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
balanceMethodSchema.index({ type: 1, createdAt: -1 });

const BalanceMethod = mongoose.model("BalanceMethod", balanceMethodSchema);

export default BalanceMethod;