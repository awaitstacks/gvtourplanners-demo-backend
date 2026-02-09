import mongoose from "mongoose";

import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";

import tourModel from "../models/tourModel.js";
import userModel from "../models/userModel.js";

import tourBookingModel from "../models/tourBookingmodel.js";
import cancelRuleModel from "../models/cancelRuleModel.js";
import cancellationModel from "../models/cancellationModel.js";
import tourRoomAllocationModel from "../models/roomModel.js";
import manageBookingModel from "../models/manageBookingModel.js";

//API for the admin login
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign(email + password, process.env.JWT_SECRET);
      res.json({
        success: true,
        token,
      });
    } else {
      res.json({
        success: false,
        message: "Invalid credentials",
      });
    }
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

//THIS CONTROLLER IS USED IN TOUR CONTROLERS AND DATA PAGE
const allTours = async (req, res) => {
  try {
    const tours = await tourModel.find({}).select("-password");
    res.json({ success: true, tours });
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};
//CHANGES THE AVAILABLITY OF TOUR
const changeTourAvailability = async (req, res) => {
  try {
    const { tourId } = req.body; // ✅ Use tourId here

    const tourData = await tourModel.findById(tourId);

    if (!tourData) {
      return res.json({ success: false, message: "Tour not found" });
    }

    await tourModel.findByIdAndUpdate(tourId, {
      available: !tourData.available,
    });

    res.json({ success: true, message: "Availability changed" });
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

//Add tour controller
const addTour = async (req, res) => {
  try {
    const {
      title,
      batch,
      duration,
      price,
      destination,
      sightseeing,
      itinerary,
      includes,
      excludes,
      trainDetails,
      flightDetails,
      lastBookingDate,
      completedTripsCount,
      available,
      advanceAmount,
      addons,
      remarks,
      boardingPoints,
      deboardingPoints,
      variantPackage,
    } = req.body;

    // Image handling
    const files = req.files || {};
    const titleImage = files.titleImage?.[0];
    const mapImage = files.mapImage?.[0];
    const galleryImages = files.galleryImages || [];

    // Validate required fields
    if (
      !title ||
      !batch ||
      !duration ||
      !price ||
      !destination ||
      !sightseeing ||
      !itinerary ||
      !includes ||
      !excludes ||
      !titleImage ||
      !mapImage ||
      galleryImages.length === 0 ||
      !lastBookingDate ||
      !advanceAmount ||
      !boardingPoints ||
      !deboardingPoints
    ) {
      return res.json({
        success: false,
        message: "Missing required tour details",
      });
    }

    // Image upload function
    const uploadImage = async (file) => {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: "image",
      });
      return result.secure_url;
    };

    // Upload images
    const titleImageUrl = await uploadImage(titleImage);
    const mapImageUrl = await uploadImage(mapImage);
    const galleryImageUrls = await Promise.all(
      galleryImages.map((img) => uploadImage(img))
    );

    // Parse and validate fields
    let parsedDuration, parsedPrice, parsedAdvance;
    try {
      parsedDuration = JSON.parse(duration);
      parsedPrice = JSON.parse(price);
      parsedAdvance = JSON.parse(advanceAmount);
    } catch {
      return res.json({
        success: false,
        message: "Invalid JSON format for duration, price, or advanceAmount",
      });
    }

    // Validate main tour price and advance amounts
    const doubleSharing = Number(parsedPrice.doubleSharing);
    const tripleSharing = Number(parsedPrice.tripleSharing);
    const childWithBerth = Number(parsedPrice.childWithBerth) || 0;
    const childWithoutBerth = Number(parsedPrice.childWithoutBerth) || 0;
    const advanceAdult = Number(parsedAdvance.adult) || 0;
    const advanceChild = Number(parsedAdvance.child) || 0;

    if (
      isNaN(doubleSharing) ||
      isNaN(tripleSharing) ||
      isNaN(advanceAdult) ||
      isNaN(advanceChild)
    ) {
      return res.json({
        success: false,
        message: "Invalid number in price or advance amount",
      });
    }

    // Calculate balances for main tour
    const balanceDouble = doubleSharing - advanceAdult;
    const balanceTriple = tripleSharing - advanceAdult;
    const balanceChildWithBerth =
      childWithBerth > 0 ? childWithBerth - advanceChild : null;
    const balanceChildWithoutBerth =
      childWithoutBerth > 0 ? childWithoutBerth - advanceChild : null;

    // Parse arrays safely
    const parseArrayField = (field, fieldName) => {
      try {
        const parsed = JSON.parse(field);
        if (!Array.isArray(parsed)) {
          throw new Error(`Invalid format for ${fieldName}`);
        }
        return parsed;
      } catch {
        throw new Error(`Invalid format for ${fieldName}`);
      }
    };

    // Parse addons
    let parsedAddons = [];
    if (addons) {
      try {
        const temp = JSON.parse(addons);
        if (Array.isArray(temp)) {
          parsedAddons = temp.map((a) => ({
            name: a.name || "",
            amount: Number(a.amount) || 0,
          }));
        }
      } catch {
        return res.json({
          success: false,
          message: "Invalid format for addons",
        });
      }
    }

    // Parse boarding and deboarding points
    let parsedBoardingPoints = [];
    let parsedDeboardingPoints = [];
    try {
      parsedBoardingPoints = parseArrayField(
        boardingPoints,
        "boardingPoints"
      ).map((b) => ({
        stationCode: b.stationCode || "",
        stationName: b.stationName || "",
      }));
      parsedDeboardingPoints = parseArrayField(
        deboardingPoints,
        "deboardingPoints"
      ).map((b) => ({
        stationCode: b.stationCode || "",
        stationName: b.stationName || "",
      }));
    } catch (error) {
      return res.json({
        success: false,
        message: error.message,
      });
    }

    // Parse variantPackage
    let parsedVariants = [];
    if (variantPackage) {
      try {
        const temp = JSON.parse(variantPackage);
        if (Array.isArray(temp)) {
          parsedVariants = temp.map((v) => {
            const vpPrice = v.price || {};
            const vpAdvance = v.advanceAmount || {};
            const vpDuration = v.duration || {};

            const vpDouble = Number(vpPrice.doubleSharing) || 0;
            const vpTriple = Number(vpPrice.tripleSharing) || 0;
            const vpChildWithBerth = Number(vpPrice.childWithBerth) || 0;
            const vpChildWithoutBerth = Number(vpPrice.childWithoutBerth) || 0;
            const vpAdvanceAdult = Number(vpAdvance.adult) || 0;
            const vpAdvanceChild = Number(vpAdvance.child) || 0;

            return {
              duration: {
                days: Number(vpDuration.days) || 0,
                nights: Number(vpDuration.nights) || 0,
              },
              price: {
                doubleSharing: vpDouble,
                tripleSharing: vpTriple,
                childWithBerth: vpChildWithBerth,
                childWithoutBerth: vpChildWithoutBerth,
              },
              advanceAmount: {
                adult: vpAdvanceAdult,
                child: vpAdvanceChild,
              },
              balanceDouble: vpDouble - vpAdvanceAdult,
              balanceTriple: vpTriple - vpAdvanceAdult,
              balanceChildWithBerth:
                vpChildWithBerth > 0 ? vpChildWithBerth - vpAdvanceChild : null,
              balanceChildWithoutBerth:
                vpChildWithoutBerth > 0
                  ? vpChildWithoutBerth - vpAdvanceChild
                  : null,
              destination: Array.isArray(v.destination) ? v.destination : [],
              sightseeing: Array.isArray(v.sightseeing) ? v.sightseeing : [],
              itinerary: Array.isArray(v.itinerary) ? v.itinerary : [],
              includes: Array.isArray(v.includes) ? v.includes : [],
              excludes: Array.isArray(v.excludes) ? v.excludes : [],
              trainDetails: Array.isArray(v.trainDetails)
                ? v.trainDetails.map((t) => ({
                    trainNo: t.trainNo || "",
                    trainName: t.trainName || "",
                    fromCode: t.fromCode || "",
                    fromStation: t.fromStation || "",
                    toCode: t.toCode || "",
                    toStation: t.toStation || "",
                    class: t.class || "",
                    departureTime: t.departureTime || "",
                    arrivalTime: t.arrivalTime || "",
                    ticketOpenDate: t.ticketOpenDate
                      ? new Date(t.ticketOpenDate)
                      : null,
                  }))
                : [],
              flightDetails: Array.isArray(v.flightDetails)
                ? v.flightDetails.map((f) => ({
                    airline: f.airline || "",
                    flightNo: f.flightNo || "",
                    fromCode: f.fromCode || "",
                    fromAirport: f.fromAirport || "",
                    toCode: f.toCode || "",
                    toAirport: f.toAirport || "",
                    class: f.class || "",
                    departureTime: f.departureTime || "",
                    arrivalTime: f.arrivalTime || "",
                  }))
                : [],
              addons: Array.isArray(v.addons)
                ? v.addons.map((a) => ({
                    name: a.name || "",
                    amount: Number(a.amount) || 0,
                  }))
                : [],
              remarks: v.remarks || "",
              boardingPoints: Array.isArray(v.boardingPoints)
                ? v.boardingPoints.map((b) => ({
                    stationCode: b.stationCode || "",
                    stationName: b.stationName || "",
                  }))
                : [],
              deboardingPoints: Array.isArray(v.deboardingPoints)
                ? v.deboardingPoints.map((b) => ({
                    stationCode: b.stationCode || "",
                    stationName: b.stationName || "",
                  }))
                : [],
              lastBookingDate: v.lastBookingDate
                ? new Date(v.lastBookingDate)
                : null,
            };
          });
        }
      } catch {
        return res.json({
          success: false,
          message: "Invalid format for variantPackage",
        });
      }
    }

    // Create tour data object
    const tourData = {
      title,
      batch,
      duration: {
        days: Number(parsedDuration.days) || 0,
        nights: Number(parsedDuration.nights) || 0,
      },
      price: {
        doubleSharing,
        tripleSharing,
        childWithBerth,
        childWithoutBerth,
      },
      advanceAmount: {
        adult: advanceAdult,
        child: advanceChild,
      },
      balanceDouble,
      balanceTriple,
      balanceChildWithBerth,
      balanceChildWithoutBerth,
      destination: parseArrayField(destination, "destination"),
      sightseeing: parseArrayField(sightseeing, "sightseeing"),
      itinerary: parseArrayField(itinerary, "itinerary"),
      includes: parseArrayField(includes, "includes"),
      excludes: parseArrayField(excludes, "excludes"),
      trainDetails: trainDetails
        ? parseArrayField(trainDetails, "trainDetails").map((t) => ({
            trainNo: t.trainNo || "",
            trainName: t.trainName || "",
            fromCode: t.fromCode || "",
            fromStation: t.fromStation || "",
            toCode: t.toCode || "",
            toStation: t.toStation || "",
            class: t.class || "",
            departureTime: t.departureTime || "",
            arrivalTime: t.arrivalTime || "",
            ticketOpenDate: t.ticketOpenDate
              ? new Date(t.ticketOpenDate)
              : null,
          }))
        : [],
      flightDetails: flightDetails
        ? parseArrayField(flightDetails, "flightDetails").map((f) => ({
            airline: f.airline || "",
            flightNo: f.flightNo || "",
            fromCode: f.fromCode || "",
            fromAirport: f.fromAirport || "",
            toCode: f.toCode || "",
            toAirport: f.toAirport || "",
            class: f.class || "",
            departureTime: f.departureTime || "",
            arrivalTime: f.arrivalTime || "",
          }))
        : [],
      addons: parsedAddons,
      remarks: remarks || "",
      boardingPoints: parsedBoardingPoints,
      deboardingPoints: parsedDeboardingPoints,
      titleImage: titleImageUrl,
      mapImage: mapImageUrl,
      galleryImages: galleryImageUrls,
      lastBookingDate: new Date(lastBookingDate),
      completedTripsCount: Number(completedTripsCount) || 0,
      available: available ?? true,
      variantPackage: parsedVariants,
    };

    // Save tour to database
    const newTour = new tourModel(tourData);
    await newTour.save();

    res.json({
      success: true,
      message: "Tour added successfully",
      data: newTour,
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};


const tourAdminDashboard = async (req, res) => {
  try {
    const tours = await tourModel.find({});
    const users = await userModel.find({});
    const bookings = await tourBookingModel.find({});
    const dashData = {
      tours: tours.length,
      bookings: bookings.length,
      users: users.length,
      latestAppointments: bookings.reverse().slice(0, 5),
    };
    res.json({ success: true, dashData });
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

//API to get all BOOKINGS

const bookingsAdmin = async (req, res) => {
  try {
    const bookings = await tourBookingModel.find({});
    res.json({ success: true, bookings });
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

//WORKS SAME LIKE BOOKINGS ADMIN BUT LINKED TO CONTEXT SO NEEDED
const getBookings = async (req, res) => {
  try {
    console.log("Logged-in tour operator ID:", req.tourOperator?._id); // ← add this
    const bookings = await tourBookingModel
      .find({})
      .populate({
        path: "userId",
        select: "name email mobile", // Only needed user fields
      })
      .populate({
        path: "tourId",
        select: "title destination startDate endDate available", // Tour details
      })
      .sort({ bookingDate: -1 }) // Latest bookings first
      .lean(); // Better performance for large data
      console.log("Total bookings found in DB:", bookings.length); // ← add this

    if (!bookings || bookings.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No bookings found in the system.",
        total: 0,
        bookings: [],
      });
    }

    // Optional: Add quick stats
    const totalBookings = bookings.length;
    const totalEarnings = bookings.reduce((sum, b) => {
      let earnings = 0;
      if (b.payment?.advance?.paid) earnings += b.payment.advance.amount || 0;
      if (b.payment?.balance?.paid) earnings += b.payment.balance.amount || 0;
      return sum + earnings;
    }, 0);

    const completedBookings = bookings.filter(b => b.isBookingCompleted).length;
    const pendingBookings = totalBookings - completedBookings;

    res.status(200).json({
      success: true,
      totalBookings,
      totalEarnings,
      completedBookings,
      pendingBookings,
      bookings,
    });
  } catch (error) {
    console.error("Error in getBookings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch all bookings",
      error: error.message,
    });
  }
};

//ALL CONTROLLERS RELATED TO CANCLLATION START FROM HERE

// GET (with auto-create default)
const getCancellationChart = async (req, res) => {
  try {
    let chart = await cancelRuleModel.findOne();

    if (!chart) {
      chart = await cancelRuleModel.create({
        gv: {
          advancePaid: {
            tiers: [{ fromDays: 30, toDays: 15, percentage: 50 }],
          },
          fullyPaid: { tiers: [{ fromDays: 30, toDays: 15, percentage: 100 }] },
        },
        irctc: [
          { classType: "SL", noOfDays: 7, fixedAmount: 60, percentage: 50 },
        ],
      });
    }

    res.status(200).json({ success: true, data: chart });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch chart" });
  }
};

// UPDATE CANCELLATION CHART (or create if not exists)
const upsertCancellationChart = async (req, res) => {
  try {
    const { gv, irctc } = req.body;
    let chart = await cancelRuleModel.findOne();

    if (chart) {
      chart.gv = gv ?? chart.gv;
      chart.irctc = irctc ?? chart.irctc;
      chart = await chart.save();
    } else {
      chart = await cancelRuleModel.create({ gv, irctc });
    }

    res.status(200).json({
      success: true,
      message: "Updated",
      data: chart,
    });
  } catch (error) {
    console.error("Upsert error:", error);
    res.status(500).json({ success: false, message: "Failed to update" });
  }
};

//GET THE PENDING CANCELLATIONS
const getCancellations = async (req, res) => {
  try {
    // 1. Find cancellation docs that are RAISED but NOT YET APPROVED
    //    (approvedBy must be explicitly false or missing)
    const pendingCancellations = await cancellationModel
      .find({
        raisedBy: true,
        $or: [{ approvedBy: { $exists: false } }, { approvedBy: false }],
      })
      .select("-__v")
      .lean();

    if (!pendingCancellations.length) {
      return res.json({ success: true, data: [] });
    }

    // 2. Extract booking IDs
    const bookingIds = [
      ...new Set(pendingCancellations.map((c) => c.bookingId).filter(Boolean)),
    ];

    // 3. Fetch bookings + filter travellers on the server side
    const bookings = await tourBookingModel
      .find({ _id: { $in: bookingIds } })
      .select("travellers cancelled")
      .lean();

    // Helper: does the booking contain a traveller cancelled **by traveller only** OR **by admin only**?
    const hasValidTravellerCancellation = (booking) => {
      return booking.travellers.some(
        (t) =>
          (t.cancelled?.byTraveller === true &&
            t.cancelled?.byAdmin === false) ||
          (t.cancelled?.byAdmin === true && t.cancelled?.byTraveller === false)
      );
    };

    const validBookingIds = bookings
      .filter(hasValidTravellerCancellation)
      .map((b) => b._id.toString());

    // 4. Keep only cancellation docs whose booking passed the traveller check
    const result = pendingCancellations.filter(
      (c) => c.bookingId && validBookingIds.includes(c.bookingId.toString())
    );

    // 5. OPTIONAL: Populate booking & traveller data for the front-end
    const enriched = await Promise.all(
      result.map(async (c) => {
        const booking = await tourBookingModel
          .findById(c.bookingId)
          .select(
            "userId tourId travellers contact bookingDate payment adminRemarks"
          )
          .populate({
            path: "travellers",
            match: {
              $or: [
                { "cancelled.byTraveller": true, "cancelled.byAdmin": false },
              ],
            },
            select: "title firstName lastName age gender sharingType cancelled",
          })
          .lean();

        return { ...c, booking };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error("getCancellations error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

//APPROVE CANCELLATION IN THE CANCELLATION APPROVALS PAGE
// const approveCancellation = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { bookingId, cancellationId } = req.body;

//     if (!bookingId || !cancellationId) {
//       return res.status(400).json({
//         success: false,
//         message: "bookingId and cancellationId are required",
//       });
//     }

//     if (
//       !mongoose.Types.ObjectId.isValid(bookingId) ||
//       !mongoose.Types.ObjectId.isValid(cancellationId)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid bookingId or cancellationId format",
//       });
//     }

//     const cancellation = await cancellationModel
//       .findOne({
//         _id: cancellationId,
//         bookingId,
//         raisedBy: true,
//         approvedBy: { $ne: true },
//       })
//       .session(session);

//     if (!cancellation) {
//       return res.status(404).json({
//         success: false,
//         message: "Cancellation request not found or already processed",
//       });
//     }

//     const booking = await tourBookingModel
//       .findById(bookingId)
//       .select(
//         "travellers gvCancellationPool irctcCancellationPool cancellationRequest payment contact.mobile"
//       )
//       .session(session);

//     if (!booking) throw new Error("Booking not found");

//     // === PENDING TRAVELLERS ===
//     const pendingTravellers = (booking.travellers || []).filter(
//       (t) => t.cancelled?.byTraveller === true && t.cancelled?.byAdmin !== true
//     );

//     const pendingCount = pendingTravellers.length;
//     const requestedCount = (cancellation.travellerIds || []).length;

//     // Build name list
//     const getName = (t) =>
//       `${t.title || ""} ${t.firstName || ""} ${t.lastName || ""}`.trim() ||
//       "Unknown Traveller";

//     const pendingNames = pendingTravellers.map(getName);
//     const requestedNames = (cancellation.travellerIds || []).map((id) => {
//       const t = booking.travellers.find(
//         (t) => t._id.toString() === id.toString()
//       );
//       return t ? getName(t) : `Deleted Traveller (ID: ${id})`;
//     });

//     // === COUNT MISMATCH ===
//     if (pendingCount !== requestedCount) {
//       return res.status(400).json({
//         success: false,
//         message: `CANCELLATION BLOCKED: Traveller

// User requested : ${pendingCount} traveller's
// Admin calculated : ${requestedCount} traveller's

// User requested: ${pendingNames.join(", ") || "None"}
// But Admin worked: ${requestedNames.join(", ") || "None"}

// Kindly reject this and raise new request`,
//         details: {
//           pendingTravellers: pendingTravellers.map((t) => ({
//             name: getName(t),
//             id: t._id.toString(),
//             age: t.age,
//             gender: t.gender,
//           })),
//           requestedTravellers: requestedNames,
//           pendingCount,
//           requestedCount,
//         },
//       });
//     }

//     // === ID MISMATCH ===
//     const pendingIds = pendingTravellers.map((t) => t._id.toString()).sort();
//     const requestIds = (cancellation.travellerIds || [])
//       .map((id) => id.toString())
//       .sort();

//     const idsMatch =
//       pendingIds.length === requestIds.length &&
//       pendingIds.every((id, i) => id === requestIds[i]);

//     if (!idsMatch) {
//       return res.status(400).json({
//         success: false,
//         message: `SECURITY BLOCKED: Wrong travellers detected!

// User requested:
// → ${pendingNames.join("\n→ ") || "None"}

// But Admin worked:
// → ${requestedNames.join("\n→ ") || "None"}

// Kindly reject this and raise new request`,
//         details: {
//           pendingTravellers: pendingTravellers.map((t) => ({
//             name: getName(t),
//             id: t._id.toString(),
//           })),
//           requestedTravellers: requestedNames.map((name, i) => ({
//             name,
//             id: requestIds[i],
//           })),
//           securityNote: "Only exact matching travellers can be cancelled",
//         },
//       });
//     }

//     // === ALL GOOD — APPROVE ===
//     const gvAdd =
//       (cancellation.gvCancellationAmount || 0) +
//       (cancellation.remarksAmount || 0);
//     const irctcAdd = cancellation.irctcCancellationAmount || 0;

//     const newGvPool = (booking.gvCancellationPool || 0) + gvAdd;
//     const newIrctcPool = (booking.irctcCancellationPool || 0) + irctcAdd;
//     const finalBalance = Math.max(0, cancellation.updatedBalance || 0);

//     const setObj = {
//       gvCancellationPool: newGvPool,
//       irctcCancellationPool: newIrctcPool,
//       cancellationRequest: false,
//       "payment.balance.amount": Number(finalBalance),
//     };

//     if (finalBalance === 0) {
//       setObj["payment.balance.paid"] = true;
//       setObj["payment.balance.paymentVerified"] = true;
//       setObj["payment.balance.paidAt"] = new Date();
//     }

//     const arrayFilters = [];
//     pendingTravellers.forEach((t, i) => {
//       const elem = `elem${i}`;
//       setObj[`travellers.$[${elem}].cancelled.byAdmin`] = true;
//       setObj[`travellers.$[${elem}].cancelled.cancelledAt`] = new Date();
//       arrayFilters.push({ [`${elem}._id`]: t._id });
//     });

//     await tourBookingModel.findByIdAndUpdate(
//       bookingId,
//       { $set: setObj },
//       { arrayFilters, session, new: true }
//     );

//     await cancellationModel.findByIdAndUpdate(
//       cancellationId,
//       { approvedBy: true, approvedAt: new Date(), raisedBy: false },
//       { session }
//     );

//     await session.commitTransaction();

//     return res.json({
//       success: true,
//       message: `Cancellation approved successfully!

// Cancelled: ${pendingNames.join(", ")}

// New balance: ₹${finalBalance} ${finalBalance === 0 ? "(Fully Paid)" : ""}`,
//       data: {
//         cancelledTravellers: pendingNames,
//         cancelledCount: pendingCount,
//         newBalance: finalBalance,
//         balancePaid: finalBalance === 0,
//       },
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     console.error("approveCancellation error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Server error during approval. Please try again.",
//     });
//   } finally {
//     session.endSession();
//   }
// };

const approveCancellation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId, cancellationId } = req.body;

    if (!bookingId || !cancellationId) {
      return res.status(400).json({
        success: false,
        message: "bookingId and cancellationId are required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(bookingId) ||
      !mongoose.Types.ObjectId.isValid(cancellationId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid bookingId or cancellationId format",
      });
    }

    const cancellation = await cancellationModel
      .findOne({
        _id: cancellationId,
        bookingId,
        raisedBy: true,
        approvedBy: { $ne: true },
      })
      .session(session);

    if (!cancellation) {
      return res.status(404).json({
        success: false,
        message: "Cancellation request not found or already processed",
      });
    }

    const booking = await tourBookingModel
      .findById(bookingId)
      .select(
        "travellers gvCancellationPool irctcCancellationPool cancellationRequest payment contact.mobile"
      )
      .session(session);

    if (!booking) throw new Error("Booking not found");

    // === PENDING TRAVELLERS ===
    const pendingTravellers = (booking.travellers || []).filter(
      (t) => t.cancelled?.byTraveller === true && t.cancelled?.byAdmin !== true
    );

    const pendingCount = pendingTravellers.length;
    const requestedCount = (cancellation.travellerIds || []).length;

    // Build name list
    const getName = (t) =>
      `${t.title || ""} ${t.firstName || ""} ${t.lastName || ""}`.trim() ||
      "Unknown Traveller";

    const pendingNames = pendingTravellers.map(getName);
    const requestedNames = (cancellation.travellerIds || []).map((id) => {
      const t = booking.travellers.find(
        (t) => t._id.toString() === id.toString()
      );
      return t ? getName(t) : `Deleted Traveller (ID: ${id})`;
    });

    // === COUNT MISMATCH ===
    if (pendingCount !== requestedCount) {
      return res.status(400).json({
        success: false,
        message: `CANCELLATION BLOCKED: Traveller

User requested : ${pendingCount} traveller's
Admin calculated : ${requestedCount} traveller's

User requested: ${pendingNames.join(", ") || "None"}
But Admin worked: ${requestedNames.join(", ") || "None"}

Kindly reject this and raise new request`,
        details: {
          pendingTravellers: pendingTravellers.map((t) => ({
            name: getName(t),
            id: t._id.toString(),
            age: t.age,
            gender: t.gender,
          })),
          requestedTravellers: requestedNames,
          pendingCount,
          requestedCount,
        },
      });
    }

    // === ID MISMATCH ===
    const pendingIds = pendingTravellers.map((t) => t._id.toString()).sort();
    const requestIds = (cancellation.travellerIds || [])
      .map((id) => id.toString())
      .sort();

    const idsMatch =
      pendingIds.length === requestIds.length &&
      pendingIds.every((id, i) => id === requestIds[i]);

    if (!idsMatch) {
      return res.status(400).json({
        success: false,
        message: `SECURITY BLOCKED: Wrong travellers detected!

User requested:
→ ${pendingNames.join("\n→ ") || "None"}

But Admin worked:
→ ${requestedNames.join("\n→ ") || "None"}

Kindly reject this and raise new request`,
        details: {
          pendingTravellers: pendingTravellers.map((t) => ({
            name: getName(t),
            id: t._id.toString(),
          })),
          requestedTravellers: requestedNames.map((name, i) => ({
            name,
            id: requestIds[i],
          })),
          securityNote: "Only exact matching travellers can be cancelled",
        },
      });
    }

    // === ALL GOOD — APPROVE ===
    const gvAdd =
      (cancellation.gvCancellationAmount || 0) +
      (cancellation.remarksAmount || 0);
    const irctcAdd = cancellation.irctcCancellationAmount || 0;

    const newGvPool = (booking.gvCancellationPool || 0) + gvAdd;
    const newIrctcPool = (booking.irctcCancellationPool || 0) + irctcAdd;
    const finalBalance = Math.max(0, cancellation.updatedBalance || 0);

    const setObj = {
      gvCancellationPool: newGvPool,
      irctcCancellationPool: newIrctcPool,
      cancellationRequest: false,
      cancellationReceipt: true,
      "payment.balance.amount": Number(finalBalance),
    };

    if (finalBalance === 0) {
      setObj["payment.balance.paid"] = true;
      setObj["payment.balance.paymentVerified"] = true;
      setObj["payment.balance.paidAt"] = new Date();
    }

    const arrayFilters = [];
    pendingTravellers.forEach((t, i) => {
      const elem = `elem${i}`;
      setObj[`travellers.$[${elem}].cancelled.byAdmin`] = true;
      setObj[`travellers.$[${elem}].cancelled.cancelledAt`] = new Date();
      arrayFilters.push({ [`${elem}._id`]: t._id });
    });

    await tourBookingModel.findByIdAndUpdate(
      bookingId,
      { $set: setObj },
      { arrayFilters, session, new: true }
    );

    await cancellationModel.findByIdAndUpdate(
      cancellationId,
      { approvedBy: true, approvedAt: new Date(), raisedBy: false },
      { session }
    );

    await session.commitTransaction();

    return res.json({
      success: true,
      message: `Cancellation approved successfully!

Cancelled: ${pendingNames.join(", ")}

New balance: ₹${finalBalance} ${finalBalance === 0 ? "(Fully Paid)" : ""}`,
      data: {
        cancelledTravellers: pendingNames,
        cancelledCount: pendingCount,
        newBalance: finalBalance,
        balancePaid: finalBalance === 0,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("approveCancellation error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during approval. Please try again.",
    });
  } finally {
    session.endSession();
  }
};
//REJECTING THE CANCELLATION IN ANCELLATION APPROVALS PAGE
const rejectCancellation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId, travellerIds, cancellationId } = req.body;

    // === VALIDATION ===
    if (
      !bookingId ||
      !cancellationId ||
      !Array.isArray(travellerIds) ||
      travellerIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "bookingId, cancellationId, and travellerIds array are required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(bookingId) ||
      !mongoose.Types.ObjectId.isValid(cancellationId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid bookingId or cancellationId",
      });
    }

    const invalidTravellerIds = travellerIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );
    if (invalidTravellerIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid travellerId(s)",
        invalidIds: invalidTravellerIds,
      });
    }

    // === FIND CANCELLATION DOCUMENT ===
    const cancellation = await cancellationModel
      .findOne({
        _id: cancellationId,
        bookingId,
        raisedBy: true,
      })
      .session(session);

    if (!cancellation) {
      return res.status(404).json({
        success: false,
        message: "Cancellation request not found or already processed",
      });
    }

    // Ensure all requested travellerIds are part of this cancellation
    const cancellationTravellerIds = cancellation.travellerIds.map((id) =>
      id.toString()
    );
    const missing = travellerIds.filter(
      (id) => !cancellationTravellerIds.includes(id.toString())
    );
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some travellerIds do not belong to this cancellation",
        missing,
      });
    }

    // === ONLY UPDATE CANCELLATION MODEL ===
    await cancellationModel.findByIdAndUpdate(
      cancellationId,
      {
        raisedBy: false,
        approvedBy: false,
        rejectedAt: new Date(),
      },
      { session }
    );

    // === ONLY THIS LINE ADDED: Clear cancellationRequest in main booking ===
    await tourBookingModel.findByIdAndUpdate(
      bookingId,
      { $set: { cancellationRequest: false } },
      { session }
    );
    // ======================================================================

    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Cancellation request rejected successfully",
      data: {
        bookingId,
        travellerIds,
        cancellationId,
        cancellationRequestCleared: true,
        rejectedAt: new Date(),
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("rejectCancellation error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

//REJECTING CANCELLATION IN DASHBOARD SO THAT USER END WILL GET UPDATED

const bookingRelease = async (req, res) => {
  try {
    const { tourBookingId, travellerIds = [] } = req.body;

    // Validate input
    if (
      !tourBookingId ||
      !Array.isArray(travellerIds) ||
      travellerIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "tourBookingId and travellerIds[] are required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(tourBookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const releasedTravellers = [];
    const notFoundTravellers = [];
    const notEligibleTravellers = [];

    const idsSet = new Set(travellerIds.map(String));

    // Process travellers
    booking.travellers = booking.travellers.map((traveller) => {
      const travellerIdStr = String(traveller._id);

      if (idsSet.has(travellerIdStr)) {
        const { cancelled } = traveller;

        // Only allow release if cancelled.byTraveller = true AND cancelled.byAdmin = false
        if (cancelled.byTraveller && !cancelled.byAdmin) {
          traveller.cancelled.byTraveller = false;
          traveller.cancelled.releasedAt = new Date();
          releasedTravellers.push(travellerIdStr);
        } else {
          notEligibleTravellers.push(travellerIdStr);
        }
      }

      return traveller;
    });

    // Identify travellers not found in booking
    travellerIds.forEach((id) => {
      if (!booking.travellers.some((t) => String(t._id) === String(id))) {
        notFoundTravellers.push(id);
      }
    });

    // If no travellers were released, respond with failure
    if (releasedTravellers.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No travellers released. Only traveller-cancelled (not admin-cancelled) bookings can be released.",
        notFoundTravellers,
        notEligibleTravellers,
      });
    }

    await booking.save();

    res.json({
      success: true,
      message: "Some or all travellers released successfully",
      releasedTravellers,
      notFoundTravellers,
      notEligibleTravellers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//ALL CONTROLLERS RELATED TO CANCLLATION GOT END

//ADD THE MISSING FIELDS TO ALL BOOKINGS IN THE DATABASE (ONE TIME USE API USED IN DB MIGRATION CENTRE)
const addMissingFieldsToAllBookings = async (req, res) => {
  try {
    const totalBookings = await tourBookingModel.countDocuments();

    const result = await tourBookingModel.updateMany(
      {
        $or: [
          { manageBooking: { $exists: false } },
          { dummyField: { $exists: false } },
          { advanceAdminRemarks: { $exists: false } },
          { cancellationRequest: { $exists: false } },
          { cancellationReceipt: { $exists: false } },
          { manageBookingReceipt: { $exists: false } },
          // Add future fields here easily
        ],
      },
      {
        $set: {
          manageBooking: false,
          dummyField: false,
          advanceAdminRemarks: [],
          cancellationRequest: false,
          cancellationReceipt:false,
          manageBookingReceipt:false,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Migration completed successfully!",
      data: {
        totalBookings,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        fieldsEnsured: [
          "manageBooking",
          "dummyField",
          "advanceAdminRemarks",
          "cancellationRequest",
          "cancellationReceipt",
          "manageBookingReceipt"
        ],
      },
    });
  } catch (error) {
    console.error("Migration failed:", error);
    res.status(500).json({
      success: false,
      message: "Migration failed",
      error: error.message,
    });
  }
};

//MANAGE BOOKING RELATED CONTROLLER GET PENDING APPROVALS
const getPendingApprovals = async (req, res) => {
  try {
    const pendingBookings = await manageBookingModel
      .find({
        manageBooking: true,
        raisedBy: true,
      })
      .populate({
        path: "userId",
        select: "name email mobile",
      })
      .populate({
        path: "tourId",
        select: "title destination startDate endDate thumbnail",
      })
      .populate({
        path: "bookingId",
        select:
          "travellers contact bookingType payment receipts bookingDate gvCancellationPool irctcCancellationPool adminRemarks",
        populate: {
          path: "tourId",
          select: "title",
        },
      })
      .sort({ bookingDate: -1 })
      .select("-__v")
      .lean();

    // Ensure travellers in original booking also have _id
    pendingBookings.forEach((mb) => {
      if (mb.bookingId?.travellers) {
        mb.bookingId.travellers = mb.bookingId.travellers.map((t) => ({
          ...t,
          _id: t._id || new mongoose.Types.ObjectId(), // fallback (should never happen)
        }));
      }
    });

    return res.status(200).json({
      success: true,
      message:
        pendingBookings.length > 0
          ? "Pending approvals fetched successfully."
          : "No pending approvals found.",
      count: pendingBookings.length,
      data: pendingBookings,
    });
  } catch (error) {
    console.error("Error in getPendingApprovals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending approvals.",
      error: error.message,
    });
  }
};
//APPROVE THE BOOKING UPDATE REQUEST IN THE MANAGE BOOKING APPROVALS PAGE
// const approveBookingUpdate = async (req, res) => {
//   try {
//     const { bookingId } = req.body;

//     if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid bookingId is required",
//       });
//     }

//     // Step 1: Find manageBooking request
//     const manageBooking = await manageBookingModel
//       .findOne({ bookingId, approvedBy: false, raisedBy: true })
//       .lean();

//     if (!manageBooking) {
//       return res.status(404).json({
//         success: false,
//         message: "No pending update request found for this booking",
//       });
//     }

//     if (manageBooking.approvedBy) {
//       return res.status(400).json({
//         success: false,
//         message: "This update has already been approved",
//       });
//     }

//     // Validate amounts
//     if (
//       manageBooking.updatedAdvance === undefined ||
//       manageBooking.updatedBalance === undefined
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "updatedAdvance and updatedBalance are required",
//       });
//     }

//     // Step 2: Prepare update for tourBooking
//     const updateData = {
//       $set: {
//         "payment.advance.amount": manageBooking.updatedAdvance,
//         "payment.balance.amount": manageBooking.updatedBalance,
//         travellers: manageBooking.travellers, // ← includes _id
//         contact: manageBooking.contact,
//         billingAddress: manageBooking.billingAddress,
//         adminRemarks: manageBooking.adminRemarks || [],
//         manageBooking: false, // reset flag
//       },
//     };

//     // Step 3: Apply update
//     const updatedTourBooking = await tourBookingModel.findByIdAndUpdate(
//       bookingId,
//       updateData,
//       { new: true, runValidators: true }
//     );

//     if (!updatedTourBooking) {
//       return res.status(404).json({
//         success: false,
//         message: "Original booking not found",
//       });
//     }

//     // Step 4: Mark manageBooking as approved
//     await manageBookingModel.findOneAndUpdate(
//       { _id: manageBooking._id },
//       { $set: { approvedBy: true, raisedBy: false, manageBooking: false } }
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Booking update approved and applied successfully",
//       data: {
//         updatedBooking: updatedTourBooking,
//         approvedRequestId: manageBooking._id,
//       },
//     });
//   } catch (error) {
//     console.error("Error in approveBookingUpdate:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };
//APPROVE THE BOOKING UPDATE REQUEST IN THE MANAGE BOOKING APPROVALS PAGE
const approveBookingUpdate = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Valid bookingId is required",
      });
    }

    // Step 1: Find manageBooking request
    const manageBooking = await manageBookingModel
      .findOne({ bookingId, approvedBy: false, raisedBy: true })
      .lean();

    if (!manageBooking) {
      return res.status(404).json({
        success: false,
        message: "No pending update request found for this booking",
      });
    }

    if (manageBooking.approvedBy) {
      return res.status(400).json({
        success: false,
        message: "This update has already been approved",
      });
    }

    // Validate amounts
    if (
      manageBooking.updatedAdvance === undefined ||
      manageBooking.updatedBalance === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "updatedAdvance and updatedBalance are required",
      });
    }

    // Step 2: Prepare update for tourBooking
    const updateData = {
      $set: {
        "payment.advance.amount": manageBooking.updatedAdvance,
        "payment.balance.amount": manageBooking.updatedBalance,
        travellers: manageBooking.travellers, // ← includes _id
        contact: manageBooking.contact,
        billingAddress: manageBooking.billingAddress,
        adminRemarks: manageBooking.adminRemarks || [],
        manageBooking: false, // reset flag
        manageBookingReceipt: true,
      },
    };

    // Step 3: Apply update
    const updatedTourBooking = await tourBookingModel.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedTourBooking) {
      return res.status(404).json({
        success: false,
        message: "Original booking not found",
      });
    }

    // Step 4: Mark manageBooking as approved
    await manageBookingModel.findOneAndUpdate(
      { _id: manageBooking._id },
      { $set: { approvedBy: true, raisedBy: false, manageBooking: false } }
    );

    return res.status(200).json({
      success: true,
      message: "Booking update approved and applied successfully",
      data: {
        updatedBooking: updatedTourBooking,
        approvedRequestId: manageBooking._id,
      },
    });
  } catch (error) {
    console.error("Error in approveBookingUpdate:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
//REJECT THE BOOKING UPDATE REQUEST IN THE MANAGE BOOKING APPROVALS PAGE
const rejectBookingUpdate = async (req, res) => {
  try {
    const { bookingId, remark } = req.body; // remark is optional

    // --- 1. Validate bookingId ---
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Valid bookingId is required",
      });
    }

    // --- 2. Find the pending manageBooking request ---
    const manageBooking = await manageBookingModel
      .findOne({
        bookingId,
        approvedBy: false,
        manageBooking: true,
      })
      .lean();

    if (!manageBooking) {
      return res.status(404).json({
        success: false,
        message: "No pending update request found for this booking",
      });
    }

    // --- 3. Prepare update: reject the request ---
    const updatePayload = {
      $set: {
        manageBooking: false,
        raisedBy: false,
        // Optional: mark as rejected (you can add a field if needed)
      },
      $push: {
        adminRemarks: {
          remark: remark || "Update request rejected by admin",
          amount: 0,
          addedAt: new Date(),
        },
      },
    };

    // --- 4. Apply the update ---
    const updated = await manageBookingModel.findByIdAndUpdate(
      manageBooking._id,
      updatePayload,
      { new: true, runValidators: true }
    );

    // --- 5. Success response ---
    return res.status(200).json({
      success: true,
      message: "Booking update request rejected successfully",
      data: {
        rejectedRequestId: updated._id,
        bookingId: updated.bookingId,
      },
    });
  } catch (error) {
    console.error("rejectBookingUpdate error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



//GET ALL USERS DATA FOR ALL USERS PAGE
const getAllUsers = async (req, res) => {
  try {
    const users = await userModel
      .find({})
      .select("name email phone address gender dob image createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: users.length,
      users,  // ← முக்கியம்: "users" key தான் தரணும்
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};




const adminBookingsTour = async (req, res) => {
  try {
    // Get the tourId from the URL parameter
    const tourId = req.params.tourId;

    if (!tourId) {
      return res
        .status(400)
        .json({ success: false, message: "Tour ID is missing" });
    }

    const bookings = await tourBookingModel
      .find({ tourId })
      .populate({
        path: "userId",
        model: "user",
        select: "-password",
      })
      .populate({
        path: "tourId",
        model: "tour",
      });

    res.json({
      success: true,
      total: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const adminTourList = async (req, res) => {
  try {
    const tours = await tourModel
      .find({})
      .sort({
        // 1. lastBookingDate year (descending) – newest year first
        "lastBookingDate": -1,
        // 2. same year la irundha createdAt newest first
        "createdAt": -1
      })
      .lean();

    res.json({
      success: true,
      total: tours.length,
      tours,
    });
  } catch (error) {
    console.error("Error in tourList:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch all tours",
      error: error.message,
    });
  }
};

//ADMIN ROOM LIST HELPER FUNCTION AND CONTROLLERS

// === Helper Functions ===
const getBasicTravelerInfo = (t) => ({
  title: t.title,
  firstName: t.firstName,
  lastName: t.lastName,
  age: t.age,
  gender: t.gender,
  sharingType: t.sharingType,
});
const assignRoomNumbers = (rooms) =>
  rooms.map((r, i) => ({ ...r, roomNumber: i + 1 }));


const adminAllotRooms = async (req, res) => {
  try {
    const { tourId } = req.params;
    if (!tourId || !mongoose.Types.ObjectId.isValid(tourId)) {
      return res.status(400).json({ error: "Valid tourId is required" });
    }

    const objectTourId = new mongoose.Types.ObjectId(tourId);

    const bookings = await tourBookingModel
      .find({
        tourId: objectTourId,
        "cancelled.byAdmin": false,
        "cancelled.byTraveller": false,
      })
      .lean();

    if (bookings.length === 0) {
      return res.json({
        tourId,
        unpaidGuests: [],
        roomAllocations: [],
        message: "No active bookings found for this tour.",
      });
    }

    // === Separate paid and unpaid ===
    const paidBookings = bookings.filter(
      (b) => b.payment.advance.paid && b.payment.advance.paymentVerified
    );

    const unpaidBookings = bookings.filter(
      (b) => !b.payment.advance.paid || !b.payment.advance.paymentVerified
    );

    const unpaidGuests = [];
    unpaidBookings.forEach((booking) => {
      booking.travellers.forEach((traveller) => {
        if (!traveller.cancelled.byAdmin && !traveller.cancelled.byTraveller) {
          unpaidGuests.push({
            bookingId: booking._id.toString(),
            ...getBasicTravelerInfo(traveller),
          });
        }
      });
    });

    const rawRoomEntries = [];

    // Track allocated travellers to prevent duplicates
    const allocatedTravellerIds = new Set();

    const createOccupant = (t, mobile) => ({
      firstName: t.firstName,
      lastName: t.lastName,
      gender: t.gender,
      mobile,
      travellerId: t._id?.toString(),
      sharingType: t.sharingType,
      originalIndex: t.originalIndex, // Preserve original order
    });

    // === Step 1: Group by mobile number (Family/Friends - Case 6) ===
    const mobileGroups = new Map();

    paidBookings.forEach((booking) => {
      const active = booking.travellers.filter(
        (t) => !t.cancelled.byAdmin && !t.cancelled.byTraveller
      );
      // Preserve original order in travellers array
      active.forEach((t, index) => {
        t.originalIndex = index; // Add original index for sorting later
      });
      const mobile = booking.contact.mobile;

      if (!mobileGroups.has(mobile)) mobileGroups.set(mobile, []);
      active.forEach((t) => {
        mobileGroups.get(mobile).push({
          traveller: t,
          bookingId: booking._id.toString(),
        });
      });
    });

    // === Step 2: Process each mobile group ===
    for (const [mobile, groupItems] of mobileGroups) {
      // Sort groupItems by original traveller index to maintain order
      groupItems.sort(
        (a, b) => a.traveller.originalIndex - b.traveller.originalIndex
      );

      const travellers = groupItems.map((i) => i.traveller);
      const bookingIds = [...new Set(groupItems.map((i) => i.bookingId))];

      if (travellers.length === 0) continue;

      const sharingTypes = [...new Set(travellers.map((t) => t.sharingType))];
      const isUniformSharing =
        sharingTypes.length === 1 &&
        ["double", "triple"].includes(sharingTypes[0]);

      const isMarriedCouple =
        travellers.length === 2 &&
        travellers[0].gender !== travellers[1].gender &&
        travellers.every((t) => t.sharingType === "double");

      const rooms = [];

      // === Husband & Wife Rule ===
      if (isMarriedCouple) {
        rooms.push({
          sharingType: "double",
          occupants: travellers.map((t) => createOccupant(t, mobile)),
        });
      }
      // === Other cases: Mixed or Uniform sharing — allocate full groups in original order ===
      else {
        // Group by sharing type while maintaining order
        const bySharing = {};
        travellers.forEach((t) => {
          const key = t.sharingType;
          if (!bySharing[key]) bySharing[key] = [];
          bySharing[key].push(t);
        });

        Object.keys(bySharing).forEach((type) => {
          if (!["double", "triple"].includes(type)) return;

          const list = bySharing[type];
          const capacity = type === "double" ? 2 : 3;

          let i = 0;
          while (i < list.length) {
            const remaining = list.length - i;
            if (remaining >= capacity) {
              const group = list.slice(i, i + capacity);
              rooms.push({
                sharingType: type,
                occupants: group.map((t) => createOccupant(t, mobile)),
              });
              i += capacity;
            } else {
              i += remaining; // Leave remainder
            }
          }
        });

        // Add children in original order to first adult room
        const children = travellers.filter(
          (t) =>
            t.sharingType === "withBerth" || t.sharingType === "withoutBerth"
        );
        if (children.length > 0 && rooms.length > 0) {
          children.forEach((child) => {
            rooms[0].occupants.push(createOccupant(child, mobile));
          });
          rooms.forEach((room) => {
            const total = room.occupants.length;
            if (total > 3) room.sharingType = "quad";
            else if (total > 2) room.sharingType = "triple";
          });
        }
      }

      if (rooms.length > 0) {
        rawRoomEntries.push({
          bookingId: bookingIds[0],
          contactMobile: mobile,
          rooms: assignRoomNumbers(rooms),
        });

        rooms.forEach((room) => {
          room.occupants.forEach((occ) => {
            if (occ.travellerId) allocatedTravellerIds.add(occ.travellerId);
          });
        });
      }
    }

    // === Step 3: Global pooling for remainders (preserve order within same sharing/gender) ===
    const remainderPool = {};

    paidBookings.forEach((booking) => {
      booking.travellers.forEach((t, index) => {
        if (
          !t.cancelled.byAdmin &&
          !t.cancelled.byTraveller &&
          t._id &&
          !allocatedTravellerIds.has(t._id.toString()) &&
          ["double", "triple"].includes(t.sharingType)
        ) {
          t.originalIndex = index; // Preserve order
          const key = `${t.sharingType}-${t.gender}`;
          if (!remainderPool[key]) remainderPool[key] = [];
          remainderPool[key].push({
            traveller: t,
            mobile: booking.contact.mobile,
            bookingId: booking._id.toString(),
          });
        }
      });
    });

    Object.keys(remainderPool).forEach((key) => {
      const [sharingType, gender] = key.split("-");
      const capacity = sharingType === "double" ? 2 : 3;
      let list = remainderPool[key];
      if (list.length === 0) return;

      // Sort by original traveller index to keep order as much as possible
      list.sort(
        (a, b) => a.traveller.originalIndex - b.traveller.originalIndex
      );

      const rooms = [];
      let i = 0;
      while (i < list.length) {
        const take = Math.min(capacity, list.length - i);
        const occupants = list
          .slice(i, i + take)
          .map((item) => createOccupant(item.traveller, item.mobile));
        rooms.push({
          sharingType:
            take === capacity ? sharingType : take === 2 ? "double" : "single",
          occupants,
        });
        i += take;
      }

      if (rooms.length > 0) {
        rawRoomEntries.push({
          bookingId: list[0].bookingId,
          contactMobile: list[0].mobile,
          rooms: assignRoomNumbers(rooms),
        });

        rooms.forEach((room) => {
          room.occupants.forEach((occ) => {
            if (occ.travellerId) allocatedTravellerIds.add(occ.travellerId);
          });
        });
      }
    });

    // === Step 4: Final single room reduction (same gender only) ===
    const singleRooms = [];
    rawRoomEntries.forEach((entry, entryIndex) => {
      entry.rooms = entry.rooms.filter((room) => {
        if (room.sharingType === "single") {
          singleRooms.push({
            entryIndex,
            room,
            contactMobile: entry.contactMobile,
            bookingId: entry.bookingId,
          });
          return false;
        }
        return true;
      });
    });

    const tripleSingles = { male: [], female: [] };
    const doubleSingles = { male: [], female: [] };

    singleRooms.forEach((single) => {
      const occupant = single.room.occupants[0];
      const gender = occupant.gender.toLowerCase();
      const original = occupant.sharingType;
      if (original === "triple") tripleSingles[gender].push(single);
      else if (original === "double") doubleSingles[gender].push(single);
    });

    ["male", "female"].forEach((gender) => {
      while (
        tripleSingles[gender].length > 0 &&
        doubleSingles[gender].length > 0
      ) {
        const tripleSingle = tripleSingles[gender].pop();
        const doubleSingle = doubleSingles[gender].pop();

        const newRoom = {
          sharingType: "double",
          occupants: [
            ...tripleSingle.room.occupants,
            ...doubleSingle.room.occupants,
          ],
        };

        rawRoomEntries[tripleSingle.entryIndex].rooms.push(newRoom);
      }

      tripleSingles[gender].forEach((r) =>
        rawRoomEntries[r.entryIndex].rooms.push(r.room)
      );
      doubleSingles[gender].forEach((r) =>
        rawRoomEntries[r.entryIndex].rooms.push(r.room)
      );
    });

    // === Final Grouping by Mobile ===
    const mobileMap = new Map();
    rawRoomEntries.forEach((entry) => {
      const mobile = entry.contactMobile || "0000000000";
      if (!mobileMap.has(mobile)) {
        mobileMap.set(mobile, {
          contactMobile: mobile,
          bookingIds: new Set(),
          rooms: [],
        });
      }
      const g = mobileMap.get(mobile);
      g.bookingIds.add(entry.bookingId);
      g.rooms.push(...entry.rooms);
    });

    const groupedByMobile = Array.from(mobileMap.values())
      .map((g) => ({
        contactMobile: g.contactMobile,
        bookingIds: Array.from(g.bookingIds),
        rooms: g.rooms.map((r, i) => ({ ...r, roomNumber: i + 1 })),
      }))
      .sort((a, b) => a.contactMobile.localeCompare(b.contactMobile));

    // === Check existing finalized allocation ===
    const existing = await tourRoomAllocationModel.findOne({
      tourId: objectTourId,
    });

    if (existing && existing.isFinalized) {
      const flat = existing.groupedByMobile.flatMap((g) =>
        g.rooms.map((r) => ({
          contactMobile: g.contactMobile,
          bookingIds: g.bookingIds,
          roomNumber: r.roomNumber,
          sharingType: r.sharingType,
          occupants: r.occupants.map((o) => ({
            firstName: o.firstName,
            lastName: o.lastName,
            gender: o.gender,
          })),
        }))
      );

      return res.json({
        tourId,
        unpaidGuests,
        roomAllocations: flat,
        groupedByMobile: existing.groupedByMobile,
        totalRooms: flat.length,
        totalGroups: existing.groupedByMobile.length,
        saved: false,
        message: "Finalized allocation displayed with updated unpaid guests.",
      });
    }

    // === Save new allocation ===
    await tourRoomAllocationModel.findOneAndUpdate(
      { tourId: objectTourId },
      {
        tourId: objectTourId,
        groupedByMobile,
        grouped: true,
        isFinalized: false,
      },
      { upsert: true, new: true }
    );

    const responseRooms = groupedByMobile.flatMap((g) =>
      g.rooms.map((r) => ({
        contactMobile: g.contactMobile,
        bookingIds: g.bookingIds,
        roomNumber: r.roomNumber,
        sharingType: r.sharingType,
        occupants: r.occupants.map((o) => ({
          firstName: o.firstName,
          lastName: o.lastName,
          gender: o.gender,
        })),
      }))
    );

    res.json({
      tourId,
      unpaidGuests,
      roomAllocations: responseRooms,
      groupedByMobile,
      totalRooms: responseRooms.length,
      totalGroups: groupedByMobile.length,
      saved: true,
      message:
        "Room allotment completed successfully (travellers in original order).",
    });
  } catch (error) {
    console.error("Room allotment error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};






//Rejects booking from booking rejection section
const bookingRejectAdmin = async (req, res) => {
  try {
    const { tourBookingId, travellerIds = [] } = req.body;

    // Validate input
    if (
      !tourBookingId ||
      !Array.isArray(travellerIds) ||
      travellerIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "tourBookingId and travellerIds[] are required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(tourBookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Extract balance prices
    const balanceDouble = Number(booking.tourData?.balanceDouble) || 0;
    const balanceTriple = Number(booking.tourData?.balanceTriple) || 0;

    // Payment status (used for deduction logic only)
    const advancePaid =
      booking.payment.advance.paid && booking.payment.advance.paymentVerified;
    const balancePaid =
      booking.payment.balance.paid && booking.payment.balance.paymentVerified;

    // Normalize IDs
    const idsSet = new Set(travellerIds.map(String));

    // Check for travellers that block rejection
    const cancelledByTraveller = [];
    const alreadyRejectedTravellers = [];
    const missingTravellers = [];

    travellerIds.forEach((id) => {
      const traveller = booking.travellers.find(
        (t) => String(t._id) === String(id)
      );
      if (!traveller) {
        missingTravellers.push(id);
      } else if (traveller.cancelled.byTraveller) {
        cancelledByTraveller.push(id);
      } else if (traveller.cancelled.byAdmin) {
        alreadyRejectedTravellers.push(id);
      }
    });

    // Strict mode: Block if any blocking conditions exist
    if (
      cancelledByTraveller.length > 0 ||
      alreadyRejectedTravellers.length === travellerIds.length ||
      missingTravellers.length === travellerIds.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Rejection not allowed due to invalid traveller state.",
        cancelledByTraveller,
        alreadyRejected: alreadyRejectedTravellers,
        missingTravellers,
      });
    }

    // Proceed with valid travellers
    let totalDeduction = 0;
    const rejectedTravellers = [];

    booking.travellers = booking.travellers.map((traveller) => {
      const travellerIdStr = String(traveller._id);

      if (idsSet.has(travellerIdStr)) {
        traveller.cancelled.byAdmin = true;
        traveller.cancelled.cancelledAt = new Date();

        rejectedTravellers.push(traveller);

        // Deduct only if advance paid AND balance not paid
        if (advancePaid && !balancePaid) {
          if (traveller.sharingType === "double") {
            totalDeduction += balanceDouble;
          } else if (traveller.sharingType === "triple") {
            totalDeduction += balanceTriple;
          }
        }
      }

      return traveller;
    });

    // Update balance only if deduction is applicable
    if (totalDeduction > 0) {
      booking.payment.balance.amount = Math.max(
        booking.payment.balance.amount - totalDeduction,
        0
      );
    }

    await booking.save();

    res.json({
      success: true,
      message: "Traveller(s) rejected successfully",
      updatedBalance: booking.payment.balance.amount,
      rejectedTravellers: rejectedTravellers.map((t) => String(t._id)),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};
export {
  loginAdmin,
  allTours,
  changeTourAvailability,
  addTour,
  tourAdminDashboard,
  bookingsAdmin,
  getBookings,
  getCancellationChart,
  upsertCancellationChart,
  getCancellations,
  approveCancellation,
  rejectCancellation,
  bookingRelease,
  addMissingFieldsToAllBookings,
  getPendingApprovals,
  approveBookingUpdate,
  rejectBookingUpdate,
  getAllUsers,
  adminBookingsTour,
  adminTourList,
  adminAllotRooms,
  bookingRejectAdmin,  
};

