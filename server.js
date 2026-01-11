const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const dataFile = path.join(__dirname, "Data.js");

/* Helper: Read data from file */
function readData() {
  delete require.cache[require.resolve("./Data.js")];
  return require("./Data.js");
}

/* Helper: Write data to file */
function writeData(data) {
  const content = `module.exports = ${JSON.stringify(data, null, 2)};`;
  fs.writeFileSync(dataFile, content);
}

/* BUY PLAN */
app.post("/buy-plan", (req, res) => {
  const { name, email, school, plan } = req.body;

  const teachers = readData();

  const teacher = {
    id: uuidv4(),
    name,
    email,
    school,
    plan,
    createdAt: new Date()
  };

  teachers.push(teacher);
  writeData(teachers);

  res.json({
    dashboardLink: `/dashboard/${teacher.id}`
  });
});

/* DASHBOARD */
app.get("/dashboard/:id", (req, res) => {
  const teachers = readData();
  const teacher = teachers.find(t => t.id === req.params.id);

  if (!teacher) return res.send("Invalid Dashboard");

  const features = {
    attendance: false,
    reports: false,
    analytics: false
  };

  if (teacher.plan === "intermediate") {
    features.attendance = true;
    features.reports = true;
  }

  if (teacher.plan === "pro") {
    features.attendance = true;
    features.reports = true;
    features.analytics = true;
  }

  res.send(`
    <h2>Welcome ${teacher.name}</h2>
    <h3>Plan: ${teacher.plan.toUpperCase()}</h3>
    <ul>
      <li>Attendance: ${features.attendance ? "✅" : "🔒"}</li>
      <li>Reports: ${features.reports ? "✅" : "🔒"}</li>
      <li>Analytics: ${features.analytics ? "✅" : "🔒"}</li>
    </ul>
  `);
});

/* ADMIN CHECK */
app.get("/all-data", (req, res) => {
  res.json(readData());
});

app.listen(5000, () =>
  console.log("Server running on http://localhost:5000")
);
