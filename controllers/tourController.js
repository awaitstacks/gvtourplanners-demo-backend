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

// const bookingComplete = async (req, res) => {
//   try {
//     const { bookingId, tourId } = req.body; // Destructure tourId from the request body

//     if (!bookingId) {
//       return res.status(400).json({
//         success: false,
//         message: "Booking ID is missing. Please provide a valid booking ID.",
//       });
//     }

//     if (!tourId) {
//       return res.status(400).json({
//         success: false,
//         message: "Tour ID is missing. Please provide a valid tour ID.",
//       });
//     }

//     // 1. Fetch booking
//     const booking = await tourBookingModel.findById(bookingId);
//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message: "No booking found with the provided booking ID.",
//       });
//     }

//     // 2. Ensure the booking belongs to this tour
//     if (booking.tourId.toString() !== tourId) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "You are not authorized to modify this booking. It belongs to another tour.",
//       });
//     }

//     // 3. Check if already marked as completed
//     if (booking.isBookingCompleted) {
//       return res.json({
//         success: false,
//         message: "This booking is already marked as completed.",
//       });
//     }

//     // 4. Cancellation checks for each traveller
//     const travellerCancellationIssues = booking.travellers.filter(
//       (traveller) =>
//         traveller.cancelled?.byTraveller === true &&
//         traveller.cancelled?.byAdmin === false
//     );

//     if (travellerCancellationIssues.length > 0) {
//       const cancelledTravellersList = travellerCancellationIssues
//         .map(
//           (t) =>
//             `Traveller name : ${t.firstName || "Unnamed"} ${t.lastName || ""}`
//         )
//         .join(", ");

//       return res.json({
//         success: false,
//         message: `The following traveller(s) have requested cancellation and must be resolved before completing the booking: ${cancelledTravellersList}`,
//       });
//     }

//     // 5. Payment + Receipt checks
//     const { advance, balance } = booking.payment;
//     const { receipts } = booking;

//     // Advance checks
//     if (!advance?.paid) {
//       return res.json({
//         success: false,
//         message: "Advance payment has not been made.",
//       });
//     }
//     if (!advance?.paymentVerified) {
//       return res.json({
//         success: false,
//         message: "Advance payment is pending verification.",
//       });
//     }
//     if (!receipts?.advanceReceiptSent) {
//       return res.json({
//         success: false,
//         message: "Advance receipt has not been sent.",
//       });
//     }

//     // Balance checks
//     if (!balance?.paid) {
//       return res.json({
//         success: false,
//         message: "Balance payment has not been made.",
//       });
//     }
//     if (!balance?.paymentVerified) {
//       return res.json({
//         success: false,
//         message: "Balance payment is pending verification.",
//       });
//     }
//     if (!receipts?.balanceReceiptSent) {
//       return res.json({
//         success: false,
//         message: "Balance receipt has not been sent.",
//       });
//     }

//     // 6. Mark booking as completed
//     booking.isBookingCompleted = true;
//     booking.bookingCompletedAt = new Date();

//     await booking.save({ validateModifiedOnly: true });

//     return res.json({
//       success: true,
//       message: "Booking marked as completed successfully.",
//     });
//   } catch (error) {
//     console.error("bookingComplete error:", error);
//     return res.json({
//       success: false,
//       message: `An unexpected error occurred: ${error.message}`,
//     });
//   }
// };

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

// const markOfflineBalancePaid = async (req, res) => {
//   try {
//     const { bookingId, tourId } = req.body; // Destructure tourId from the request body

//     if (!bookingId) {
//       return res.status(400).json({
//         success: false,
//         message: "bookingId is required",
//       });
//     }

//     if (!tourId) {
//       // Check if tourId is provided
//       return res.status(400).json({
//         success: false,
//         message: "tourId is required",
//       });
//     }

//     // Fetch booking
//     const booking = await tourBookingModel.findById(bookingId);
//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message: "Booking not found",
//       });
//     }

//     // Ensure the booking belongs to the selected tour
//     if (booking.tourId.toString() !== tourId) {
//       return res.status(403).json({
//         success: false,
//         message: "Unauthorized to modify this booking",
//       });
//     }

//     // 1. Check if booking type is offline
//     if (booking.bookingType !== "offline") {
//       return res.status(400).json({
//         success: false,
//         message: "Only offline bookings can be marked as balance paid",
//       });
//     }

//     // 2. Cancellation checks
//     const hasTravellerCancelled = booking.travellers.some(
//       (traveller) => traveller.cancelled?.byTraveller === true
//     );
//     const hasAdminCancelled = booking.travellers.some(
//       (traveller) => traveller.cancelled?.byAdmin === true
//     );

//     if (hasTravellerCancelled && !hasAdminCancelled) {
//       return res.status(400).json({
//         success: false,
//         message: "Traveller already requested for cancellation",
//       });
//     }

//     // 3. Payment checks
//     const { advance, balance } = booking.payment;

//     if (advance?.paid && balance?.paid) {
//       return res.status(400).json({
//         success: false,
//         message: "Advance and balance are already completed",
//       });
//     }

//     if (balance?.paid) {
//       return res.status(400).json({
//         success: false,
//         message: "Balance payment is already marked as completed",
//       });
//     }

//     // 4. Ensure advance is paid, verified AND advance receipt sent
//     if (!advance?.paid || !advance?.paymentVerified) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Advance payment must be paid and verified before marking balance as paid",
//       });
//     }

//     if (!booking.receipts?.advanceReceiptSent) {
//       return res.status(400).json({
//         success: false,
//         message: "Advance receipt must be sent before marking balance as paid",
//       });
//     }

//     // 5. Mark balance as paid
//     booking.payment.balance.paid = true;
//     booking.payment.balance.paymentVerified = true;
//     booking.payment.balance.paidAt = new Date();

//     await booking.save({ validateModifiedOnly: true });

//     return res.status(200).json({
//       success: true,
//       message: "Offline booking balance marked as paid successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error("markOfflineBalancePaid error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Something went wrong",
//     });
//   }
// };
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

// A new controller that gets the tourId from the request body
// const updateTourProfile = async (req, res) => {
//   try {
//     const { tourId } = req.body; // 🚨 CHANGE: Get tourId from the request body
//     if (!tourId) {
//       return res.json({ success: false, message: "Tour ID is missing" });
//     }

//     const tour = await tourModel.findById(tourId);
//     if (!tour) {
//       return res.json({ success: false, message: "Tour not found" });
//     }

//     // 1. Destructure and get files
//     const { titleImage, mapImage, galleryImages } = req.files || {};

//     // 2. Image upload helper
//     const uploadImage = async (file) => {
//       const result = await cloudinary.uploader.upload(file.path, {
//         resource_type: "image",
//       });
//       return result.secure_url;
//     };

//     let updateFields = {};

//     // 3. Process images
//     if (titleImage) {
//       updateFields.titleImage = await uploadImage(titleImage[0]);
//     }
//     if (mapImage) {
//       updateFields.mapImage = await uploadImage(mapImage[0]);
//     }
//     if (galleryImages) {
//       if (galleryImages.length !== 3) {
//         return res.json({
//           success: false,
//           message: "Please upload exactly 3 gallery images",
//         });
//       }
//       updateFields.galleryImages = await Promise.all(
//         galleryImages.map((img) => uploadImage(img))
//       );
//     }

//     // 4. Get and parse all body fields, including nested ones
//     const {
//       title,
//       batch,
//       duration,
//       price,
//       destination,
//       sightseeing,
//       itinerary,
//       includes,
//       excludes,
//       trainDetails,
//       flightDetails,
//       lastBookingDate,
//       completedTripsCount,
//       available,
//       advanceAmount,
//       addons,
//       boardingPoints,
//       deboardingPoints,
//       remarks,
//     } = req.body;

//     // 5. Use existing data as a fallback for calculations
//     let parsedPrice = tour.price;
//     if (price) {
//       try {
//         parsedPrice = JSON.parse(price);
//         updateFields.price = parsedPrice;
//       } catch {
//         return res.json({ success: false, message: "Invalid JSON in price" });
//       }
//     }

//     let parsedAdvanceAmount = tour.advanceAmount;
//     if (advanceAmount) {
//       try {
//         parsedAdvanceAmount = JSON.parse(advanceAmount);
//         updateFields.advanceAmount = parsedAdvanceAmount;
//       } catch {
//         return res.json({
//           success: false,
//           message: "Invalid JSON in advanceAmount",
//         });
//       }
//     }

//     // 6. Recalculate balances using the most current data (either from the request or the DB)
//     if (parsedPrice && parsedAdvanceAmount) {
//       const adultAdvance = Number(parsedAdvanceAmount.adult);
//       const childAdvance = Number(parsedAdvanceAmount.child);

//       updateFields.balanceDouble =
//         Number(parsedPrice.doubleSharing) - adultAdvance;
//       updateFields.balanceTriple =
//         Number(parsedPrice.tripleSharing) - adultAdvance;
//       updateFields.balanceChildWithBerth =
//         Number(parsedPrice.childWithBerth) - childAdvance;
//       updateFields.balanceChildWithoutBerth =
//         Number(parsedPrice.childWithoutBerth) - childAdvance;
//     }

//     // 7. Update other fields (duration, completedTripsCount, etc.)
//     if (title) updateFields.title = title;
//     if (remarks) updateFields.remarks = remarks;
//     if (batch) updateFields.batch = batch;
//     if (lastBookingDate) updateFields.lastBookingDate = lastBookingDate;
//     if (typeof available !== "undefined") updateFields.available = available;

//     if (duration) {
//       try {
//         const parsed = JSON.parse(duration);
//         const days = Number(parsed.days);
//         const nights = Number(parsed.nights);
//         if (isNaN(days) || isNaN(nights)) {
//           return res.json({
//             success: false,
//             message: "Invalid duration format",
//           });
//         }
//         updateFields.duration = { days, nights };
//       } catch {
//         return res.json({
//           success: false,
//           message: "Invalid JSON in duration",
//         });
//       }
//     }

//     if (completedTripsCount) {
//       const trips = Number(completedTripsCount);
//       if (isNaN(trips) || trips < 0) {
//         return res.json({
//           success: false,
//           message: "Invalid completedTripsCount",
//         });
//       }
//       updateFields.completedTripsCount = trips;
//     }

//     // 8. Handle all optional arrays
//     const optionalArrays = {
//       destination,
//       sightseeing,
//       itinerary,
//       includes,
//       excludes,
//       trainDetails,
//       flightDetails,
//       addons,
//       boardingPoints,
//       deboardingPoints,
//     };

//     for (let key in optionalArrays) {
//       if (optionalArrays[key]) {
//         try {
//           const parsedArray = JSON.parse(optionalArrays[key]);
//           if (!Array.isArray(parsedArray)) throw new Error();

//           if (key === "addons") {
//             updateFields[key] = parsedArray.map((a) => ({
//               name: a.name,
//               amount: Number(a.amount) || 0,
//             }));
//           } else if (key === "boardingPoints" || key === "deboardingPoints") {
//             updateFields[key] = parsedArray.map((a) => ({
//               stationCode: a.stationCode,
//               stationName: a.stationName,
//             }));
//           } else {
//             updateFields[key] = parsedArray;
//           }
//         } catch {
//           return res.json({
//             success: false,
//             message: `Invalid JSON in ${key}`,
//           });
//         }
//       }
//     }

//     // 9. Final update
//     await tourModel.findByIdAndUpdate(tourId, { $set: updateFields });

//     res.json({ success: true, message: "Tour updated successfully" });
//   } catch (error) {
//     console.error("Update Tour Error:", error);
//     res.json({ success: false, message: error.message });
//   }
// };

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
