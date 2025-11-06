import validator from "validator";
import mongoose from "mongoose";

import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import tourModel from "../models/tourModel.js";
import userModel from "../models/userModel.js";
import tourBookingModel from "../models/tourBookingmodel.js";
import cancelRuleModel from "../models/cancelRuleModel.js";
import cancellationModel from "../models/cancellationModel.js";

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

//API to get all appointments list

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

const bookingCancelAdmin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { tourBookingId, travellerIds = [] } = req.body;

    if (
      !tourBookingId ||
      !Array.isArray(travellerIds) ||
      travellerIds.length === 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "tourBookingId and travellerIds[] are required",
      });
    }

    const booking = await tourBookingModel
      .findById(tourBookingId)
      .session(session);
    if (!booking) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    // Prices & payment state
    const balanceDouble = Number(booking.tourData?.balanceDouble) || 0;
    const balanceTriple = Number(booking.tourData?.balanceTriple) || 0;
    const advancePaid =
      booking.payment.advance.paid && booking.payment.advance.paymentVerified;
    const balancePaid =
      booking.payment.balance.paid && booking.payment.balance.paymentVerified;

    // ❗ New check: Advance must be paid before allowing admin cancellation
    if (!advancePaid) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          "User has not completed advance payment, cancellation cannot proceed.",
      });
    }

    // Normalise to string IDs
    const idsSet = new Set(travellerIds.map(String));

    // Check that all provided travellers exist on this booking
    const targetTravellers = booking.travellers.filter((t) =>
      idsSet.has(String(t._id))
    );
    const missingIds = travellerIds.filter(
      (id) => !booking.travellers.some((t) => String(t._id) === String(id))
    );
    if (missingIds.length > 0) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Some travellerIds do not belong to this booking",
        missingTravellerIds: missingIds,
      });
    }

    // Strict rule: every target must have been cancelled by the user first
    const notCancelledByUser = targetTravellers.filter(
      (t) => !t.cancelled?.byTraveller
    );
    const alreadyAdminCancelled = targetTravellers.filter(
      (t) => t.cancelled?.byAdmin
    );

    if (notCancelledByUser.length > 0 || alreadyAdminCancelled.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          "Admin cancellation allowed only for travellers cancelled by user and not already admin-cancelled.",
        details: {
          notCancelledByUser: notCancelledByUser.map((t) => String(t._id)),
          alreadyCancelledByAdmin: alreadyAdminCancelled.map((t) =>
            String(t._id)
          ),
        },
      });
    }

    // Apply admin cancellation + compute deduction
    let totalDeduction = 0;
    const now = new Date();

    booking.travellers.forEach((t) => {
      if (idsSet.has(String(t._id))) {
        t.cancelled.byAdmin = true;
        t.cancelled.cancelledAt = now;

        if (!balancePaid) {
          if (t.sharingType === "double") totalDeduction += balanceDouble;
          else if (t.sharingType === "triple") totalDeduction += balanceTriple;
        }
      }
    });

    if (totalDeduction > 0) {
      booking.payment.balance.amount = Math.max(
        booking.payment.balance.amount - totalDeduction,
        0
      );
    }

    await booking.save({ session });
    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Admin cancellation completed",
      updatedBalance: booking.payment.balance.amount,
      cancelledTravellers: targetTravellers.map((t) => String(t._id)),
    });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

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

// UPSERT
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

/**
 * GET /touradmingetcancelrule
 * Returns pending cancellation requests:
 *   - raisedBy = true
 *   - approvedBy = false
 *   - at least one traveller cancelled by the traveller (not by admin)
 */
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
/**
 * POST /touradmin/approvecancellation
 * Body: { bookingId, travellerIds: [...] }
 *
 * 1. Updates tourBooking.payment.balance.amount = cancellation.updatedBalance
 * 2. Sets cancelled.byAdmin = true for ALL given travellerIds
 * 3. Sets cancellation.raisedBy = false, approvedBy = true
 */
const approveCancellation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId, travellerIds } = req.body;

    // === VALIDATION ===
    if (
      !bookingId ||
      !Array.isArray(travellerIds) ||
      travellerIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "bookingId and travellerIds array are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid bookingId" });
    }

    const invalidIds = travellerIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid travellerId(s)",
        invalidIds,
      });
    }

    // === FETCH BOOKING WITH TRAVELLERS & CURRENT POOLS ===
    const booking = await tourBookingModel
      .findById(bookingId)
      .select("travellers gvCancellationPool irctcCancellationPool")
      .session(session)
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // === VALIDATE TRAVELLERS: Must be cancelled by traveller, not by admin ===
    const validTravellerIds = booking.travellers
      .filter(
        (t) =>
          t.cancelled?.byTraveller === true && t.cancelled?.byAdmin !== true
      )
      .map((t) => t._id.toString());

    const requestedIds = travellerIds.map((id) => id.toString());
    const notMatching = requestedIds.filter(
      (id) => !validTravellerIds.includes(id)
    );

    if (notMatching.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cancelled traveller(s) not matching with booking",
        mismatchedIds: notMatching,
      });
    }

    // === FIND CANCELLATION REQUEST ===
    const cancellation = await cancellationModel
      .findOne({
        bookingId,
        travellerIds: {
          $all: travellerIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      })
      .session(session);

    if (!cancellation) {
      return res.status(404).json({
        success: false,
        message: "Cancellation request not found",
      });
    }

    if (cancellation.approvedBy && cancellation.raisedBy) {
      return res.status(400).json({
        success: false,
        message: "Cancellation already approved",
      });
    }

    // === CALCULATE POOL ADDITIONS ===
    const gvAdd =
      (cancellation.gvCancellationAmount || 0) +
      (cancellation.remarksAmount || 0);
    const irctcAdd = cancellation.irctcCancellationAmount || 0;

    const newGvPool = (cancellation.gvCancellationPool || 0) + gvAdd;
    const newIrctcPool = (cancellation.irctcCancellationPool || 0) + irctcAdd;

    // === ALSO UPDATE BOOKING POOLS ===
    const bookingNewGvPool = (booking.gvCancellationPool || 0) + gvAdd;
    const bookingNewIrctcPool = (booking.irctcCancellationPool || 0) + irctcAdd;

    // === BUILD $set AND arrayFilters FOR BOOKING ===
    const setObj = {
      "payment.balance.amount": cancellation.updatedBalance,
      gvCancellationPool: bookingNewGvPool,
      irctcCancellationPool: bookingNewIrctcPool,
    };
    const arrayFilters = [];

    travellerIds.forEach((id, idx) => {
      const filterName = `trav${idx}`;
      setObj[`travellers.$[${filterName}].cancelled.byAdmin`] = true;
      setObj[`travellers.$[${filterName}].cancelled.cancelledAt`] = new Date();
      arrayFilters.push({
        [`${filterName}._id`]: new mongoose.Types.ObjectId(id),
      });
    });

    // === UPDATE BOOKING (with pools) ===
    const updatedBooking = await tourBookingModel.findByIdAndUpdate(
      bookingId,
      { $set: setObj },
      {
        arrayFilters,
        new: true,
        session,
      }
    );

    if (!updatedBooking) throw new Error("Failed to update booking");

    // === UPDATE CANCELLATION: Approve + Update Pools ===
    await cancellationModel.findByIdAndUpdate(
      cancellation._id,
      {
        raisedBy: false,
        approvedBy: true,
        gvCancellationPool: newGvPool,
        irctcCancellationPool: newIrctcPool,
      },
      { session }
    );

    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Cancellation approved successfully",
      data: {
        bookingId,
        travellerIds,
        newBalanceAmount: cancellation.updatedBalance,
        updatedPools: {
          gvCancellationPool: bookingNewGvPool,
          irctcCancellationPool: bookingNewIrctcPool,
        },
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("approveCancellation error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};
/**
 * POST /touradmin/rejectcancellation
 * Body: { bookingId, travellerIds: [...], cancellationId }
 *
 * 1. Sets cancellation.raisedBy = false
 * 2. Sets travellers.cancelled.byTraveller = false for given travellerIds
 */
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
        rejectedAt: new Date(), // optional: for audit
        // DO NOT touch: approvedBy, booking, travellers
      },
      { session }
    );

    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Cancellation request rejected successfully",
      data: {
        bookingId,
        travellerIds,
        cancellationId,
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
export {
  addTour,
  loginAdmin,
  allTours,
  bookingsAdmin,
  bookingCancelAdmin,
  bookingRejectAdmin,
  bookingRelease,
  tourAdminDashboard,
  upsertCancellationChart,
  getCancellationChart,
  getCancellations,
  approveCancellation,
  rejectCancellation,
};
