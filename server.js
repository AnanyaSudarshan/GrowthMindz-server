// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const pool=require('./db');
// Middleware to parse JSON
app.use(express.json());
app.use(cors());       
// Import routes
// Example signup route
app.post("/api/signup", async(req, res) => {
  try{
    const { firstname, lastname, email, password,confirm_password} = req.body;
    const result=await pool.query('INSERT INTO users (first_name, last_name, email, password, confirm_password) VALUES ($1, $2, $3, $4, $5)', [firstname, lastname, email, password, confirm_password]);
    res.json({ message: "Signup successful!" });
  }catch(err){
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Example login route
app.post("/api/login", async(req, res) => {
  try{
    const { email, password } = req.body;
    console.log("Login attempt for email:", email);
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    
    const user = result.rows[0];
    
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    
    res.json({ message: "Login successful", user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name } });
  }catch(err){
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//edit user profile
app.put("/api/edit-profile", async(req, res) => {
  try{
    const { id, firstname, lastname, email, password } = req.body;
    const result=await pool.query('UPDATE users SET first_name = $1, last_name = $2, email = $3, password = $4 WHERE id = $5', [firstname, lastname, email, password, id]);
    res.json({ message: "Profile updated successfully" });
  }catch(err){
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//delete user profile
app.delete("/api/delete-profile", async(req, res) => {
  try{
    const { id } = req.body;
    const result=await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: "Profile deleted successfully" });
  }catch(err){
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//get all users
app.get("/api/get-all-users", async(req, res) => {
  try{
    const result=await pool.query('SELECT * FROM users');
    res.json(result.rows);
  }catch(err){
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(5000, () => console.log("✅ Backend running on port 5000"));



