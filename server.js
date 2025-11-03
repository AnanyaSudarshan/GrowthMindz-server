// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const pool = require('./db');
// Middleware to parse JSON
app.use(express.json());
app.use(cors());
// Import routes
// Example signup route
app.post("/api/signup", async (req, res) => {
  try {
    const { firstname, lastname, email, password, confirm_password } = req.body;
    const result = await pool.query('INSERT INTO users (first_name, last_name, email, password, confirm_password) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email', [firstname, lastname, email, password, confirm_password]);
    const newUser = result.rows[0];
    res.json({ message: "Signup successful!", user: { id: newUser.id, first_name: newUser.first_name, last_name: newUser.last_name, email: newUser.email } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Example login route
app.post("/api/login", async (req, res) => {
  try {
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

    res.json({ message: "Login successful", user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone_number, date_of_birth: user.dob, bio: user.bio } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//edit user profile
app.put("/api/edit-profile", async (req, res) => {
  try {
    const { id, firstname, lastname, email, phone_number, dob, bio } = req.body;
    const result = await pool.query('UPDATE users SET first_name = $1, last_name = $2, email = $3, phone_number = $4, dob=$5, bio=$6 WHERE id = $7', [firstname, lastname, email, phone_number, dob, bio, id]);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//delete user profile
app.delete("/api/delete-profile", async (req, res) => {
  try {
    const { id } = req.body;
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: "Profile deleted successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//change password
app.put("/api/change-password", async (req, res) => {
  try {
    const { id, currentPassword, newPassword } = req.body;

    // First verify the current password
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.password !== currentPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Update the password
    const result = await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, id]);
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

//get all users
app.get("/api/get-all-users", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// --- GET COURSES WITH VIDEO AND CATEGORY FILTER ---
app.get('/api/courses', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM courses';
    const params = [];
    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- QUIZ TABLES AND SUBMISSION ENDPOINT ---
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        quiz_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_answers (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES quiz_submissions(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        selected_option INTEGER NOT NULL,
        is_correct BOOLEAN NOT NULL
      );
    `);
    console.log('✅ Quiz tables ensured');
  } catch (e) {
    console.error('Failed ensuring quiz tables', e);
  }
})();

app.post('/api/quizzes/nism/ch1/submit', async (req, res) => {
  try {
    const { userId, quizId = 'nism_ch1', score, total, answers } = req.body || {};
    if (!Number.isInteger(score) || !Number.isInteger(total) || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const subResult = await pool.query(
      'INSERT INTO quiz_submissions (user_id, quiz_id, score, total) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId || null, quizId, score, total]
    );
    const submissionId = subResult.rows[0].id;

    if (answers.length > 0) {
      const values = [];
      const placeholders = [];
      answers.forEach((a, idx) => {
        const base = idx * 4;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        values.push(submissionId, String(a.questionId), Number(a.selectedOption), Boolean(a.isCorrect));
      });
      await pool.query(
        `INSERT INTO quiz_answers (submission_id, question_id, selected_option, is_correct) VALUES ${placeholders.join(',')}`,
        values
      );
    }

    res.json({ message: 'Submission saved', submissionId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(5000, () => console.log('✅ Backend running on port 5000'));
