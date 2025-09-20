import express from "express";
import {
  bookingComplete,
  bookingsTour,
  loginTour,
  markOfflineAdvancePaid,
  markOfflineBalancePaid,
  markAdvanceReceiptSent,
  markBalanceReceiptSent,
  tourDashboard,
  tourList,
  tourProfile,
  updateTourProfile,
  updateTraveller,
} from "../controllers/tourController.js";
import authTour from "../middlewares/authTour.js";
import { tourUpload } from "../middlewares/multer.js";
const tourRouter = express.Router();

tourRouter.get("/list", tourList);
tourRouter.post("/login", loginTour);
// tourRouter.get("/bookings-tour", authTour, bookingsTour);

tourRouter.get("/bookings-tour/:tourId", authTour, bookingsTour);
tourRouter.post("/complete-bookingtour", authTour, bookingComplete);

// tourRouter.get("/tour-dashboard", authTour, tourDashboard);
tourRouter.get("/tour-dashboard/:tourId", authTour, tourDashboard);
tourRouter.get("/tour-profile/:tourId", authTour, tourProfile);
// tourRouter.post("/update-tourprofile", authTour, updateTourProfile);
tourRouter.put("/update-tourprofile", authTour, tourUpload, updateTourProfile);
tourRouter.put("/mark-advancepaid", authTour, markOfflineAdvancePaid);
tourRouter.put("/mark-balancepaid", authTour, markOfflineBalancePaid);

tourRouter.put("/update-traveller", authTour, updateTraveller);
tourRouter.put("/mark-advance-receipt", authTour, markAdvanceReceiptSent);
tourRouter.put("/mark-balance-receipt", authTour, markBalanceReceiptSent);
export default tourRouter;
