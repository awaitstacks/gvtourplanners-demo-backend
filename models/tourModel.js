import mongoose from "mongoose";

const tourSchema = new mongoose.Schema({
  title: { type: String, required: true },
  batch: { type: String, required: true },

  duration: {
    days: { type: Number, required: true },
    nights: { type: Number, required: true },
  },

  // ✅ Price structure
  price: {
    doubleSharing: { type: Number, required: true },
    tripleSharing: { type: Number, required: true },
    childWithBerth: { type: Number }, // flat field
    childWithoutBerth: { type: Number }, // flat field
  },

  // ✅ Advance structure (adult + child separated)
  advanceAmount: {
    adult: { type: Number, required: true }, // existing logic moved here
    child: { type: Number, default: 0 }, // optional, backward compatible
  },

  // ✅ Auto-calculated balances
  balanceDouble: { type: Number },
  balanceTriple: { type: Number },
  balanceChildWithBerth: { type: Number },
  balanceChildWithoutBerth: { type: Number },

  destination: { type: [String], required: true },
  sightseeing: { type: [String], required: true },

  itinerary: { type: [String], required: true },
  includes: { type: [String], required: true },
  excludes: { type: [String], required: true },

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

  addons: [
    {
      name: { type: String },
      amount: { type: Number },
    },
  ],

  remarks: { type: String },

  boardingPoints: [
    {
      stationCode: { type: String },
      stationName: { type: String },
    },
  ],

  // ✅ New deboardingPoints field
  deboardingPoints: [
    {
      stationCode: { type: String },
      stationName: { type: String },
    },
  ],

  titleImage: { type: String, required: true },
  mapImage: { type: String, required: true },
  galleryImages: { type: [String], required: true },

  lastBookingDate: { type: Date, required: true },
  completedTripsCount: { type: Number, default: 0 },

  available: { type: Boolean, default: true },

  // For individual tour login
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const tourModel = mongoose.models.tour || mongoose.model("tour", tourSchema);
export default tourModel;
