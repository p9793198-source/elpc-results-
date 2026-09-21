const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const fs=require("fs");
const path=require("path");

const app=express();
const PORT=process.env.PORT||3000;
const DATA_FILE=process.env.DATA_FILE||path.join(__dirname,"results.json");

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret:process.env.SESSION_SECRET||"elpc-session-change-me",
  resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:false}
}));

function defaultDB(){
  return {
    admin:{username:"admin",passwordHash:bcrypt.hashSync("admin123",10)},
    studentPassword:"ELPC123",
    students:[]
  };
}
function loadDB(){
  if(!fs.existsSync(DATA_FILE)){const db=defaultDB();saveDB(db);return db;}
  try{
    const db=JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
    db.students=Array.isArray(db.students)?db.students:[];
    db.studentPassword=db.studentPassword||"ELPC123";
    db.admin=db.admin||defaultDB().admin;
    return db;
  }catch(e){return defaultDB();}
}
function saveDB(db){fs.writeFileSync(DATA_FILE,JSON.stringify(db,null,2));}
function auth(req,res,next){if(req.session.admin)return next();res.status(401).json({error:"Admin login required"});}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function result(s){
 const total=n(s.physics)+n(s.chemistry)+n(s.math)+n(s.english)+n(s.hindi);
 const percentage=total/5;
 return {...s,total,percentage:percentage.toFixed(2),status:percentage>=33?"PASS":"FAIL"};
}

const HTML=`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ELPC Student Result Portal</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f4f7fb;color:#172033}
header{background:#101828;color:#fff;padding:14px 6%;display:flex;justify-content:space-between;align-items:center}
.brand b{font-size:25px;color:#55d6be}.brand span{margin-left:7px}.container{max-width:1100px;margin:auto;padding:28px 16px}
.card{background:#fff;border-radius:16px;padding:26px;box-shadow:0 8px 30px #0001}.hero{text-align:center}
input{width:100%;padding:12px;border:1px solid #ccd4df;border-radius:8px;font-size:15px}
button{border:0;border-radius:8px;padding:11px 16px;background:#1769e0;color:white;font-weight:700;cursor:pointer}
.search{max-width:600px;margin:22px auto;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hidden{display:none}.result{max-width:800px;margin:20px auto;text-align:left;border:1px solid #e5e7eb;border-radius:12px;padding:20px}
.marks{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.mark{background:#f8fafc;padding:12px;border-radius:8px}
.total{margin-top:16px;font-size:19px;font-weight:700}.admin{margin-top:24px}
.form{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}
.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:900px}
th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left}th{background:#f8fafc}
.actions button{padding:6px 9px;margin-right:5px}.hint{font-size:13px;color:#667085}
.topline{display:flex;justify-content:space-between;align-items:center;gap:10px}
@media(max-width:700px){.search{grid-template-columns:1fr}.form{grid-template-columns:1fr 1fr}.marks{grid-template-columns:1fr 1fr}.topline{align-items:flex-start;flex-direction:column}}
</style></head><body>
<header><div class="brand"><b>ELPC</b><span>Easy Learn Physics Classes</span></div><button onclick="toggleAdmin()">Admin</button></header>
<div class="container">
<section class="card hero">
<h1>Student Result Portal</h1><p>Enter your Roll Number and common student password.</p>
<div class="search"><input id="roll" placeholder="Roll Number"><input id="spass" type="password" placeholder="Student Password">
<button onclick="studentLogin()" style="grid-column:1/-1">View My Result</button></div>
<div id="studentResult"></div>
</section>

<section id="adminArea" class="admin hidden">
<div id="adminLogin" class="card">
<h2>Admin Login</h2><input id="auser" value="admin" placeholder="Admin ID">
<input id="apass" type="password" placeholder="Admin Password" style="margin:8px 0">
<button onclick="adminLogin()">Login</button><p class="hint">First login: admin / admin123</p>
</div>

<div id="dashboard" class="card hidden">
<div class="topline"><h2>Admin Dashboard</h2><div><button onclick="changeStudentPassword()">Student Password</button> <button onclick="changeAdminPassword()">Admin Password</button> <button onclick="logout()">Logout</button></div></div>
<p class="hint">Add students and edit any student's marks later. Student password is common for all students.</p>
<div class="form">
<input id="sid" type="hidden"><input id="sroll" placeholder="Roll No"><input id="sname" placeholder="Student Name">
<input id="physics" type="number" placeholder="Physics"><input id="chemistry" type="number" placeholder="Chemistry">
<input id="math" type="number" placeholder="Math"><input id="english" type="number" placeholder="English"><input id="hindi" type="number" placeholder="Hindi">
<button onclick="saveStudent()">Save / Update</button><button onclick="clearForm()">Clear</button>
</div>
<div class="tablewrap"><table><thead><tr><th>Roll</th><th>Name</th><th>Physics</th><th>Chemistry</th><th>Math</th><th>English</th><th>Hindi</th><th>Action</th></tr></thead><tbody id="students"></tbody></table></div>
</div></section></div>

<script>
const $=id=>document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toggleAdmin(){$("adminArea").classList.toggle("hidden");$("adminArea").scrollIntoView({behavior:"smooth"});}
async function studentLogin(){
 const roll=$("roll").value.trim(),password=$("spass").value;
 if(!roll||!password)return alert("Roll Number and password are required");
 const r=await fetch("/api/student-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({roll,password})});
 const d=await r.json(); if(!r.ok)return alert(d.error);
 const s=d.student;
 $("studentResult").innerHTML='<div class="result"><h2>'+esc(s.name)+'</h2><p><b>Roll No:</b> '+esc(s.roll)+'</p><div class="marks">'+
 [["Physics",s.physics],["Chemistry",s.chemistry],["Math",s.math],["English",s.english],["Hindi",s.hindi]].map(x=>'<div class="mark">'+x[0]+'<br><b>'+x[1]+'</b></div>').join("")+
 '</div><div class="total">Total: '+s.total+' / 500 | Percentage: '+s.percentage+'% | '+s.status+'</div></div>';
}
async function adminLogin(){
 const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("auser").value,password:$("apass").value})});
 const d=await r.json();if(!r.ok)return alert(d.error);
 $("adminLogin").classList.add("hidden");$("dashboard").classList.remove("hidden");loadStudents();
}
async function loadStudents(){
 const r=await fetch("/api/students");if(!r.ok)return;
 const a=await r.json();
 $("students").innerHTML=a.map(s=>'<tr><td>'+esc(s.roll)+'</td><td>'+esc(s.name)+'</td><td>'+s.physics+'</td><td>'+s.chemistry+'</td><td>'+s.math+'</td><td>'+s.english+'</td><td>'+s.hindi+'</td><td class="actions"><button onclick="editStudent('+s.id+')">Edit</button><button onclick="deleteStudent('+s.id+')">Delete</button></td></tr>').join("");
}
async function editStudent(id){
 const r=await fetch("/api/students/"+id);const s=await r.json();if(!r.ok)return alert(s.error);
 $("sid").value=s.id;$("sroll").value=s.roll;$("sname").value=s.name;
 $("physics").value=s.physics;$("chemistry").value=s.chemistry;$("math").value=s.math;$("english").value=s.english;$("hindi").value=s.hindi;
 window.scrollTo({top:$("dashboard").offsetTop,behavior:"smooth"});
}
function clearForm(){["sid","sroll","sname","physics","chemistry","math","english","hindi"].forEach(i=>$(i).value="");}
async function saveStudent(){
 const body={roll:$("sroll").value.trim(),name:$("sname").value.trim(),physics:$("physics").value,chemistry:$("chemistry").value,math:$("math").value,english:$("english").value,hindi:$("hindi").value};
 if(!body.roll||!body.name)return alert("Roll Number and Name required");
 const id=$("sid").value;
 const r=await fetch(id?"/api/students/"+id:"/api/students",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)return alert(d.error);alert(id?"Student updated":"Student added");clearForm();loadStudents();
}
async function deleteStudent(id){if(!confirm("Delete this student?"))return;const r=await fetch("/api/students/"+id,{method:"DELETE"});const d=await r.json();if(!r.ok)return alert(d.error);loadStudents();}
async function changeStudentPassword(){const p=prompt("Enter common student password (minimum 4 characters):");if(!p)return;const r=await fetch("/api/change-student-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})});const d=await r.json();alert(r.ok?"Student password changed":d.error);}
async function changeAdminPassword(){const p=prompt("Enter new admin password (minimum 6 characters):");if(!p)return;const r=await fetch("/api/change-admin-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})});const d=await r.json();alert(r.ok?"Admin password changed":d.error);}
async function logout(){await fetch("/api/logout",{method:"POST"});location.reload();}
</script></body></html>`;

app.get("/",(req,res)=>res.type("html").send(HTML));

app.post("/api/student-login",(req,res)=>{
 const db=loadDB(),s=db.students.find(x=>String(x.roll).trim()===String(req.body.roll||"").trim());
 if(!s||req.body.password!==db.studentPassword)return res.status(401).json({error:"Invalid Roll Number or student password"});
 res.json({student:result(s)});
});

app.post("/api/login",(req,res)=>{
 const db=loadDB();
 if(req.body.username!==db.admin.username||!bcrypt.compareSync(req.body.password,db.admin.passwordHash))
   return res.status(401).json({error:"Invalid admin ID or password"});
 req.session.admin={username:db.admin.username};res.json({ok:true});
});
app.post("/api/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/students",auth,(req,res)=>res.json(loadDB().students));
app.get("/api/students/:id",auth,(req,res)=>{
 const s=loadDB().students.find(x=>x.id===Number(req.params.id));
 if(!s)return res.status(404).json({error:"Student not found"});res.json(s);
});
function clean(b,id){return{id:id??Date.now(),roll:String(b.roll||"").trim(),name:String(b.name||"").trim(),physics:n(b.physics),chemistry:n(b.chemistry),math:n(b.math),english:n(b.english),hindi:n(b.hindi)}}
app.post("/api/students",auth,(req,res)=>{
 const db=loadDB(),s=clean(req.body);
 if(!s.roll||!s.name)return res.status(400).json({error:"Roll Number and Name required"});
 if(db.students.some(x=>String(x.roll)===s.roll))return res.status(400).json({error:"Roll Number already exists"});
 db.students.push(s);saveDB(db);res.json({ok:true,id:s.id});
});
app.put("/api/students/:id",auth,(req,res)=>{
 const db=loadDB(),id=Number(req.params.id),i=db.students.findIndex(x=>x.id===id);
 if(i<0)return res.status(404).json({error:"Student not found"});
 const s=clean(req.body,id);
 if(!s.roll||!s.name)return res.status(400).json({error:"Roll Number and Name required"});
 if(db.students.some(x=>x.id!==id&&String(x.roll)===s.roll))return res.status(400).json({error:"Roll Number already exists"});
 db.students[i]=s;saveDB(db);res.json({ok:true});
});
app.delete("/api/students/:id",auth,(req,res)=>{
 const db=loadDB(),id=Number(req.params.id),old=db.students.length;
 db.students=db.students.filter(x=>x.id!==id);
 if(db.students.length===old)return res.status(404).json({error:"Student not found"});
 saveDB(db);res.json({ok:true});
});
app.post("/api/change-student-password",auth,(req,res)=>{
 if(!req.body.password||req.body.password.length<4)return res.status(400).json({error:"Password must be at least 4 characters"});
 const db=loadDB();db.studentPassword=req.body.password;saveDB(db);res.json({ok:true});
});
app.post("/api/change-admin-password",auth,(req,res)=>{
 if(!req.body.password||req.body.password.length<6)return res.status(400).json({error:"Password must be at least 6 characters"});
 const db=loadDB();db.admin.passwordHash=bcrypt.hashSync(req.body.password,10);saveDB(db);res.json({ok:true});
});

app.listen(PORT,()=>console.log("ELPC Results Portal running on port "+PORT));