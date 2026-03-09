import express from "express";
import {
  getBookingSummaryByTNR,
  getCurrentTerms,
  submitTermsAgreement,
} from "../controllers/tourAdminController.js";
const bookingRouter = express.Router();
bookingRouter.get("/terms/current", getCurrentTerms);
bookingRouter.post("/:tnr/agree-terms", submitTermsAgreement);
bookingRouter.get("/:tnr/summary", getBookingSummaryByTNR);

export default bookingRouter;
