import express from "express";
import {
  addTour,
  allTours,
  approveCancellation,
  bookingCancelAdmin,
  bookingRejectAdmin,
  bookingRelease,
  bookingsAdmin,
  getCancellationChart,
  getCancellations,
  loginAdmin,
  rejectCancellation,
  tourAdminDashboard,
  upsertCancellationChart,
} from "../controllers/tourAdminController.js";
import authAdmin from "../middlewares/authAdmin.js";
import { tourUpload } from "../middlewares/multer.js"; // ✅ Correct import (pre-configured fields)

import { changeTourAvailability } from "../controllers/tourController.js";

const touradminRouter = express.Router();

// ✅ Route: Add a new tour with images
touradminRouter.post("/add-tour", authAdmin, tourUpload, addTour);
touradminRouter.post("/login", loginAdmin);
touradminRouter.post("/all-tours", authAdmin, allTours);

touradminRouter.post("/cancel-bookingadmin", authAdmin, bookingCancelAdmin);
touradminRouter.post("/reject-bookingadmin", authAdmin, bookingRejectAdmin);
touradminRouter.post("/release-bookingadmin", authAdmin, bookingRelease);
touradminRouter.post(
  "/change-touravailablity",
  authAdmin,
  changeTourAvailability
);

touradminRouter.get("/bookings", authAdmin, bookingsAdmin);
touradminRouter.get("/touradmindashboard", authAdmin, tourAdminDashboard);
touradminRouter.post(
  "/touradmincancelrule",
  authAdmin,
  upsertCancellationChart
);
touradminRouter.get("/touradmingetcancelrule", authAdmin, getCancellationChart);
touradminRouter.get("/touradmingetcancellations", authAdmin, getCancellations);
touradminRouter.post("/approvecancellation", authAdmin, approveCancellation);
touradminRouter.post("/rejectcancellation", authAdmin, rejectCancellation);
export default touradminRouter;
