const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const dataFile = path.join(__dirname, "Data.js");

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
    type, // 'teacher', 'student', or 'public'
    name: name || subdomain,
    description: description || "",
    createdAt: new Date().toISOString(),
    accessLink: `/${mainDomain}/${subdomain}`
  };
  
  data[schoolIndex].subdomains.push(newSubdomain);
  writeData(data);
  
  res.json({
    success: true,
    message: `${type} subdomain created successfully!`,
    accessLink: `http://localhost:5000${newSubdomain.accessLink}`,
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
  
  res.send(dashboardHtml);
});

/* ---------- SUBDOMAIN PAGES ---------- */
app.get("/:mainDomain/:subdomain", (req, res) => {
  const { mainDomain, subdomain } = req.params;
  
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
  const pageUrl = `http://localhost:5000/${mainDomain}/${subdomain}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pageUrl)}`;
  
  if (sub.type === 'teacher') {
    dashboardHtml = getTeacherDashboard(school, sub, pageUrl, qrCodeUrl);
  } else if (sub.type === 'student') {
    dashboardHtml = getStudentDashboard(school, sub, pageUrl, qrCodeUrl);
  } else if (sub.type === 'public') {
    dashboardHtml = getPublicDashboard(school, sub, pageUrl, qrCodeUrl);
  } else {
    dashboardHtml = getDefaultDashboard(school, sub, pageUrl, qrCodeUrl);
  }
  
  res.send(dashboardHtml);
});

// Teacher Dashboard
function getTeacherDashboard(school, sub, pageUrl, qrCodeUrl) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${sub.name} - Teacher Dashboard</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      body {
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        min-height: 100vh;
        color: white;
      }
      
      .navbar {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        padding: 15px 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .brand h1 {
        font-size: 20px;
      }
      
      .teacher-badge {
        background: #f59e0b;
        color: black;
        padding: 5px 15px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 12px;
      }
      
      .container {
        padding: 30px;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      .header {
        text-align: center;
        margin-bottom: 40px;
        background: rgba(255, 255, 255, 0.1);
        padding: 30px;
        border-radius: 20px;
        backdrop-filter: blur(10px);
      }
      
      .header h1 {
        font-size: 2.5rem;
        margin-bottom: 10px;
      }
      
      .header p {
        opacity: 0.9;
        margin-bottom: 20px;
      }
      
      .dashboard {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
      }
      
      .card {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 15px;
        padding: 25px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.3s;
      }
      
      .card:hover {
        transform: translateY(-5px);
        background: rgba(255, 255, 255, 0.15);
      }
      
      .card h3 {
        margin-bottom: 15px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
      }
      
      .stat-card {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 15px;
        padding: 20px;
        text-align: center;
      }
      
      .stat-card .number {
        font-size: 2.5rem;
        font-weight: bold;
        margin-bottom: 10px;
      }
      
      .qr-section {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 30px;
        text-align: center;
        backdrop-filter: blur(10px);
        margin-top: 40px;
      }
      
      .qr-section img {
        width: 150px;
        height: 150px;
        border: 10px solid white;
        border-radius: 10px;
        margin-bottom: 20px;
      }
      
      .url-display {
        background: rgba(0, 0, 0, 0.2);
        padding: 15px;
        border-radius: 10px;
        margin: 20px 0;
        word-break: break-all;
      }
      
      button {
        background: #f59e0b;
        color: black;
        border: none;
        padding: 12px 25px;
        border-radius: 10px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
      }
      
      button:hover {
        background: #fbbf24;
        transform: translateY(-2px);
      }
    </style>
  </head>
  <body>
    <nav class="navbar">
      <div class="brand">
        <div style="font-size: 24px;">👨‍🏫</div>
        <h1>${sub.name} - Teacher Dashboard</h1>
        <span class="teacher-badge">TEACHER</span>
      </div>
      <div style="font-size: 14px; opacity: 0.8;">
        ${school.school}
      </div>
    </nav>
    
    <div class="container">
      <div class="header">
        <h1>Welcome, ${sub.name}!</h1>
        <p>Manage your classes, attendance, and students from this dashboard</p>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button>📚 My Classes</button>
          <button>📊 Attendance</button>
          <button>📝 Reports</button>
        </div>
      </div>
      
      <div class="stats">
        <div class="stat-card">
          <div class="number">5</div>
          <div>Active Classes</div>
        </div>
        <div class="stat-card">
          <div class="number">142</div>
          <div>Total Students</div>
        </div>
        <div class="stat-card">
          <div class="number">96%</div>
          <div>Attendance Rate</div>
        </div>
        <div class="stat-card">
          <div class="number">12</div>
          <div>Pending Tasks</div>
        </div>
      </div>
      
      <div class="dashboard">
        <div class="card">
          <h3>📚 Class Management</h3>
          <p>Create and manage your classes, add students, set schedules</p>
        </div>
        <div class="card">
          <h3>📊 Attendance Tracker</h3>
          <p>Mark daily attendance, view reports, generate analytics</p>
        </div>
        <div class="card">
          <h3>📝 Assignment Creator</h3>
          <p>Create assignments, set deadlines, grade submissions</p>
        </div>
        <div class="card">
          <h3>💬 Communication</h3>
          <p>Send announcements, messages to students and parents</p>
        </div>
      </div>
      
      <div class="qr-section">
        <h3>🔗 Share This Dashboard</h3>
        <p>Scan QR code to access this dashboard on mobile</p>
        <img src="${qrCodeUrl}" alt="QR Code">
        <div class="url-display">
          ${pageUrl}
        </div>
        <button onclick="navigator.clipboard.writeText('${pageUrl}')">
          📋 Copy Link
        </button>
        <p style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
          Created: ${new Date(sub.createdAt).toLocaleDateString()}
        </p>
        <a href="/dashboard/${school.domain}" style="color: #f59e0b; display: block; margin-top: 20px;">
          ← Back to Main Dashboard
        </a>
      </div>
    </div>
    
    <script>
      console.log("Teacher dashboard loaded for: ${sub.name}");
    </script>
  </body>
  </html>
  `;
}

// Student Dashboard
function getStudentDashboard(school, sub, pageUrl, qrCodeUrl) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${sub.name} - Student Dashboard</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      body {
        background: linear-gradient(135deg, #10b981 0%, #047857 100%);
        min-height: 100vh;
        color: white;
      }
      
      .navbar {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        padding: 15px 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .brand h1 {
        font-size: 20px;
      }
      
      .student-badge {
        background: #3b82f6;
        color: white;
        padding: 5px 15px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 12px;
      }
      
      .container {
        padding: 30px;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      .header {
        text-align: center;
        margin-bottom: 40px;
        background: rgba(255, 255, 255, 0.1);
        padding: 30px;
        border-radius: 20px;
        backdrop-filter: blur(10px);
      }
      
      .header h1 {
        font-size: 2.5rem;
        margin-bottom: 10px;
      }
      
      .header p {
        opacity: 0.9;
        margin-bottom: 20px;
      }
      
      .schedule {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 25px;
        margin-bottom: 30px;
        backdrop-filter: blur(10px);
      }
      
      .schedule h2 {
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .schedule-item {
        display: flex;
        justify-content: space-between;
        padding: 15px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .schedule-item:last-child {
        border-bottom: none;
      }
      
      .grades {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
      }
      
      .grade-card {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 15px;
        padding: 20px;
        text-align: center;
      }
      
      .grade-card .subject {
        font-size: 18px;
        margin-bottom: 10px;
      }
      
      .grade-card .score {
        font-size: 2.5rem;
        font-weight: bold;
      }
      
      .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
      }
      
      .card {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 15px;
        padding: 25px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.3s;
      }
      
      .card:hover {
        transform: translateY(-5px);
        background: rgba(255, 255, 255, 0.15);
      }
      
      .card h3 {
        margin-bottom: 15px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .qr-section {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 30px;
        text-align: center;
        backdrop-filter: blur(10px);
        margin-top: 40px;
      }
      
      .qr-section img {
        width: 150px;
        height: 150px;
        border: 10px solid white;
        border-radius: 10px;
        margin-bottom: 20px;
      }
      
      .url-display {
        background: rgba(0, 0, 0, 0.2);
        padding: 15px;
        border-radius: 10px;
        margin: 20px 0;
        word-break: break-all;
      }
      
      button {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 12px 25px;
        border-radius: 10px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
      }
      
      button:hover {
        background: #2563eb;
        transform: translateY(-2px);
      }
    </style>
  </head>
  <body>
    <nav class="navbar">
      <div class="brand">
        <div style="font-size: 24px;">👨‍🎓</div>
        <h1>${sub.name} - Student Dashboard</h1>
        <span class="student-badge">STUDENT</span>
      </div>
      <div style="font-size: 14px; opacity: 0.8;">
        ${school.school}
      </div>
    </nav>
    
    <div class="container">
      <div class="header">
        <h1>Welcome, ${sub.name}!</h1>
        <p>Access your classes, assignments, grades, and schedule</p>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button>📚 My Classes</button>
          <button>📝 Assignments</button>
          <button>📊 Grades</button>
        </div>
      </div>
      
      <div class="grades">
        <div class="grade-card">
          <div class="subject">Mathematics</div>
          <div class="score">A+</div>
          <div>95%</div>
        </div>
        <div class="grade-card">
          <div class="subject">Science</div>
          <div class="score">A</div>
          <div>88%</div>
        </div>
        <div class="grade-card">
          <div class="subject">English</div>
          <div class="score">B+</div>
          <div>82%</div>
        </div>
        <div class="grade-card">
          <div class="subject">History</div>
          <div class="score">A-</div>
          <div>90%</div>
        </div>
      </div>
      
      <div class="schedule">
        <h2>📅 Today's Schedule</h2>
        <div class="schedule-item">
          <span>9:00 AM - 10:00 AM</span>
          <span>Mathematics</span>
          <span>Room 101</span>
        </div>
        <div class="schedule-item">
          <span>10:15 AM - 11:15 AM</span>
          <span>Science Lab</span>
          <span>Lab 3</span>
        </div>
        <div class="schedule-item">
          <span>11:30 AM - 12:30 PM</span>
          <span>English</span>
          <span>Room 205</span>
        </div>
        <div class="schedule-item">
          <span>1:30 PM - 2:30 PM</span>
          <span>Physical Education</span>
          <span>Ground</span>
        </div>
      </div>
      
      <div class="dashboard-grid">
        <div class="card">
          <h3>📚 My Courses</h3>
          <p>View all enrolled courses, materials, and resources</p>
        </div>
        <div class="card">
          <h3>📝 Assignments</h3>
          <p>Check pending assignments, submit work, view feedback</p>
        </div>
        <div class="card">
          <h3>📊 Performance</h3>
          <p>View grades, progress reports, and analytics</p>
        </div>
        <div class="card">
          <h3>📅 Schedule</h3>
          <p>Class timetable, exam dates, and events calendar</p>
        </div>
      </div>
      
      <div class="qr-section">
        <h3>🔗 Share This Dashboard</h3>
        <p>Scan QR code to access this dashboard on mobile</p>
        <img src="${qrCodeUrl}" alt="QR Code">
        <div class="url-display">
          ${pageUrl}
        </div>
        <button onclick="navigator.clipboard.writeText('${pageUrl}')">
          📋 Copy Link
        </button>
        <p style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
          Created: ${new Date(sub.createdAt).toLocaleDateString()}
        </p>
        <a href="/dashboard/${school.domain}" style="color: #3b82f6; display: block; margin-top: 20px;">
          ← Back to Main Dashboard
        </a>
      </div>
    </div>
    
    <script>
      console.log("Student dashboard loaded for: ${sub.name}");
    </script>
  </body>
  </html>
  `;
}

// Public Dashboard
function getPublicDashboard(school, sub, pageUrl, qrCodeUrl) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${sub.name} - ${school.school}</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      body {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        min-height: 100vh;
        color: white;
      }
      
      .navbar {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        padding: 15px 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .brand h1 {
        font-size: 20px;
      }
      
      .public-badge {
        background: #f59e0b;
        color: black;
        padding: 5px 15px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 12px;
      }
      
      .container {
        padding: 30px;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      .hero {
        text-align: center;
        margin-bottom: 50px;
        padding: 60px 30px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 30px;
        backdrop-filter: blur(10px);
      }
      
      .hero h1 {
        font-size: 3rem;
        margin-bottom: 20px;
      }
      
      .hero p {
        font-size: 1.2rem;
        opacity: 0.9;
        max-width: 800px;
        margin: 0 auto 30px;
      }
      
      .info-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 25px;
        margin-bottom: 50px;
      }
      
      .info-card {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 30px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .info-card h2 {
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .announcements {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 30px;
        margin-bottom: 40px;
        backdrop-filter: blur(10px);
      }
      
      .announcement-item {
        padding: 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .announcement-item:last-child {
        border-bottom: none;
      }
      
      .contact-form {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 30px;
        margin-bottom: 40px;
        backdrop-filter: blur(10px);
      }
      
      .contact-form input,
      .contact-form textarea {
        width: 100%;
        padding: 15px;
        margin: 10px 0;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        background: rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 16px;
      }
      
      .contact-form textarea {
        height: 150px;
        resize: vertical;
      }
      
      .qr-section {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 40px;
        text-align: center;
        backdrop-filter: blur(10px);
        margin-top: 40px;
      }
      
      .qr-section img {
        width: 150px;
        height: 150px;
        border: 10px solid white;
        border-radius: 10px;
        margin-bottom: 25px;
      }
      
      .url-display {
        background: rgba(0, 0, 0, 0.2);
        padding: 15px;
        border-radius: 10px;
        margin: 20px 0;
        word-break: break-all;
        font-family: monospace;
      }
      
      button {
        background: #f59e0b;
        color: black;
        border: none;
        padding: 15px 30px;
        border-radius: 10px;
        font-weight: bold;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s;
      }
      
      button:hover {
        background: #fbbf24;
        transform: translateY(-2px);
      }
      
      .btn-secondary {
        background: rgba(255, 255, 255, 0.2);
        color: white;
      }
      
      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    </style>
  </head>
  <body>
    <nav class="navbar">
      <div class="brand">
        <div style="font-size: 24px;">🌐</div>
        <h1>${school.school} - Public Portal</h1>
        <span class="public-badge">PUBLIC</span>
      </div>
      <div style="font-size: 14px; opacity: 0.8;">
        ${sub.name}
      </div>
    </nav>
    
    <div class="container">
      <div class="hero">
        <h1>Welcome to ${school.school}</h1>
        <p>${sub.description || 'Official public information portal for students, parents, and visitors'}</p>
        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 30px;">
          <button>📰 Latest News</button>
          <button class="btn-secondary">📅 Events Calendar</button>
          <button class="btn-secondary">📞 Contact Us</button>
        </div>
      </div>
      
      <div class="info-cards">
        <div class="info-card">
          <h2>🏫 About Our School</h2>
          <p>${school.school} is committed to providing quality education and holistic development for all students.</p>
          <p style="margin-top: 15px; opacity: 0.9;">Established with a vision to create future leaders through innovative teaching methods.</p>
        </div>
        
        <div class="info-card">
          <h2>📅 Upcoming Events</h2>
          <div style="margin-top: 20px;">
            <div style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <strong>Annual Sports Day</strong><br>
              <small>March 15, 2024 | School Ground</small>
            </div>
            <div style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <strong>Parent-Teacher Meeting</strong><br>
              <small>March 20, 2024 | Main Auditorium</small>
            </div>
            <div style="padding: 10px 0;">
              <strong>Science Exhibition</strong><br>
              <small>March 25, 2024 | Science Block</small>
            </div>
          </div>
        </div>
        
        <div class="info-card">
          <h2>🕒 School Hours</h2>
          <div style="margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
              <span>Monday - Friday</span>
              <span>8:00 AM - 3:00 PM</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
              <span>Office Hours</span>
              <span>9:00 AM - 4:00 PM</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
              <span>Library</span>
              <span>8:30 AM - 5:00 PM</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="announcements">
        <h2>📢 Important Announcements</h2>
        <div class="announcement-item">
          <strong>Admission Open for 2024-25</strong>
          <p>Registration for new admissions begins from April 1, 2024.</p>
          <small>Posted: March 1, 2024</small>
        </div>
        <div class="announcement-item">
          <strong>Summer Vacation Schedule</strong>
          <p>School will remain closed for summer vacation from May 15 to June 30, 2024.</p>
          <small>Posted: February 28, 2024</small>
        </div>
      </div>
      
      <div class="contact-form">
        <h2>📞 Contact Information</h2>
        <p>Have questions? Get in touch with us.</p>
        <input type="text" placeholder="Your Name">
        <input type="email" placeholder="Your Email">
        <textarea placeholder="Your Message"></textarea>
        <button style="width: 100%; margin-top: 20px;">Send Message</button>
      </div>
      
      <div class="qr-section">
        <h2>🔗 Share This Portal</h2>
        <p>Scan QR code to access this public portal on mobile</p>
        <img src="${qrCodeUrl}" alt="QR Code">
        <div class="url-display">
          ${pageUrl}
        </div>
        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 20px;">
          <button onclick="navigator.clipboard.writeText('${pageUrl}')">
            📋 Copy Link
          </button>
          <button class="btn-secondary" onclick="window.print()">
            🖨️ Print Page
          </button>
        </div>
        <p style="margin-top: 25px; font-size: 14px; opacity: 0.8;">
          Portal Created: ${new Date(sub.createdAt).toLocaleDateString()}
        </p>
        <a href="/dashboard/${school.domain}" style="color: #f59e0b; display: block; margin-top: 20px; font-weight: bold;">
          ← Back to School Dashboard
        </a>
      </div>
    </div>
    
    <script>
      console.log("Public portal loaded for: ${school.school}");
    </script>
  </body>
  </html>
  `;
}

// Default Dashboard (fallback)
function getDefaultDashboard(school, sub, pageUrl, qrCodeUrl) {
  return `
  <!DOCTYPE html>
  <html><body>
    <h1>${sub.name}</h1>
    <p>Type: ${sub.type}</p>
    <p>School: ${school.school}</p>
    <img src="${qrCodeUrl}" alt="QR Code">
    <a href="/dashboard/${school.domain}">Back</a>
  </body></html>
  `;
}

/* ---------- ADMIN ---------- */
app.get("/all-data", (req, res) => {
  res.json(readData());
});

app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
  console.log("📁 Dashboard: http://localhost:5000");
  console.log("📊 Admin data: http://localhost:5000/all-data");
});