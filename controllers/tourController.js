import tourModel from "../models/tourModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import tourBookingModel from "../models/tourBookingmodel.js";
import cancellationModel from "../models/cancellationModel.js";
import manageBookingModel from "../models/manageBookingModel.js";

import mongoose from "mongoose"; // Added missing import

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

const tourList = async (req, res) => {
  try {
    const tours = await tourModel.find({});
    res.json({ success: true, tours });
  } catch (error) {
    console.log("Error fetching tours", error);

    res.json({ success: false, message: error.message });
  }
};

const loginTour = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      email === process.env.TOUR_EMAIL &&
      password === process.env.TOUR_PASSWORD
    ) {
      const token = jwt.sign(email + password, process.env.JWT_SECRET);
      return res.json({
        success: true,
        token,
        message: "Tour login successful",
      });
    }

    res.json({
      success: false,
      message: "Invalid credentials",
    });
  } catch (error) {
    console.error("Tour login error:", error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

const bookingsTour = async (req, res) => {
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

const bookingComplete = async (req, res) => {
  try {
    const { bookingId, tourId } = req.body; // Destructure tourId from the request body

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is missing. Please provide a valid booking ID.",
      });
    }

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "Tour ID is missing. Please provide a valid tour ID.",
      });
    }

    // 1. Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "No booking found with the provided booking ID.",
      });
    }

    // 2. Ensure the booking belongs to this tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to modify this booking. It belongs to another tour.",
      });
    }

    // 3. Check if already marked as completed
    if (booking.isBookingCompleted) {
      return res.json({
        success: false,
        message: "This booking is already marked as completed.",
      });
    }

    // 4. Check cancellation conditions
    const allTravellersCancelledValid = booking.travellers.every(
      (traveller) =>
        (traveller.cancelled?.byTraveller === true &&
          traveller.cancelled?.byAdmin === true) ||
        (traveller.cancelled?.byAdmin === true &&
          traveller.cancelled?.byTraveller !== true)
    );

    if (!allTravellersCancelledValid) {
      // 5. Check for travellers with only traveller cancellation
      const travellerCancellationIssues = booking.travellers.filter(
        (traveller) =>
          traveller.cancelled?.byTraveller === true &&
          traveller.cancelled?.byAdmin !== true
      );

      if (travellerCancellationIssues.length > 0) {
        const cancelledTravellersList = travellerCancellationIssues
          .map(
            (t) =>
              `Traveller name: ${t.firstName || "Unnamed"} ${t.lastName || ""}`
          )
          .join(", ");

        return res.json({
          success: false,
          message: `Cancellation in request for the traveller: ${cancelledTravellersList}`,
        });
      }

      // 6. Payment + Receipt checks (only if not all travellers meet cancellation conditions)
      const { advance, balance } = booking.payment;
      const { receipts } = booking;

      // Advance checks
      if (!advance?.paid) {
        return res.json({
          success: false,
          message: "Advance payment has not been made.",
        });
      }
      if (!advance?.paymentVerified) {
        return res.json({
          success: false,
          message: "Advance payment is pending verification.",
        });
      }
      if (!receipts?.advanceReceiptSent) {
        return res.json({
          success: false,
          message: "Advance receipt has not been sent.",
        });
      }

      // Balance checks
      if (!balance?.paid) {
        return res.json({
          success: false,
          message: "Balance payment has not been made.",
        });
      }
      if (!balance?.paymentVerified) {
        return res.json({
          success: false,
          message: "Balance payment is pending verification.",
        });
      }
      if (!receipts?.balanceReceiptSent) {
        return res.json({
          success: false,
          message: "Balance receipt has not been sent.",
        });
      }
    }

    // 7. Mark booking as completed
    booking.isBookingCompleted = true;
    booking.bookingCompletedAt = new Date();

    await booking.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: "Booking marked as completed successfully.",
    });
  } catch (error) {
    console.error("bookingComplete error:", error);
    return res.json({
      success: false,
      message: `An unexpected error occurred: ${error.message}`,
    });
  }
};

const markOfflineAdvancePaid = async (req, res) => {
  try {
    const { bookingId, tourId } = req.body; // Destructure tourId from the request body

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    // Check if tourId is provided
    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId is required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Ensure the booking belongs to the selected tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // 1. Check if booking type is offline
    if (booking.bookingType !== "offline") {
      return res.status(400).json({
        success: false,
        message: "Only offline bookings can be marked as advance paid",
      });
    }

    // 2. Check traveller cancellation conditions
    const hasTravellerCancelled = booking.travellers.some(
      (traveller) => traveller.cancelled?.byTraveller === true
    );
    const hasAdminCancelled = booking.travellers.some(
      (traveller) => traveller.cancelled?.byAdmin === true
    );

    if (hasTravellerCancelled && hasAdminCancelled) {
      return res.status(400).json({
        success: false,
        message:
          "Booking already cancelled by user and approved by admin, cannot proceed",
      });
    }

    if (hasTravellerCancelled) {
      return res.status(400).json({
        success: false,
        message: "Traveller already requested for cancellation",
      });
    }

    if (hasAdminCancelled) {
      return res.status(400).json({
        success: false,
        message: "Booking already rejected by admin",
      });
    }

    // 3. Payment checks
    const { advance, balance } = booking.payment;

    if (advance?.paid && balance?.paid) {
      return res.status(400).json({
        success: false,
        message: "Advance and balance are already completed",
      });
    }

    if (advance?.paid) {
      return res.status(400).json({
        success: false,
        message: "Advance payment is already marked as completed",
      });
    }

    // 4. Mark advance as paid

    booking.payment.advance.paid = true;
    booking.payment.advance.paymentVerified = true;
    booking.payment.advance.paidAt = new Date();

    await booking.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message: "Offline booking advance marked as paid successfully",
      booking,
    });
  } catch (error) {
    console.error("markOfflineAdvancePaid error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const markOfflineBalancePaid = async (req, res) => {
  try {
    const { bookingId, tourId } = req.body; // Destructure tourId from the request body

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId is required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Ensure the booking belongs to the selected tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // 1. Check if booking type is offline
    if (booking.bookingType !== "offline") {
      return res.status(400).json({
        success: false,
        message: "Only offline bookings can be marked as balance paid",
      });
    }

    // 2. Check cancellation conditions
    const allTravellersCancelledValid = booking.travellers.every(
      (traveller) =>
        (traveller.cancelled?.byTraveller === true &&
          traveller.cancelled?.byAdmin === true) ||
        (traveller.cancelled?.byAdmin === true &&
          traveller.cancelled?.byTraveller !== true)
    );

    if (!allTravellersCancelledValid) {
      // 3. Check for travellers with only traveller cancellation
      const travellerCancellationIssues = booking.travellers.filter(
        (traveller) =>
          traveller.cancelled?.byTraveller === true &&
          traveller.cancelled?.byAdmin !== true
      );

      if (travellerCancellationIssues.length > 0) {
        const cancelledTravellersList = travellerCancellationIssues
          .map(
            (t) =>
              `Traveller name: ${t.firstName || "Unnamed"} ${t.lastName || ""}`
          )
          .join(", ");

        return res.status(400).json({
          success: false,
          message: `Cancellation in request for the traveller: ${cancelledTravellersList}`,
        });
      }

      // 4. Payment checks (only if not all travellers meet cancellation conditions)
      const { advance, balance } = booking.payment;

      if (advance?.paid && balance?.paid) {
        return res.status(400).json({
          success: false,
          message: "Advance and balance are already completed",
        });
      }

      if (balance?.paid) {
        return res.status(400).json({
          success: false,
          message: "Balance payment is already marked as completed",
        });
      }

      // Ensure advance is paid, verified, and advance receipt sent
      if (!advance?.paid || !advance?.paymentVerified) {
        return res.status(400).json({
          success: false,
          message:
            "Advance payment must be paid and verified before marking balance as paid",
        });
      }

      if (!booking.receipts?.advanceReceiptSent) {
        return res.status(400).json({
          success: false,
          message:
            "Advance receipt must be sent before marking balance as paid",
        });
      }
    }

    // 5. Mark balance as paid
    booking.payment.balance.paid = true;
    booking.payment.balance.paymentVerified = true;
    booking.payment.balance.paidAt = new Date();

    await booking.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message: "Offline booking balance marked as paid successfully",
      booking,
    });
  } catch (error) {
    console.error("markOfflineBalancePaid error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
// Update traveller-specific data in a booking
const updateTraveller = async (req, res) => {
  try {
    const { bookingId, travellerId, trainSeats, flightSeats, staffRemarks } =
      req.body;

    const updatedBooking = await tourBookingModel.findOneAndUpdate(
      { _id: bookingId, "travellers._id": travellerId },
      {
        $set: {
          "travellers.$.trainSeats": trainSeats,
          "travellers.$.flightSeats": flightSeats,
          "travellers.$.staffRemarks": staffRemarks,
        },
      },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking or traveller not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Traveller details updated successfully",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Error updating traveller details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// New Controller Function
const tourDashboard = async (req, res) => {
  try {
    // Get the tourId from the URL parameter
    const tourId = req.params.tourId;

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId is required",
      });
    }

    // Fetch all bookings for the specified tourId
    const bookings = await tourBookingModel.find({ tourId });

    if (!bookings || bookings.length === 0) {
      // You can decide whether to send a 404 or a 200 with an empty array
      return res.status(200).json({
        success: true,
        data: {
          totalEarnings: 0,
          totalTravellers: 0,
          totalUsers: 0,
          bookings: [],
        },
      });
    }

    let totalEarnings = 0;
    let totalTravellers = 0;
    let uniqueUsers = new Set();

    bookings.forEach((booking) => {
      if (booking.payment?.advance?.paid && booking.payment?.balance?.paid) {
        totalEarnings +=
          booking.payment.advance.amount + booking.payment.balance.amount;
      }
      if (Array.isArray(booking.travellers)) {
        totalTravellers += booking.travellers.length;
      }
      if (booking.userId) {
        uniqueUsers.add(booking.userId.toString());
      }
    });

    res.json({
      success: true,
      data: {
        totalEarnings,
        totalTravellers,
        totalUsers: uniqueUsers.size,
        bookings,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const tourProfile = async (req, res) => {
  try {
    const { tourId } = req.params; // Get tourId from URL parameters

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "Tour ID is missing from the URL.",
      });
    }

    const tourProfileData = await tourModel
      .findById(tourId)
      .select("-password");

    if (!tourProfileData) {
      return res.status(404).json({
        success: false,
        message: "Tour profile not found.",
      });
    }

    res.status(200).json({
      success: true,
      tourProfileData,
    });
  } catch (error) {
    console.error("tourProfile error:", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
    });
  }
};

const updateTourProfile = async (req, res) => {
  try {
    const { tourId } = req.body; // Get tourId from the request body
    if (!tourId) {
      return res.json({ success: false, message: "Tour ID is missing" });
    }

    const tour = await tourModel.findById(tourId);
    if (!tour) {
      return res.json({ success: false, message: "Tour not found" });
    }

    // 1. Destructure and get files
    const { titleImage, mapImage, galleryImages } = req.files || {};

    // 2. Image upload helper
    const uploadImage = async (file) => {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: "image",
      });
      return result.secure_url;
    };

    let updateFields = {};

    // 3. Process images
    if (titleImage) {
      updateFields.titleImage = await uploadImage(titleImage[0]);
    }
    if (mapImage) {
      updateFields.mapImage = await uploadImage(mapImage[0]);
    }
    if (galleryImages) {
      if (galleryImages.length !== 3) {
        return res.json({
          success: false,
          message: "Please upload exactly 3 gallery images",
        });
      }
      updateFields.galleryImages = await Promise.all(
        galleryImages.map((img) => uploadImage(img))
      );
    }

    // 4. Get and parse all body fields, including nested ones
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
      boardingPoints,
      deboardingPoints,
      remarks,
      variantPackage, // New field: array of variant packages
    } = req.body;

    // 5. Use existing data as a fallback for calculations
    let parsedPrice = tour.price;
    if (price) {
      try {
        parsedPrice = JSON.parse(price);
        updateFields.price = parsedPrice;
      } catch {
        return res.json({ success: false, message: "Invalid JSON in price" });
      }
    }

    let parsedAdvanceAmount = tour.advanceAmount;
    if (advanceAmount) {
      try {
        parsedAdvanceAmount = JSON.parse(advanceAmount);
        updateFields.advanceAmount = parsedAdvanceAmount;
      } catch {
        return res.json({
          success: false,
          message: "Invalid JSON in advanceAmount",
        });
      }
    }

    // 6. Recalculate balances for main tour using the most current data
    if (parsedPrice && parsedAdvanceAmount) {
      const adultAdvance = Number(parsedAdvanceAmount.adult) || 0;
      const childAdvance = Number(parsedAdvanceAmount.child) || 0;

      updateFields.balanceDouble =
        Number(parsedPrice.doubleSharing) - adultAdvance;
      updateFields.balanceTriple =
        Number(parsedPrice.tripleSharing) - adultAdvance;
      updateFields.balanceChildWithBerth =
        Number(parsedPrice.childWithBerth || 0) - childAdvance;
      updateFields.balanceChildWithoutBerth =
        Number(parsedPrice.childWithoutBerth || 0) - childAdvance;
    }

    // 7. Handle variantPackage array
    if (variantPackage) {
      try {
        const parsedVariantPackage = JSON.parse(variantPackage);
        if (!Array.isArray(parsedVariantPackage)) {
          return res.json({
            success: false,
            message: "variantPackage must be an array",
          });
        }

        // Validate and process each variant package
        updateFields.variantPackage = parsedVariantPackage.map((variant) => {
          // Initialize defaults
          const variantPrice = variant.price || {};
          const variantAdvanceAmount = variant.advanceAmount || {};

          // Calculate balances for this variant
          const adultAdvance = Number(variantAdvanceAmount.adult) || 0;
          const childAdvance = Number(variantAdvanceAmount.child) || 0;

          return {
            ...variant,
            balanceDouble:
              Number(variantPrice.doubleSharing || 0) - adultAdvance,
            balanceTriple:
              Number(variantPrice.tripleSharing || 0) - adultAdvance,
            balanceChildWithBerth:
              Number(variantPrice.childWithBerth || 0) - childAdvance,
            balanceChildWithoutBerth:
              Number(variantPrice.childWithoutBerth || 0) - childAdvance,
            // Ensure nested arrays are properly formatted
            destination: Array.isArray(variant.destination)
              ? variant.destination
              : [],
            sightseeing: Array.isArray(variant.sightseeing)
              ? variant.sightseeing
              : [],
            itinerary: Array.isArray(variant.itinerary)
              ? variant.itinerary
              : [],
            includes: Array.isArray(variant.includes) ? variant.includes : [],
            excludes: Array.isArray(variant.excludes) ? variant.excludes : [],
            trainDetails: Array.isArray(variant.trainDetails)
              ? variant.trainDetails.map((train) => ({
                  trainNo: train.trainNo || "",
                  trainName: train.trainName || "",
                  fromCode: train.fromCode || "",
                  fromStation: train.fromStation || "",
                  toCode: train.toCode || "",
                  toStation: train.toStation || "",
                  class: train.class || "",
                  departureTime: train.departureTime || "",
                  arrivalTime: train.arrivalTime || "",
                  ticketOpenDate: train.ticketOpenDate || null,
                }))
              : [],
            flightDetails: Array.isArray(variant.flightDetails)
              ? variant.flightDetails.map((flight) => ({
                  airline: flight.airline || "",
                  flightNo: flight.flightNo || "",
                  fromCode: flight.fromCode || "",
                  fromAirport: flight.fromAirport || "",
                  toCode: flight.toCode || "",
                  toAirport: flight.toAirport || "",
                  class: flight.class || "",
                  departureTime: flight.departureTime || "",
                  arrivalTime: flight.arrivalTime || "",
                }))
              : [],
            addons: Array.isArray(variant.addons)
              ? variant.addons.map((addon) => ({
                  name: addon.name || "",
                  amount: Number(addon.amount) || 0,
                }))
              : [],
            boardingPoints: Array.isArray(variant.boardingPoints)
              ? variant.boardingPoints.map((bp) => ({
                  stationCode: bp.stationCode || "",
                  stationName: bp.stationName || "",
                }))
              : [],
            deboardingPoints: Array.isArray(variant.deboardingPoints)
              ? variant.deboardingPoints.map((dp) => ({
                  stationCode: dp.stationCode || "",
                  stationName: dp.stationName || "",
                }))
              : [],
          };
        });
      } catch {
        return res.json({
          success: false,
          message: "Invalid JSON in variantPackage",
        });
      }
    }

    // 8. Update other fields
    if (title) updateFields.title = title;
    if (remarks) updateFields.remarks = remarks;
    if (batch) updateFields.batch = batch;
    if (lastBookingDate) updateFields.lastBookingDate = lastBookingDate;
    if (typeof available !== "undefined") updateFields.available = available;

    if (duration) {
      try {
        const parsed = JSON.parse(duration);
        const days = Number(parsed.days);
        const nights = Number(parsed.nights);
        if (isNaN(days) || isNaN(nights)) {
          return res.json({
            success: false,
            message: "Invalid duration format",
          });
        }
        updateFields.duration = { days, nights };
      } catch {
        return res.json({
          success: false,
          message: "Invalid JSON in duration",
        });
      }
    }

    if (completedTripsCount) {
      const trips = Number(completedTripsCount);
      if (isNaN(trips) || trips < 0) {
        return res.json({
          success: false,
          message: "Invalid completedTripsCount",
        });
      }
      updateFields.completedTripsCount = trips;
    }

    // 9. Handle all optional arrays
    const optionalArrays = {
      destination,
      sightseeing,
      itinerary,
      includes,
      excludes,
      trainDetails,
      flightDetails,
      addons,
      boardingPoints,
      deboardingPoints,
    };

    for (let key in optionalArrays) {
      if (optionalArrays[key]) {
        try {
          const parsedArray = JSON.parse(optionalArrays[key]);
          if (!Array.isArray(parsedArray)) throw new Error();

          if (key === "addons") {
            updateFields[key] = parsedArray.map((a) => ({
              name: a.name || "",
              amount: Number(a.amount) || 0,
            }));
          } else if (key === "boardingPoints" || key === "deboardingPoints") {
            updateFields[key] = parsedArray.map((a) => ({
              stationCode: a.stationCode || "",
              stationName: a.stationName || "",
            }));
          } else {
            updateFields[key] = parsedArray;
          }
        } catch {
          return res.json({
            success: false,
            message: `Invalid JSON in ${key}`,
          });
        }
      }
    }

    // 10. Final update
    await tourModel.findByIdAndUpdate(tourId, { $set: updateFields });

    res.json({ success: true, message: "Tour updated successfully" });
  } catch (error) {
    console.error("Update Tour Error:", error);
    res.json({ success: false, message: error.message });
  }
};

const markAdvanceReceiptSent = async (req, res) => {
  try {
    const { bookingId, tourId } = req.body; // Destructure tourId from the request body

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId is required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Ensure booking belongs to the selected tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // Mark receipt as sent
    booking.receipts.advanceReceiptSent = true;
    booking.receipts.advanceReceiptSentAt = new Date();

    await booking.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message: "Advance receipt marked as sent successfully",
      booking,
    });
  } catch (error) {
    console.error("markAdvanceReceiptSent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const markBalanceReceiptSent = async (req, res) => {
  try {
    const { bookingId, tourId } = req.body; // Destructure tourId from the request body

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId is required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Ensure booking belongs to the selected tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // Mark receipt as sent
    booking.receipts.balanceReceiptSent = true;
    booking.receipts.balanceReceiptSentAt = new Date();

    await booking.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message: "Balance receipt marked as sent successfully",
      booking,
    });
  } catch (error) {
    console.error("markBalanceReceiptSent error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const viewTourBalance = async (req, res) => {
  try {
    const { bookingId } = req.params; // Using params for GET request

    // Validate input
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing booking ID",
      });
    }

    // Find the booking by ID, selecting only relevant fields
    const booking = await tourBookingModel
      .findById(bookingId)
      .select("payment.advance payment.balance adminRemarks")
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking balance details retrieved successfully",
      data: {
        bookingId,
        advance: booking.payment.advance,
        balance: booking.payment.balance,
        adminRemarks: booking.adminRemarks || [],
      },
    });
  } catch (error) {
    console.error("Error retrieving tour balance:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const viewTourAdvance = async (req, res) => {
  try {
    const { bookingId } = req.params; // Using params for GET request

    // Validate input
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing booking ID",
      });
    }

    // Find the booking by ID, selecting only relevant advance-related fields
    const booking = await tourBookingModel
      .findById(bookingId)
      .select("payment.advance payment.balance advanceAdminRemarks ")
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Advance payment details and remarks retrieved successfully",
      data: {
        bookingId,
        advance: {
          amount: booking.payment.advance.amount,
          paid: booking.payment.advance.paid,
          paymentVerified: booking.payment.advance.paymentVerified,
          paidAt: booking.payment.advance.paidAt || null,
        },
        advanceAdminRemarks: booking.advanceAdminRemarks || [],
        isTripCompleted: booking.isTripCompleted,
      },
    });
  } catch (error) {
    console.error("Error retrieving tour advance details:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateTourBalance = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // --- INPUT VALIDATION ---
    if (!req.body || !req.body.updates) {
      return res.status(400).json({
        success: false,
        message: "Request body is missing or does not contain updates",
      });
    }

    const { updates } = req.body;

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing booking ID",
      });
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates must be a non-empty array",
      });
    }

    for (const update of updates) {
      const { remarks, amount } = update;

      if (amount === undefined || typeof amount !== "number") {
        return res.status(400).json({
          success: false,
          message: "Each update must include a valid amount",
        });
      }

      if (remarks && (typeof remarks !== "string" || remarks.trim() === "")) {
        return res.status(400).json({
          success: false,
          message: "Remarks, if provided, must be a non-empty string",
        });
      }
    }

    // --- FETCH BOOKING ---
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // --- NEW: BLOCK IF ANY TRAVELLER HAS APPLIED FOR CANCELLATION ---
    const hasTravellerAppliedForCancellation = booking.travellers.some(
      (t) => t.cancelled?.byTraveller === true && t.cancelled?.byAdmin === false
    );

    if (hasTravellerAppliedForCancellation) {
      return res.status(400).json({
        success: false,
        message:
          "One or more travellers have applied for cancellation. Cannot update balance.",
      });
    }

    // --- BLOCK 1: Both advance & balance already paid ---
    const advancePaid = booking.payment?.advance?.paid === true;
    const balancePaid = booking.payment?.balance?.paid === true;

    if (advancePaid && balancePaid) {
      return res.status(400).json({
        success: false,
        message: "Cannot update: Advance and balance are both already paid",
      });
    }

    // --- BLOCK 2: All travellers cancelled by admin ---
    const allTravellersCancelledByAdmin = booking.travellers.every(
      (t) => t.cancelled?.byAdmin === true
    );

    if (allTravellersCancelledByAdmin) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot update: All travellers are cancelled by admin. Booking is closed.",
      });
    }

    // --- BLOCK 3: Prevent negative balance ---
    const currentBalance = booking.payment?.balance?.amount || 0;
    const totalDeduction = updates
      .filter((u) => u.amount < 0)
      .reduce((sum, u) => sum + Math.abs(u.amount), 0);

    if (currentBalance - totalDeduction < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot apply updates: Balance would become negative. Current: ₹${currentBalance}, Requested deduction: ₹${totalDeduction}`,
      });
    }

    // --- APPLY UPDATES SAFELY ---
    for (const update of updates) {
      const { remarks, amount } = update;

      // Update balance
      booking.payment.balance.amount += amount;

      // Add to admin remarks
      booking.adminRemarks.push({
        remark: remarks?.trim() || "No remark",
        amount,
        addedAt: new Date(),
      });
    }

    // Mark trip as completed
    booking.isTripCompleted = true;

    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Balance and admin remarks updated successfully",
      data: {
        bookingId: booking._id,
        updatedBalance: booking.payment.balance.amount,
        adminRemarks: booking.adminRemarks,
        isTripCompleted: booking.isTripCompleted,
      },
    });
  } catch (error) {
    console.error("Error updating tour balance:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
const updateTourAdvance = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // --- INPUT VALIDATION ---
    if (!req.body || !req.body.updates) {
      return res.status(400).json({
        success: false,
        message: "Request body is missing or does not contain updates",
      });
    }

    const { updates } = req.body;

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing booking ID",
      });
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates must be a non-empty array",
      });
    }

    // Validate each update item
    for (const update of updates) {
      const { remarks, amount } = update;

      if (amount === undefined || typeof amount !== "number") {
        return res.status(400).json({
          success: false,
          message: "Each update must include a valid 'amount' (number)",
        });
      }

      if (remarks && (typeof remarks !== "string" || remarks.trim() === "")) {
        return res.status(400).json({
          success: false,
          message: "Remarks, if provided, must be a non-empty string",
        });
      }

      // Amount to shift must be positive
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Amount to shift from advance to balance must be greater than 0",
        });
      }
    }

    // --- FETCH BOOKING ---
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // --- BLOCK: If any traveller has applied for cancellation (but not yet approved by admin) ---
    const hasTravellerAppliedForCancellation = booking.travellers.some(
      (t) => t.cancelled?.byTraveller === true && t.cancelled?.byAdmin === false
    );

    if (hasTravellerAppliedForCancellation) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot shift advance to balance: One or more travellers have applied for cancellation",
      });
    }

    // --- BLOCK: If both advance and balance are already fully paid ---
    const advanceFullyPaid =
      booking.payment.advance.paid === true &&
      booking.payment.advance.paymentVerified === true;
    const balanceFullyPaid = booking.payment.balance.paid === true;

    if (advanceFullyPaid && balanceFullyPaid) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot shift amount: Both advance and balance are already fully paid",
      });
    }

    // --- BLOCK: If trip is already marked as completed ---
    if (booking.isTripCompleted === true) {
      return res.status(400).json({
        success: false,
        message: "Cannot shift amount: Already one request pending",
      });
    }

    // --- APPLY UPDATES: Shift from Advance → Balance ---
    for (const update of updates) {
      const { remarks, amount } = update;

      // Deduct from advance
      booking.payment.advance.amount -= amount;

      // Add to balance (ensure it's NOT marked as paid)
      booking.payment.balance.amount += amount;
      booking.payment.balance.paid = false;
      booking.payment.balance.paymentVerified = false;
      if (booking.payment.balance.paidAt) {
        booking.payment.balance.paidAt = null; // reset if was previously paid
      }

      // Add remark to advanceAdminRemarks (not adminRemarks)
      booking.advanceAdminRemarks.push({
        remark: remarks?.trim() || "Amount shifted from advance to balance",
        amount: amount,
        addedAt: new Date(),
      });
    }

    // --- FINAL: Mark trip as completed ---
    booking.isTripCompleted = true;

    await booking.save();

    return res.status(200).json({
      success: true,
      message:
        "Advance amount successfully shifted to balance and trip marked as completed",
      data: {
        bookingId: booking._id,
        updatedAdvanceAmount: booking.payment.advance.amount,
        updatedBalanceAmount: booking.payment.balance.amount,
        advanceAdminRemarks: booking.advanceAdminRemarks,
        isTripCompleted: booking.isTripCompleted,
      },
    });
  } catch (error) {
    console.error("Error in updateTourAdvance:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateModifyReceipt = async (req, res) => {
  try {
    const { bookingId, tourId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "tourId is required",
      });
    }

    // Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Ensure booking belongs to the selected tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // Set isTripCompleted to false
    booking.isTripCompleted = false;

    // Save the updated booking
    await booking.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message: "Trip completion status marked as not completed successfully",
      booking,
    });
  } catch (error) {
    console.error("updateModifyReceipt error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

// controllers/tourController.js
const viewBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const tToken = req.header("ttoken");

    if (!tToken) {
      return res
        .status(401)
        .json({ success: false, message: "Not Authorized." });
    }

    let decoded;
    try {
      decoded = jwt.verify(tToken, process.env.JWT_SECRET);
    } catch (error) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token." });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const booking = await tourBookingModel
      .findById(bookingId)
      .populate("userId", "name email mobile")
      .lean();

    if (!booking)
      return res.status(404).json({ success: false, message: "Not found" });

    const tour = await tourModel.findById(booking.tourId).lean();
    if (!tour)
      return res
        .status(404)
        .json({ success: false, message: "Tour not found" });

    booking.tourFull = tour;

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error("viewBooking error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
const getCancellationsByBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { limit = 20 } = req.query;

  // Validate bookingId
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid bookingId" });
  }

  const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

  try {
    // find cancellations for this booking
    const cancellations = await cancellationModel
      .find({ bookingId: bookingId })
      .sort({ createdAt: -1 })
      .limit(numericLimit)
      .lean();

    // return as array
    return res.status(200).json({
      success: true,
      count: cancellations.length,
      results: cancellations,
    });
  } catch (err) {
    console.error("getCancellationsByBooking error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching cancellations",
    });
  }
};

// const updateBookingBalance = async (req, res) => {
//   try {
//     const { bookingId } = req.params;
//     const { updates = {} } = req.body;

//     // ---- 1. Validate ID -------------------------------------------------
//     if (!mongoose.Types.ObjectId.isValid(bookingId)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid bookingId" });
//     }

//     // ---- 2. Load original booking + populate tour + travellers ----------
//     const original = await tourBookingModel
//       .findById(bookingId)
//       .populate("tourId")
//       .populate({ path: "travellers" }) // ensures _id exists
//       .lean();

//     if (!original) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Original booking not found" });
//     }

//     const tour = original.tourId;

//     // ---- Payment Status -------------------------------------------------
//     const advancePaid = original.payment?.advance?.paid ?? false;
//     const balancePaid = original.payment?.balance?.paid ?? false;

//     // ---- 3. Merge UI updates --------------------------------------------
//     const merged = {
//       ...original,
//       ...updates,
//       travellers: original.travellers.map((origT, i) => ({
//         ...origT,
//         ...(updates.travellers?.[i] || {}),
//       })),
//       contact: { ...original.contact, ...(updates.contact || {}) },
//       billingAddress: {
//         ...original.billingAddress,
//         ...(updates.billingAddress || {}),
//       },
//     };

//     // ---- Helper: Get package (main or variant) -------------------------
//     const getPackage = (traveller) => {
//       return traveller.packageType === "main"
//         ? tour
//         : tour.variantPackage?.[traveller.variantPackageIndex] ?? tour;
//     };

//     // ---- Helper: Get advance price for one traveller -------------------
//     const getTravellerAdvance = (traveller) => {
//       const pkg = getPackage(traveller);
//       if (!pkg || !pkg.advanceAmount) return 0;

//       const isChild =
//         traveller.sharingType === "withBerth" ||
//         traveller.sharingType === "withoutBerth";

//       return isChild ? pkg.advanceAmount.child : pkg.advanceAmount.adult;
//     };

//     // ---- Helper: Get balance price for one traveller -------------------
//     const getTravellerBalance = (traveller) => {
//       const pkg = getPackage(traveller);
//       if (!pkg) return 0;

//       switch (traveller.sharingType) {
//         case "double":
//           return pkg.balanceDouble ?? 0;
//         case "triple":
//           return pkg.balanceTriple ?? 0;
//         case "withBerth":
//           return pkg.balanceChildWithBerth ?? 0;
//         case "withoutBerth":
//           return pkg.balanceChildWithoutBerth ?? 0;
//         default:
//           return 0;
//       }
//     };

//     // ---- Helper: Get addon price ---------------------------------------
//     const getAddonPrice = (traveller) => {
//       return traveller.selectedAddon?.price ?? 0;
//     };

//     // ---- Active Travellers Only ----------------------------------------
//     const activeTravellers = merged.travellers.filter(
//       (t) => !t.cancelled?.byAdmin && !t.cancelled?.byTraveller
//     );

//     let updatableAdvance = 0,
//       updatedAdvance = 0,
//       updatableBalance = 0,
//       updatedBalance = 0;

//     // ====================================================================
//     // CASE 1: Advance paid, balance not paid → PRESERVE ADVANCE AMOUNT
//     // ====================================================================
//     if (advancePaid && !balancePaid) {
//       // PRESERVE ORIGINAL ADVANCE AMOUNT (CRITICAL FIX)
//       updatableAdvance = merged.payment?.advance?.amount || 0;
//       updatedAdvance = updatableAdvance;

//       const getTravellerPrice = (traveller) => {
//         const pkg = getPackage(traveller);
//         if (!pkg) return 0;

//         let base = 0;
//         switch (traveller.sharingType) {
//           case "double":
//             base = pkg.price?.doubleSharing ?? 0;
//             break;
//           case "triple":
//             base = pkg.price?.tripleSharing ?? 0;
//             break;
//           case "withBerth":
//             base = pkg.price?.childWithBerth ?? 0;
//             break;
//           case "withoutBerth":
//             base = pkg.price?.childWithoutBerth ?? 0;
//             break;
//           default:
//             base = pkg.price?.doubleSharing ?? 0;
//         }
//         const addon = getAddonPrice(traveller);
//         return base + addon;
//       };

//       const A = activeTravellers.reduce(
//         (sum, t) => sum + getTravellerPrice(t),
//         0
//       );

//       const C =
//         (merged.gvCancellationPool || 0) + (merged.irctcCancellationPool || 0);

//       const D = (merged.adminRemarks || [])
//         .filter((r) => (r.amount || 0) > 0)
//         .reduce((sum, r) => sum + r.amount, 0);

//       updatableBalance = A + C + D;

//       const advancePaidAmount = merged.payment?.advance?.amount || 0;

//       const negativeRemarksTotal = (merged.adminRemarks || [])
//         .filter((r) => (r.amount || 0) < 0)
//         .reduce((sum, r) => sum + Math.abs(r.amount), 0);

//       updatedBalance =
//         updatableBalance - advancePaidAmount - negativeRemarksTotal;
//     }
//     // ====================================================================
//     // CASE 2: Both advance & balance unpaid → New Advance + Balance Logic
//     // ====================================================================
//     else if (!advancePaid && !balancePaid) {
//       // A = sum of advance per traveller
//       const A = activeTravellers.reduce(
//         (sum, t) => sum + getTravellerAdvance(t),
//         0
//       );

//       // B = sum of addons
//       const B = activeTravellers.reduce((sum, t) => sum + getAddonPrice(t), 0);

//       updatableAdvance = A + B;
//       updatedAdvance = A + B; // nothing paid yet

//       // C = sum of balance per traveller
//       const C = activeTravellers.reduce(
//         (sum, t) => sum + getTravellerBalance(t),
//         0
//       );

//       updatableBalance = C;
//       updatedBalance = C;
//     }
//     // ====================================================================
//     // INVALID STATE: balance paid but advance not? (should not happen)
//     // ====================================================================
//     else {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid payment state: balance cannot be paid before advance.",
//       });
//     }

//     // ---- 8. Build manageBooking document --------------------------------
//     const manageDoc = {
//       userId: merged.userId,
//       tourId: tour._id,
//       bookingId,
//       userData: merged.userData,
//       tourData: merged.tourData,

//       travellers: merged.travellers,
//       billingAddress: merged.billingAddress,
//       contact: merged.contact,
//       bookingType: merged.bookingType,
//       payment: merged.payment,
//       receipts: merged.receipts,
//       isTripCompleted: merged.isTripCompleted,
//       isBookingCompleted: merged.isBookingCompleted,
//       cancelled: merged.cancelled,
//       bookingDate: merged.bookingDate,
//       gvCancellationPool: merged.gvCancellationPool,
//       irctcCancellationPool: merged.irctcCancellationPool,
//       manageBooking: true,
//       adminRemarks: merged.adminRemarks || [],

//       approvedBy: false,
//       raisedBy: true,

//       // Store both advance and balance fields
//       updatableAdvance,
//       updatedAdvance,
//       updatableBalance,
//       updatedBalance,
//     };

//     const saved = await manageBookingModel.create(manageDoc);

//     return res.status(201).json({
//       success: true,
//       message: "Manage-booking raised successfully",
//       data: saved,
//     });
//   } catch (err) {
//     console.error("updateBookingBalance error:", err);
//     return res
//       .status(500)
//       .json({ success: false, message: "Server error", error: err.message });
//   }
// };

//Crictical copy do not delete

const updateBookingBalance = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { updates = {} } = req.body;

    // ---- 1. Validate ID -------------------------------------------------
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid bookingId" });
    }

    // ---- 2. Load original booking + populate tour + travellers ----------
    const original = await tourBookingModel
      .findById(bookingId)
      .populate("tourId")
      .populate({ path: "travellers" })
      .lean();

    if (!original) {
      return res
        .status(404)
        .json({ success: false, message: "Original booking not found" });
    }

    const tour = original.tourId;

    // ---- Payment Status -------------------------------------------------
    const advancePaid = original.payment?.advance?.paid ?? false;
    const balancePaid = original.payment?.balance?.paid ?? false;

    // ---- 3. Merge UI updates --------------------------------------------
    const merged = {
      ...original,
      ...updates,
      travellers: original.travellers.map((origT, i) => ({
        ...origT,
        ...(updates.travellers?.[i] || {}),
      })),
      contact: { ...original.contact, ...(updates.contact || {}) },
      billingAddress: {
        ...original.billingAddress,
        ...(updates.billingAddress || {}),
      },
    };

    // ---- Helper: Get package (main or variant) -------------------------
    const getPackage = (traveller) => {
      return traveller.packageType === "main"
        ? tour
        : tour.variantPackage?.[traveller.variantPackageIndex] ?? tour;
    };

    // ---- Helper: Get advance price for one traveller -------------------
    const getTravellerAdvance = (traveller) => {
      const pkg = getPackage(traveller);
      if (!pkg || !pkg.advanceAmount) return 0;

      const isChild =
        traveller.sharingType === "withBerth" ||
        traveller.sharingType === "withoutBerth";

      return isChild ? pkg.advanceAmount.child : pkg.advanceAmount.adult;
    };

    // ---- Helper: Get balance price for one traveller -------------------
    const getTravellerBalance = (traveller) => {
      const pkg = getPackage(traveller);
      if (!pkg) return 0;

      switch (traveller.sharingType) {
        case "double":
          return pkg.balanceDouble ?? 0;
        case "triple":
          return pkg.balanceTriple ?? 0;
        case "withBerth":
          return pkg.balanceChildWithBerth ?? 0;
        case "withoutBerth":
          return pkg.balanceChildWithoutBerth ?? 0;
        default:
          return 0;
      }
    };

    // ---- Helper: Get addon price ---------------------------------------
    const getAddonPrice = (traveller) => {
      return traveller.selectedAddon?.price ?? 0;
    };

    // ---- Active Travellers Only ----------------------------------------
    const activeTravellers = merged.travellers.filter(
      (t) => !t.cancelled?.byAdmin && !t.cancelled?.byTraveller
    );

    let updatableAdvance = 0,
      updatedAdvance = 0,
      updatableBalance = 0,
      updatedBalance = 0;

    // ====================================================================
    // CASE 1: Advance PAID → DO NOT RECALCULATE ADVANCE
    // ====================================================================
    if (advancePaid && !balancePaid) {
      // CRITICAL: Advance is already PAID → copy from original booking
      const originalAdvanceAmount = original.payment?.advance?.amount || 0;

      updatableAdvance = originalAdvanceAmount;
      updatedAdvance = originalAdvanceAmount;

      // Now calculate only BALANCE based on updated travellers
      const getTravellerPrice = (traveller) => {
        const pkg = getPackage(traveller);
        if (!pkg) return 0;

        let base = 0;
        switch (traveller.sharingType) {
          case "double":
            base = pkg.price?.doubleSharing ?? 0;
            break;
          case "triple":
            base = pkg.price?.tripleSharing ?? 0;
            break;
          case "withBerth":
            base = pkg.price?.childWithBerth ?? 0;
            break;
          case "withoutBerth":
            base = pkg.price?.childWithoutBerth ?? 0;
            break;
          default:
            base = pkg.price?.doubleSharing ?? 0;
        }
        const addon = getAddonPrice(traveller);
        return base + addon;
      };

      const A = activeTravellers.reduce(
        (sum, t) => sum + getTravellerPrice(t),
        0
      );

      const C =
        (merged.gvCancellationPool || 0) + (merged.irctcCancellationPool || 0);

      const D = (merged.adminRemarks || [])
        .filter((r) => (r.amount || 0) > 0)
        .reduce((sum, r) => sum + r.amount, 0);

      updatableBalance = A + C + D;

      const negativeRemarksTotal = (merged.adminRemarks || [])
        .filter((r) => (r.amount || 0) < 0)
        .reduce((sum, r) => sum + Math.abs(r.amount), 0);

      updatedBalance =
        updatableBalance - originalAdvanceAmount - negativeRemarksTotal;
    }
    // ====================================================================
    // CASE 2: Both unpaid → Calculate advance & balance fresh
    // ====================================================================
    else if (!advancePaid && !balancePaid) {
      const A = activeTravellers.reduce(
        (sum, t) => sum + getTravellerAdvance(t),
        0
      );

      const B = activeTravellers.reduce((sum, t) => sum + getAddonPrice(t), 0);

      updatableAdvance = A + B;
      updatedAdvance = A + B;

      const C = activeTravellers.reduce(
        (sum, t) => sum + getTravellerBalance(t),
        0
      );

      updatableBalance = C;
      updatedBalance = C;
    }
    // ====================================================================
    // INVALID STATE
    // ====================================================================
    else {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment state: balance cannot be paid before advance.",
      });
    }

    // ---- 8. Build manageBooking document --------------------------------
    const manageDoc = {
      userId: merged.userId,
      tourId: tour._id,
      bookingId,
      userData: merged.userData,
      tourData: merged.tourData,

      travellers: merged.travellers,
      billingAddress: merged.billingAddress,
      contact: merged.contact,
      bookingType: merged.bookingType,
      payment: merged.payment,
      receipts: merged.receipts,
      isTripCompleted: merged.isTripCompleted,
      isBookingCompleted: merged.isBookingCompleted,
      cancelled: merged.cancelled,
      bookingDate: merged.bookingDate,
      gvCancellationPool: merged.gvCancellationPool,
      irctcCancellationPool: merged.irctcCancellationPool,
      manageBooking: true,
      adminRemarks: merged.adminRemarks || [],

      approvedBy: false,
      raisedBy: true,

      updatableAdvance,
      updatedAdvance,
      updatableBalance,
      updatedBalance,
    };

    const saved = await manageBookingModel.create(manageDoc);

    return res.status(201).json({
      success: true,
      message: "Manage-booking raised successfully",
      data: saved,
    });
  } catch (err) {
    console.error("updateBookingBalance error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

const getManagedBookingsHistory = async (req, res) => {
  try {
    // Fetch all manageBooking documents with populated references
    const history = await manageBookingModel
      .find({})
      .populate({
        path: "userId",
        select: "name email mobile", // Only needed user fields
      })
      .populate({
        path: "tourId",
        select: "title destination startDate endDate",
      })
      .populate({
        path: "bookingId",
        select:
          "bookingDate payment.advance.amount payment.balance.amount travellers",
      })
      .sort({ createdAt: -1 }) // Latest first
      .lean(); // Use lean for performance (returns plain JS objects)

    // If no records
    if (!history || history.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No manage-booking history found.",
        data: [],
        count: 0,
      });
    }

    // Optional: Transform or enrich data if needed
    const enrichedHistory = history.map((entry) => {
      const original = entry.bookingId;

      return {
        _id: entry._id,
        raisedAt: entry.bookingDate || entry.createdAt,
        raisedBy: entry.raisedBy,
        approvedBy: entry.approvedBy,

        // User Info
        user: {
          _id: entry.userId?._id,
          name: entry.userId?.name || "Unknown",
          email: entry.userId?.email || "N/A",
          mobile: entry.userId?.mobile || "N/A",
        },

        // Tour Info
        tour: {
          _id: entry.tourId?._id,
          title: entry.tourId?.title || "Unknown Tour",
          destination: entry.tourId?.destination || "N/A",
          dates: entry.tourId
            ? `${entry.tourId.startDate} to ${entry.tourId.endDate}`
            : "N/A",
        },

        // Original Booking Reference
        originalBooking: original
          ? {
              _id: original._id,
              bookingDate: original.bookingDate,
              advancePaid: original.payment?.advance?.amount || 0,
              balanceDue: original.payment?.balance?.amount || 0,
              totalTravellers: original.travellers?.length || 0,
            }
          : null,

        // Requested Updates
        requested: {
          updatableAdvance: entry.updatableAdvance || 0,
          updatedAdvance: entry.updatedAdvance || 0,
          updatableBalance: entry.updatableBalance || 0,
          updatedBalance: entry.updatedBalance || 0,
        },

        // Admin Remarks
        adminRemarks: entry.adminRemarks || [],

        // Status
        status: entry.approvedBy
          ? "APPROVED"
          : entry.raisedBy
          ? "PENDING"
          : "DRAFT",
      };
    });

    return res.status(200).json({
      success: true,
      message: "Manage-booking history fetched successfully",
      data: enrichedHistory,
      count: enrichedHistory.length,
    });
  } catch (err) {
    console.error("getManagedBookingsHistory error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch manage-booking history",
      error: err.message,
    });
  }
};

export {
  tourList,
  changeTourAvailability,
  loginTour,
  bookingsTour,
  bookingComplete,
  tourDashboard,
  tourProfile,
  updateTourProfile,
  markOfflineAdvancePaid,
  markOfflineBalancePaid,
  updateTraveller,
  markAdvanceReceiptSent,
  markBalanceReceiptSent,
  viewTourBalance,
  viewTourAdvance,
  updateTourBalance,
  updateTourAdvance,
  updateModifyReceipt,
  viewBooking,
  getCancellationsByBooking,
  updateBookingBalance,
  getManagedBookingsHistory,
};
