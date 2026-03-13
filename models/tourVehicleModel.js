import mongoose from "mongoose";

const tourVehicleSchema = new mongoose.Schema(
  {
    tourId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "tour",
      required: true,
    },
    vehicleName: {
      type: String,
      required: true,
      trim: true,
    },
    registrationNumber: {
      type: String,
      trim: true,
      sparse: true,
    },

    leaderRow: {
      type: [String],
      default: ["LS1", "LS2"], // fallback only — will be overridden
      required: true,
    },

    passengerRows: {
      type: [[String]],
      default: [
        ["C1", "C2", "D1", "D2"],
        ["C3", "C4", "D3", "D4"],
        ["C5", "C6", "D5", "D6"],
        ["C7", "C8", "D7", "D8"],
      ],
      validate: {
        validator: function (rows) {
          if (rows.length === 0) return true;
          const firstLen = rows[0].length;
          return rows.every((row) => row.length === firstLen);
        },
        message: "All passenger rows must have the same number of seats",
      },
    },

    // ────────────────────────────────────────────────
    // Computed fields (updated automatically on save)
    // ────────────────────────────────────────────────
    totalSeats: {
      type: Number,
      default: 0,
      // ONLY counts C + D seats across all passenger rows
      // Leader seats (LS) are NOT included
    },
    seatsPerRow: { type: Number, default: 0 },
    passengerRowCount: { type: Number, default: 0 },

    allowSeatSelection: { type: Boolean, default: false },

    bookedSeats: [
      {
        seatNumber: { type: String, required: true },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "tourBooking" },
        travellerIndex: { type: Number },
        lockedAt: { type: Date, default: Date.now },
      },
    ],

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Pre-save hook: recalculate computed fields
tourVehicleSchema.pre("save", function (next) {
  const passengerCount = this.passengerRows.length;
  const seatsInPassengerRows =
    passengerCount > 0 ? this.passengerRows[0].length * passengerCount : 0;

  this.seatsPerRow = passengerCount > 0 ? this.passengerRows[0].length : 0;
  this.passengerRowCount = passengerCount;

  // TOTAL = only passenger seats (C + D both included via row length)
  this.totalSeats = seatsInPassengerRows;

  // ← leaderRow sync block removed — it was overwriting your custom LS layout

  next();
});

// Virtual: full seat layout (leader row + all passenger rows)
tourVehicleSchema.virtual("seatLayout").get(function () {
  return [this.leaderRow, ...this.passengerRows];
});

// Ensure virtuals are included when converting to JSON/object
tourVehicleSchema.set("toJSON", { virtuals: true });
tourVehicleSchema.set("toObject", { virtuals: true });

export default mongoose.models.tourVehicle ||
  mongoose.model("tourVehicle", tourVehicleSchema);
