require("dotenv").config();
const express = require("express");

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.use("/api", require("./routes/orderRoutes"));
app.use("/api", require("./routes/menuRoutes"));
app.use("/api", require("./routes/reportRoutes"));

app.get("/", (req, res) => {
  res.json({
    message: "RUOK Cafe System API is running",
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
});