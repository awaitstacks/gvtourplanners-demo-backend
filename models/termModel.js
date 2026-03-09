import mongoose from "mongoose";

const termsSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // examples: "2025-v1", "2026-03", "after-new-rule-apr-2026", "1.4.2"
    },

    effectiveFrom: {
      type: Date,
      default: Date.now,
    },

    isCurrent: {
      type: Boolean,
      default: true,
      index: true, // helps quickly find the active version
    },

    // ────────────────────────────────────────────────
    //              All points live here
    // ────────────────────────────────────────────────
    points: [
      {
        order: {
          type: Number,
          required: true,
          min: 1,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          minlength: 10,
          maxlength: 2000,
        },
        active: {
          type: Boolean,
          default: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
        },
        internalNote: {
          type: String,
          default: "", // admin-only comment, not shown to users
        },
      },
    ],

    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // change to your actual admin/user model name
      default: null,
    },

    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },

    changeSummary: {
      type: String,
      default: "",
      // example: "Added new point about mandatory travel insurance + corrected typo in point 7"
    },
  },
  {
    timestamps: true,
    // Optional: you can name the collection explicitly
    // collection: 'terms_and_conditions'
  },
);

// Optional but recommended: enforce only one document can be isCurrent: true
termsSchema.pre("save", async function (next) {
  if (this.isModified("isCurrent") && this.isCurrent) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isCurrent: true },
      { $set: { isCurrent: false } },
    );
  }
  next();
});

const Terms = mongoose.models.Terms || mongoose.model("Terms", termsSchema);

export default Terms;
