const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const dataFile = path.join(__dirname, "Data.js");

// Get base URL dynamically
function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// Read data function
function readData() {
  try {
    if (!fs.existsSync(dataFile)) {
      return [];
    }
    delete require.cache[require.resolve("./Data.js")];
    const data = require("./Data.js");
    return data || [];
  } catch (error) {
    console.error("Error reading data:", error);
    return [];
  }
}

// Write data function
function writeData(data) {
  try {
    const content = `module.exports = ${JSON.stringify(data, null, 2)};`;
    fs.writeFileSync(dataFile, content);
  } catch (error) {
    console.error("Error writing data:", error);
  }
}

/* ---------- BUY PLAN ---------- */
app.post("/buy-plan", (req, res) => {
  const { domain, school, name, email, plan } = req.body;
  
  if (!domain || domain.length > 7)
    return res.json({ error: "Domain max 7 characters allowed" });
  if (!school || !name || !email)
    return res.json({ error: "All fields are required" });
  
  const data = readData();
  const exists = data.find((d) => d.domain === domain);
  if (exists) return res.json({ error: "Domain already taken" });
  
  const schoolData = {
    domain,
    school,
    name,
    email,
    plan: plan || "basic",
    createdAt: new Date().toISOString(),
    subdomains: []
  };
  
  data.push(schoolData);
  writeData(data);
  
  res.json({ 
    success: true,
    dashboardLink: `/dashboard/${domain}`,
    plan: schoolData.plan,
    message: "Main domain created successfully!"
  });
});

/* ---------- CREATE SUBDOMAIN ---------- */
app.post("/create-subdomain", (req, res) => {
  const { mainDomain, subdomain, type, name, description } = req.body;
  
  if (!mainDomain || !subdomain || !type) {
    return res.json({ error: "Main domain, subdomain and type are required" });
  }
  
  const data = readData();
  const schoolIndex = data.findIndex((d) => d.domain === mainDomain);
  
  if (schoolIndex === -1) {
    return res.json({ error: "Main domain not found" });
  }
  
  const subdomainExists = data[schoolIndex].subdomains.find(
    (s) => s.subdomain === subdomain
  );
  
  if (subdomainExists) {
    return res.json({ error: "Subdomain already exists" });
  }
  
  // Add new subdomain
  const newSubdomain = {
    subdomain,
    type,
    name: name || subdomain,
    description: description || "",
    createdAt: new Date().toISOString(),
    accessLink: `/${mainDomain}/${subdomain}`
  };
  
  data[schoolIndex].subdomains.push(newSubdomain);
  writeData(data);
  
  // Dynamic URL based on request
  const baseUrl = getBaseUrl(req);
  
  res.json({
    success: true,
    message: `${type} subdomain created successfully!`,
    accessLink: `${baseUrl}${newSubdomain.accessLink}`,
    subdomain: newSubdomain
  });
});

/* ---------- GET SUBDOMAINS ---------- */
app.get("/get-subdomains/:domain", (req, res) => {
  const data = readData();
  const school = data.find((d) => d.domain === req.params.domain);
  
  if (!school) {
    return res.json({ 
      success: false,
      error: "Domain not found"
    });
  }
  
  res.json({
    success: true,
    mainDomain: school.domain,
    school: school.school,
    subdomains: school.subdomains || [],
    total: school.subdomains?.length || 0
  });
});

/* ---------- MAIN DASHBOARD ---------- */
app.get("/dashboard/:domain", (req, res) => {
  const data = readData();
  const school = data.find((d) => d.domain === req.params.domain);
  
  if (!school) {
    return res.send(`
      <!DOCTYPE html>
      <html><body><h1>Invalid Dashboard</h1></body></html>
    `);
  }
  
  let dashboardHtml = fs.readFileSync(
    path.join(__dirname, "dashboard.html"),
    "utf-8"
  );
  
  const baseUrl = getBaseUrl(req);
  
  // Inject dynamic values
  dashboardHtml = dashboardHtml.replace(
    'let PLAN = "BASIC";',
    `let PLAN = "${school.plan || 'basic'}";`
  );
  
  dashboardHtml = dashboardHtml.replace(
    'let SCHOOL_NAME = "School";',
    `let SCHOOL_NAME = "${school.school}";`
  );
  
  dashboardHtml = dashboardHtml.replace(
    'let MAIN_DOMAIN = "";',
    `let MAIN_DOMAIN = "${school.domain}";`
  );
  
  // Inject BASE_URL dynamically
  dashboardHtml = dashboardHtml.replace(
    'let BASE_URL = "http://localhost:5000";',
    `let BASE_URL = "${baseUrl}";`
  );
  
  res.send(dashboardHtml);
});

/* ---------- SUBDOMAIN PAGES ---------- */
app.get("/:mainDomain/:subdomain", (req, res) => {
  const { mainDomain, subdomain } = req.params;
  const baseUrl = getBaseUrl(req);
  
  const data = readData();
  const school = data.find((d) => d.domain === mainDomain);
  
  if (!school) {
    return res.send(`
      <!DOCTYPE html>
      <html><body><h1>Invalid Main Domain</h1></body></html>
    `);
  }
  
  const sub = school.subdomains.find((s) => s.subdomain === subdomain);
  if (!sub) {
    return res.send(`
      <!DOCTYPE html>
      <html><body><h1>Invalid Subdomain</h1></body></html>
    `);
  }
  
  // Different dashboard based on type
  let dashboardHtml = "";
  const pageUrl = `${baseUrl}/${mainDomain}/${subdomain}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pageUrl)}`;
  
  if (sub.type === 'teacher') {
    dashboardHtml = getTeacherDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl);
  } else if (sub.type === 'student') {
    dashboardHtml = getStudentDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl);
  } else if (sub.type === 'public') {
    dashboardHtml = getPublicDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl);
  } else {
    dashboardHtml = getDefaultDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl);
  }
  
  res.send(dashboardHtml);
});

// Teacher Dashboard (Updated with dynamic baseUrl)
function getTeacherDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>${sub.name} - Teacher Dashboard</title>
    <style>/* ... same CSS as before ... */</style>
  </head>
  <body>
    <!-- ... same HTML structure ... -->
    <a href="${baseUrl}/dashboard/${school.domain}" style="color: #f59e0b; display: block; margin-top: 20px;">
      ← Back to Main Dashboard
    </a>
    <!-- ... rest of HTML ... -->
  </body>
  </html>
  `;
}

// Student Dashboard (Updated with dynamic baseUrl)
function getStudentDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>${sub.name} - Student Dashboard</title>
    <style>/* ... same CSS as before ... */</style>
  </head>
  <body>
    <!-- ... same HTML structure ... -->
    <a href="${baseUrl}/dashboard/${school.domain}" style="color: #3b82f6; display: block; margin-top: 20px;">
      ← Back to Main Dashboard
    </a>
    <!-- ... rest of HTML ... -->
  </body>
  </html>
  `;
}

// Public Dashboard (Updated with dynamic baseUrl)
function getPublicDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>${school.school} - Public Portal</title>
    <style>/* ... same CSS as before ... */</style>
  </head>
  <body>
    <!-- ... same HTML structure ... -->
    <a href="${baseUrl}/dashboard/${school.domain}" style="color: #f59e0b; display: block; margin-top: 20px; font-weight: bold;">
      ← Back to School Dashboard
    </a>
    <!-- ... rest of HTML ... -->
  </body>
  </html>
  `;
}

function getDefaultDashboard(school, sub, pageUrl, qrCodeUrl, baseUrl) {
  return `
  <!DOCTYPE html>
  <html><body>
    <h1>${sub.name}</h1>
    <p>Type: ${sub.type}</p>
    <p>School: ${school.school}</p>
    <img src="${qrCodeUrl}" alt="QR Code">
    <a href="${baseUrl}/dashboard/${school.domain}">Back to Dashboard</a>
  </body></html>
  `;
}

/* ---------- ADMIN ---------- */
app.get("/all-data", (req, res) => {
  res.json(readData());
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Serve index.html for root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Main URL: http://localhost:${PORT}`);
});