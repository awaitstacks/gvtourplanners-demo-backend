// middlewares/multer.js
import multer from "multer";
import path from "path";
import fs from "fs"; // ← ADD THIS IMPORT

// ────────────────────────────────────────────────
// Existing code (DO NOT TOUCH)
// ────────────────────────────────────────────────
const storage = multer.diskStorage({
  filename: (req, file, callback) => {
    callback(null, file.originalname);
  },
});

const upload = multer({ storage });

const tourUpload = upload.fields([
  { name: "mapImage", maxCount: 1 },
  { name: "titleImage", maxCount: 1 },
  { name: "galleryImages", maxCount: 3 },
]);

// ────────────────────────────────────────────────
// Dedicated multer for payment QR uploads – auto-create folder
// ────────────────────────────────────────────────
const paymentQrDir = "uploads/temp/payment-qr/";

// Auto-create folder if missing (safe & idempotent)
if (!fs.existsSync(paymentQrDir)) {
  fs.mkdirSync(paymentQrDir, { recursive: true });
  console.log(`Created missing upload folder: ${paymentQrDir}`);
}

const paymentQrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, paymentQrDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const paymentFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed for QR code"), false);
  }
};

const paymentQrUpload = multer({
  storage: paymentQrStorage,
  fileFilter: paymentFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("qrImage");

export { upload, tourUpload, paymentQrUpload };
