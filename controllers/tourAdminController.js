import validator from "validator";
import mongoose from "mongoose";

import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import tourModel from "../models/tourModel.js";
import userModel from "../models/userModel.js";
import tourBookingModel from "../models/tourBookingmodel.js";

const addTour = async (req, res) => {
  try {
    const {
      title,
      email,
      password,
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
      addons, // Optional
      remarks, // Optional
      boardingPoints, // Optional
    } = req.body;

    const files = req.files || {};
    const titleImage = files.titleImage?.[0];
    const mapImage = files.mapImage?.[0];
    const galleryImages = files.galleryImages || [];
    if (
      !title ||
      !email ||
      !password ||
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
      galleryImages.length === 0 || // <-- FIXED
      !lastBookingDate ||
      !advanceAmount
    ) {
      return res.json({
        success: false,
        message: "Missing required tour details",
      });
    }

    // 2️⃣ Validate email and password
    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: "Invalid email format" });
    }
    if (password.length < 8) {
      return res.json({ success: false, message: "Password too short" });
    }

    // 3️⃣ Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4️⃣ Upload images to Cloudinary
    const uploadImage = async (file) => {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: "image",
      });
      return result.secure_url;
    };

    const titleImageUrl = await uploadImage(titleImage);
    const mapImageUrl = await uploadImage(mapImage);

    const galleryImageUrls = await Promise.all(
      galleryImages.map((img) => uploadImage(img))
    );

    // 5️⃣ Parse fields safely
    const parsedPrice = JSON.parse(price);
    const parsedAdvance = Number(advanceAmount);
    const doubleSharing = Number(parsedPrice.doubleSharing);
    const tripleSharing = Number(parsedPrice.tripleSharing);

    if (isNaN(doubleSharing) || isNaN(tripleSharing) || isNaN(parsedAdvance)) {
      return res.json({
        success: false,
        message: "Invalid number in price or advance amount",
      });
    }

    const balanceDouble = doubleSharing - parsedAdvance;
    const balanceTriple = tripleSharing - parsedAdvance;

    // 6️⃣ Parse addons safely (optional)
    let parsedAddons = [];
    if (addons) {
      try {
        const temp = JSON.parse(addons);
        if (Array.isArray(temp)) {
          parsedAddons = temp.map((a) => ({
            name: a.name,
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

    // 7️⃣ Parse boardingPoints safely (optional)
    let parsedBoardingPoints = [];
    if (boardingPoints) {
      try {
        const temp = JSON.parse(boardingPoints);
        if (Array.isArray(temp)) {
          parsedBoardingPoints = temp.map((b) => ({
            stationCode: b.stationCode || "",
            stationName: b.stationName || "",
          }));
        }
      } catch {
        return res.json({
          success: false,
          message: "Invalid format for boarding points",
        });
      }
    }

    // 8️⃣ Create tour
    const tourData = {
      title,
      email,
      password: hashedPassword,
      batch,
      duration: JSON.parse(duration),
      price: parsedPrice,
      destination: JSON.parse(destination),
      sightseeing: JSON.parse(sightseeing),
      itinerary: JSON.parse(itinerary),
      includes: JSON.parse(includes),
      excludes: JSON.parse(excludes),
      trainDetails: trainDetails ? JSON.parse(trainDetails) : [],
      flightDetails: flightDetails ? JSON.parse(flightDetails) : [],
      titleImage: titleImageUrl,
      mapImage: mapImageUrl,
      galleryImages: galleryImageUrls,
      lastBookingDate,
      advanceAmount: parsedAdvance,
      completedTripsCount: completedTripsCount || 0,
      available: available ?? true,
      balanceDouble,
      balanceTriple,
      addons: parsedAddons,
      remarks: remarks || "",
      boardingPoints: parsedBoardingPoints,
    };

    const newTour = new tourModel(tourData);
    await newTour.save();

    res.json({
      success: true,
      message: "Tour added successfully",
    });
  } catch (error) {
    console.log(error);
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

export {
  addTour,
  loginAdmin,
  allTours,
  bookingsAdmin,
  bookingCancelAdmin,
  bookingRejectAdmin,
  bookingRelease,
  tourAdminDashboard,
};
