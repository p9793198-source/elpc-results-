
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Render runs the app behind a reverse proxy. Trust it so secure session
// cookies are correctly created and returned on subsequent API requests.
app.set("trust proxy", 1);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "elpc-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ELPC Student Results</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#f4f7fb;color:#172033}
header{min-height:70px;background:#101828;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 5%;gap:12px}
.brand{display:flex;align-items:center;gap:12px}.brand img{width:48px;height:48px;object-fit:contain;border-radius:50%}.brand b{font-size:23px;color:#55d6be}.brand span{font-size:14px;display:block;opacity:.85}
button{border:0;border-radius:8px;padding:11px 16px;background:#1769e0;color:#fff;font-weight:700;cursor:pointer}
header button{background:#55d6be;color:#10231f}
main{max-width:1050px;margin:30px auto;padding:0 16px}
.hero,.panel{background:#fff;border-radius:14px;padding:24px;box-shadow:0 5px 22px rgba(16,24,40,.08)}
.hero h1{text-align:center;margin:0 0 8px;font-size:32px}.hero>p{text-align:center;color:#667085}
.search{display:flex;gap:10px;max-width:600px;margin:22px auto}
input{width:100%;padding:12px;border:1px solid #d0d5dd;border-radius:8px;font-size:16px}
.hidden{display:none!important}
.resultcard{margin-top:22px;background:#f8fafc;border:1px solid #e4e7ec;border-radius:12px;padding:20px}
.marks{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:15px}.mark{background:#fff;padding:12px;border-radius:8px;text-align:center}
.total{font-size:18px;margin-top:15px;font-weight:700}
.admin{margin-top:25px}.panel h2{margin-top:0}
.form{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}
.tablewrap{overflow:auto}.tablewrap table{border-collapse:collapse;width:100%;min-width:760px}
th,td{border:1px solid #e4e7ec;padding:9px;text-align:left}th{background:#f2f4f7}
.actions{white-space:nowrap}.actions button{margin-right:5px;padding:8px 10px}
.dashhead{display:flex;justify-content:space-between;gap:12px;align-items:center}
.hint{font-size:13px;color:#667085}
@media(max-width:700px){.marks{grid-template-columns:repeat(2,1fr)}.search{flex-direction:column}.form{grid-template-columns:1fr}.dashhead{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<header>
  <div class="brand">
    <img src="/logo.png" alt="ELPC Logo">
    <div><b>ELPC</b><span>Easy Learn Physics Classes</span></div>
  </div>
  <button id="adminBtn">Admin</button>
</header>

<main>
<section class="hero">
  <h1>Student Result Portal</h1>
  <p>Enter your Roll Number and common student password.</p>
  <div class="search">
    <input id="roll" placeholder="Enter Roll Number">
    <input id="studentPass" type="password" placeholder="Student Password">
    <button onclick="studentLogin()">View Result</button>
  </div>
  <div id="result"></div>
</section>

<section id="admin" class="admin hidden">
  <div class="panel" id="loginPanel">
    <h2>Admin Login</h2>
    <input id="user" placeholder="Admin ID" value="admin">
    <br><br>
    <input id="pass" type="password" placeholder="Admin Password">
    <br><br>
    <button onclick="login()">Login</button>
    <p class="hint">First login: admin / admin123</p>
  </div>

  <div class="panel hidden" id="dashboard">
    <div class="dashhead">
      <h2>Admin Dashboard</h2>
      <div>
        <button onclick="changeStudentPassword()">Change Student Password</button>
        <button onclick="changeAdminPassword()">Change Admin Password</button>
        <button onclick="logout()">Logout</button>
      </div>
    </div>

    <div class="form">
      <input id="sid" type="hidden">
      <input id="sroll" placeholder="Roll No">
      <input id="sname" placeholder="Student Name">
      <input id="physics" type="number" placeholder="Physics">
      <input id="chemistry" type="number" placeholder="Chemistry">
      <input id="math" type="number" placeholder="Math">
      <input id="english" type="number" placeholder="English">
      <input id="hindi" type="number" placeholder="Hindi">
      <button onclick="saveStudent()">Save Student</button>
      <button onclick="clearForm()">Clear</button>
    </div>

    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Roll</th><th>Name</th><th>Physics</th><th>Chemistry</th><th>Math</th><th>English</th><th>Hindi</th><th>Actions</th>
        </tr></thead>
        <tbody id="students"></tbody>
      </table>
    </div>
  </div>
</section>
</main>

<script>
const $ = id => document.getElementById(id);

$("adminBtn").onclick = () => {
  $("admin").classList.toggle("hidden");
  $("admin").scrollIntoView({behavior:"smooth"});
};

async function studentLogin(){
  const roll = $("roll").value.trim();
  const password = $("studentPass").value;
  if(!roll || !password) return alert("Roll number and password required");
  const x = await fetch("/api/student-login", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({roll,password})
  });
  const d = await x.json();
  if(!x.ok) return alert(d.error);
  $("result").innerHTML =
    '<div class="resultcard"><h2>'+esc(d.name)+'</h2>'+
    '<p><b>Roll No:</b> '+esc(d.roll)+'</p>'+
    '<div class="marks">'+
    mark("Physics",d.physics)+mark("Chemistry",d.chemistry)+mark("Math",d.math)+
    mark("English",d.english)+mark("Hindi",d.hindi)+
    '</div><div class="total">Total: '+d.total+' / 500 | Percentage: '+d.percentage+'% | '+d.status+'</div></div>';
}
function mark(name,value){return '<div class="mark">'+name+'<br><b>'+value+'</b></div>'}
function esc(v){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function login(){
  const x = await fetch("/api/login",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:$("user").value,password:$("pass").value})
  });
  const d=await x.json();
  if(!x.ok)return alert(d.error);
  $("loginPanel").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  loadStudents();
}

async function loadStudents(){
  const x=await fetch("/api/students");
  if(!x.ok)return;
  const a=await x.json();
  $("students").innerHTML=a.map(s =>
    '<tr><td>'+esc(s.roll)+'</td><td>'+esc(s.name)+'</td>'+
    '<td>'+s.physics+'</td><td>'+s.chemistry+'</td><td>'+s.math+'</td>'+
    '<td>'+s.english+'</td><td>'+s.hindi+'</td>'+
    '<td class="actions"><button onclick=\\'editStudent('+JSON.stringify(s)+')\\'>Edit</button>'+
    '<button onclick="deleteStudent('+s.id+')">Delete</button></td></tr>'
  ).join("");
}

function editStudent(s){
  $("sid").value=s.id;$("sroll").value=s.roll;$("sname").value=s.name;
  $("physics").value=s.physics;$("chemistry").value=s.chemistry;$("math").value=s.math;
  $("english").value=s.english;$("hindi").value=s.hindi;
}
function clearForm(){
  ["sid","sroll","sname","physics","chemistry","math","english","hindi"].forEach(i=>$(i).value="");
}
async function saveStudent(){
  const body={
    roll:$("sroll").value.trim(),name:$("sname").value.trim(),
    physics:$("physics").value,chemistry:$("chemistry").value,math:$("math").value,
    english:$("english").value,hindi:$("hindi").value
  };
  if(!body.roll||!body.name)return alert("Roll number and name required");
  const id=$("sid").value;
  const x=await fetch(id?"/api/students/"+id:"/api/students",{
    method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const d=await x.json();
  if(!x.ok)return alert(d.error);
  clearForm();loadStudents();
}
async function deleteStudent(id){
  if(!confirm("Delete this student?"))return;
  const x=await fetch("/api/students/"+id,{method:"DELETE"});
  const d=await x.json();
  if(!x.ok)return alert(d.error||"Delete failed");
  loadStudents();
}
async function changeStudentPassword(){
  const p=prompt("New common student password (minimum 6 characters):");
  if(!p)return;
  const x=await fetch("/api/change-student-password",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})
  });
  const d=await x.json();alert(x.ok?"Student password changed successfully":d.error);
}
async function changeAdminPassword(){
  const p=prompt("New admin password (minimum 6 characters):");
  if(!p)return;
  const x=await fetch("/api/change-admin-password",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})
  });
  const d=await x.json();alert(x.ok?"Admin password changed successfully":d.error);
}
async function logout(){
  await fetch("/api/logout",{method:"POST"});
  location.reload();
}
</script>
</body>
</html>`;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      roll VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      physics INTEGER NOT NULL DEFAULT 0,
      chemistry INTEGER NOT NULL DEFAULT 0,
      math INTEGER NOT NULL DEFAULT 0,
      english INTEGER NOT NULL DEFAULT 0,
      hindi INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const admin = await pool.query("SELECT id FROM admin WHERE username='admin' LIMIT 1");
  if (!admin.rowCount) {
    const hash = await bcrypt.hash("admin123", 12);
    await pool.query("INSERT INTO admin(username,password_hash) VALUES($1,$2)", ["admin", hash]);
  }

  const studentPass = await pool.query("SELECT key FROM settings WHERE key='student_password_hash'");
  if (!studentPass.rowCount) {
    const hash = await bcrypt.hash("ELPC123", 12);
    await pool.query(
      "INSERT INTO settings(key,value) VALUES('student_password_hash',$1)",
      [hash]
    );
  }
}

function adminAuth(req,res,next){
  if(req.session && req.session.admin) return next();
  return res.status(401).json({error:"Unauthorized"});
}

app.get("/", (req,res)=>res.type("html").send(HTML));

app.get("/logo.png",(req,res)=>{
  const file=path.join(__dirname,"logo.png");
  if(fs.existsSync(file)) return res.sendFile(file);
  res.status(404).end();
});

app.post("/api/login",async(req,res)=>{
  try{
    const r=await pool.query("SELECT * FROM admin WHERE username=$1 LIMIT 1",[req.body.username]);
    if(!r.rowCount || !(await bcrypt.compare(req.body.password,r.rows[0].password_hash))){
      return res.status(401).json({error:"Invalid ID or password"});
    }
    req.session.admin={id:r.rows[0].id,username:r.rows[0].username};
    res.json({ok:true});
  }catch(e){res.status(500).json({error:"Server error"});}
});

app.post("/api/logout",adminAuth,(req,res)=>{
  req.session.destroy(()=>res.json({ok:true}));
});

app.post("/api/student-login",async(req,res)=>{
  try{
    const setting=await pool.query("SELECT value FROM settings WHERE key='student_password_hash' LIMIT 1");
    if(!setting.rowCount || !(await bcrypt.compare(req.body.password,setting.rows[0].value))){
      return res.status(401).json({error:"Invalid roll number or password"});
    }
    const r=await pool.query("SELECT * FROM students WHERE roll=$1 LIMIT 1",[String(req.body.roll).trim()]);
    if(!r.rowCount)return res.status(404).json({error:"Result not found"});
    const s=r.rows[0];
    const total=s.physics+s.chemistry+s.math+s.english+s.hindi;
    const percentage=total/5;
    res.json({...s,total,percentage:percentage.toFixed(2),status:percentage>=33?"PASS":"FAIL"});
  }catch(e){console.error(e);res.status(500).json({error:"Server error"});}
});

app.get("/api/students",adminAuth,async(req,res)=>{
  const r=await pool.query("SELECT id,roll,name,physics,chemistry,math,english,hindi FROM students ORDER BY roll");
  res.json(r.rows);
});

app.post("/api/students",adminAuth,async(req,res)=>{
  try{
    const x=req.body;
    const r=await pool.query(
      `INSERT INTO students(roll,name,physics,chemistry,math,english,hindi)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [String(x.roll).trim(),String(x.name).trim(),Number(x.physics)||0,Number(x.chemistry)||0,
       Number(x.math)||0,Number(x.english)||0,Number(x.hindi)||0]
    );
    res.json({ok:true,id:r.rows[0].id});
  }catch(e){
    res.status(400).json({error:String(e.message).includes("students_roll_key")?"Roll number already exists":e.message});
  }
});

app.put("/api/students/:id",adminAuth,async(req,res)=>{
  try{
    const x=req.body;
    const r=await pool.query(
      `UPDATE students SET roll=$1,name=$2,physics=$3,chemistry=$4,math=$5,english=$6,hindi=$7,updated_at=NOW()
       WHERE id=$8`,
      [String(x.roll).trim(),String(x.name).trim(),Number(x.physics)||0,Number(x.chemistry)||0,
       Number(x.math)||0,Number(x.english)||0,Number(x.hindi)||0,req.params.id]
    );
    if(!r.rowCount)return res.status(404).json({error:"Student not found"});
    res.json({ok:true});
  }catch(e){
    res.status(400).json({error:String(e.message).includes("students_roll_key")?"Roll number already exists":e.message});
  }
});

app.delete("/api/students/:id",adminAuth,async(req,res)=>{
  const r=await pool.query("DELETE FROM students WHERE id=$1",[req.params.id]);
  if(!r.rowCount)return res.status(404).json({error:"Student not found"});
  res.json({ok:true});
});

app.post("/api/change-student-password",adminAuth,async(req,res)=>{
  if(!req.body.password || req.body.password.length<6)
    return res.status(400).json({error:"Password must be at least 6 characters"});
  const hash=await bcrypt.hash(req.body.password,12);
  await pool.query(
    `INSERT INTO settings(key,value) VALUES('student_password_hash',$1)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
    [hash]
  );
  res.json({ok:true});
});

app.post("/api/change-admin-password",adminAuth,async(req,res)=>{
  if(!req.body.password || req.body.password.length<6)
    return res.status(400).json({error:"Password must be at least 6 characters"});
  const hash=await bcrypt.hash(req.body.password,12);
  await pool.query("UPDATE admin SET password_hash=$1 WHERE username='admin'",[hash]);
  res.json({ok:true});
});

initDb()
  .then(()=>app.listen(PORT,()=>console.log("ELPC portal running on port "+PORT)))
  .catch(err=>{console.error("Database initialization failed:",err);process.exit(1);});
