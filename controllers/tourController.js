import tourModel from "../models/tourModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import tourBookingModel from "../models/tourBookingmodel.js";

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

    const tour = await tourModel.findOne({ email });
    if (!tour) {
      return res.json({
        success: false,
        message: "Invalid email",
      });
    }

    const isMatch = await bcrypt.compare(password, tour.password);
    if (!isMatch) {
      return res.json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = jwt.sign({ id: tour._id }, process.env.JWT_SECRET);

    res.json({
      success: true,
      token,
      message: "Tour login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

const bookingsTour = async (req, res) => {
  try {
    const tourId = req.tour; // ✅ take from middleware, not params

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
    const { bookingId } = req.body;
    const tourId = req.tour; // From middleware

    if (!bookingId) {
      return res.json({
        success: false,
        message: "Booking ID is missing. Please provide a valid booking ID.",
      });
    }

    // 1. Fetch booking
    const booking = await tourBookingModel.findById(bookingId);
    if (!booking) {
      return res.json({
        success: false,
        message: "No booking found with the provided booking ID.",
      });
    }

    // 2. Ensure the booking belongs to this tour
    if (booking.tourId.toString() !== tourId) {
      return res.json({
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

    // 4. Cancellation checks for each traveller
    const travellerCancellationIssues = booking.travellers.filter(
      (traveller) =>
        traveller.cancelled?.byTraveller === true &&
        traveller.cancelled?.byAdmin === false
    );

    if (travellerCancellationIssues.length > 0) {
      const cancelledTravellersList = travellerCancellationIssues
        .map(
          (t) =>
            `Traveller name : ${t.firstName || "Unnamed"} ${t.lastName || ""}`
        )
        .join(", ");

      return res.json({
        success: false,
        message: `The following traveller(s) have requested cancellation and must be resolved before completing the booking: ${cancelledTravellersList}`,
      });
    }

    // 5. Payment + Receipt checks
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

    // 6. Mark booking as completed
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
    const { bookingId } = req.body;
    const tourId = req.tour; // Assuming this comes from middleware

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
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

    // Ensure the booking belongs to this tour
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
    const { bookingId } = req.body;
    const tourId = req.tour; // From middleware

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
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

    // Ensure the booking belongs to this tour
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

    // 2. Cancellation checks
    const hasTravellerCancelled = booking.travellers.some(
      (traveller) => traveller.cancelled?.byTraveller === true
    );
    const hasAdminCancelled = booking.travellers.some(
      (traveller) => traveller.cancelled?.byAdmin === true
    );

    if (hasTravellerCancelled && !hasAdminCancelled) {
      return res.status(400).json({
        success: false,
        message: "Traveller already requested for cancellation",
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

    if (balance?.paid) {
      return res.status(400).json({
        success: false,
        message: "Balance payment is already marked as completed",
      });
    }

    // 4. Ensure advance is paid, verified AND advance receipt sent
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
        message: "Advance receipt must be sent before marking balance as paid",
      });
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

const tourDashboard = async (req, res) => {
  try {
    const tourId = req.tour;

    // Fetch all bookings for this tour
    const bookings = await tourBookingModel.find({ tourId });

    let totalEarnings = 0;
    let totalTravellers = 0;
    let uniqueUsers = new Set();

    bookings.forEach((booking) => {
      // ✅ Add earnings only if BOTH advance and balance are paid
      if (booking.payment?.advance?.paid && booking.payment?.balance?.paid) {
        totalEarnings +=
          booking.payment.advance.amount + booking.payment.balance.amount;
      }

      // ✅ Count travellers
      if (Array.isArray(booking.travellers)) {
        totalTravellers += booking.travellers.length;
      }

      // ✅ Collect unique users
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
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

const tourProfile = async (req, res) => {
  try {
    const tourId = req.tour;
    const tourProfileData = await tourModel
      .findById(tourId)
      .select("-password");
    res.json({ success: true, tourProfileData });
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message,
    });
  }
};

const updateTourProfile = async (req, res) => {
  try {
    const tourId = req.tour; // From auth middleware
    const tour = await tourModel.findById(tourId);
    if (!tour) {
      return res.json({ success: false, message: "Tour not found" });
    }

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
      remarks,
    } = req.body;

    const { titleImage, mapImage, galleryImages } = req.files;

    // Image upload helper
    const uploadImage = async (file) => {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: "image",
      });
      return result.secure_url;
    };

    let updateFields = {};

    // 🔹 Images
    if (titleImage) {
      const url = await uploadImage(titleImage[0]);
      updateFields.titleImage = url;
    }

    if (mapImage) {
      const url = await uploadImage(mapImage[0]);
      updateFields.mapImage = url;
    }

    if (galleryImages) {
      if (galleryImages.length !== 3) {
        return res.json({
          success: false,
          message: "Please upload exactly 3 gallery images",
        });
      }
      const urls = await Promise.all(
        galleryImages.map((img) => uploadImage(img))
      );
      updateFields.galleryImages = urls;
    }

    // 🔹 Basic fields
    if (title) updateFields.title = title;
    if (remarks) updateFields.remarks = remarks;
    if (batch) updateFields.batch = batch;

    if (lastBookingDate) updateFields.lastBookingDate = lastBookingDate;
    if (typeof available !== "undefined") updateFields.available = available;

    // 🔹 Parse numbers safely
    if (advanceAmount) {
      const adv = Number(advanceAmount);
      if (isNaN(adv)) {
        return res.json({ success: false, message: "Invalid advance amount" });
      }
      updateFields.advanceAmount = adv;
    }

    // 🔹 Duration
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

    // 🔹 Price & Balance
    if (price) {
      try {
        const parsed = JSON.parse(price);
        const double = Number(parsed.doubleSharing);
        const triple = Number(parsed.tripleSharing);
        if (isNaN(double) || isNaN(triple)) {
          return res.json({ success: false, message: "Invalid price format" });
        }
        updateFields.price = parsed;

        if (advanceAmount) {
          const adv = Number(advanceAmount);
          updateFields.balanceDouble = double - adv;
          updateFields.balanceTriple = triple - adv;
        }
      } catch {
        return res.json({ success: false, message: "Invalid JSON in price" });
      }
    }

    // 🔹 Completed Trips
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

    // 🔹 Optional Arrays (parsed only if provided)
    const optionalArrays = {
      destination,
      sightseeing,
      itinerary,
      includes,
      excludes,
      trainDetails,
      flightDetails,
    };

    for (let key in optionalArrays) {
      if (optionalArrays[key]) {
        try {
          updateFields[key] = JSON.parse(optionalArrays[key]);
        } catch {
          return res.json({
            success: false,
            message: `Invalid JSON in ${key}`,
          });
        }
      }
    }

    // 🔹 Addons
    if (addons) {
      try {
        const parsedAddons = JSON.parse(addons);
        if (!Array.isArray(parsedAddons)) {
          throw new Error();
        }
        updateFields.addons = parsedAddons.map((a) => ({
          name: a.name,
          amount: Number(a.amount) || 0,
        }));
      } catch {
        return res.json({ success: false, message: "Invalid JSON in addons" });
      }
    }
    if (boardingPoints) {
      try {
        const parsedBp = JSON.parse(boardingPoints);
        if (!Array.isArray(parsedBp)) {
          throw new Error();
        }
        updateFields.boardingPoints = parsedBp.map((a) => ({
          stationCode: a.stationCode,
          stationName: a.stationName,
        }));
      } catch {
        return res.json({ success: false, message: "Invalid JSON in addons" });
      }
    }

    // 🔹 Perform the update
    await tourModel.findByIdAndUpdate(tourId, updateFields);

    res.json({ success: true, message: "Tour updated successfully" });
  } catch (error) {
    console.error("Update Tour Error:", error);
    res.json({ success: false, message: error.message });
  }
};

// ✅ Mark Advance Receipt Sent
const markAdvanceReceiptSent = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const tourId = req.tour; // from middleware

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
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

    // Ensure booking belongs to the logged-in tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // Mark receipt as sent
    booking.receipts.advanceReceiptSent = true;
    booking.receipts.advanceReceiptSentAt = new Date(); // optional if you want timestamp

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

// ✅ Mark Balance Receipt Sent
const markBalanceReceiptSent = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const tourId = req.tour; // from middleware

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
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

    // Ensure booking belongs to the logged-in tour
    if (booking.tourId.toString() !== tourId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to modify this booking",
      });
    }

    // Mark receipt as sent
    booking.receipts.balanceReceiptSent = true;
    booking.receipts.balanceReceiptSentAt = new Date(); // optional timestamp

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
};
