import validator from "validator";
import bcrypt from "bcrypt";
import userModel from "../models/userModel.js";
import tourModel from "../models/tourModel.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import { verifyGoogleToken } from "../middlewares/googleUserAuth.js";
import razorpay from "razorpay";
import crypto from "crypto";
import tourBookingModel from "../models/tourBookingmodel.js";

// API for Google Sign-In / Sign-Up
const googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google tokens is required",
      });
    }

    // Verify the Google token
    const payload = await verifyGoogleToken(idToken);

    if (!payload.email_verified) {
      return res.status(400).json({
        success: false,
        message: "Google email not verified",
      });
    }

    const { email, name, picture, sub: googleId } = payload;

    // Check if user already exists by email
    let user = await userModel.findOne({ email });

    if (!user) {
      // New user → auto register
      const hashedPassword = await bcrypt.genSalt(10); // random unused hash
      user = new userModel({
        name: name || "Google User",
        email,
        password: hashedPassword, // dummy password (never used)
        image: picture || "",
        googleId, // optional: store google sub for future reference
      });
      await user.save();
    } else {
      // Existing user → just log them in (optional: update name/image)
      user.name = user.name || name;
      user.image = user.image || picture;
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      success: true,
      token,
      message: "Google login successful",
    });
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    res.status(401).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.json({ success: false, message: "Email already registered" });
    }

    if (!name || !password || !email)
      return res.json({ success: false, message: "Missing details" });
    if (!validator.isEmail(email)) {
      return res.json({
        success: false,
        message: "Enter a valid email please",
      });
    }
    //Validating strong password
    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Enter a strong password",
      });
    }
    //Hashing user password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userData = {
      name,
      email,
      password: hashedPassword,
    };
    const newUser = new userModel(userData);

    const user = await newUser.save();

    //Creating token process
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ success: true, token });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

//API fpr uder login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User does not exists" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

//API to get user profile data

const getProfile = async (req, res) => {
  try {
    const userId = req.user._id; // ✅ correct
    const useData = await userModel.findById(userId).select("-password");

    res.json({ success: true, user: useData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

//API to update USER Profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone, address, dob, gender } = req.body;
    const imageFile = req.file;
    const userId = req.user._id; // ✅ from token, not from body

    if (!name || !phone || !dob || !gender) {
      return res.json({ success: false, message: "Data Missing" });
    }

    await userModel.findByIdAndUpdate(userId, {
      name,
      phone,
      address: JSON.parse(address),
      dob,
      gender,
    });

    if (imageFile) {
      // upload image to cloudinary
      const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
        resource_type: "image",
      });
      const imageURL = imageUpload.secure_url;

      await userModel.findByIdAndUpdate(userId, { image: imageURL });
    }

    res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
const addToTrolly = async (req, res) => {
  try {
    const {
      tourId,
      travellers = [],
      billingAddress,
      bookingType,
      contact,
    } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!tourId) {
      return res.status(400).json({
        success: false,
        message: "Tour ID is required.",
      });
    }

    // Fetch the tour
    const tour = await tourModel.findById(tourId);
    if (!tour) {
      return res.status(404).json({
        success: false,
        message: "Tour not found.",
      });
    }

    let totalAdvance = 0;
    let totalBalance = 0;
    const updatedTravellers = [];

    for (const trav of travellers) {
      const age = Number(trav.age);

      // --- Age-based validation check ---
      if (isNaN(age) || age < 1 || (age >= 1 && age <= 5)) {
        return res.status(400).json({
          success: false,
          message: `Booking failed: Invalid age for traveller ${
            trav.firstName || "Unknown"
          }. Age must be a number greater than 5.`,
        });
      }

      // --- Package Type Validation ---
      if (
        !trav.packageType ||
        !["main", "variant"].includes(trav.packageType)
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid package type for traveller: ${
            trav.firstName || "Unknown"
          }. Must be 'main' or 'variant'.`,
        });
      }

      if (
        trav.packageType === "variant" &&
        (trav.variantPackageIndex === null || isNaN(trav.variantPackageIndex))
      ) {
        return res.status(400).json({
          success: false,
          message: `Variant package index is required for traveller: ${
            trav.firstName || "Unknown"
          }.`,
        });
      }

      // Select package data based on traveller's packageType
      let selectedPackage = tour;
      if (trav.packageType === "variant") {
        if (!tour.variantPackage[trav.variantPackageIndex]) {
          return res.status(400).json({
            success: false,
            message: `Variant package at index ${
              trav.variantPackageIndex
            } does not exist for traveller: ${trav.firstName || "Unknown"}.`,
          });
        }
        selectedPackage = tour.variantPackage[trav.variantPackageIndex];
      }

      // --- Boarding Point Validation ---
      if (!trav.boardingPoint) {
        return res.status(400).json({
          success: false,
          message: `Boarding point is required for traveller: ${
            trav.firstName || "Unknown"
          }`,
        });
      }

      const validBoarding = selectedPackage.boardingPoints?.find(
        (bp) => bp.stationCode === trav.boardingPoint.stationCode,
      );

      if (!validBoarding) {
        return res.status(400).json({
          success: false,
          message: `Invalid boarding point for traveller: ${
            trav.firstName || "Unknown"
          }`,
        });
      }

      const selectedBoarding = {
        stationCode: validBoarding.stationCode,
        stationName: validBoarding.stationName,
      };

      // --- Deboarding Point Validation ---
      if (!trav.deboardingPoint) {
        return res.status(400).json({
          success: false,
          message: `Deboarding point is required for traveller: ${
            trav.firstName || "Unknown"
          }`,
        });
      }

      const validDeboarding = selectedPackage.deboardingPoints?.find(
        (dp) => dp.stationCode === trav.deboardingPoint.stationCode,
      );

      if (!validDeboarding) {
        return res.status(400).json({
          success: false,
          message: `Invalid deboarding point for traveller: ${
            trav.firstName || "Unknown"
          }`,
        });
      }

      const selectedDeboarding = {
        stationCode: validDeboarding.stationCode,
        stationName: validDeboarding.stationName,
      };

      // --- Add-on Validation ---
      let addonPrice = 0;
      let selectedAddonData = null;
      if (trav.selectedAddon?.name) {
        const validAddon = selectedPackage.addons?.find(
          (a) => a.name === trav.selectedAddon.name,
        );
        if (!validAddon) {
          return res.status(400).json({
            success: false,
            message: `Invalid add-on for traveller: ${
              trav.firstName || "Unknown"
            }`,
          });
        }
        addonPrice = Number(validAddon.amount) || 0;
        selectedAddonData = {
          name: validAddon.name,
          price: validAddon.amount,
        };
      }

      let travellerAdvance = 0;
      let travellerBalance = 0;

      // --- Age-based pricing logic ---
      if (age >= 11) {
        // Adult pricing (age 11 and above)
        travellerAdvance = Number(selectedPackage.advanceAmount?.adult) || 0;
        switch (trav.sharingType?.toLowerCase()) {
          case "double":
            travellerBalance = Number(selectedPackage.balanceDouble) || 0;
            break;
          case "triple":
            travellerBalance = Number(selectedPackage.balanceTriple) || 0;
            break;
          default:
            return res.status(400).json({
              success: false,
              message: `Invalid sharing type for adult traveller: ${
                trav.firstName || "Unknown"
              }`,
            });
        }
      } else if (age >= 6 && age <= 10) {
        // Child pricing (age 6 to 10)
        travellerAdvance = Number(selectedPackage.advanceAmount?.child) || 0;
        switch (trav.sharingType?.toLowerCase()) {
          case "withberth":
            travellerBalance =
              Number(selectedPackage.balanceChildWithBerth) || 0;
            break;
          case "withoutberth":
            travellerBalance =
              Number(selectedPackage.balanceChildWithoutBerth) || 0;
            break;
          default:
            return res.status(400).json({
              success: false,
              message: `Invalid sharing type for child traveller: ${
                trav.firstName || "Unknown"
              }`,
            });
        }
      }

      travellerAdvance += addonPrice;
      if (isNaN(travellerAdvance) || isNaN(travellerBalance)) {
        return res.status(400).json({
          success: false,
          message: `Booking failed: Could not calculate prices for traveller ${
            trav.firstName || "Unknown"
          }. Please check tour prices.`,
        });
      }

      totalAdvance += travellerAdvance;
      totalBalance += travellerBalance;

      updatedTravellers.push({
        ...trav,
        boardingPoint: selectedBoarding,
        deboardingPoint: selectedDeboarding,
        selectedAddon: selectedAddonData,
        remarks: trav.remarks || null,
        packageType: trav.packageType,
        variantPackageIndex:
          trav.packageType === "variant" ? trav.variantPackageIndex : null,
      });
    }

    // ────────────────────────────────────────────────
    //          TNR GENERATION – AA11AA format
    // ────────────────────────────────────────────────
    let tnr;
    let attempts = 0;
    const maxAttempts = 10;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const digits = "0123456789";

    while (attempts < maxAttempts) {
      tnr =
        letters.charAt(Math.floor(Math.random() * letters.length)) +
        letters.charAt(Math.floor(Math.random() * letters.length)) +
        digits.charAt(Math.floor(Math.random() * digits.length)) +
        digits.charAt(Math.floor(Math.random() * digits.length)) +
        letters.charAt(Math.floor(Math.random() * letters.length)) +
        letters.charAt(Math.floor(Math.random() * letters.length));

      const conflict = await tourBookingModel.exists({ tnr });
      if (!conflict) {
        break;
      }
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(503).json({
        success: false,
        message:
          "Unable to generate unique booking reference right now. Please try again in a moment.",
      });
    }

    // Prepare booking data for tourBookingModel
    const bookingData = {
      userId,
      tourId,
      tnr, // ← added here
      userData: {
        id: userId,
      },
      tourData: {
        id: tour._id,
        title: tour.title,
        titleImage: tour.titleImage,
        // Store main package duration and price as default
        duration: tour.duration,
        price: tour.price,
      },
      travellers: updatedTravellers,
      billingAddress: billingAddress || {},
      contact: {
        email: contact?.email,
        mobile: contact?.mobile,
      },
      bookingType: bookingType || "online",
      payment: {
        advance: {
          amount: totalAdvance,
        },
        balance: {
          amount: totalBalance,
        },
      },
      status: "pending",
      bookingDate: new Date(),
      emergencyContact: null,
      termsAgreed: false,
      termsAgreedAt: null,
    };

    const newBooking = new tourBookingModel(bookingData);
    await newBooking.save();

    return res.status(201).json({
      success: true,
      message: "Booking added to trolley successfully.",
      booking: newBooking,
    });
  } catch (error) {
    console.error("Error adding to trolley:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// Get all tour bookings for a user
const listTrolly = async (req, res) => {
  try {
    const userId = req.user;

    const bookings = await tourBookingModel
      .find({ userId })
      .populate(
        "tourId",
        "title duration titleImage advanceAmount doubleSharing tripleSharing",
      );

    res.json({ success: true, bookings });
  } catch (error) {
    console.log("Error in listCart:", error);
    res.json({ success: false, message: error.message });
  }
};

("use strict");
const cancelTraveller = async (req, res) => {
  try {
    const { tnr, travellerId } = req.body;
    const userId = req.user?._id;

    // Validate request body
    if (!tnr || !travellerId) {
      return res.status(400).json({
        success: false,
        message: "tnr and travellerId are required",
      });
    }

    // Fetch the booking by tnr
    const bookingData = await tourBookingModel.findOne({
      tnr: tnr.trim().toUpperCase(),
    });
    if (!bookingData) {
      return res.status(404).json({
        success: false,
        message: "Booking not found with this TNR",
      });
    }

    // Ensure the booking belongs to the logged-in user
    if (bookingData.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized action – this booking does not belong to you",
      });
    }

    // Check if advance payment is completed
    const advancePaid =
      bookingData.payment?.advance?.paid &&
      bookingData.payment?.advance?.paymentVerified;

    if (!advancePaid) {
      return res.status(400).json({
        success: false,
        message: "Advance payment not completed, cancellation cannot proceed.",
      });
    }

    // Find the traveller
    const travellerIndex = bookingData.travellers.findIndex(
      (traveller) => traveller._id.toString() === String(travellerId),
    );

    if (travellerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Traveller not found in this booking",
      });
    }

    const traveller = bookingData.travellers[travellerIndex];

    // Check if already cancelled
    if (traveller.cancelled?.byTraveller) {
      return res.status(400).json({
        success: false,
        message: "Traveller has already been cancelled",
      });
    }

    // Update cancellation flags
    traveller.cancelled = {
      ...traveller.cancelled,
      byTraveller: true,
      cancelledAt: new Date(),
    };

    await bookingData.save();

    return res.status(200).json({
      success: true,
      message: `Cancellation requested for traveller: ${traveller.firstName} ${traveller.lastName}`,
      tnr: bookingData.tnr,
      travellerId: traveller._id,
    });
  } catch (error) {
    console.error("Cancel Traveller Error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      error: error.message,
    });
  }
};

const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// // ===============================
// // CREATE PAYMENT ORDER
// // ===============================
const paymentRazorpay = async (req, res) => {
  try {
    const { tnr, paymentType } = req.body; // ← changed

    if (!tnr) {
      return res.json({ success: false, message: "TNR is required" });
    }

    // Find by tnr field (assuming tnr is a unique string field)
    const booking = await tourBookingModel.findOne({ tnr });

    if (!booking) {
      return res.json({
        success: false,
        message: "Booking not found",
      });
    }

    if (
      booking.cancelled?.byAdmin ||
      booking.cancelled?.byTraveller ||
      booking.isBookingCancelled // ← add if you have this flag
    ) {
      return res.json({
        success: false,
        message: "Booking cancelled or not found",
      });
    }

    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.json({
        success: false,
        message: "Unauthorized action",
      });
    }

    let amountToPay = 0;
    let paymentKey = "";

    if (paymentType === "advance") {
      if (booking.payment?.advance?.paid) {
        return res.json({ success: false, message: "Advance already paid" });
      }
      amountToPay = booking.payment.advance.amount;
      paymentKey = "advance";
    } else if (paymentType === "balance") {
      if (!booking.payment?.advance?.paid) {
        return res.json({ success: false, message: "Pay advance first" });
      }
      if (booking.payment?.balance?.paid) {
        return res.json({ success: false, message: "Balance already paid" });
      }
      amountToPay = booking.payment.balance.amount;
      paymentKey = "balance";
    } else {
      return res.json({ success: false, message: "Invalid payment type" });
    }

    // Razorpay order
    const options = {
      amount: Math.round(amountToPay * 100), // paise, avoid floating point issues
      currency: process.env.CURRENCY || "INR",
      receipt: `${tnr}_${paymentKey}`, // ← better to use tnr here too
    };

    const order = await razorpayInstance.orders.create(options);

    return res.json({
      success: true,
      order,
      // Optional: send these back if frontend needs them
      amountToPay,
      paymentType: paymentKey,
      tnr,
    });
  } catch (error) {
    console.error("Error in paymentRazorpay:", error);
    return res.json({
      success: false,
      message: error.message || "Payment initiation failed",
    });
  }
};

const verifyRazorpay = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tnr,
      paymentType,
    } = req.body;

    // You can send tnr & paymentType from frontend in verify call (safer)

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.json({ success: false, message: "Invalid signature" });
    }

    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);
    if (!orderInfo || orderInfo.status !== "paid") {
      return res.json({ success: false, message: "Payment not completed" });
    }

    // Prefer using tnr from body (more secure than parsing receipt)
    let booking;

    if (tnr) {
      booking = await tourBookingModel.findOne({ tnr });
    } else {
      // fallback – only if you didn't send tnr
      const [receiptTnr, receiptType] = orderInfo.receipt.split("_");
      booking = await tourBookingModel.findOne({ tnr: receiptTnr });
    }

    if (!booking) {
      return res.json({ success: false, message: "Booking not found" });
    }

    // Update
    await tourBookingModel.findOneAndUpdate(
      { tnr: booking.tnr },
      {
        $set: {
          [`payment.${paymentType}.paid`]: true,
          [`payment.${paymentType}.paidAt`]: new Date(),
          [`payment.${paymentType}.transactionId`]: razorpay_payment_id,
          [`payment.${paymentType}.razorpayOrderId`]: razorpay_order_id,
          [`payment.${paymentType}.status`]: "paid",
          [`payment.${paymentType}.paymentVerified`]: true,
        },
      },
    );

    return res.json({
      success: true,
      message: "Payment verified successfully.",
    });
  } catch (error) {
    console.error("Error in verifyRazorpay:", error);
    return res.json({ success: false, message: error.message });
  }
};

export {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  addToTrolly,
  listTrolly,
  cancelTraveller,
  paymentRazorpay,
  verifyRazorpay,
  googleSignIn,
};
