import mongoose from "mongoose";

const tourSchema = new mongoose.Schema({
  title: { type: String, required: true },

  batch: { type: String, required: true },

  duration: {
    days: { type: Number, required: true },
    nights: { type: Number, required: true },
  },

  price: {
    doubleSharing: { type: Number, required: true },
    tripleSharing: { type: Number, required: true },
  },

  destination: { type: [String], required: true },
  sightseeing: { type: [String], required: true },

  itinerary: { type: [String], required: true },
  includes: { type: [String], required: true },
  excludes: { type: [String], required: true },

  // ✅ Optional
  trainDetails: [
    {
      trainNo: { type: String },
      trainName: { type: String },
      fromCode: { type: String },
      fromStation: { type: String },
      toCode: { type: String },
      toStation: { type: String },
      class: { type: String },
      departureTime: { type: String },
      arrivalTime: { type: String },
      ticketOpenDate: { type: Date },
    },
  ],

  // ✅ Optional
  flightDetails: [
    {
      airline: { type: String },
      flightNo: { type: String },
      fromCode: { type: String },
      fromAirport: { type: String },
      toCode: { type: String },
      toAirport: { type: String },
      class: { type: String },
      departureTime: { type: String },
      arrivalTime: { type: String },
    },
  ],

  // ✅ Optional
  addons: [
    {
      name: { type: String }, // e.g., "Chennai to Delhi 3AC extra"
      amount: { type: Number }, // Extra charge
    },
  ],

  // ✅ New feature - Remarks (optional)
  remarks: { type: String },

  // ✅ New feature - Boarding Points (optional)
  boardingPoints: [
    {
      stationCode: { type: String }, // e.g., "MAS"
      stationName: { type: String }, // e.g., "MGR Chennai Central"
    },
  ],

  titleImage: { type: String, required: true },
  mapImage: { type: String, required: true },
  galleryImages: { type: [String], required: true }, // Expect 3 images

  lastBookingDate: { type: Date, required: true },
  completedTripsCount: { type: Number, default: 0 },

  available: { type: Boolean, default: true },
  advanceAmount: { type: Number, required: true },

  // Auto-calculated
  balanceDouble: { type: Number },
  balanceTriple: { type: Number },

  // For individual tour login
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const tourModel = mongoose.models.tour || mongoose.model("tour", tourSchema);
export default tourModel;
