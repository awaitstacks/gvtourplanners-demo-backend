// models/paymentMethodModel.js (note: user said paymentmodel.js, but using standard naming)
import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["bank", "upi"],
      required: true,
    },
    // Bank fields
    accountNumber: {
      type: String,
    },
    ifsc: {
      type: String,
    },
    swift: {
      type: String,
    },
    beneficiary: {
      type: String,
    },
    accountType: {
      type: String,
    },
    // UPI fields
    upiId: {
      type: String,
    },
    phone: {
      type: String,
      match: [/^[0-9]{10}$/, "Phone must be 10 digits"],
    },
    qrImage: {
      type: String, // Cloudinary URL
    },
  },
  { timestamps: true },
);

const PaymentMethod = mongoose.model("PaymentMethod", paymentMethodSchema);

export default PaymentMethod;
