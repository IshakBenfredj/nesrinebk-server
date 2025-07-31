const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const products = require("./routes/productRoutes");
const categories = require("./routes/categoryRoutes");
const auth = require("./routes/authRoutes");
const sales = require("./routes/saleRoutes");
const expenses = require("./routes/expenseRoutes");
const dailyProfit = require("./routes/dailyProfitRoutes");
const orders = require("./routes/orderRoutes");
const job = require("./utils/cron");

// const job = require("./lib/cron");

dotenv.config();

const app = express();
job.start();

// const allowedOrigins = ["https://faqeeh.academy", "https://www.faqeeh.academy"];

// const corsOptions = {
//   origin: (origin, callback) => {
//     if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
//       callback(null, true);
//     } else {
//       callback(new Error("Not allowed by CORS"));
//     }
//   },
// };
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
// job.start()
// app.use(express.urlencoded({ limit: "5gb", extended: true }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
if (process.env.NODE_ENV === "production" || !process.env.NODE_ENV) {
  app.use(morgan("combined"));
}

app.use((req, res, next) => {
  const customerHeader = req.headers["x-custom-header"];
  if (!customerHeader || customerHeader !== "nesrinebk") {
    res.status(403).send("Access impossible");
  } else {
    next();
  }
});

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
app.use("/api/auth", auth);
app.use("/api/products", products);
app.use("/api/categories", categories);
app.use("/api/sales", sales);
app.use("/api/expenses", expenses);
app.use("/api/orders", orders);
app.use("/api/daily-profit", dailyProfit);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
