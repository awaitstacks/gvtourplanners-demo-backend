// import mongoose from "mongoose";
// import tourBookingModel from "../models/tourBookingmodel.js";
// import tourModel from "../models/tourModel.js";
// import cancellationModel from "../models/cancellationModel.js";

// const CancelRule =
//   mongoose.models.cancelrulemodel || mongoose.model("cancelrulemodel");

// // ---------- helpers ----------
// function daysBetween(dateA, dateB) {
//   const msPerDay = 1000 * 60 * 60 * 24;
//   return Math.floor(
//     (Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()) -
//       Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate())) /
//       msPerDay
//   );
// }

// function getTravellerAdvanceAmount(traveller, tourData) {
//   const isChild = traveller.age != null ? traveller.age < 12 : false;
//   const packType = traveller.packageType || "main";
//   if (packType === "variant") {
//     const vIndex = traveller.variantPackageIndex ?? 0;
//     const v = tourData.variantPackage?.[vIndex];
//     if (v?.advanceAmount) {
//       return isChild
//         ? Number(v.advanceAmount.child || 0)
//         : Number(v.advanceAmount.adult || 0);
//     }
//   }
//   return isChild
//     ? Number(tourData.advanceAmount?.child || 0)
//     : Number(tourData.advanceAmount?.adult || 0);
// }

// function getTravellerPackageBasePrice(traveller, tourData) {
//   const packType = traveller.packageType || "main";
//   const vIndex =
//     traveller.variantPackageIndex != null ? traveller.variantPackageIndex : 0;
//   const mapField = (sharing) => {
//     switch ((sharing || "").toLowerCase()) {
//       case "double":
//         return "doubleSharing";
//       case "triple":
//         return "tripleSharing";
//       case "withberth":
//         return "childWithBerth";
//       case "withoutberth":
//         return "childWithoutBerth";
//       default:
//         return null;
//     }
//   };
//   const field = mapField(traveller.sharingType);
//   let basePrice = 0;
//   if (packType === "variant") {
//     const variant = tourData.variantPackage?.[vIndex] || null;
//     if (variant?.price && field && variant.price[field] != null) {
//       basePrice = Number(variant.price[field]);
//     }
//   } else {
//     if (tourData.price && field && tourData.price[field] != null) {
//       basePrice = Number(tourData.price[field]);
//     }
//   }
//   return Number(basePrice || 0);
// }

// function getTravellerFullPackageCost(traveller, tourData) {
//   const cancelled = traveller.cancelled || {};
//   if (cancelled.byTraveller === true || cancelled.byAdmin === true) {
//     return 0;
//   }

//   const base = getTravellerPackageBasePrice(traveller, tourData);
//   const selectedAddonPrice = traveller.selectedAddon?.price
//     ? Number(traveller.selectedAddon.price)
//     : 0;

//   let customAddonsTotal = 0;
//   if (Array.isArray(traveller.customAddons) && traveller.customAddons.length) {
//     customAddonsTotal = traveller.customAddons
//       .map((a) => Number(a?.price || 0))
//       .reduce((s, v) => s + v, 0);
//   }

//   return Number((base + selectedAddonPrice + customAddonsTotal).toFixed(2));
// }

// function matchPercentageFromTiers(daysBefore, tiers) {
//   const raw = Array.isArray(tiers) ? tiers : [];
//   const normalized = raw
//     .map((t) => {
//       const fromD = Number(t?.fromDays ?? NaN);
//       const toD = Number(t?.toDays ?? NaN);
//       const pct = Number(t?.percentage ?? NaN);
//       if (
//         Number.isFinite(fromD) &&
//         Number.isFinite(toD) &&
//         Number.isFinite(pct)
//       ) {
//         return { fromD, toD, pct };
//       }
//       return null;
//     })
//     .filter(Boolean);
//   normalized.sort((a, b) => {
//     const widthA = a.toD - a.fromD;
//     const widthB = b.toD - b.fromD;
//     if (widthA !== widthB) return widthA - widthB;
//     return b.fromD - a.fromD;
//   });
//   if (daysBefore > 60) return 0;
//   for (const t of normalized) {
//     if (daysBefore >= t.fromD && daysBefore <= t.toD) return Number(t.pct);
//   }
//   return 100;
// }

// function sumNumericValues(container) {
//   if (!container) return 0;
//   let sum = 0;
//   if (Array.isArray(container)) {
//     for (const v of container) {
//       const n = Number(v || 0);
//       if (!Number.isNaN(n)) sum += n;
//     }
//   } else if (typeof container === "object") {
//     for (const k of Object.keys(container)) {
//       const n = Number(container[k] || 0);
//       if (!Number.isNaN(n)) sum += n;
//     }
//   } else {
//     const n = Number(container || 0);
//     if (!Number.isNaN(n)) sum += n;
//   }
//   return sum;
// }

// // ---------- unified controller ----------
// export const cancelBookingController = async (req, res) => {
//   try {
//     const bookingId = req.params.id || req.body.bookingId;
//     const {
//       cancellationDate,
//       cancelledTravellerIndexes = [],
//       extraRemarkAmount = 0,
//       remark = "",
//       irctcCancellationAmount = 0,
//       trainCancellations = null,
//       flightCancellations = null,
//     } = req.body;

//     if (!bookingId)
//       return res.status(400).json({ message: "bookingId required" });
//     if (!cancellationDate)
//       return res.status(400).json({ message: "cancellationDate required" });
//     if (
//       !Array.isArray(cancelledTravellerIndexes) ||
//       cancelledTravellerIndexes.length === 0
//     )
//       return res
//         .status(400)
//         .json({ message: "cancelledTravellerIndexes (array) required" });

//     const cancellationDt = new Date(cancellationDate);
//     if (isNaN(cancellationDt.getTime()))
//       return res.status(400).json({ message: "Invalid cancellationDate" });

//     const booking = await tourBookingModel.findById(bookingId).lean();
//     if (!booking) return res.status(404).json({ message: "Booking not found" });

//     // payment flags and amounts
//     const advancePaidFlag = booking.payment?.advance?.paid === true;
//     const advanceVerified = booking.payment?.advance?.paymentVerified === true;
//     const balancePaidFlag = booking.payment?.balance?.paid === true;
//     const balanceVerified = booking.payment?.balance?.paymentVerified === true;
//     const advAmount = Number(booking.payment?.advance?.amount || 0);
//     const balAmount = Number(booking.payment?.balance?.amount || 0);

//     // fetch tour data
//     let tour = null;
//     if (booking.tourId) tour = await tourModel.findById(booking.tourId).lean();
//     const tourData = tour || booking.tourData || {};
//     if (!tourData)
//       return res.status(400).json({ message: "Tour data not found." });

//     // daysBefore
//     const lastBookingDate = tourData.lastBookingDate
//       ? new Date(tourData.lastBookingDate)
//       : null;
//     const daysBefore = lastBookingDate
//       ? Math.max(0, daysBetween(cancellationDt, lastBookingDate))
//       : 0;

//     // travellers array
//     const travellers = Array.isArray(booking.travellers)
//       ? booking.travellers
//       : [];
//     if (!travellers.length)
//       return res.status(400).json({ message: "No travellers in booking." });

//     // build cancelled travellers array
//     const cancelledTravellers = cancelledTravellerIndexes
//       .map((i) => travellers[i])
//       .filter(Boolean);
//     if (!cancelledTravellers.length)
//       return res
//         .status(400)
//         .json({ message: "No valid cancelled travellers provided." });

//     // Sum train + flight breakdowns
//     const trainSum = Number(sumNumericValues(trainCancellations).toFixed(2));
//     const flightSum = Number(sumNumericValues(flightCancellations).toFixed(2));
//     const irctcTotal = Number(
//       (Number(irctcCancellationAmount || 0) + trainSum + flightSum).toFixed(2)
//     );

//     // Decide which flow to run
//     const isAdvanceOnlyFlow =
//       advancePaidFlag === true && balancePaidFlag !== true;
//     const isFullyPaidFlow =
//       advancePaidFlag === true &&
//       balancePaidFlag === true &&
//       advanceVerified &&
//       balanceVerified;

//     if (!isAdvanceOnlyFlow && !isFullyPaidFlow) {
//       return res.status(400).json({
//         message:
//           "Cannot determine flow: either advance-only OR fully paid (both verified).",
//       });
//     }

//     const cancelRule = await CancelRule.findOne().lean();

//     // -----------------------
//     // Fully-paid flow (unchanged)
//     // -----------------------
//     if (isFullyPaidFlow) {
//       const fullyPaidTiers = cancelRule?.gv?.fullyPaid?.tiers;
//       if (!Array.isArray(fullyPaidTiers) || fullyPaidTiers.length === 0) {
//         return res.status(400).json({
//           message: "fullyPaid tiers not configured in cancel rules.",
//         });
//       }

//       const matchedPercentage = matchPercentageFromTiers(
//         daysBefore,
//         fullyPaidTiers
//       );

//       const adminNegativeSum = (booking.adminRemarks || [])
//         .map((r) => Number(r.amount || 0))
//         .filter((amt) => amt < 0)
//         .reduce((s, v) => s + v, 0);

//       const netAmountPaid = Number(
//         (advAmount - adminNegativeSum + balAmount).toFixed(2)
//       );

//       let gvCancellationAmount = 0;
//       for (const t of cancelledTravellers) {
//         const basePrice = getTravellerPackageBasePrice(t, tourData);
//         gvCancellationAmount += (basePrice * matchedPercentage) / 100;
//       }
//       gvCancellationAmount = Number(gvCancellationAmount.toFixed(2));

//       const remarksAmount = Number(extraRemarkAmount || 0);

//       const totalCancellationAmount = Number(
//         (gvCancellationAmount + remarksAmount + irctcTotal).toFixed(2)
//       );

//       const updatedBalance = netAmountPaid;

//       const cancelledTotalPackagePlusAddons = cancelledTravellers
//         .map((t) => getTravellerFullPackageCost(t, tourData))
//         .reduce((s, v) => s + v, 0);

//       const refundAmount = Number(
//         Math.max(
//           0,
//           cancelledTotalPackagePlusAddons - totalCancellationAmount
//         ).toFixed(2)
//       );

//       const cancellationDoc = new cancellationModel({
//         bookingId: booking._id,
//         travellerIds: cancelledTravellers.map((t) => t._id).filter(Boolean),
//         travellerIndexes: cancelledTravellerIndexes,
//         netAmountPaid,
//         noOfDays: daysBefore,
//         gvCancellationAmount,
//         irctcCancellationAmount: irctcTotal,
//         remarksAmount,
//         totalCancellationAmount,
//         updatedBalance,
//         refundAmount,
//         remarkText: remark || "",
//         approvedBy: false,
//         raisedBy: false,
//       });
//       await cancellationDoc.save();

//       await cancellationModel.findByIdAndUpdate(cancellationDoc._id, {
//         raisedBy: true,
//       });

//       return res.status(200).json({
//         message: "Fully-paid cancellation completed",
//         data: {
//           cancellationRecordId: cancellationDoc._id,
//           bookingId: booking._id,
//           daysBefore,
//           matchedPercentage,
//           netAmountPaid,
//           gvCancellationAmount,
//           irctcCancellationAmount: irctcTotal,
//           trainSum,
//           flightSum,
//           remarksAmount,
//           totalCancellationAmount,
//           updatedBalance,
//           refundAmount,
//         },
//       });
//     }

//     // -----------------------
//     // Advance-Only Flow – ALL TRAVELLERS CANCELLED
//     // -----------------------
//     if (isAdvanceOnlyFlow) {
//       const advancePaidTiers = cancelRule?.gv?.advancePaid?.tiers;
//       let matchedPercentage = 100;
//       if (Array.isArray(advancePaidTiers) && advancePaidTiers.length > 0)
//         matchedPercentage = matchPercentageFromTiers(
//           daysBefore,
//           advancePaidTiers
//         );
//       if (daysBefore > 60) matchedPercentage = 0;

//       const adminNegSum = (booking.adminRemarks || [])
//         .filter((r) => Number(r.amount) < 0)
//         .reduce((s, r) => s + Number(r.amount), 0);
//       const netAmountPaid = Number((advAmount - adminNegSum).toFixed(2));

//       // === GV CANCELLATION FROM ADVANCE ONLY ===
//       let gvCancellationAmount = 0;
//       for (const traveller of cancelledTravellers) {
//         const advPerTraveller = getTravellerAdvanceAmount(traveller, tourData);
//         gvCancellationAmount += (advPerTraveller * matchedPercentage) / 100;
//       }
//       gvCancellationAmount = Number(gvCancellationAmount.toFixed(2));

//       // === REMAINING ACTIVE TRAVELLERS ===
//       const activeTravellers = travellers.filter(
//         (_, idx) => !cancelledTravellerIndexes.includes(idx)
//       );
//       const preBalanceAmount = Number(
//         activeTravellers
//           .reduce((sum, t) => sum + getTravellerFullPackageCost(t, tourData), 0)
//           .toFixed(2)
//       );

//       const remarksAmount = Number(extraRemarkAmount || 0);
//       const bookingBalanceManagementAmount = (booking.adminRemarks || [])
//         .filter((r) => Number(r.amount) > 0)
//         .reduce((s, r) => s + Number(r.amount), 0);

//       const totalCancellationAmount = Number(
//         (
//           bookingBalanceManagementAmount +
//           gvCancellationAmount +
//           remarksAmount +
//           irctcTotal
//         ).toFixed(2)
//       );

//       const isMultiTravellerBooking = travellers.length > 1;
//       const hasAnyCancellation = cancelledTravellers.length > 0;

//       const gvPool =
//         isMultiTravellerBooking && hasAnyCancellation
//           ? Number(booking.gvCancellationPool || 0)
//           : 0;
//       const irctcPool =
//         isMultiTravellerBooking && hasAnyCancellation
//           ? Number(booking.irctcCancellationPool || 0)
//           : 0;

//       // === ALL TRAVELLERS CANCELLED → SPECIAL REFUND LOGIC ===
//       let refundAmount = 0;
//       let updatedBalance = 0;

//       if (activeTravellers.length === 0) {
//         // All cancelled → refund = GV + remarks + balance mgmt - net paid
//         refundAmount = Number(
//           (
//             gvCancellationAmount +
//             remarksAmount +
//             irctcCancellationAmount -
//             netAmountPaid
//           ).toFixed(2)
//         );
//         if (refundAmount < 0) refundAmount = Number(refundAmount * -1);
//         updatedBalance = -refundAmount;
//       } else {
//         // Partial cancellation → normal logic
//         updatedBalance = Number(
//           (
//             bookingBalanceManagementAmount +
//             remarksAmount +
//             preBalanceAmount +
//             gvCancellationAmount +
//             irctcTotal +
//             gvPool +
//             irctcPool -
//             netAmountPaid
//           ).toFixed(2)
//         );
//         if (updatedBalance < 0) {
//           refundAmount = Number((-updatedBalance).toFixed(2));
//         }
//       }

//       // === REFUND ALREADY ISSUED CHECK ===
//       if (balAmount < 0) {
//         const cancellationDoc = new cancellationModel({
//           bookingId: booking._id,
//           travellerIds: cancelledTravellers.map((t) => t._id),
//           travellerIndexes: cancelledTravellerIndexes,
//           netAmountPaid,
//           noOfDays: daysBefore,
//           gvCancellationAmount,
//           irctcCancellationAmount: irctcTotal,
//           preBalanceAmount,
//           bookingBalanceManagementAmount,
//           remarksAmount,
//           totalCancellationAmount,
//           updatedBalance,
//           refundAmount: 0,
//           remarkText: remark || "",
//           approvedBy: false,
//           raisedBy: false,
//           gvCancellationPool: gvPool,
//           irctcCancellationPool: irctcPool,
//         });
//         await cancellationDoc.save();

//         await cancellationModel.findByIdAndUpdate(cancellationDoc._id, {
//           raisedBy: true,
//         });

//         return res.status(200).json({
//           message: "Refund already issued. No further refund.",
//           data: {
//             cancellationRecordId: cancellationDoc._id,
//             bookingId: booking._id,
//             daysBefore,
//             matchedPercentage,
//             netAmountPaid,
//             gvCancellationAmount,
//             irctcCancellationAmount: irctcTotal,
//             preBalanceAmount,
//             bookingBalanceManagementAmount,
//             remarksAmount,
//             totalCancellationAmount,
//             updatedBalance,
//             refundAmount: 0,
//             usedPools: {
//               gvCancellationPool: gvPool,
//               irctcCancellationPool: irctcPool,
//             },
//           },
//         });
//       }

//       // === SAVE CANCELLATION RECORD ===
//       const cancellationDoc = new cancellationModel({
//         bookingId: booking._id,
//         travellerIds: cancelledTravellers.map((t) => t._id),
//         travellerIndexes: cancelledTravellerIndexes,
//         netAmountPaid,
//         noOfDays: daysBefore,
//         gvCancellationAmount,
//         irctcCancellationAmount: irctcTotal,
//         preBalanceAmount,
//         bookingBalanceManagementAmount,
//         remarksAmount,
//         totalCancellationAmount,
//         updatedBalance,
//         refundAmount,
//         remarkText: remark || "",
//         approvedBy: false,
//         raisedBy: false,
//         gvCancellationPool: gvPool,
//         irctcCancellationPool: irctcPool,
//       });
//       await cancellationDoc.save();

//       await cancellationModel.findByIdAndUpdate(cancellationDoc._id, {
//         raisedBy: true,
//       });

//       return res.status(200).json({
//         message: "Advance-only cancellation completed",
//         data: {
//           cancellationRecordId: cancellationDoc._id,
//           bookingId: booking._id,
//           daysBefore,
//           matchedPercentage,
//           netAmountPaid,
//           gvCancellationAmount,
//           trainSum,
//           flightSum,
//           irctcCancellationAmount: irctcTotal,
//           preBalanceAmount,
//           bookingBalanceManagementAmount,
//           remarksAmount,
//           totalCancellationAmount,
//           updatedBalance,
//           refundAmount,
//           usedPools: {
//             gvCancellationPool: gvPool,
//             irctcCancellationPool: irctcPool,
//           },
//         },
//       });
//     }

//     return res.status(500).json({ message: "Unhandled cancellation flow." });
//   } catch (err) {
//     console.error("cancelBookingController error:", err);
//     return res
//       .status(500)
//       .json({ message: "Internal server error", error: err.message });
//   }
// };

// export default cancelBookingController;
import mongoose from "mongoose";
import tourBookingModel from "../models/tourBookingmodel.js";
import tourModel from "../models/tourModel.js";
import cancellationModel from "../models/cancellationModel.js";

const CancelRule =
  mongoose.models.cancelrulemodel || mongoose.model("cancelrulemodel");

// ---------- helpers ----------
function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(
    (Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()) -
      Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate())) /
      msPerDay
  );
}

function getTravellerAdvanceAmount(traveller, tourData) {
  const isChild = traveller.age != null ? traveller.age < 12 : false;
  const packType = traveller.packageType || "main";
  if (packType === "variant") {
    const vIndex = traveller.variantPackageIndex ?? 0;
    const v = tourData.variantPackage?.[vIndex];
    if (v?.advanceAmount) {
      return isChild
        ? Number(v.advanceAmount.child || 0)
        : Number(v.advanceAmount.adult || 0);
    }
  }
  return isChild
    ? Number(tourData.advanceAmount?.child || 0)
    : Number(tourData.advanceAmount?.adult || 0);
}

function getTravellerPackageBasePrice(traveller, tourData) {
  const packType = traveller.packageType || "main";
  const vIndex =
    traveller.variantPackageIndex != null ? traveller.variantPackageIndex : 0;
  const mapField = (sharing) => {
    switch ((sharing || "").toLowerCase()) {
      case "double":
        return "doubleSharing";
      case "triple":
        return "tripleSharing";
      case "withberth":
        return "childWithBerth";
      case "withoutberth":
        return "childWithoutBerth";
      default:
        return null;
    }
  };
  const field = mapField(traveller.sharingType);
  let basePrice = 0;
  if (packType === "variant") {
    const variant = tourData.variantPackage?.[vIndex] || null;
    if (variant?.price && field && variant.price[field] != null) {
      basePrice = Number(variant.price[field]);
    }
  } else {
    if (tourData.price && field && tourData.price[field] != null) {
      basePrice = Number(tourData.price[field]);
    }
  }
  return Number(basePrice || 0);
}

function getTravellerFullPackageCost(traveller, tourData) {
  const cancelled = traveller.cancelled || {};
  if (cancelled.byTraveller === true || cancelled.byAdmin === true) {
    return 0;
  }

  const base = getTravellerPackageBasePrice(traveller, tourData);
  const selectedAddonPrice = traveller.selectedAddon?.price
    ? Number(traveller.selectedAddon.price)
    : 0;

  let customAddonsTotal = 0;
  if (Array.isArray(traveller.customAddons) && traveller.customAddons.length) {
    customAddonsTotal = traveller.customAddons
      .map((a) => Number(a?.price || 0))
      .reduce((s, v) => s + v, 0);
  }

  return Number((base + selectedAddonPrice + customAddonsTotal).toFixed(2));
}

function matchPercentageFromTiers(daysBefore, tiers) {
  const raw = Array.isArray(tiers) ? tiers : [];
  const normalized = raw
    .map((t) => {
      const fromD = Number(t?.fromDays ?? NaN);
      const toD = Number(t?.toDays ?? NaN);
      const pct = Number(t?.percentage ?? NaN);
      if (
        Number.isFinite(fromD) &&
        Number.isFinite(toD) &&
        Number.isFinite(pct)
      ) {
        return { fromD, toD, pct };
      }
      return null;
    })
    .filter(Boolean);
  normalized.sort((a, b) => {
    const widthA = a.toD - a.fromD;
    const widthB = b.toD - b.fromD;
    if (widthA !== widthB) return widthA - widthB;
    return b.fromD - a.fromD;
  });
  if (daysBefore > 60) return 0;
  for (const t of normalized) {
    if (daysBefore >= t.fromD && daysBefore <= t.toD) return Number(t.pct);
  }
  return 100;
}

function sumNumericValues(container) {
  if (!container) return 0;
  let sum = 0;
  if (Array.isArray(container)) {
    for (const v of container) {
      const n = Number(v || 0);
      if (!Number.isNaN(n)) sum += n;
    }
  } else if (typeof container === "object") {
    for (const k of Object.keys(container)) {
      const n = Number(container[k] || 0);
      if (!Number.isNaN(n)) sum += n;
    }
  } else {
    const n = Number(container || 0);
    if (!Number.isNaN(n)) sum += n;
  }
  return sum;
}

// ---------- unified controller ----------
export const cancelBookingController = async (req, res) => {
  try {
    const bookingId = req.params.id || req.body.bookingId;
    const {
      cancellationDate,
      cancelledTravellerIndexes = [],
      extraRemarkAmount = 0,
      remark = "",
      irctcCancellationAmount = 0,
      trainCancellations = null,
      flightCancellations = null,
    } = req.body;

    if (!bookingId)
      return res.status(400).json({ message: "bookingId required" });
    if (!cancellationDate)
      return res.status(400).json({ message: "cancellationDate required" });

    const cancellationDt = new Date(cancellationDate);
    if (isNaN(cancellationDt.getTime()))
      return res.status(400).json({ message: "Invalid cancellationDate" });

    const booking = await tourBookingModel.findById(bookingId).lean();
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // payment flags and amounts
    const advancePaidFlag = booking.payment?.advance?.paid === true;
    const advanceVerified = booking.payment?.advance?.paymentVerified === true;
    const balancePaidFlag = booking.payment?.balance?.paid === true;
    const balanceVerified = booking.payment?.balance?.paymentVerified === true;
    const advAmount = Number(booking.payment?.advance?.amount || 0);
    const balAmount = Number(booking.payment?.balance?.amount || 0);

    // fetch tour data
    let tour = null;
    if (booking.tourId) tour = await tourModel.findById(booking.tourId).lean();
    const tourData = tour || booking.tourData || {};
    if (!tourData)
      return res.status(400).json({ message: "Tour data not found." });

    // daysBefore
    const lastBookingDate = tourData.lastBookingDate
      ? new Date(tourData.lastBookingDate)
      : null;
    const daysSince = lastBookingDate
      ? Math.max(0, daysBetween(cancellationDt, lastBookingDate))
      : 0;

    // travellers array
    const travellers = Array.isArray(booking.travellers)
      ? booking.travellers
      : [];
    if (!travellers.length)
      return res.status(400).json({ message: "No travellers in booking." });

    // build cancelled travellers array
    const cancelledTravellers = cancelledTravellerIndexes
      .map((i) => travellers[i])
      .filter(Boolean);
    if (!cancelledTravellers.length)
      return res
        .status(400)
        .json({ message: "No valid cancelled travellers provided." });

    // Sum train + flight breakdowns
    const trainSum = Number(sumNumericValues(trainCancellations).toFixed(2));
    const flightSum = Number(sumNumericValues(flightCancellations).toFixed(2));
    const irctcTotal = Number(
      (Number(irctcCancellationAmount || 0) + trainSum + flightSum).toFixed(2)
    );

    // Decide which flow to run
    const isAdvanceOnlyFlow =
      advancePaidFlag === true && balancePaidFlag !== true;
    const isFullyPaidFlow =
      advancePaidFlag === true &&
      balancePaidFlag === true &&
      advanceVerified &&
      balanceVerified;

    if (!isAdvanceOnlyFlow && !isFullyPaidFlow) {
      return res.status(400).json({
        message:
          "Cannot determine flow: either advance-only OR fully paid (both verified).",
      });
    }

    const cancelRule = await CancelRule.findOne().lean();

    // -----------------------
    // Fully-paid flow
    // -----------------------
    if (isFullyPaidFlow) {
      const fullyPaidTiers = cancelRule?.gv?.fullyPaid?.tiers;
      if (!Array.isArray(fullyPaidTiers) || fullyPaidTiers.length === 0) {
        return res.status(400).json({
          message: "fullyPaid tiers not configured in cancel rules.",
        });
      }

      const matchedPercentage = matchPercentageFromTiers(
        daysSince,
        fullyPaidTiers
      );

      const adminNegativeSum = (booking.adminRemarks || [])
        .map((r) => Number(r.amount || 0))
        .filter((amt) => amt < 0)
        .reduce((s, v) => s + v, 0);

      const netAmountPaid = Number(
        (advAmount - adminNegativeSum + balAmount).toFixed(2)
      );

      let gvCancellationAmount = 0;
      for (const t of cancelledTravellers) {
        const basePrice = getTravellerPackageBasePrice(t, tourData);
        gvCancellationAmount += (basePrice * matchedPercentage) / 100;
      }
      gvCancellationAmount = Number(gvCancellationAmount.toFixed(2));

      const remarksAmount = Number(extraRemarkAmount || 0);

      const totalCancellationAmount = Number(
        (gvCancellationAmount + remarksAmount + irctcTotal).toFixed(2)
      );

      const updatedBalance = netAmountPaid;

      const cancelledTotalPackagePlusAddons = cancelledTravellers
        .map((t) => getTravellerFullPackageCost(t, tourData))
        .reduce((s, v) => s + v, 0);

      const refundAmount = Number(
        Math.max(
          0,
          cancelledTotalPackagePlusAddons - totalCancellationAmount
        ).toFixed(2)
      );

      const cancellationDoc = new cancellationModel({
        bookingId: booking._id,
        travellerIds: cancelledTravellers.map((t) => t._id).filter(Boolean),
        travellerIndexes: cancelledTravellerIndexes,
        netAmountPaid,
        noOfDays: daysSince,
        gvCancellationAmount,
        irctcCancellationAmount: irctcTotal,
        remarksAmount,
        totalCancellationAmount,
        updatedBalance,
        refundAmount,
        remarkText: remark || "",
        approvedBy: false,
        raisedBy: false,
      });
      await cancellationDoc.save();

      await cancellationModel.findByIdAndUpdate(cancellationDoc._id, {
        raisedBy: true,
      });

      // ONLY CHANGE: Set cancellationRequest = true
      await tourBookingModel.findByIdAndUpdate(booking._id, {
        $set: {
          cancellationRequest: true,
        },
      });

      return res.status(200).json({
        message: "Fully-paid cancellation completed",
        data: {
          cancellationRecordId: cancellationDoc._id,
          bookingId: booking._id,
          daysBefore: daysSince,
          matchedPercentage,
          netAmountPaid,
          gvCancellationAmount,
          irctcCancellationAmount: irctcTotal,
          trainSum,
          flightSum,
          remarksAmount,
          totalCancellationAmount,
          updatedBalance,
          refundAmount,
        },
      });
    }

    // -----------------------
    // Advance-Only Flow
    // -----------------------
    if (isAdvanceOnlyFlow) {
      const advancePaidTiers = cancelRule?.gv?.advancePaid?.tiers;
      let matchedPercentage = 100;
      if (Array.isArray(advancePaidTiers) && advancePaidTiers.length > 0)
        matchedPercentage = matchPercentageFromTiers(
          daysSince,
          advancePaidTiers
        );
      if (daysSince > 60) matchedPercentage = 0;

      const adminNegSum = (booking.adminRemarks || [])
        .filter((r) => Number(r.amount) < 0)
        .reduce((s, r) => s + Number(r.amount), 0);
      const netAmountPaid = Number((advAmount - adminNegSum).toFixed(2));

      let gvCancellationAmount = 0;
      for (const traveller of cancelledTravellers) {
        const advPerTraveller = getTravellerAdvanceAmount(traveller, tourData);
        gvCancellationAmount += (advPerTraveller * matchedPercentage) / 100;
      }
      gvCancellationAmount = Number(gvCancellationAmount.toFixed(2));

      const activeTravellers = travellers.filter(
        (_, idx) => !cancelledTravellerIndexes.includes(idx)
      );
      const preBalanceAmount = Number(
        activeTravellers
          .reduce((sum, t) => sum + getTravellerFullPackageCost(t, tourData), 0)
          .toFixed(2)
      );

      const remarksAmount = Number(extraRemarkAmount || 0);
      const bookingBalanceManagementAmount = (booking.adminRemarks || [])
        .filter((r) => Number(r.amount) > 0)
        .reduce((s, r) => s + Number(r.amount), 0);

      const totalCancellationAmount = Number(
        (
          bookingBalanceManagementAmount +
          gvCancellationAmount +
          remarksAmount +
          irctcTotal
        ).toFixed(2)
      );

      const isMultiTravellerBooking = travellers.length > 1;
      const hasAnyCancellation = cancelledTravellers.length > 0;

      const gvPool =
        isMultiTravellerBooking && hasAnyCancellation
          ? Number(booking.gvCancellationPool || 0)
          : 0;
      const irctcPool =
        isMultiTravellerBooking && hasAnyCancellation
          ? Number(booking.irctcCancellationPool || 0)
          : 0;

      let refundAmount = 0;
      let updatedBalance = 0;

      if (activeTravellers.length === 0) {
        refundAmount = Number(
          (
            gvCancellationAmount +
            remarksAmount +
            irctcTotal -
            netAmountPaid
          ).toFixed(2)
        );
        if (refundAmount < 0) refundAmount = Number(refundAmount * -1);
        updatedBalance = -refundAmount;
      } else {
        updatedBalance = Number(
          (
            bookingBalanceManagementAmount +
            remarksAmount +
            preBalanceAmount +
            gvCancellationAmount +
            irctcTotal +
            gvPool +
            irctcPool -
            netAmountPaid
          ).toFixed(2)
        );
        if (updatedBalance < 0) {
          refundAmount = Number((-updatedBalance).toFixed(2));
        }
      }

      // REFUND ALREADY ISSUED CHECK
      if (balAmount < 0) {
        const cancellationDoc = new cancellationModel({
          bookingId: booking._id,
          travellerIds: cancelledTravellers.map((t) => t._id),
          travellerIndexes: cancelledTravellerIndexes,
          netAmountPaid,
          noOfDays: daysSince,
          gvCancellationAmount,
          irctcCancellationAmount: irctcTotal,
          preBalanceAmount,
          bookingBalanceManagementAmount,
          remarksAmount,
          totalCancellationAmount,
          updatedBalance,
          refundAmount: 0,
          remarkText: remark || "",
          approvedBy: false,
          raisedBy: false,
          gvCancellationPool: gvPool,
          irctcCancellationPool: irctcPool,
        });
        await cancellationDoc.save();

        await cancellationModel.findByIdAndUpdate(cancellationDoc._id, {
          raisedBy: true,
        });

        // Also set cancellationRequest = true here
        await tourBookingModel.findByIdAndUpdate(booking._id, {
          $set: {
            cancellationRequest: true,
          },
        });

        return res.status(200).json({
          message: "Refund already issued. No further refund.",
          data: {
            cancellationRecordId: cancellationDoc._id,
            bookingId: booking._id,
            daysBefore: daysSince,
            matchedPercentage,
            netAmountPaid,
            gvCancellationAmount,
            irctcCancellationAmount: irctcTotal,
            preBalanceAmount,
            bookingBalanceManagementAmount,
            remarksAmount,
            totalCancellationAmount,
            updatedBalance,
            refundAmount: 0,
            usedPools: {
              gvCancellationPool: gvPool,
              irctcCancellationPool: irctcPool,
            },
          },
        });
      }

      // SAVE CANCELLATION RECORD
      const cancellationDoc = new cancellationModel({
        bookingId: booking._id,
        travellerIds: cancelledTravellers.map((t) => t._id),
        travellerIndexes: cancelledTravellerIndexes,
        netAmountPaid,
        noOfDays: daysSince,
        gvCancellationAmount,
        irctcCancellationAmount: irctcTotal,
        preBalanceAmount,
        bookingBalanceManagementAmount,
        remarksAmount,
        totalCancellationAmount,
        updatedBalance,
        refundAmount,
        remarkText: remark || "",
        approvedBy: false,
        raisedBy: false,
        gvCancellationPool: gvPool,
        irctcCancellationPool: irctcPool,
      });
      await cancellationDoc.save();

      await cancellationModel.findByIdAndUpdate(cancellationDoc._id, {
        raisedBy: true,
      });

      // ONLY CHANGE: Set cancellationRequest = true
      await tourBookingModel.findByIdAndUpdate(booking._id, {
        $set: {
          cancellationRequest: true,
        },
      });

      return res.status(200).json({
        message: "Advance-only cancellation completed",
        data: {
          cancellationRecordId: cancellationDoc._id,
          bookingId: booking._id,
          daysBefore: daysSince,
          matchedPercentage,
          netAmountPaid,
          gvCancellationAmount,
          trainSum,
          flightSum,
          irctcCancellationAmount: irctcTotal,
          preBalanceAmount,
          bookingBalanceManagementAmount,
          remarksAmount,
          totalCancellationAmount,
          updatedBalance,
          refundAmount,
          usedPools: {
            gvCancellationPool: gvPool,
            irctcCancellationPool: irctcPool,
          },
        },
      });
    }

    return res.status(500).json({ message: "Unhandled cancellation flow." });
  } catch (err) {
    console.error("cancelBookingController error:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};

export default cancelBookingController;
