const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const dataFile = path.join(__dirname, "Data.js");

/* ---------- FILE HELPERS ---------- */
function readData() {
  delete require.cache[require.resolve("./Data.js")];
  return require("./Data.js");
}

function writeData(data) {
  const content = `module.exports = ${JSON.stringify(data, null, 2)};`;
  fs.writeFileSync(dataFile, content);
}

/* ---------- BUY PLAN ---------- */
app.post("/buy-plan", (req, res) => {
  const { domain, school, name, plan } = req.body;

  if (!domain || domain.length > 7) {
    return res.json({ error: "Domain max 7 characters allowed" });
  }

  const data = readData();

  const exists = data.find(d => d.domain === domain);
  if (exists) {
    return res.json({ error: "Domain already taken" });
  }

  const record = {
    domain,
    school,
    name,
    plan,
    createdAt: new Date()
  };

  data.push(record);
  writeData(data);

  res.json({
    dashboardLink: `/${domain}`
  });
});

/* ---------- DASHBOARD ---------- */
app.get("/:domain", (req, res) => {
  const data = readData();
  const school = data.find(d => d.domain === req.params.domain);

  if (!school) return res.send("Invalid School Dashboard");

  const features = {
    attendance: false,
    reports: false,
    analytics: false
  };

  if (school.plan === "intermediate") {
    features.attendance = true;
    features.reports = true;
  }

  if (school.plan === "pro") {
    features.attendance = true;
    features.reports = true;
    features.analytics = true;
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>${school.school} Dashboard</title>
</head>
<body>
  <h1>${school.school}</h1>
  <h3>Teacher: ${school.name}</h3>
  <h3>Plan: ${school.plan.toUpperCase()}</h3>

  <ul>
    <li>Attendance: ${features.attendance ? "✅" : "🔒"}</li>
    <li>Reports: ${features.reports ? "✅" : "🔒"}</li>
    <li>Analytics: ${features.analytics ? "✅" : "🔒"}</li>
  </ul>

  <p><b>Dashboard URL:</b> https://tanneidfirstp.onrender.com/${school.domain}</p>
</body>
</html>
`);
});

/* ---------- ADMIN CHECK ---------- */
app.get("/all-data", (req, res) => {
  res.json(readData());
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
