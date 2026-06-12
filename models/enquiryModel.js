
import mongoose from "mongoose";

const enquirySchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    city: { type: String, trim: true },
    destination: { type: String, required: true, trim: true },
    tourType: {
      type: String,
      required: true,
      enum: [
        "Group tour(fixed departure)", "Customized/Private tour",
        "Friends", "Family", "Corporate/Team Outing",
        "Honeymoon", "pilgrimage tour", "Others",
      ],
    },
    preferredTravelDate: { type: Date, required: true },
    numberOfDays: { type: Number, required: true, min: 1 },
    numberOfNights: { type: Number, required: true, min: 0 },
    adults: { type: Number, default: 1, min: 0 },
    children: { type: Number, default: 0, min: 0 },
    infants: { type: Number, default: 0, min: 0 },
    specialRequests: { type: String, trim: true },
    source: {
      type: String,
      enum: ["Google", "Facebook", "Instagram", "YouTube", "Friends & Family", "Whatsapp/Referral", "Others"],
      default: "Website",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    fitCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    fitStates: {
      type: [String],
      enum: [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
        "Chhattisgarh", "Goa", "Gujarat", "Haryana",
        "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
        "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
        "Mizoram", "Nagaland", "Odisha", "Punjab",
        "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
        "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
      ],
      default: [],
    },
    salesValue: { type: Number, min: 0, default: null },
    raisedBy: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Auto-generate fitCode when enquiry is first created
enquirySchema.pre("save", async function (next) {
  if (this.isNew && !this.fitCode) {
    const last = await mongoose.model("enquiry")
      .findOne({ fitCode: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 })
      .select("fitCode");

    let nextNum = 1;
    if (last?.fitCode) {
      const num = parseInt(last.fitCode.replace("GVFIT", ""), 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    this.fitCode = `GVFIT${String(nextNum).padStart(4, "0")}`;
  }
  next();
});

const enquiryModel = mongoose.models.enquiry || mongoose.model("enquiry", enquirySchema);
export default enquiryModel;
